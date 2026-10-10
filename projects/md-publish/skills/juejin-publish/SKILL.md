---
name: juejin-publish
description: 将本地指定路径的 Markdown 文章发布到掘金（juejin.cn）平台。当用户要求"把这篇 md 发到掘金"、"发布文章到掘金"、"掘金发文"、"publish markdown to Juejin"，或提供一个本地 .md 文件路径并希望投稿掘金时触发。基于 ego-browser 复用用户登录态，自动推断标题/分类/标签并填正文发布，全程仅在发布前做一次确认。选择器以 snapshotText 实时验证为准。不负责生成文章内容本身，也不负责掘金以外的平台（知乎/CSDN/dev.to 等走各自 skill）。
---

# Juejin Publish（掘金发文）

把一个本地 Markdown 文件发布为掘金文章。核心用 **ego-browser**（复用用户 Chrome 登录态，在隔离 task space 里操作，不打扰用户），**无需账号密码**，只要用户此前在浏览器登录过掘金即可。

掘金新版编辑器地址：`https://juejin.cn/editor/drafts/new?v=2`

> **选择器以 snapshotText 实时验证为准**。掘金编辑器会改版，每次操作前先用 snapshotText 确认页面结构，选择器失效时以实时 snapshot 的 `loc=...` 或 `ref=N` 为准，不要盲目重试同一失败选择器。

> **ego-browser ref 不可用于 js()**。`@N` / `ref=N` 仅对 `click`/`fillInput`/`typeText` 等 ego-helper 有效，不能在 `js()` 中作为 `document.querySelector` 参数使用。js() 内部必须用原生 CSS/XPath 选择器。

> **ego-browser 参数单位**。`wait()` 和 `timeout` 参数单位为**秒**，`Ms` 后缀才是毫秒。

## 自动化原则（重要）

**目标：全流程自动决策，人工介入只保留一次——发布前的不可逆确认。**

- 标题、分类、标签、摘要**全部自动推断**，不要逐项去问用户。
- 分类/标签即使 frontmatter 缺失，也按下方「决策规则」自动定，并在**最终发布确认**里一并展示，让用户一次性过目。
- 唯一必须的人工节点：**点「确定并发布」前的一次确认**（因发布不可逆）。若用户在发起指令时已明确"直接发布/不用确认/auto"，则连这次也跳过，直接发布。
- 若用户明确"只存草稿"，则走草稿模式，不点发布，也无需确认。

---

## 能力依赖（本地）

- **ego-browser**：主力浏览器自动化工具，复用登录态、可填表单/点击/读页面/截图。首次运行报 `command not found` 时，按 ego-browser 的 `references/install.md` 安装。
- **Read 工具**：读取本地 Markdown 文件与 frontmatter。
- **Bash**：用 `python3` 做 base64 编码正文。
- 掘金账号已在浏览器登录（未登录时走「登录 handoff」）。

---

## 元数据决策规则（自动推断，无需询问）

优先读 frontmatter，缺失项按规则自动补齐。

```markdown
---
title: 文章标题        # 见「标题规则」
category: 后端         # 见「分类规则」，掘金 8 选 1
tags: [Agent, LLM]     # 见「标签规则」，1~3 个（掘金上限 3）
cover: /abs/cover.png  # 可选，本地图片或 URL
summary: 摘要...       # 可选，缺省时掘金自动截取正文前 100 字
publish: true          # 可选，false=只存草稿
---
```

### 标题规则（按优先级）
1. `frontmatter.title`
2. 正文首个 `# 一级标题`
3. 文件名（去扩展名）后**做清洗**：
   - 去掉路径、`.md`
   - 把驼峰粘连拆开、明显拼写错纠正（例：`SpringCloudAliababa - GateWay` → `SpringCloud Alibaba - Gateway`）
   - 若正文主题清晰，可补一个简短中文副标题（例：`… 网关详解`）
   - 结果应是**通顺、无拼写错、可读**的标题

### 分类规则（掘金 8 类，取匹配度最高者）
`后端`、`前端`、`Android`、`iOS`、`人工智能`、`开发工具`、`代码人生`、`阅读`

