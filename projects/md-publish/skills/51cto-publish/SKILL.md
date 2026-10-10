---
name: 51cto-publish
description: 将本地指定路径的 Markdown 文章发布到 51CTO 博客（blog.51cto.com）。当用户要求"把这篇 md 发到 51CTO"、"51CTO 发文"、"发布到 51CTO"、"publish to 51cto"，或提供一个本地 .md 文件路径并希望投稿 51CTO 时触发。基于 ego-browser 复用用户登录态，自动推断标题/分类/标签并填正文发布，全程仅在发布前做一次确认。使用 am-engine 的 setMarkdown 原生注入 Markdown，无需转 HTML。不负责生成文章内容本身，也不负责 51CTO 以外的平台（掘金/CSDN/知乎等走各自 skill）。
agent_created: true
---

# 51CTO Publish（51CTO 发文）

把一个本地 Markdown 文件发布为 51CTO 博客文章。核心用 **ego-browser**（复用用户浏览器登录态，在隔离 task space 操作），**无需账号密码**，只要用户此前在浏览器登录过 51CTO 即可。

发布页：`https://blog.51cto.com/blogger/publish?old=1&newBloger=2`

> **本文所有选择器与流程均于 2026-09 实测验证**（含一次真实发布 + 删除回退）。若页面改版，以 `snapshotText()` 实时结构为准，不要盲目重试同一失败选择器。

---

## ⚠️ 四个决定成败的硬约束（务必先读）

1. **正文与标题必须在发布弹窗【关闭】状态下写入。**
   弹窗打开时 `$VM.wukcontent` 会变为 `undefined`，表单的 `content` 会被清空，最终发出一篇 **空文**。
   写入后必须校验 `window.$VM.wukcontent.length > 0` 且 `window.submitForm.content.length > 0`，**两者都非空才允许打开发布弹窗**。

2. **「发布文章」按钮和「发布」按钮必须真实鼠标点击。**
   用 `js()` 里的 `element.click()` 合成点击 **无效**（实测不触发 Vue/jQuery 委托）。必须用 ego 的 `click(selectorOrRef)`。

3. **正文字段只在提交瞬间从 DOM 收集的是标签**；正文走 Vue 模型。标签 chip 写入后 `submitForm.tag` 仍为空是**正常现象**——发布点击时才由 `getTagStr()` 从 chip DOM 读取。校验标签要看 chip DOM，不要看 `submitForm.tag`。

4. **必填项：二级分类（仅当该 L1 有子项时）+ 版权声明。** 选完一级分类后，若该分类存在二级子项（如「大模型」→「多模态模型」），**必须选二级**；「版权声明」`input#staRe`（Element UI 下拉）**必须显式点选一项**（如"转载请注明出处"）。漏填会触发 `请选择二级分类` / `请选择版权声明` 校验，表现形式是"发布按钮点了却始终停在发布页、URL 不变"——极易误判为脚本失效。脚本已默认给有子项的 L1 取首个二级；版权声明需手动点选（见下方新增步骤）。

---

## 自动化原则

**目标：全流程自动决策，人工介入只保留一次——发布前的不可逆确认。**

- 标题、一级/二级分类、标签、摘要**全部自动推断**，不要逐项问用户。
- 缺失项按 `scripts/prepare_article.py` 的规则自动定，并在**最终发布确认**里一并展示。
- 唯一必须的人工节点：**点「发布」前的一次确认**。若用户指令含"直接发布/不用确认/auto"，跳过确认直接发布。
- 用户明确"只存草稿"时，不点发布（走页面自动保存即可）。

---

## 能力依赖

- **ego-browser**：`nodejs` heredoc。首次 `command not found` 时按其 `references/install.md` 安装。
- **Read 工具**：读取本地 Markdown。
- **python3**：运行 `scripts/prepare_article.py`。
- 51CTO 账号已在浏览器登录（未登录时走「登录 handoff」）。

### ego-browser 两个易错点

- **heredoc 是 ESM**（支持顶层 await）：读文件用 `const fs = (await import('fs')).default`，**不能用 `require`**。
- `wait()` 与 `timeout` 单位是**秒**；`@N`/`ref=N` 只对 `click`/`fillInput` 等 ego helper 有效，**不能**在 `js()` 里当选择器用。

