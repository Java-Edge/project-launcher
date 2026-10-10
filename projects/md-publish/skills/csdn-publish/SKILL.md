---
name: csdn-publish
description: 将本地指定路径的 Markdown 文章发布到 CSDN（editor.csdn.net/md）平台。当用户要求"把这篇 md 发到 CSDN"、"CSDN 发文"、"发布到 CSDN"、"publish to csdn"，或提供一个本地 .md 文件路径并希望投稿 CSDN 时触发。基于 bb-browser 复用用户登录态，自动推断标题/正文/标签并填写发布。不负责生成文章内容本身。
---

# CSDN Publish（CSDN 发文）

把一个本地 Markdown 文件发布为 CSDN 文章。核心用 **bb-browser**（复用用户 Chrome 登录态，通过扩展直接操控页面），**无需账号密码**，只要用户此前在浏览器登录过 CSDN 即可。

CSDN Markdown 编辑器地址：`https://editor.csdn.net/md/`

> ⚠️ **与用户偏好存在已知冲突（2026-09-24 记录，暂未解决）**：用户已保存偏好「博客平台发文一律用 ego-browser（Ego Lite），不要用 bb-browser 操控 Chrome」，但**本 skill 的整套流程与全部实测选择器都是在 bb-browser 上验证的**（2026-09-24 用它成功发布 2 篇）。经用户决定：先保留 bb-browser 版本，不盲目改写。
> - 照本 skill 执行时用 bb-browser 是**被允许的例外**，不算违反偏好。
> - 若将来迁到 ego-browser：`open`→`openOrReuseTab`、`eval`→`js(String.raw\`...\`)`、`snapshot -i`→`snapshotText`、`--tab <id>` 去掉（改用 task space）；`wait` 参数单位从**毫秒**变成**秒**，这是最容易出错的一处。迁移后必须用一篇真文重跑一遍「存草稿→刷新→校验标签持久化」才算验证完成，未验证前不要替换正文。

> **选择器以 `snapshot -i` 实时验证为准**。CSDN 编辑器会改版，每次操作前先用 `snapshot -i` 确认页面结构，选择器失效时以实时 snapshot 的 `ref=N` 或 `textbox/button` 文案为准，不要盲目重试同一失败选择器。

> **bb-browser ref 编号不固定**：每次打开页面或执行操作后 ref 可能变化，**必须先 `snapshot -i` 获取最新 ref** 再 `click`/`fill`。

---

## ⚠️ 实测关键发现（2026-09 版，已验证可全自动）

1. **正文编辑器不是 CodeMirror，是 `cledit` 的 `contenteditable`**：`.editor__inner.markdown-highlighting`（一个 `<pre>`）。写入用 `e.textContent = md` + dispatch `input`/`change`。`document.querySelector('.CodeMirror')` 在本编辑器**不存在**。
2. **页面里有一个 iframe**（`https://app-blog.csdn.net/csdn/aiChatNew?agent=1`），只是右侧 AI 对话挂件，**不是编辑器**。正文在父页 `.editor__inner`，无需进 iframe。
3. **标题输入框**：`input.article-bar__title--input`，placeholder「请输入文章标题（5~100个字）」。受控组件，用 native setter + dispatch `input`/`change`。
4. **文章标签的持久化机制（2026-09 实测修正，替换旧版「调 tagOnLine」结论）**：发布抽屉的「添加文章标签」点开后出现 `input.el-input__inner`（placeholder「请输入文字搜索，Enter键入可添加自定义标签」）。
   - **仅调 `tagOnLine()` 或合成 Enter（dispatch KeyboardEvent / bb-browser press / fill+Enter）都不落库**：`tagInputValue` 会残留、显示层可能变，但保存草稿 + 刷新后标签丢失。**别信返回的 'added'**——它不代表写入存储。
   - **可靠做法（已验证持久化）**：
     1. 找 `input[placeholder*="标签"]` 的 `__vue__`，沿 `$parent` 上溯到含 `tagOnLine` 的 `mark-selection` 组件（实测链路 `ElInput → ElAutocomplete → mark-selection`）。
     2. 用 `selected.splice(0, selected.length, ...目标标签)` 直接把目标数组写进 `selected`（splice 保证 Vue 响应式即时渲染），再 `tagInputValue=''`。
     3. **必须补调组件方法 `saveTagToStore()`**——这一步才把标签写入存储；缺它保存草稿后标签必然丢失。
     4. 点「保存为草稿」→ **刷新页面 → 重新打开发布抽屉**，用 `.el-tag.el-tag--light.mark_selection_box_el_tag` 校验是否持久化。
   - 热词 chip（`.el-tag--light` 的 `java`/`AI编程`/`hibernate`/`后端`/`python` 等）**点击即真实入账**（进入 `selected` 且持久化，实测保存+重载后仍在）；但热词列表固定且有限，够用时应优先点热词 chip。
   - **当前版本选中标签渲染类名是 `.el-tag.el-tag--light.mark_selection_box_el_tag`（不是旧文档的 `.el-tag.is-selected`）**。