按正文关键词自动判定（命中越多分越高，取最高）：

| 分类 | 触发关键词（不区分大小写） |
|------|--------------------------|
| 后端 | Java, Spring, Go, Python, 微服务, 网关, MySQL, Redis, Kafka, 分布式, 数据库, JVM, 高并发, 后端, RPC, Dubbo |
| 前端 | Vue, React, JavaScript, TypeScript, CSS, Webpack, 前端, Node.js, 浏览器, HTML |
| Android | Android, Kotlin, Jetpack, Gradle, APK |
| iOS | iOS, Swift, Objective-C, Xcode, SwiftUI |
| 人工智能 | LLM, 大模型, 机器学习, 深度学习, 神经网络, GPT, Transformer, AI, RAG, LangChain, 训练, 推理 |
| 开发工具 | Git, Docker, Kubernetes, VSCode, IDEA, CI/CD, Vim, Shell, 效率工具 |
| 代码人生 | 面试, 职场, 感悟, 成长, 跳槽, 复盘, 副业 |
| 阅读 | 读书, 书评, 读后感 |

无明显命中时默认 `后端`（本地 md 多为技术后端向）。

### 标签规则
1. 起始候选：`frontmatter.tags` ∪ 从正文抽取的技术名词（如 Spring Cloud、Gateway、微服务、Netty、Zuul…）。**不含分类名本身**。
2. 去重、按与主题相关度排序，**取前 3**。
3. **掘金标签是受控词表，且上限只有 3 个**（2026-09 实测）。抽屉提示文案为「你还能添加 N 个标签」，N 从 3 递减到 0。必须在编辑器候选下拉里命中。实际添加时（第 6 步）对每个候选：
   - 输入后从下拉里选**完全相等**项（注意 `Java` vs `JavaScript` 要精确匹配）；
   - 都没有完全相等则跳过该词，换下一个候选；
   - 直到成功添加 **至少 1 个**（掘金必填），最多 3 个。
4. **先探测词表，再决定用哪 3 个**（2026-09 实测踩坑）。直觉上的中文词大量**不在**词表里：`智能体` 无候选（只有 `Agent`）、`知识库 / 大模型 / RAG / 钉钉 / 飞书 / 企业微信 / 问答系统 / Qoder` 全部无候选。已确认存在的词：`Agent`、`LLM`、`MCP`、`LangChain`、`AI编程`、`AIGC`、`Claude`、`ChatGPT`、`Coze`、`工作流引擎`、`人工智能`、`机器学习`。逐个词「清空 → typeText → 等 3 秒 → 读 `.byte-select-option`」跑一轮探测，比盲加省一半时间。
   - **自检**：探测时若连 `Java`、`前端` 都返回空，说明是方法坏了（下拉没展开/等待不足），不是词表没有。
5. 全流程自动完成，不要为选哪个标签去问用户。

---

## 完整工作流

> 每步用 ego-browser 的 `nodejs <<'EOF' ... EOF` heredoc。task space 名统一 `'publish juejin article'`，跨 heredoc 复用（用 `task.id` 定位）。

### 第 1 步：读取并解析本地 Markdown（自动）

1. **Read 工具** 读全文。
2. 解析 frontmatter → `title/category/tags/cover/summary/publish`。
3. 按上方「决策规则」自动补齐 `title / category / tags`。
4. **body** = 去掉 frontmatter 的正文。
5. **本地图片检测**：正则扫描 `!\[[^\]]*\]\((?!https?:)[^)]+\)`。若命中本地图片路径，记录数量，在最终确认里提示"这些图需发布后手动上传或改图床"；纯网络 URL 图片无碍。不因此中断。

> **选择器验证原则**：每个 heredoc 开头先用 `js()` 探测关键元素是否存在，存在再继续，不存在则 fallback 到视觉定位或告知用户。不要直接假设选择器一定有效。

### 第 2 步：base64 编码正文（自动）

