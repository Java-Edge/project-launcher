---
name: cnblogs-publish
description: 将本地指定路径的 Markdown 文章发布到博客园（cnblogs.com）平台。当用户要求"把这篇 md 发到博客园"、"博客园发文"、"发布到 cnblogs"、"publish to cnblogs"，或提供一个本地 .md 文件路径并希望投稿博客园时触发。基于 ego-browser 复用用户登录态，自动推断标题/正文/标签/分类并填写发布，发布前一次性确认。不负责生成文章内容本身。
---

# 博客园 Publish（博客园发文）

把一个本地 Markdown 文件发布为博客园文章。核心用 **ego-browser**（Ego Lite 浏览器 + 用户登录态），**无需账号密码**，只要该浏览器此前登录过博客园即可。

- 新建文章编辑器：`https://i.cnblogs.com/articles/edit`
- 编辑已有文章（更新/补发）：`https://i.cnblogs.com/articles/edit?postId=<id>`

> **选择器以实时 `page.evaluate()` / `snapshot()` 探测为准**（本文选择器为 2026-09 实测）。页面是 Angular + ant-design 应用；操作前确认元素存在，失效时重新探测，不要盲目重试同一选择器。

> **整个发布流程只用一个 TaskSpace**。每次 `ego-browser nodejs` 调用都是新进程，须记下首轮输出的 `spaceId`，后续用 `takeOverTaskSpace(<id>)` 续用；页面标签固定用 `p1`，跨 URL 用 `goto()` 复用，不新开页面。

---

## ⚠️ 实测关键发现（2026-09，已验证）

1. **正文是原生 textarea `#md-editor`**，不是 CodeMirror（账号编辑器设为 Markdown 时）。大段正文用 **native setter + dispatch `input`** 注入即可，Angular 会转 `ng-dirty` 且值保留；注入后必须回读 `value` 校验。
2. **标题 `input#post-title`** 同样适用 native setter + `input` 事件（实测 Angular 绑定生效）。
3. **标签是第二个 `.ant-select`（"Tag 标签"）**：ant-design 搜索型下拉，**合成事件写入搜索词不触发远程搜索**，必须 `input.focus()+click()` 后用 `page.keyboard.type(<词>)` 真实键入；下拉出现既有标签则点选，没有则出现「新建标签: "xxx"」选项，点击即入账为 chip（`.ant-select-selection-item`）。
4. **个人分类**是正文右侧的一组 `input[type=checkbox]`（id 为数字分类 ID，label 为分类名，如 `AI Agent`、`Java`）。按 label 文案找到后 `cb.click()`，`checked` 即入账。**至多选一个**；没有匹配项就留空。
5. **摘要** 是 `textarea#summary`（可选，缺省由平台截取）。
6. **发布控制**：`button "发布"` / `button "存为草稿"` / `button "取消"`。`#isPublished` 复选框默认勾选（不勾=存草稿语义）。
7. **外链图片**：博客园不会自动转存失败报错，但防盗链站点（Twitter 等）的图在读者端可能挂不出来。表单顶部有 `button "提取图片"`（把正文外链图转存到博客园图床）；该按钮的完整交互链路**未实测**，含大量外链图的正文发布前先截图预览，必要时点击该按钮并观察。
8. **成功判据（2026-10-05 直发实测修正）**：点「发布」后页面**不会整页跳到读者页**，而是 SPA 路由到
   `https://i.cnblogs.com/articles/edit-done;postId=<postId>;isPublished=true`，正文区文案为「发布成功」并给出「立即查看」。
   所以判据是 URL 里出现 `edit-done;postId=<数字>`；对外链接要自己拼：博客后台页头像区有
   `https://www.cnblogs.com/<用户>` 的链接，取它 + `/p/<postId>.html`（再打开可确认匿名可读，会 302 到 `/articles/<postId>`）。
   `www.cnblogs.com/<用户>/p/<id>.html` 是**读者地址**，不是发布过程中会出现的 URL。
9. **同标题会被拒**：账号下已有同名文章（含草稿箱里的）时，点「发布」停在编辑页，toast 提示
   「相同标题的博文已存在」，约 3 秒消失——点完发布要**立刻**抓一次 toast 文本，别等到轮询结束后再抓（那时已经没了）。
10. **截图不是安全动作**：Ego Lite 窗口被最小化/隐藏时 `captureScreenshot()` 会抛
    `Cannot take screenshot with 0 width` 或 `CDP request timed out: Page.captureScreenshot`。
    在「已经点了发布」的分支里让它炸掉，就会出现"文章其实发成功了但任务报失败"的假阴性——截图一律包 try/catch，失败只记 warn。