5. **封面非必填，但正文有图时应选一张**（2026-09 实测补全）：无正文图直接点「发布文章」也能成功。一旦正文里有图（见第 6 条转存），抽屉的封面项会从「暂无内容图片」变成候选列表，此时按下面两步设封面：
   1. 点第一个候选：`document.querySelector('.modal__inner-2 .img-selection-list').querySelectorAll('.img-selection-item')[0].click()` → 进入裁剪态（封面项文字变「图片编辑 / 封面图预览 / 确认上传」）。
   2. **必须再点「确认上传」**才生效：该文案是 `.vicp-operate-btn` 里的叶子节点，`closest('button')` 取不到，按类名点 —— `[...document.querySelectorAll('.vicp-operate-btn')][0].click()`。
   设好后会生成独立地址 `https://i-blog.csdnimg.cn/direct/<uuid>.png`，且**存草稿 + 刷新后仍在**（实测）。
   注意：未点确认上传时封面项只剩「添加封面」字样，容易误判成"已清除"，以 `img[src*="/direct/"]` 是否存在为准。
6. **外链图片会被 CSDN 自动转存并大概率失败**：Twitter(`pbs.twimg.com`) 等图会被改写成「外链图片转存失败,源站可能有防盗链机制…」占位符，**且不会成为正文内容图（无法用于封面）**。
   - **正解（2026-09 实测，替代旧版"发前清掉坏图行"的兜底）：发布前自己先调官方转存接口，把 URL 换掉**。在已登录的编辑器页里直接调（同源、自动带 cookie）：
     ```js
     // 参数从 app.chunk.*.js 反查得到，别猜
     window.csdn.upload.transferImg({
       uniqueId: 'qw_' + Date.now() + '_' + i,
       imgUrl: 'https://p.ipic.vip/217fbp.png',
       type: 'blog', rtype: 'article', isCrawler: 0, nocache: 2
     })  // → Promise，resolve {code:200, data:{url, width, height, contentLength, originUrl}}
     ```
     返回的 `data.url` 形如 `https://i-blog.csdnimg.cn/img_convert/<hash>.png`，是 CSDN 自家永久地址。
     多张图用 `Promise.all` 并发（实测 9 张 <5s 全成功），结果写进 `window.__tr.map` 供回读；
     然后在**本地**把 md 里的外链正则替换成这些 `csdnimg.cn` 地址，再走第 3 步注入正文。
   - 上传库出处：`https://g.csdnimg.cn/csdn-upload/1.0.9/csdn-upload.js`（暴露 `csdn.upload.{uploadImg,transferImg,uploadVideo}`）。本地文件上传走 `csdn.upload.uploadImg({appName:'direct_blog', file, imageTemplate})`，但需要真 `File` 对象，页面内不便构造，**优先用 `transferImg`**。
   - 校验：注入后 `csdnimg.cn` 出现次数应等于图片数；发布后到成品页数 `naturalWidth>0`。
   - 仅当某张图转存失败时才退回旧做法：用 JS 把含「外链图片转存失败」的行过滤掉，避免正文留占位符。