```bash
python3 -c "import base64; print(base64.b64encode(open('<绝对路径.md>','rb').read()).decode())" > /tmp/juejin_body_b64.txt
```
> 若正文需去 frontmatter，先写出净正文再编码。含中文务必按 UTF-8 字节编码（上面按二进制读即可）。

### 第 3 步：打开编辑器 + 登录检测

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')
cliLog('task space id: ' + task.id)
await openOrReuseTab('https://juejin.cn/editor/drafts/new?v=2', { wait: true, timeout: 25 })
await wait(3)
const info = await pageInfo()
// 如果 pageInfo 返回 w:0 或 h:0，说明窗口未就绪，需等待
if (info.w === 0 || info.h === 0) {
  await wait(5)
}
cliLog('URL: ' + info.url + ' | TITLE: ' + info.title)
const hasTitle = await js(String.raw`!!document.querySelector('input.title-input')`)
cliLog('logged-in(hasTitleInput): ' + hasTitle)
EOF
```
- 有 `input.title-input` → 已登录，继续。
- 无（或跳登录页/弹窗）→ 走「登录 handoff」。

> **注意**：掘金编辑器可能带 AI 助手悬浮窗（yiban.io），不影响编辑操作，忽略即可。

> **选择器验证**：如果 `input.title-input` 不存在，用 snapshotText 找标题输入框的 `loc=...` 值。

### 第 4 步：填标题（自动）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')
const title = '<<TITLE>>'
await fillInput('input.title-input', title)
await wait(0.8)
cliLog('title: ' + await js(String.raw`document.querySelector('input.title-input')?.value`))
EOF
```

> **标题注入安全**：`<<TITLE>>` 是纯字符串，通过 `fillInput()` 传入，不经过 js() 模板拼接，天然安全。

### 第 5 步：写正文（自动，优先 CodeMirror）

正文经 base64 注入，避免反引号/`$`/换行破坏脚本。

```bash
BODY_B64=$(cat /tmp/juejin_body_b64.txt)
```

```bash
ego-browser nodejs <<EOF
const task = await useOrCreateTaskSpace('publish juejin article')

const ok = await js(String.raw\`(() => {
  const md = decodeURIComponent(escape(atob("${BODY_B64}")));
  const cmEl = document.querySelector('.CodeMirror');
  if (cmEl && cmEl.CodeMirror) { cmEl.CodeMirror.setValue(md); return 'cm-ok len='+md.length; }
  return 'cm-not-found';
})()\`)
cliLog('write: ' + ok)
await wait(2)
const cnt = await js(String.raw\`document.body.innerText.match(/正文字数:\s*\d+/)?.[0]||'n/a'\`)
cliLog(cnt)
EOF
```

**校验正文首尾**（确认没截断、没串位）：
```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')
cliLog(await js(String.raw`(() => {
  const cm=document.querySelector('.CodeMirror')?.CodeMirror; if(!cm)return'no-cm';
  const v=cm.getValue(); return 'HEAD['+v.slice(0,40)+'] TAIL['+v.slice(-40)+']';
})()`))
EOF
```

**`.CodeMirror` 不存在时**：切到 Markdown 模式；仍不行退视觉+键盘（点击编辑区聚焦 → `pressKey('Meta+A')` → 分段 `typeText`），写前做小探针验证文字落在正文而非标题。

> **bytemd 正文注入（实测）**：掘金编辑器使用 `bytemd-editor` + `.CodeMirror`。如果 `.CodeMirror` 不存在，尝试 `document.querySelector('.bytemd-editor textarea')` 用 native setter 写入。

### 第 6 步：打开发布抽屉 + 自动设分类/标签（关键，含选择器修正）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')

// 打开发布抽屉
await js(String.raw`[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='发布')?.click()`)
await wait(2.5)