11. 若 `#md-editor` 不存在而页面出现富文本编辑器，说明账号编辑器设置不是 Markdown——到「设置编辑器」改回，或按富文本路径另行处理。

---

## 自动化原则（重要）

**全流程自动决策，人工介入只保留一次——发布前的不可逆确认。**

- 标题、标签、分类全部自动推断，不逐项问用户。
- frontmatter 缺失也按「决策规则」自动定，并在**发布确认**里一并展示。
- 唯一必须的人工节点：点「发布」前一次确认。用户指令含"直接发布/不用确认/auto"→ 跳过。
- 用户明确"只存草稿"→ 点「存为草稿」，无需确认。
- 未登录时：`await task.handOff()` 把窗口交给用户登录，等用户回复"继续"后 `takeOverTaskSpace(<id>)` 恢复。

---

## 能力依赖（本地）

- **ego-browser** CLI（`ego-browser nodejs <<'EOF' ... EOF`；沙箱内 heredoc 不可用时改 `-e '...'`）。
- **Read 工具**：读本地 Markdown 与 frontmatter。
- **python3**：base64 编码正文，避免反引号/`$`/换行破坏脚本。
- 博客园账号已在 Ego Lite 登录。

---

## 元数据决策规则（自动推断，无需询问）

```markdown
---
title: 文章标题
tags: [Agent, LLM]      # 1~5 个
category: AI Agent       # 个人分类，匹配不到则留空
summary: 摘要...
publish: true            # false=只存草稿
aigc: false              # true 时勾选「内容由AI生成」
---
```

- **标题**：frontmatter.title → 正文首个 `# 一级标题` → 文件名清洗。
- **标签**：`frontmatter.tags` ∪ 正文技术名词，去重取前 5。允许新建（见发现 3）。
- **分类**：从页面实测存在的分类 checkbox 文案里选**至多一个**最匹配的；没有就留空。
- **正文**：去掉 frontmatter；文首若是 `# 标题` 可保留（博客园不自动加 H1）。

---

## 完整工作流

### 第 1 步：读取解析本地 Markdown

Read 全文 → 解析 frontmatter → body。正则 `!\[[^\]]*\]\(https?:[^)]+\)` 统计外链图，若来自 Twitter 等防盗链域，在最终确认里提示用户。

### 第 2 步：打开编辑器 + 登录检测

```bash
ego-browser nodejs <<'EOF'
const task = await taskSpace("publish cnblogs article");
const page = task.page("p1");
await page.goto("https://i.cnblogs.com/articles/edit");
await page.waitForTimeout(2500);
console.log(JSON.stringify({ spaceId: task.spaceId, url: await page.url() }));
EOF
```

URL 落在 `account.cnblogs.com/signin` → 未登录：`await task.handOff()`，告知用户在弹出窗口登录，回复"继续"后 `takeOverTaskSpace(<spaceId>)` 重新 `goto`。

登录正常时页面含 `#post-title`、`#md-editor`、`button "发布"`。

### 第 3 步：注入正文 + 标题

```bash
python3 -c "import base64; print(base64.b64encode(open('<绝对路径.md>','rb').read()).decode())" > /tmp/cnb_body_b64.txt
```

```bash
ego-browser nodejs <<'EOF'
const task = await takeOverTaskSpace(<spaceId>);
const page = task.page("p1");
const fs = await import("node:fs/promises");
const b64 = (await fs.readFile("/tmp/cnb_body_b64.txt", "utf8")).trim();
const r = await page.evaluate(({ b64, title }) => {
  const md = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
  function setNative(el, val) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const body = md.replace(/^---[\s\S]*?\n---\n/, '');   // 若有 frontmatter 再去一次
  setNative(document.querySelector('#md-editor'), body);
  setNative(document.querySelector('#post-title'), title);
  return { bodyLen: document.querySelector('#md-editor').value.length,
           titleVal: document.querySelector('#post-title').value,
           mdDirty: document.querySelector('#md-editor').className.includes('ng-dirty'),
           head: body.slice(0, 40), tail: body.slice(-40) };
}, { b64, title: '<标题>' });
console.log(JSON.stringify(r));
EOF
```

**校验**：`bodyLen` 与本地文件字数一致、`mdDirty:true`、HEAD/TAIL 对得上。若正文开头有杂散文本，重注入一次。

### 第 4 步：加标签（真实键入 + 下拉点选）

对每个目标标签依次执行（一轮脚本可处理多个）：