7. **新版发布抽屉可能在首次快照后才完成渲染**：点击编辑器页的「发布文章」后，立即执行的 `snapshot -i` 可能仍显示旧页面；用 `bb-browser wait 1000`~`2000` 后重新 snapshot，或通过 DOM 检查 `添加文章标签` / `保存为草稿` 确认抽屉已打开。当前实测抽屉会保留 URL 中的 `articleId` 草稿地址。
8. **`input.tag__option-chk` 复选框属于「分类专栏」，不是文章标签（2026-09 实测修正，危险坑）**：发布抽屉里那批 `input.tag__option-chk`（实测 74 个，如 `AI Agent`/`AI大模型应用开发`/`ClaudeCode`/`AI` 等）勾选后填进的是**「分类专栏」**区域，与文章标签完全无关。曾实测误把 3 个标签词条勾进分类专栏（违反下方第 9 点），务必先 `input.tag__option-chk:checked` 检查并取消。**文章标签的加入只走「添加文章标签」面板**（热词 chip 或组件 `selected`+`saveTagToStore()`）。
9. **分类专栏与文章标签是两个完全不同的区域**：分类专栏最多只能选择一个。必须先在「分类专栏」区域检查已有专栏，选择唯一一个与文章最匹配的专栏；文章标签只能添加到「文章标签」区域，不能把多个标签词条（如 `AI`、`AI大模型应用开发`、`机器学习`）误选到分类专栏中。若没有适配的已有专栏，保持未选择，不要批量创建或填入多个专栏。
   - 2026-09 实测补充：账号无已有专栏时，该区域只剩「新建分类专栏」一项，且那批 `input.tag__option-chk` **全部 `offsetWidth===0 && offsetHeight===0`（隐藏面板）**，此时正确做法就是**什么都不点、留空发布**（实测不拦发布）。检查是否误勾用 `document.querySelectorAll('input.tag__option-chk:checked').length`，应为 0。
   - 抽屉里「分类专栏」旁标注的是"最多选择3个分类专栏，#为二级分类"，但按本 skill 纪律**只选 0 或 1 个**，不要为凑数新建专栏。
10. **发布抽屉重开 + 正文完整性**（2026-09 实测）：
    - 保存草稿后**刷新页面**再点「发布文章」重开抽屉，用 `bb-browser click @ref` 有时点了没反应（drawer 没弹出）。兜底：用 JS 直接 `[].slice.call(document.querySelectorAll('button')).filter(b=>b.innerText.trim()==='发布文章')[0].click()`。
    - 期间出现过正文开头被串入杂散文本（一个多余 `Claude` 行，长度 2919→2926）的情况（疑为标签 autocomplete 操作串写进 `.editor__inner`）。**每次标签/发布抽屉操作前后都校验正文 HEAD/TAIL**，发现头部杂散文本用 `textContent` 截掉后 dispatch `input`/`change`。
11. **发布抽屉的真实容器是 `.modal__inner-2`**（不是 `el-drawer`，也查不到 `.el-drawer__body`）。定位抽屉内元素一律加这个前缀，否则会命中编辑器页或右侧 AI iframe：
    - 标签入口：`.modal__inner-2 button.tag__btn-tag`（文字「添加文章标签」；它是 BUTTON，按"叶子节点文案等于该串"去找会找不到，2026-09 实测踩过）
    - 保存草稿：`.modal__inner-2 button` 文本含「保存为草稿」；最终发布：同容器内文本恰为「发布文章」
    - 编辑器页的「发布文章」有 **2 个**同名按钮：`[0]` 是 `btn btn-publish`（真），`[1]` 是 `simulation-button`（装饰，点了没反应）。取 `[0]` 或按 class 过滤。