// --- 分类：点文字精确等于目标分类的项，选后应带 class "item active" ---
const CATEGORY = '<<CATEGORY>>'   // 如 后端
const cat = await js(String.raw`(() => {
  const items = [...document.querySelectorAll('div.item')];
  const t = items.find(e => e.innerText.trim() === '${CATEGORY}' && e.offsetParent !== null);
  if (t) { t.click(); return 'cat-clicked'; }
  return 'cat-not-found';
})()`)
cliLog('category: ' + cat)
await wait(1)
cliLog('cat-active: ' + await js(String.raw`(() => {
  const active = [...document.querySelectorAll('div.item.active')];
  return active.length > 0 ? 'active: ' + active.map(e => e.innerText.trim()).join(', ') : 'none';
})()`))
EOF
```

> **分类选择器修正**：用 `div.item` 替代泛化的 `div,span,label,li`，限定在分类列表区域内，避免命中无关元素。

> ⚠️ **标签输入框选择器（实测踩过坑）**：
> - 掘金标签输入是 `input.byte-select__input`（**无 placeholder 属性**，"请搜索添加标签"是旁边的假占位 span）。
> - **绝不能**用泛化的 `input` 或 `input[placeholder*="标签"]`——前者会命中标题框把标题写坏，后者匹配不到。
> - 抽屉内有 3 个 `.byte-select__input`，顺序固定为 **[0]=标签、[1]=专栏、[2]=话题**。直接用 **`input.byte-select__input[0]`** 最稳。
> - ⚠️ **每次添加前必须清空输入框**：失败的输入会在框里残留文本，污染后续匹配。清空方法见下方 `clearTagInput()`。

逐个添加标签（对「标签规则」得到的候选列表循环执行）：

```bash
BODY_B64=$(cat /tmp/juejin_body_b64.txt)
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')

// 标签输入框固定为 byte-select__input[0]；清空残留文本
async function clearTagInput(){
  await js(String.raw`(() => {
    const i=document.querySelectorAll('input.byte-select__input')[0];
    if(!i) return; i.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(i, '');
      i.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const s = getSelection(), r = document.createRange();
      r.selectNodeContents(i); s.removeAllRanges(); s.addRange(r);
    }
  })()`)
  await wait(0.3)
}

async function addTag(tagName){
  await clearTagInput()
  await typeText(tagName)
  await wait(3)      // 等候选下拉（2026-09 实测 2.2s 偶发不够，取 3s）
  // 优先完全相等，其次大小写不敏感相等
  const picked = await js(String.raw`(() => {
    const options = [...document.querySelectorAll('.byte-select-option')].filter(e => e.offsetParent !== null);
    const el = options.find(e => e.innerText.trim() === '${tagName}');
    if (el) { el.click(); return 'picked'; }
    const el2 = options.find(e => e.innerText.trim().toLowerCase() === '${tagName}'.toLowerCase());
    if (el2) { el2.click(); return 'picked-ci'; }
    return 'candidates:' + options.slice(0, 10).map(e => e.innerText.trim()).join('|');
  })()`)
  cliLog('addTag ' + tagName + ' -> ' + picked)
  await wait(1)
  return picked === 'picked' || picked === 'picked-ci'
}

// <<TAGS_JSON>> 是标签名的 JS 数组字面量，如 ['Agent','LLM','AI编程']
// ⚠️ 2026-09 实测：原本文档在这里自相矛盾——tags 由 b64 解码得到后，又把"原始标签名"再传进
//    addTag(nameB64) 做一次 b64Decode，解码结果是乱码；若改用 JSON.stringify(t) 包一层，
//    typeText 会连引号一起打进输入框（值为 "智能体" 而非 智能体），下拉永远没有候选、
//    返回 cands: 空，看着像"词表没有这个词"，其实是引号污染。
//    正确做法：标签名一律以原始字符串传入，addTag 内部不做任何 base64 解码。
const tags = <<TAGS_JSON>>
let added = 0
for (const t of tags) {
  if (await addTag(t)) added++
  if (added >= 3) break          // 掘金上限 3
}
cliLog('tags added: ' + added)