---

## 完整工作流

task space 名统一 `'publish 51cto article'`，跨 heredoc 复用。

### 第 1 步：预处理（自动）

```bash
python3 /Users/javaedge/soft/VSProjects/project-launcher/projects/md-publish/skills/51cto-publish/scripts/prepare_article.py \
  "<绝对路径.md>" [--title "自定义标题"] > /tmp/51cto_article.json
```

输出 JSON：`title / body_b64 / body_chars / pid / pidName / cate_id / cateName / tags / abstract / local_images / publish`。

- 分类 ID 取自 `references/categories.json`（`/category/get-child` 权威接口快照，31 个一级分类）。
- **正文以 base64 落盘**，供浏览器端 `atob()` 解码，彻底规避反引号/`$`/换行破坏脚本。
- 若 `local_images` 非空：本地图片无法直传，**在最终确认里提示用户**（发布后需手动上传或改图床），不阻断流程。
- 用户给的标题以 `--title` 覆盖，优先级高于 frontmatter 与正文首行 `#`。

### 第 2 步：打开发布页 + 登录检测

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
cliLog('task space id: ' + task.id)
await openOrReuseTab('https://blog.51cto.com/blogger/publish?old=1&newBloger=2', { wait: true, timeout: 30 })
await wait(5)
const info = await pageInfo()
cliLog('URL: ' + info.url)
cliLog('TITLE: ' + info.title)
EOF
```

- URL 仍为 `/blogger/publish` → 已登录，继续。
- 被重定向到 `home.51cto.com/index?from_service=blog` → **未登录**，走「登录 handoff」。

### 第 3 步：写标题与正文（弹窗必须关闭）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
const fs = (await import('fs')).default
const A = JSON.parse(fs.readFileSync('/tmp/51cto_article.json','utf8'))
// 所有文本一律 base64 传参：标题/标签含反引号或 ${ 时会破坏模板字符串
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64')
const T64 = b64(A.title)

// 标题：三重写入，确保 Vue 模型 / 表单模型 / DOM 三者一致
await js(String.raw`(() => {
  const T = decodeURIComponent(escape(atob("${T64}")));
  window.$VM.changeTitleValue({ type: "title", value: T });
  window.submitForm.title = T;
  document.getElementById('title').value = T;
  return 'ok';
})()`)

// 正文：am-engine 原生 setMarkdown，直接吃 Markdown 源码
await js(String.raw`(() => {
  const md = decodeURIComponent(escape(atob("${A.body_b64}")));
  window.engineInstance.setMarkdown(md);
  return 'ok';
})()`)
await wait(4)
cliLog('written')
EOF
```

> 标题**不要**只用 `fillInput`——实测在弹窗曾打开过时 Vue 模型不会同步，导致发布旧标题。
> 正文**必须**用 `engineInstance.setMarkdown()`；编辑器是 am-engine 富文本，**不是** CodeMirror/textarea，不存在 `.CodeMirror`。
> **一律 base64 传参**，不要直接把字符串插值进 `String.raw` 模板——标题里的反引号会截断模板。

### 第 4 步：校验同步（不可跳过）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
const v = await js(String.raw`(() => JSON.stringify({
  vmTitle: window.$VM.title.titleValue,
  formTitle: window.submitForm.title,
  domTitle: document.getElementById('title').value,
  vmWukLen: (window.$VM.wukcontent||'').length,
  formContentLen: (window.submitForm.content||'').length,
  engineLen: window.engineInstance.getText().length
}, null, 1))()`)
cliLog(v)
EOF
```

**放行条件**：`vmWukLen > 0` 且 `formContentLen > 0`，且三者标题一致。
不满足 → 回到第 3 步重写（确认弹窗是关闭的：`.editor-dialog__wrapper` 的 `display` 应为 `none`）。

### 第 5 步：打开发布弹窗（真实点击）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
await click('@<发布文章按钮的ref>', { label: 'click publish article button' })
await wait(3)
cliLog('dialog display: ' + await js(String.raw`String(getComputedStyle(document.querySelector('.editor-dialog__wrapper')).display)`))
EOF
```

先在上一轮用 `snapshotText()` 取「发布文章」按钮的 `ref=N`。若未打开（display 非 `block`），重新 snapshot 取新 ref 再点。