12. **正文校验要用 `textContent`，不能用 `innerText`**（2026-09 实测）。cledit 的高亮层会让 `innerText` 比 `textContent` 多出几十字（实测同一份正文 2987 vs 3032），据此判断"被串入杂散文本"会误报。做逐字比对就把 `textContent` 取回本地与源 md 跑 `difflib`，实测差异只有结尾多 1~2 个换行。
13. **标签热词每会话都不一样，别按文档里的固定词表写死**（2026-09 实测）：同一账号两次打开抽屉，`.el-tag--light` 分别是 `hibernate/java/后端/python/pip` 与 `python/pip/uv/开发语言/Vue`。技术向 AI 文章基本命中不了，直接走第 4 条的 `selected` + `saveTagToStore()` 更省时间。校验时注意 `.el-tag--light` 同时匹配热词和已选标签，用 `.mark_selection_box_el_tag` 精确取已选。
14. **工具选择的两条硬限制**（2026-09 实测）：
    - `bb-browser` **没有** `uploadFile` 命令（`--help` 只有 open/snapshot/click/fill/eval/fetch 等）。本 skill 全部动作都能靠 `eval` 完成，不受影响；但不要指望用它传封面文件。
    - `browser-use` MCP（`mcp__browser-use__*`）是**另一个独立浏览器实例**，`list_pages` 只有 `about:blank`，**不带用户 Chrome 登录态**，不能替代 bb-browser / ego-browser 发文。别浪费时间往里导航。
    - `bb-browser eval "..."` 里写含正则字面量、`|`、反斜杠的 JS 会被 shell 转义打断，报 `SyntaxError: Invalid regular expression: missing /`。**任何非单行的 JS 都写成 `/tmp/x.js` 再 `bb-browser eval "$(cat /tmp/x.js)"`**（本 skill 的中文标签名注意事项同理，范围扩大到正则与模板字符串）。

---

## 自动化原则（重要）

**目标：全流程自动决策，人工介入只保留一次——发布前的不可逆确认。**

- 标题、标签、分类（专栏/分类）**全部自动推断**，不逐项去问用户。
- 即使 frontmatter 缺失，也按下方「决策规则」自动定，并在**最终发布确认**里一并展示，让用户一次性过目。
- 唯一必须的人工节点：**点「发布文章」前的一次确认**（因发布不可逆）。若用户发起指令时已明确"直接发布/不用确认/auto"，则连这次也跳过，直接发布。
- 若用户明确"只存草稿"，则走草稿模式，不点发布，也无需确认。

---

## 能力依赖（本地）

- **bb-browser**：`open / snapshot -i / click / fill / eval / press / scroll`。
- **Read 工具**：读取本地 Markdown 与 frontmatter。
- **python3**：base64 编码正文（避免反引号/`$`/换行破坏 eval 脚本）。
- CSDN 账号已在浏览器登录（未登录时走「登录 handoff」）。

---

## 元数据决策规则（自动推断，无需询问）

```markdown
---
title: 文章标题
tags: [Agent, LLM]     # 1~5 个
category: 后端
summary: 摘要...
publish: true          # false=只存草稿
---
```

- **标题**：frontmatter.title → 正文首个 `# 一级标题` → 文件名清洗。长度 5~100 字，超长截断。
- **标签**：`frontmatter.tags` ∪ 正文抽取技术名词，去重、按相关度排序，取前 5。CSDN 受控词表不强制（自定义标签可加），至少 1 个，最多 5 个（抽屉提示"还可添加 N 个标签"）。
- **分类专栏**：先读取发布抽屉中已有专栏名称，按正文关键词匹配度只选择一个最适配的已有专栏；没有适配项时保持未选择，不能把多个标签当作专栏，也不能同时选择多个专栏。`后端`仅作为内部兜底分类判断，不代表要创建或选择名为“后端”的专栏。

---

## 完整工作流

### 第 1 步：读取并解析本地 Markdown（自动）