// 校验 chips（2026-09 实测修正）：本版**没有** `.byte-tag--checked`，
// 全文也搜不到任何 `[class*=byte-tag]` 的选中态类名。已选标签是标签输入框
// content-wrap 的直接子元素，class 为 `byte-select__tag byte-tag byte-tag--normal`。
const chips = await js(String.raw`(() => {
  const cw = document.querySelectorAll('.tag-input.select .byte-select__content-wrap')[0];
  return [...cw.children].map(e => e.innerText.trim()).filter(Boolean);
})()`)
cliLog('current tags: ' + JSON.stringify(chips))
EOF
```

> **标签选择器修正**：用 `.byte-select-option` + `offsetParent !== null` 限定可见选项。

> **标签清空修复**：用 native setter 清空输入框值，比 `selectNodeContents` + `Backspace` 更可靠。

> ⚠️ **标签名不要用 base64 绕路**（2026-09 实测修正，替换旧版「标签名 base64 安全注入」结论）。
> `typeText()` 接收的是**原始文本**，中文标签名可以直传，不需要也不应该 base64 编码——
> 多包一层（尤其 `JSON.stringify`）会把引号打进输入框，导致所有候选匹配失败。
> js() 里做精确文本比对时，标签名是拼进模板的，含引号/反斜杠的词才需要转义；纯中文词无碍。

> **成功添加后 chip 会立即渲染**（2026-09 实测）。旧文档说"中文标签点击后可能不显示 chip，
> 需操作 Vue 实例 `selected` + `$forceUpdate()`"——本版实测点击候选即正常入账并渲染 chip，
> 未触发该问题；加不进词的词是**词表没有**（见「标签规则」第 4 条），不是渲染失败。
> Vue 兜底法仅作备选，用前先确认候选下拉里确实有该词。

> 若 `current tags` 数量少于预期，重新跑 `addTag` 补加缺失项，直到 chips 数量达标，再进入第 7 步。

**摘要**：掘金默认自动截取正文前 100 字，通常无需处理。仅当 `frontmatter.summary` 存在时覆盖：
```js
await js(String.raw`(() => {
  const ta=[...document.querySelectorAll('textarea')].find(t=>(t.closest('div')?.parentElement?.innerText||'').includes('摘要'));
  if(ta){ const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
    s.call(ta,"<<SUMMARY>>"); ta.dispatchEvent(new Event('input',{bubbles:true})); }
})()`)
```

**封面**（有本地 cover 时，2026-09 实测修正，⚠️ 原文档这里是错的）：

> 页面上只有 2 个 `input[type=file]`，**类名与用途是反的**：
> - `[0]` = 真封面，**无 class**，在 `.form-item`（文本含「文章封面」）内 → 用 `uploadFile('input[type=file]', path)`（querySelector 取首个匹配即命中它）
> - `[1]` = `input.file-input`，属于**正文插图**，不在封面 form-item 内
>
> 旧文档写的 `uploadFile('input.file-input', ...)` 会把封面图**当正文图片插进 CodeMirror**，污染正文。
> 上传后务必比对正文长度未变，并确认封面项内出现 `img[src^="http"]`（实测落 `p0-xtjj-private.juejin.cn`）。

```js
const before = await js(String.raw`document.querySelector('.CodeMirror').CodeMirror.getValue().length`)
await uploadFile('input[type=file]', '/abs/cover.png')
await wait(6)
// 正文长度必须不变；封面 form-item 内应出现预览 img
```

掘金封面建议尺寸 192*128（仅展示在首页信息流），正文首图通常也能用；封面**非必填**，取不到合适图时直接跳过。

### 第 7 步：发布前一次确认（唯一人工节点）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')

// 先截图确认
await captureScreenshot()

// 汇总当前值
const summary = await js(String.raw`(() => ({
  title: document.querySelector('input.title-input')?.value,
  cat: [...document.querySelectorAll('div.item.active')].map(e => e.innerText.trim()),
  tags: (() => { const cw=document.querySelectorAll('.tag-input.select .byte-select__content-wrap')[0]; return cw?[...cw.children].map(e=>e.innerText.trim()).filter(Boolean):[]; })(),
  charCount: document.body.innerText.match(/正文字数:\s*(\d+)/)?.[1] || '0'
}))()`)
cliLog('confirm: ' + JSON.stringify(summary, null, 2))
EOF
```