### 第 6 步：选分类（必填，两级）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
const fs = (await import('fs')).default
const A = JSON.parse(fs.readFileSync('/tmp/51cto_article.json','utf8'))

await click(`.select_item[value="${A.pid}"]`, { label: 'select level-1 category' })
await wait(2.5)                                  // 等二级分类 AJAX 回填
if (A.cate_id) {
  await click(`.second-types-item[value="${A.cate_id}"]`, { label: 'select level-2 category' })
  await wait(1.5)
}
const r = await js(String.raw`(() => JSON.stringify({
  l1: [...document.querySelectorAll('#oneLever .select_item')].filter(e=>e.className.includes('check')).map(e=>e.innerText.trim()),
  l2: [...document.querySelectorAll('#twoLever .second-types-item')].filter(e=>e.className.includes('check')).map(e=>e.innerText.trim()),
  pid: window.submitForm.pid, cate_id: window.submitForm.cate_id
}, null, 1))()`)
cliLog(r)
EOF
```

- **必须先一级后二级**：点一级会把 `cate_id` 清空并重新拉取二级列表。
- 部分一级分类（软件测试/运维/区块链/物联网/代码人生/OpenClaw 等）**没有二级分类**，此时 `cate_id` 为空属正常，跳过二级点击。
- **若一级分类有子项（如「大模型」→「多模态模型」），必须选二级**，否则发布被 `请选择二级分类` 静默拦截。脚本已默认取首个子项作为 `cate_id`。
- `pid` / `cate_id` 在 `window.submitForm` 中可读，用它做最终校验。

### 第 7 步：设标签（必填，最多 5 个）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
const fs = (await import('fs')).default
const A = JSON.parse(fs.readFileSync('/tmp/51cto_article.json','utf8'))
const TAGS64 = Buffer.from(JSON.stringify(A.tags.slice(0,5)), 'utf8').toString('base64')

const r = await js(String.raw`(() => {
  const box = document.querySelector('.has-list.tage-list-arr');
  if (!box) return 'no-tag-box';
  box.innerHTML = '';
  const tags = JSON.parse(decodeURIComponent(escape(atob("${TAGS64}"))));
  tags.forEach(t => {
    const s = document.createElement('span');
    s.innerHTML = t + '<i class="iconeditor editorcancel"></i>';
    box.appendChild(s);
  });
  return JSON.stringify([...box.querySelectorAll('span')].map(s => s.textContent.trim()));
})()`)
cliLog('tags: ' + r)
EOF
```

- chip 结构固定为 `<span>标签文本<i class="iconeditor editorcancel"></i></span>`，容器是 `.has-list.tage-list-arr`（两个 class 同一元素）。
- 直接 DOM 追加即可，**无需**逐个 `typeText` + `Enter`（后者也验证可用，但慢）。
- 校验看 chip DOM 文本，**不要**看 `submitForm.tag`（提交前恒为空）。

### 第 7.5 步：版权声明（必填，el-select 下拉）

`input#staRe` 是 Element UI 下拉，**不点选会触发 `请选择版权声明` 校验并拦截发布**。

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
await click('#staRe', { label: 'open copyright dropdown' })
await wait(1.5)
await js(() => {
  const t = [...document.querySelectorAll('.el-select-dropdown__item')]
    .find(e => e.innerText.trim() === '转载请注明出处')
  if (t) t.click()   // el-select 项用原生 click 即可触发 Vue 选择
})
await wait(1)
EOF
```

> 注意：下拉项须在「展开」与「点击」同一次调用内完成，跨调用会因失焦关闭而失效。
> 若文章为原创转载，按实际选对应项；选项文案以页面为准。

### 第 8 步：摘要（可选）

```js
const ABS64 = Buffer.from(String(A.abstract), 'utf8').toString('base64')
await js(String.raw`(() => {
  const ta = document.getElementById('abstractData');
  const v = decodeURIComponent(escape(atob("${ABS64}")));
  const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  s.call(ta, v);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`)