1. **Read 工具** 读全文，解析 frontmatter。
2. **body** = 去 frontmatter 的正文。
3. **图片检测**：正则 `!\[[^\]]*\]\((?!https?:)[^)]+\)` 找本地图（`bb-browser` 无 uploadFile，本地图无法直传，仅提示）。
4. **有远程图就先预转存，再注入正文**（必做，见实测发现第 6 条）：打开编辑器（第 2 步）后，在页面里并发调用 `window.csdn.upload.transferImg(...)` 拿到 `i-blog.csdnimg.cn` 地址，在**本地**把 md 的外链替换掉，写到 `/tmp/csdn_body_final.md`，再对这份终稿做 base64 注入。直接注入外链会留下「外链图片转存失败」占位符。

### 第 2 步：打开编辑器 + 登录检测

```bash
bb-browser open https://editor.csdn.net/md/ 2>&1 | tail -5
# 取 Tab ID，后续带 --tab <TAB_ID>
bb-browser snapshot -i --tab <TAB_ID>   # 应见「发布文章」按钮、标题输入框
```

跳登录页 → 走「登录 handoff」。

### 第 3 步：写正文（先清坏图，再注入）

base64 编码正文：

```bash
python3 -c "import base64; print(base64.b64encode(open('<绝对路径.md>','rb').read()).decode())" > /tmp/csdn_body_b64.txt
```

```bash
BODY_B64=$(cat /tmp/csdn_body_b64.txt)
bb-browser eval "
var md = decodeURIComponent(escape(atob('${BODY_B64}')));
// 清除 CSDN 自动转存失败的占位图行（如有）
md = md.split('\n').filter(function(l){
  return l.indexOf('外链图片转存失败')===-1 && l.indexOf('img-home.csdnimg.cn')===-1;
}).join('\n');
var e = document.querySelector('.editor__inner');
e.focus();
e.textContent = md;
e.dispatchEvent(new Event('input', { bubbles: true }));
e.dispatchEvent(new Event('change', { bubbles: true }));
'written len=' + e.innerText.length;
" --tab <TAB_ID>
```

**校验首尾**：

```bash
bb-browser eval "var e=document.querySelector('.editor__inner'); var v=e.innerText; 'HEAD['+v.slice(0,40)+'] TAIL['+v.slice(-40)+']';" --tab <TAB_ID>
```

### 第 4 步：填标题

```bash
bb-browser eval "
var i=document.querySelector('input.article-bar__title--input');
var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
setter.call(i,'<标题>');
i.dispatchEvent(new Event('input',{bubbles:true}));
i.dispatchEvent(new Event('change',{bubbles:true}));
i.value.length+' chars';
" --tab <TAB_ID>
```

### 第 5 步：加标签（关键：`selected` + `saveTagToStore()` 才能持久化）

打开发布抽屉后，点「添加文章标签」（snapshot 拿 ref）打开标签面板，然后：

**方案 A——目标标签都是热词 chip（`.el-tag--light`）时，直接点 chip 最稳**（点击即入账且持久化）：

```bash
# 先看清面板上有哪些热词 chip（java/AI编程/hibernate/后端/python 之类）
bb-browser eval "[].slice.call(document.querySelectorAll('.el-tag--light')).map(function(e){return e.innerText.trim();})" --tab <TAB_ID>
# 点目标 chip（示例：AI编程）
bb-browser eval "var c=[].slice.call(document.querySelectorAll('.el-tag')).filter(function(e){return e.innerText.trim()==='AI编程';})[0]; if(c)c.click(); c?c.innerText:'not-found';" --tab <TAB_ID>
```

**方案 B——需要自定义标签（热词里没有）时，写 `selected` + `saveTagToStore()`**（唯一可靠路径）：