用 **question 工具**一次性展示【标题 / 分类 / 标签 / 正文字数 / 本地图片提示（若有）】，选项：`确认发布` / `先存草稿` / `取消`。

- 用户初始指令若含"直接发布/不确认/auto" → **跳过此步**，直接第 8 步。
- 选"先存草稿" → 不点发布，关抽屉，保留草稿，结束。

### 第 8 步：确认发布

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')

// 点击发布 — 注意：发布成功后页面可能立即跳转，按钮可能不存在
const pubResult = await js(String.raw`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '确定并发布')?.click() ? 'clicked' : 'not-found'`)
cliLog('publish clicked: ' + pubResult)
await wait(4)

// 检查是否成功
const info = await pageInfo()
cliLog('page info after publish: ' + JSON.stringify(info))

const link = await js(String.raw`(() => {
  if (/\/(post|spost)\//.test(location.href)) return location.href;
  const a = [...document.querySelectorAll('a')].find(x => /\/(post|spost)\//.test(x.href));
  return a ? a.href : 'no-link';
})()`)
cliLog('post link: ' + link)

// 如果发布失败，截图并提示
if (link === 'no-link') {
  await captureScreenshot()
  cliLog('PUBLISH_FAILED: check screenshot')
}
EOF
```

> **发布按钮可能不存在**：实测发现发布成功后页面会立即跳转到 `/published`，`js()` 中查找按钮时可能已经跳转了。但只要 `pageInfo().title` 包含"发布成功"或 URL 包含 `/post/` `/spost/` 即视为成功。

**成功判定**：
1. `pageInfo().title` 包含「发布成功」，或
2. URL 包含 `/post/` 或 `/spost/`，或
3. `post link` 非空

把最终链接返回用户。

### 第 9 步：收尾

```bash
ego-browser nodejs <<'EOF'
await completeTaskSpace('publish juejin article', { keep: false })
cliLog('done')
EOF
```
用户想继续手动检查则 `{ keep: true }`。

---

## 登录 handoff（未登录时）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('publish juejin article')
await handOffTaskSpace(task.id)
cliLog('已交还浏览器控制权，请完成掘金登录')
EOF
```
告知用户登录后回复"继续"；确认后新 heredoc 用 `takeOverTaskSpace('publish juejin article')` 收回控制权，回到第 3 步。

---

## 选择器速查（掘金 v2，实测 2026-07）

| 目标 | 选择器 / 方法 | 备注 |
|------|--------------|------|
| 标题输入 | `input.title-input` | placeholder「输入文章标题...」 |
| 正文编辑区 | `.CodeMirror` → `.CodeMirror.setValue(md)` | 兜底：bytemd-editor textarea |
| 发布按钮 | js() 查找文字==`发布` 的 button | 打开抽屉 |
| 分类项 | `div.item`，文字精确等于分类名，选中后 class 含 `active` | 8 类之一 |
| 标签输入 | `input.byte-select__input[0]`（顺序固定 [0]标签/[1]专栏/[2]话题） | 用 native setter 清空 |
| 标签选项 | `.byte-select-option` + `offsetParent !== null` | 精确匹配文本；无候选＝词表没这个词 |
| 标签校验 | `.tag-input.select .byte-select__content-wrap` 的直接子元素（`byte-select__tag byte-tag byte-tag--normal`） | 本版**无** `.byte-tag--checked` |
| 标签上限 | 3 个 | 提示文案「你还能添加 N 个标签」，N 从 3 递减 |
| 封面 | **第一个** `input[type=file]`（无 class，在「文章封面」`.form-item` 内） | ⚠️ `input.file-input` 是**正文插图**，误用会污染正文 |
| 摘要 | 父文本含"摘要"的 `textarea`，用 native setter + input 事件 | 默认自动填，一般不动 |
| 确定发布 | js() 查找文字==`确定并发布` 的 button | 抽屉内，可能发布后立即跳转 |
| 成功判定 | `pageInfo().title` 含"发布成功" 或 URL 含 `/post/` `/spost/` | 优先用 pageInfo |