```bash
ego-browser nodejs <<'EOF'
const task = await takeOverTaskSpace(<spaceId>);
const page = task.page("p1");
const tags = ['AI Agent', 'Qoder'];           // <-- 目标标签
const results = [];
for (const tag of tags) {
  await page.evaluate((t) => {
    const inp = document.querySelectorAll('.ant-select')[1].querySelector('input');
    inp.focus(); inp.click();
  }, tag);
  await page.waitForTimeout(400);
  await page.keyboard.type(tag);
  await page.waitForTimeout(1500);            // 等远程搜索返回
  const opt = await page.evaluate((t) => {
    const opts = [].slice.call(document.querySelectorAll(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'));
    // 优先精确匹配已有标签，否则点「新建标签」
    const hit = opts.find(o => (o.getAttribute('title') || o.innerText).trim() === t)
             || opts.find(o => (o.getAttribute('title') || o.innerText).includes(t));
    if (hit) hit.click();
    return hit ? (hit.getAttribute('title') || hit.innerText) : null;
  }, tag);
  await page.waitForTimeout(500);
  results.push({ tag, clicked: opt });
}
const chips = await page.evaluate(() =>
  [].slice.call(document.querySelectorAll('.ant-select')[1]
    .querySelectorAll('.ant-select-selection-item')).map(x => x.title || x.innerText));
console.log(JSON.stringify({ results, chips }));
EOF
```

**校验**：`chips` 包含全部目标标签。若 `clicked:null`，看页面是否有遮挡或下拉未开，重开重试；不要把标签写进别的输入框。

### 第 5 步：选分类 + 可选项

```bash
ego-browser nodejs <<'EOF'
const task = await takeOverTaskSpace(<spaceId>);
const page = task.page("p1");
const r = await page.evaluate(({ category, aigc }) => {
  let cat = null;
  if (category) {
    const cb = [].slice.call(document.querySelectorAll('input[type=checkbox]')).find(c =>
      c.labels && c.labels[0] && c.labels[0].innerText.trim() === category);
    if (cb) { cb.click(); cat = { name: category, checked: cb.checked, id: cb.id }; }
  }
  const ai = document.querySelector('#post-is-aigc');
  if (aigc && ai && !ai.checked) ai.click();
  return { cat, available: [].slice.call(document.querySelectorAll('input[type=checkbox]'))
    .filter(c => /^\d+$/.test(c.id)).map(c => c.labels[0].innerText.trim()) };
}, { category: '<分类或null>', aigc: false });
console.log(JSON.stringify(r));
EOF
```

分类名必须从 `available` 实测列表中选；不在列表里则留空并告知用户。可选填 `#summary`（同 native setter 方式）。

### 第 6 步：发布前确认（唯一人工节点）

用 AskUserQuestion 一次性展示【标题 / 标签 / 分类 / 正文字数 / 外链图提示】，选项：`确认发布` / `先存草稿` / `取消`。
- 指令含"直接发布/auto" → 跳过直接第 7 步。
- "先存草稿" → `page.click('text=存为草稿')`，结束。

### 第 7 步：点「发布」并验证

```bash
ego-browser nodejs <<'EOF'
const task = await takeOverTaskSpace(<spaceId>);
const page = task.page("p1");
await page.click('text="发布"');
try {
  // 实测：成功是路由到 /articles/edit-done;postId=<id>，不是跳到 /p/<id>.html
  await page.waitForFunction(() => /edit-done;postId=\d+/.test(location.href), undefined, { timeout: 15000 });
} catch (e) {}
await page.waitForTimeout(1500);
console.log(JSON.stringify({ url: await page.url(), title: await page.title() }));
console.log((await page.snapshot()).slice(0, 1500));
EOF
```

**成功判据**：URL 变成 `https://i.cnblogs.com/articles/edit-done;postId=<postId>;isPublished=true`（实测 2026-10-05）。
对外链接自己拼：博客后台的 `https://www.cnblogs.com/<用户>` 首页链接 + `/p/<postId>.html`。
若仍停在 `articles/edit`（没有 edit-done），就是被校验拦住了：立刻读 `.ant-message-notice-content` 的原文
（实测出现过「相同标题的博文已存在」，toast 约 3 秒消失，不要等轮询结束才读），换标题或按提示修一次；
再不行把提示原文报告用户。**不要**在确认发布结果之前调 `captureScreenshot()`——窗口隐藏时它会抛错把成功的发布报成失败。

### 第 8 步：收尾

```bash
ego-browser nodejs <<'EOF'
const task = await takeOverTaskSpace(<spaceId>);
await task.finish({ keep: [] });   // 文章链接已在第 7 步输出，无需保留页面
EOF
```

---

## 页面元素速查（博客园文章编辑器，实测 2026-09）