```bash
cat > /tmp/csdn_settags.js << 'EOF'
var getMs = function () {
  var i = document.querySelector('input[placeholder*="标签"]');
  var e = i; var c = null;
  while (e) { if (e.__vue__) { c = e.__vue__; break; } e = e.parentElement; }
  var m = null; var n = c;
  for (var d = 0; n && d < 8; d++) { if (typeof n.tagOnLine === 'function') { m = n; break; } n = n.$parent; }
  return m;
};
var ms = getMs();
if (!ms) { 'no mark-selection component'; }
else {
  var target = ['AI Agent', 'Claude', 'Anthropic', 'think工具'];   // <-- 替换为目标标签（≤5 个）
  ms.selected.splice(0, ms.selected.length, target[0], target[1], target[2], target[3]);
  ms.tagInputValue = '';
  if (typeof ms.saveTagToStore === 'function') ms.saveTagToStore();   // 关键：不调它标签不落库
  JSON.stringify({ selected: ms.selected, saveCalled: typeof ms.saveTagToStore === 'function' });
}
EOF
bb-browser eval "$(cat /tmp/csdn_settags.js)" --tab <TAB_ID>
```

> 标签名含中文/特殊字符时，务必走文件方式（`eval "$(cat /tmp/x.js)"`），避免 shell 转义破坏；对象字面量直接内联会因转义报 `SyntaxError`，也建议写文件。

**校验（渲染类名在当前版本是 `mark_selection_box_el_tag`，不再是 `.is-selected`）**：

```bash
bb-browser eval "[].slice.call(document.querySelectorAll('.el-tag.mark_selection_box_el_tag')).map(function(e){return e.innerText.trim();}).filter(Boolean);" --tab <TAB_ID>
```

**持久化验证（必做）**：点「保存为草稿」→ `refresh` → 重开发布抽屉 → 再用上面校验命令核对。若标签没回来，就是漏了 `saveTagToStore()`（或误走了方案 C 的复选框）。

**方案 C——不要碰 `input.tag__option-chk` 复选框**：那是「分类专栏」的选择框，勾选会填进分类专栏而不是文章标签（详见上面实测发现第 8/9 点）。如果误勾了，`input.tag__option-chk:checked` 逐个 `i.click()` 取消。

### 第 6 步：发布抽屉 + 发布

```bash
bb-browser snapshot -i --tab <TAB_ID>          # 找「发布文章」按钮 ref
bb-browser click @<发布文章ref> --tab <TAB_ID>   # 打开发布抽屉
sleep 3
bb-browser snapshot -i --tab <TAB_ID>          # 抽屉内最终「发布文章」按钮 ref
bb-browser click @<最终发布文章ref> --tab <TAB_ID>
sleep 4
```

- 分类专栏：先检查「分类专栏」区域已有选项，只选择一个最适配的专栏；没有适配项时保持为空。不要把文章标签区域的词条复制到分类专栏，也不要同时选择多个专栏。
- 封面：正文有图时按实测发现第 5 条设封面（点 `img-selection-item` → 点 `.vicp-operate-btn` 确认上传）；无正文图时**仍可发布**（非必填）。`bb-browser` 无 uploadFile，本地图传不进来，想让图当封面必须先有正文图。
- 摘要：缺省自动截取，一般不动。
- 发布前复核正文：`document.querySelector('.editor__inner').textContent` 取回本地与源 md 跑 `difflib`，只允许结尾换行差异。

### 第 7 步：发布前确认（唯一人工节点）

在第 6 步点最终「发布文章」**之前**，用 question 工具一次性展示【标题 / 标签 / 正文字数 / 外链图提示】，选项：`确认发布` / `先存草稿` / `取消`。

- 用户指令含"直接发布/不确认/auto" → 跳过，直接第 6 步。
- 选"先存草稿" → 点「保存为草稿」(`button "保存为草稿"`)，结束。

### 第 8 步：验证发布结果

```bash
bb-browser eval "location.href" --tab <TAB_ID>
```

**成功判定**：URL 变为 `https://mp.csdn.net/mp_blog/creation/success/<id>`，或页面含「发布成功」，或跳转到 `https://blog.csdn.net/<用户>/article/details/<id>`（审核中）。把文章链接返回用户。

### 第 9 步：收尾

无额外清理。

---

## 登录 handoff（未登录时）

打开编辑器若跳登录页，提示用户手动登录后回复"继续"，重新 `snapshot -i` 回到第 3 步。

---

## 页面元素速查（CSDN Markdown 编辑器，实测 2026-09）