> **ego-browser ref 不可用于 js()**。`@N` / `ref=N` 仅对 `click`/`fillInput`/`typeText` 等 ego-helper 有效，不能在 `js()` 中作为 `document.querySelector` 参数使用。

---

## 稳健性原则

1. **元数据全自动**：标题/分类/标签按「决策规则」自动定，不逐项问用户。
2. **人工只一次**：发布前确认（不可逆）；用户说"直接发布"则连这次都免。
3. **标签框专用选择器** `input.byte-select__input[0]`（标签/专栏/话题中索引恒为 0），**严禁泛化 `input`**——泛化会命中标题框把标题写坏（本 skill 踩过）。
4. **每次添加标签前先清空输入框**（native setter 清空值 + input 事件），否则残留文本会污染下一次匹配。
5. **标签精确匹配** 候选文本（Java vs JavaScript），至少加 1 个，**最多 3 个（掘金硬上限）**，匹配不到就跳过换下一个；直觉中文词常不在词表，先探测再定。
6. **先观察后动作**：每 heredoc 先取状态再操作，动作后复核（标题值、分类 active、标签 chips）。
7. **正文优先 CodeMirror setValue**，base64 传参，失败才退视觉+键盘；写后校验首尾。
8. **本地图片**无法直传，仅提示不阻断。
9. **选择器失效 fallback**：每个 heredoc 开头先探测关键元素是否存在，不存在则用 snapshotText 找 `loc=...` 或退到视觉定位。
10. **发布失败恢复**：第 8 步后检查 post link 是否为空，为空则截图提示用户。
11. **标签名直传原始文本**，不经 base64/JSON 包装（引号会打进输入框使匹配全失败）；点击候选即正常入账并渲染 chip。Vue 实例 `selected` + `$forceUpdate()` 仅作备选，用前先确认下拉里确实有该词。
12. task space 全程复用 `'publish juejin article'`，用 `task.id` 跨轮定位；结束 `completeTaskSpace`。
13. **发布后必须回成品页验收图片**（2026-09 实测）。打开 `/spost/<id>`，正文图是**懒加载**：只统计 `naturalWidth>0` 会把视口外的图误判为丢失（实测首屏 9 张只报 5 张已加载）。先 `window.scrollBy` 分 8 次滚到底再数，判据：`broken = complete && naturalWidth===0` 应为空、`pending` 应为 0。
14. **外链图掘金可直接用**：发布前用 `curl -H "Referer: https://juejin.cn/" <url>` 验一次，返回 200 + `image/*` 即无防盗链（实测 `p.ipic.vip` 可用），无需像 CSDN 那样预转存。

---

## 迁移说明与实测订正（2026-10-10）

> 本文件 2026-10-10 从 `~/.agents/skills/juejin-publish/` **原样**迁入
> `project-launcher/projects/md-publish/skills/juejin-publish/`，源目录随后删除。行号未变动。
> 默认执行入口是确定性脚本 `../playbooks/juejin.js`（`bridge.mjs` → ego-browser，零大模型参与），本文件留作选择器出处与人工兜底。

- **直发已用真文跑通**（2026-10-06），成功判定是页面出现 `/post|spost/` 链接或「发布成功」文案（`playbooks/juejin.js` 第 9 节）。
- **草稿分支按按钮文案 `/保存草稿/` 匹配**，文案随版本会变；没命中就点「取消/关闭」退出弹窗 —— 掘金编辑器会把内容自动留在草稿箱，所以草稿模式的最终核验要看草稿箱列表，不看编辑页 URL。
- 一次实测只落了 **1 个分类 + 1 个标签**：掘金的标签下拉是远程搜索，候选里没有的词点不上，脚本绝不硬填造词（对应上文第 11 条）。
- 成品页正文图是**懒加载**，判丢失前先分次滚到底（上文第 13 条），`naturalWidth>0` 单独用会误报。