```

缺省时 51CTO 自动取正文前 200 字，通常可不填。

### 第 9 步：发布前一次确认（唯一人工节点）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
await captureScreenshot()
const s = await js(String.raw`(() => JSON.stringify({
  title: window.submitForm.title,
  pid: window.submitForm.pid, cate_id: window.submitForm.cate_id,
  contentLen: (window.submitForm.content||'').length,
  tags: [...document.querySelectorAll('.has-list.tage-list-arr span')].map(e=>e.textContent.trim()),
  abstract: (document.getElementById('abstractData')||{}).value || '(自动)',
  blog_type: window.submitForm.blog_type, is_hide: window.submitForm.is_hide
}, null, 1))()`)
cliLog(s)
EOF
```

用 question 工具一次性展示【标题 / 分类 / 标签 / 正文字数 / 摘要 / 本地图片提示】，选项：`确认发布` / `存草稿` / `取消`。

- 指令含"直接发布/不用确认/auto" → 跳过此步，直接第 10 步。
- 选"存草稿" → 关闭弹窗（已有自动保存），结束。

### 第 10 步：点击发布

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
await click('button.release', { label: 'click publish button' })
await wait(3)

// 违禁词二次确认（命中敏感词时才会出现）
const cont = await js(String.raw`(() => {
  const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '继续发布');
  return b ? 'need-confirm' : 'none';
})()`)
cliLog('banned-dialog: ' + cont)
if (cont === 'need-confirm') {
  // 注意：:has-text() 是 Playwright 语法，ego 不支持；用 xpath 精确按文本定位
  await click('xpath=//button[normalize-space(text())="继续发布"]', { label: 'confirm continue publish' })
  await wait(4)
}
EOF
```

> 发布后页面会**整页跳转**，`.editor-dialog__wrapper` 直接从 DOM 消失。
> **不要在发布后对其调用 `getComputedStyle`**——会抛 `parameter 1 is not of type 'Element'`。

### 第 11 步：验证结果

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
const info = await pageInfo()
cliLog('URL: ' + info.url)
const m = (info.url.match(/\/blogger\/success\/(\d+)/) || [])[1]
cliLog('articleId: ' + (m || 'NOT_FOUND'))
if (!m) { await captureScreenshot(); cliLog('PUBLISH_FAILED: check screenshot'); }
EOF
```

**成功判定**：URL 匹配 `https://blog.51cto.com/blogger/success/<articleId>`。
**文章外链**：`https://blog.51cto.com/<用户名>/<articleId>`（用户名从编辑器页头像链接读取，如 `/JavaEdge`）。

把文章链接返回用户。

### 第 12 步：收尾

```bash
ego-browser nodejs <<'EOF'
await completeTaskSpace('publish 51cto article', { keep: false })
cliLog('done')
EOF
```

---

## 登录 handoff（未登录时）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish 51cto article')
await handOffTaskSpace(task.id)
cliLog('已交还浏览器控制权，请完成 51CTO 登录')
EOF
```

告知用户登录后回复"继续"；确认后用 `takeOverTaskSpace('publish 51cto article')` 收回控制权，回到第 2 步。
**用户若主动接管了 task space，不得自行 `takeOverTaskSpace`**——须等明确确认，再 `claimTaskSpace(id)`。

---

## 页面结构速查（实测 2026-09）

| 目标 | 选择器 / API | 说明 |
|------|-------------|------|
| 标题输入 | `input#title.ant-input.editor-title` | 需三重写入：`$VM.changeTitleValue({type:"title",value})` + `submitForm.title` + DOM value |
| 正文编辑器 | `window.engineInstance.setMarkdown(md)` | am-engine 富文本；`.am-engine` 容器。**非 CodeMirror** |
| 正文读回 | `engineInstance.getText()` / `getHtml()` | 校验用 |
| 表单模型 | `window.submitForm` | 含 title/content/pid/cate_id/tag/abstract/banner_type/blog_type/copy_code/is_hide |
| Vue 实例 | `window.$VM` | `.title.titleValue`、`.wukcontent`、`.changeTitleValue()` |
| 发布弹窗容器 | `.editor-dialog__wrapper` | 关闭时 `display:none`，打开后加 `fadeInRightBig` |
| 打开弹窗 | 真实点击顶部「发布文章」按钮 | 合成 click 无效 |
| 一级分类 | `#oneLever .select_item[value=N]` | 选中加 `select_item_check` |
| 二级分类 | `#twoLever .second-types-item[value=N]` | 选中加 `second-types-item-check` |
| 标签容器 | `.has-list.tage-list-arr` | chip = `<span>文本<i class="iconeditor editorcancel"></i></span>`，最多 5 |
| 标签输入 | `input#tag-input` | 可选路径：`typeText` + `Enter` |
| 文章摘要 | `textarea#abstractData` | 上限 500 字，缺省自动取前 200 字 |
| 个人分类 | `input#selfType` | 可选 |
| 话题 | `input#subjuct` | 可选（注意拼写） |
| 封面 | `input.img_type[name=imgtype]` | 1=单图 3=三图 4=无图 0=自动（默认） |
| 文章类型 | `input#aticleType` | 默认"原创"（注意拼写） |
| 版权声明 | `input#staRe`（el-select 下拉，**必填**） | 默认"转载请注明出处"；不选会被 `请选择版权声明` 拦截 |
| 可见性 | `input#open`(公开,默认) / `input#privacy` | 对应 `is_hide` 0/1 |
| 发布按钮 | `button.release#submitForm` | 弹窗内，真实点击 |
| 违禁词确认 | 文字为「继续发布」的 button | 命中敏感词才出现 |
| 成功页 | `/blogger/success/<id>` | 页面含"发布成功" |
| 分类接口 | `GET /category/get-child` | 返回 31 个一级分类及二级子树 |