| 元素 | 定位方式 | 说明 |
|------|---------|------|
| 标题输入 | `input.article-bar__title--input` | placeholder「请输入文章标题（5~100个字）」，native setter 写 |
| 正文编辑区 | `.editor__inner.markdown-highlighting`（`contenteditable` `<pre>`，cledit 引擎） | `textContent` + input/change 事件；**非 CodeMirror**。校验取 `textContent`，`innerText` 会因高亮层偏大 |
| 发布按钮（编辑页） | `button.btn.btn-publish`（同名 `simulation-button` 是装饰，点了无反应） | 打开发布抽屉；保存草稿后重开失败时用 DOM `.click()` 兜底 |
| **发布抽屉容器** | `.modal__inner-2` | 不是 `el-drawer`；抽屉内元素一律加此前缀定位 |
| 标签入口 | `.modal__inner-2 button.tag__btn-tag`（文案「添加文章标签」） | 按"叶子节点文案相等"找不到，它是 BUTTON |
| 标签输入 | 点入口后出现 `input.el-input__inner[placeholder*="标签"]` | 见第 5 步方案 A/B；`tagOnLine()`/Enter 不落库，要 `selected`+`saveTagToStore()` |
| 已加标签 | `.el-tag.mark_selection_box_el_tag` | 校验用（注意：**不是** `.is-selected`；`.el-tag--light` 会同时匹配热词，不精确） |
| 热词 chip | `.el-tag.el-tag--light` | 点击即真实入账且持久化；**词表每会话不同**，别写死 |
| 分类专栏复选框 | `input.tag__option-chk`（约 74 个，实测全部隐藏 `offsetWidth===0`） | **属于分类专栏，不是文章标签**，勿用来加标签；无已有专栏时留空 |
| 封面候选 | `.modal__inner-2 .img-selection-list .img-selection-item` → `.vicp-operate-btn`（确认上传） | 正文有图才出现；成功后生成 `i-blog.csdnimg.cn/direct/<uuid>.png`，刷新仍在 |
| 外链图预转存 | `window.csdn.upload.transferImg({uniqueId,imgUrl,type:'blog',rtype:'article',isCrawler:0,nocache:2})` | 返回 `data.url`（`i-blog.csdnimg.cn/img_convert/…`），见实测发现第 6 条 |
| 最终发布 | `.modal__inner-2 button`（文案恰为「发布文章」，class `btn-b-red`） | 点击后跳 success 页 |
| AI 助手 | 右侧 iframe（`app-blog.csdn.net/csdn/aiChatNew`） | 忽略，不是编辑器 |
| 成功页 | `https://mp.csdn.net/mp_blog/creation/success/<id>` | 标题「发布成功」，正文「正在审核中」 |

---

## 错误排查