| 元素 | 定位方式 | 说明 |
|------|---------|------|
| 标题 | `input#post-title` | native setter + `input` 事件 |
| 正文 | `textarea#md-editor` | Markdown 原文直接写 value；**非 CodeMirror** |
| 摘要 | `textarea#summary` | 可选 |
| Tag 标签 | 第 2 个 `.ant-select` 内 `input` | focus 后 `keyboard.type` 真实键入；下拉点选已有标签或「新建标签」；入账看 `.ant-select-selection-item` |
| 个人分类 | `input[type=checkbox]`（数字 id） | label 文案匹配，`click()`，至多一个 |
| 内容由AI生成 | `#post-is-aigc` | 可选 |
| 发布/草稿开关 | `#isPublished` | 默认勾选 |
| 提取图片 | `button "提取图片"` | 外链图转存，链路未实测，用后需截图确认 |
| 发布 | `button "发布"` | 成功跳 `www.cnblogs.com/<user>/p/<id>.html` |
| 存为草稿 | `button "存为草稿"` | 入草稿箱 |
| 取消 | `button "取消"` | 放弃编辑（新文章无副作用） |
| 可见性 | `#post-access-0/8/268435456` radio | 公开/仅登录用户/只有我，默认公开 |

---

## 错误排查

| 错误 | 原因 | 解决方法 |
|------|------|---------|
| 打开编辑页跳 signin | Ego Lite 无登录态 | `handOff()` 让用户登录后 `takeOverTaskSpace` 恢复 |
| `#md-editor` 不存在 | 账号编辑器非 Markdown | 「设置编辑器」切回 Markdown |
| 正文注入后发布内容为空 | 未触发 Angular 绑定 | 确认 dispatch 了 `input` 且 `ng-dirty`；兜底 `page.fill()` 真实键入 |
| 标签下拉不出结果 | 合成事件不触发远程搜索 / 等待不足 | 必须 `keyboard.type`；`waitForTimeout(1500+)` 再读下拉 |
| 标签搜不到想要的词 | 新词正常表现 | 下拉会有「新建标签: "xxx"」，点它即可 |
| 发布后仍停留编辑页 | 校验失败/弹窗 | 读 snapshot 找提示（标题空、需验证码等），修复重试一次 |
| 读者端外链图裂图 | 防盗链 | 发布前点「提取图片」或在正文替换图床链接 |
| 误操作污染已有文章表单 | 用了 `?postId=` 页 | 点「取消」/goto 别页丢弃，未点保存不会落库 |

---

## 输出格式

```
# 博客园文章发布报告

- 标题：xxx
- 标签：a, b, c（n 个）
- 个人分类：xxx（或 未选）
- 正文：xxx 字（外链图 n 张，已提示/已转存）
- 发布结果：✅ 已发布
- 文章链接：https://www.cnblogs.com/<用户>/p/<id>.html
- 备注：TaskSpace 已关闭
```

---

## 迁移说明与实测订正（2026-10-10）

> 本文件 2026-10-10 从 `~/.agents/skills/cnblogs-publish/` **原样**迁入
> `project-launcher/projects/md-publish/skills/cnblogs-publish/`，源目录随后删除。
> ⚠️ 行号务必保持稳定：`playbooks/cnblogs.js` 里有 20+ 处 `SKILL.md:<行号>` 引用，订正只能追加在文件末尾。
> 默认执行入口是确定性脚本 `../playbooks/cnblogs.js`（`bridge.mjs` → ego-browser，零大模型参与），本文件留作选择器出处与人工兜底。

- **直发已用真文跑通**（2026-10-05 首次验证，10-06 复验）。成功既不停在编辑页也不弹链接，而是路由到
  `https://i.cnblogs.com/articles/edit-done;postId=<id>;isPublished=true`、页面文案「发布成功」（第 29/224 行）；
  判据按这个 URL 前缀取，别写成 `?postId=`。对外链接自己拼：后台的 `https://www.cnblogs.com/<用户>` + `/p/<id>.html`（第 30/225 行）。
- **直发前必须确认 `#isPublished` 勾上**（第 26 行「不勾=存草稿语义」）：否则点了「发布」也只进草稿箱；勾不上就中止，不硬闯（`playbooks/cnblogs.js:355-365`）。
- **`openOrReuseTab` 可能复用到「编辑已有文章」的 `?postId=` 标签页**，填下去会覆盖旧文章（第 271 行的坑）。脚本进来先查 URL 带 `postId` 直接 fail（`playbooks/cnblogs.js:109`）。
- **个人分类只能从页面实测出来的 checkbox 文案里选**（第 24 行；实测取 `available` 列表的代码在第 190-192 行），至多一个，匹配不到就留空，绝不硬点。
  同页还有 `#post-is-aigc`（第 190 行）和 `#isPublished`（第 251 行）这些非分类 checkbox，选错就是改掉 AIGC 标记或发布开关。