完整分类 ID 表见 `references/categories.json`；故障排查见 `references/troubleshooting.md`。

---

## 稳健性原则

1. **先写内容、后开弹窗**——最高优先级的顺序约束，违反会发出空文。
2. **写入后必校验** `$VM.wukcontent` 与 `submitForm.content` 双非零，再打开发布弹窗。
3. **真实鼠标点击** 触发所有 Vue/jQuery 委托按钮（发布文章、分类、发布）。
4. **base64 + `fs` 读文件** 传正文（heredoc 是 ESM，用 `await import('fs')`），杜绝 shell 转义问题。
5. **标签看 chip DOM**，不看 `submitForm.tag`（提交瞬间才回填）。
6. **分类先一级后二级**，一级点击会清空二级。
7. **发布后不再查询弹窗 DOM**（已跳转，会抛错）；改用 `pageInfo().url` 判定。
8. **选择器失效时**用 `snapshotText()` 取实时 `ref=N` 或 `loc=...`，不要重试同一失败选择器。
9. task space 全程复用 `'publish 51cto article'`，结束调 `completeTaskSpace`。

---

## 迁移说明与实测订正（2026-10-10）

> 本文件 2026-10-10 从 `~/.agents/skills/51cto-publish/` **原样**迁入
> `project-launcher/projects/md-publish/skills/51cto-publish/`（连同 `references/categories.json`、`references/troubleshooting.md`、`scripts/prepare_article.py`），源目录随后删除。
> 默认执行入口是确定性脚本 `../playbooks/51cto.js`（`bridge.mjs` → ego-browser，零大模型参与，预处理内联、不跑 `prepare_article.py`、不读 `/tmp` JSON），本文件留作选择器出处与人工兜底。
> 上文第 64 行的 `prepare_article.py` 路径已就地改成项目内绝对路径。

- **直发已用真文跑通**（2026-10-06），成品链接形如 `https://blog.51cto.com/JavaEdge/14976249`。
- **Vue/jQuery 委托按钮必须真实鼠标点击**：`js()` 里 `element.click()` 不触发（发布文章、分类、版权声明、发布都算）。`playbooks/51cto.js:197` 的 `clickReal(sel,label)` 就是这个订正，凡走委托的按钮一律用它。
- **草稿箱**：`https://blog.51cto.com/creative-center/draft`，2026-10-05 实测列表项标题是 `h3.title`、倒序排列，草稿核验回读这里。
- **正文与标题必须在发布弹窗关闭状态下写入**（弹窗一开 `$VM.wukcontent` 变 undefined，`setForm` 会把 content 清空 → 发出去是空文）；写入后要 `$VM.wukcontent` 与 `submitForm.content` 双非空才允许点发布。
- **标签必填、上限 5**，`.has-list.tage-list-arr` 是容器；自动按正文关键词打分推断标签会跑偏（实测出过「数字孪生 / RAG」这类不相干的词），所以直发时标签最好由 `ARGS.tags` 指定，别让脚本自己猜。