| 错误 | 原因 | 解决方法 |
|------|------|---------|
| 正文写不进 | 误用 CodeMirror 选择器 | 用 `.editor__inner` contenteditable + textContent |
| 标题写不进 | 受控组件未触发事件 | native setter + dispatch input/change |
| 标签加了但保存后丢失 | 只调了 `tagOnLine()`/Enter，或只改了 `selected` | 必须 `selected.splice(...)` + **`saveTagToStore()`**，再保存草稿+刷新验证 |
| 标签「added」但没生效 | `tagOnLine()` 返回 `'added'` 是假象 | 别信返回值；用 `.mark_selection_box_el_tag` 校验 + 持久化验证 |
| 误把词条勾进“分类专栏” | 把 `input.tag__option-chk` 复选框当成标签面板 | 那是分类专栏选项；`querySelectorAll('input.tag__option-chk:checked')` 逐个 `.click()` 取消；标签只走「添加文章标签」 |
| 正文"变长/被串入杂散文本" | 用 `innerText` 校验，被高亮层虚增（实测 2987→3032） | 改用 `textContent`，并与本地源 md 跑 `difflib` 逐字比对 |
| **真的**被串入杂散文本（如多一行 `Claude`） | 标签 autocomplete 操作串写 `.editor__inner` | 每步（标签/抽屉操作）前后校验正文 HEAD/TAIL；确认真有杂散才用 `textContent` 截掉 + dispatch input/change |
| 保存草稿后重开发布抽屉没反应 | `click @ref` 偶发失效；或点到了 `simulation-button` | 用 JS 按文案取 `button.btn.btn-publish` / `.modal__inner-2 button` 再 `.click()` |
| 正文出现坏图占位符 | 外链图被 CSDN 转存失败 | **首选发布前调 `csdn.upload.transferImg` 预转存并回填 URL**（实测发现第 6 条）；单张失败才退回过滤掉「外链图片转存失败」行 |
| 封面点了没生效 | 只点了候选图，没点「确认上传」 | 补点 `.vicp-operate-btn`；以出现 `img[src*="/direct/"]` 为准 |
| 按文案找不到「添加文章标签」 | 它是 `button.tag__btn-tag`，非叶子节点 | 用 `.modal__inner-2 button.tag__btn-tag` |
| `bb-browser eval` 报 `SyntaxError: missing /` | 内联 JS 含正则/反斜杠被 shell 转义打断 | 写 `/tmp/x.js` 再 `eval "$(cat /tmp/x.js)"` |
| 发布被拦要求封面 | 个别账号策略 | 点「从本地上传」传图，或先存草稿 |
| 发布后跳 success 页 | 正常 | URL 含 `creation/success/<id>` 即成功，审核中 |

---

## 输出格式

```
# CSDN 文章发布报告

- 标题：xxx
- 标签：xxx, yyy（n 个）
- 正文：xxx 字（外链图 n 张已预转存为 csdnimg.cn；或：已清理转存失败占位图 n 张）
- 封面：已用正文首图 / 无（非必填）
- 发布结果：✅ 已发布（审核中）
- 文章链接：https://blog.csdn.net/<用户>/article/details/<id>
- 备注：CSDN 文章发布后需审核，审核通过后才公开展示
```

---

## 迁移说明与实测订正（2026-10-10）

> 本文件 2026-10-10 从 `~/.agents/skills/csdn-publish/` **原样**迁入
> `project-launcher/projects/md-publish/skills/csdn-publish/`，源目录随后删除。行号未变动（`playbooks/csdn.js` 按 `SKILL.md 第 N 条` 引用）。
> 默认执行入口是确定性脚本 `../playbooks/csdn.js`（`bridge.mjs` → ego-browser，零大模型参与），本文件留作选择器出处与人工兜底。

- **上文那条「bb-browser 与 ego-browser 偏好冲突」已经解决了**：整套流程已移植到 ego-browser，并在 2026-10-06 用真文完成一次**直发**（成功判定 URL 形如 `mp.csdn.net/mp_blog/creation/success/<id>`，articleId 167131876）。移植要点即上文注释里预告的那几条：`wait` 单位毫秒→**秒**、`open`→`openOrReuseTab`、`eval`→`js(String.raw)`、`snapshot -i`→`snapshotText`。本 skill 不再是 bb-browser 例外。
- **正文一致性校验要先归一化 Unicode 空格**（2026-10-05 实测）：CSDN 的 cledit 会把 `U+00A0 / U+2007 / U+202F` 落成普通空格、吃掉 `U+200B / U+2060 / U+FEFF`。一篇含 198 个 NBSP 的稿件，长度相同但从第 17 个字符起逐字符不等 —— 不归一化就会误判「写入失败」，而内容其实完好。判据见 `playbooks/csdn.js` 的 `norm()`。
- **校验正文长度用 `textContent`，不要用 `innerText`**：cledit 高亮层会把 `innerText` 虚增几十字（实测 2987 vs 3032）。
- **成功页给的是创作中心地址，不是公开阅读地址**。公开链接要拼 `https://blog.csdn.net/<用户名>/article/details/<id>`，或直接回读文章列表；审核通过前对外不可见，别把 `creation/success/<id>` 当成品链接发出去。
