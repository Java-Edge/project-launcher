---
name: toutiao-publish
description: 将本地指定路径的 Markdown 文章发布到头条号（mp.toutiao.com）平台。当用户要求"把这篇 md 发到头条号"、"头条号发文"、"publish to toutiao"，或提供一个本地 .md 文件路径并希望投稿头条号时触发。基于 bb-browser 复用用户登录态，自动推断标题/正文并填写发布。不负责生成文章内容本身。
---

# 头条号文章发布 Skill

## 目标

将本地 Markdown 文件自动发布到头条号文章。

## 使用前提

1. `bb-browser` 命令可调用
2. Chrome 已安装并启用 bb-browser 扩展
3. 浏览器中已登录头条号账号（`mp.toutiao.com`）
4. 用户提供本地 .md 文件路径

---

## 页面元素速查（实测 2026-07）

| 元素 | 定位方式 | 说明 |
|------|---------|------|
| 标题输入 | `@ref`（snapshot 中 `textbox "请输入文章标题（2～30个字）"`） | 自定义组件，内部有 `<textarea>` + `<pre class="autofit-textarea-content">` |
| 正文编辑器 | `.ProseMirror` | ProseMirror 富文本编辑器，包裹在 `.syl-editor` 内 |
| 封面选项 | `.article-cover-radio-group label.byte-radio` | **通过点击 label 触发 Vue 组件**，不是操作 radio input |
| 封面选项状态 | `label > span > .byte-radio-inner` 的 class 含 `checked` | 视觉状态在此 div 上，不在 radio input 上 |
| 封面选项值 | `label > input[type=radio]` 的 value | value="1"=无封面, value="2"=单图, value="3"=三图 |
| 预览按钮 | `@ref`（`button "预览"`） | 打开预览弹窗 |
| 发布按钮 | `@ref`（预览弹窗中 `button "发布"`） | 预览弹窗内的发布按钮 |
| 预览并发布 | `@ref`（`button "预览并发布"`） | 可直接发布，跳过预览 |
| AI 助手 | `@ref`（`textbox "输入创作主题、观点或大纲，AI 帮你写"`） | 悬浮 AI 助手，不影响操作，忽略即可 |
| 标题字数限制 | 2-30 字 | 超出显示 `XX / 30` 红色警告 |

> ⚠️ **ref 编号不固定**：每次打开页面或执行操作后 ref 可能变化，**必须先 `snapshot -i` 获取最新 ref**。

---

## 封面选择的关键发现

头条号的封面选择使用 Vue 组件，**不能通过直接设置 `radio.checked=true` 来切换**。正确的做法是：

1. **找到包含"无封面"文本的 `<label class="byte-radio">` 元素**
2. **调用 `label.click()`** — 这会触发 Vue 组件的内部处理逻辑
3. 验证：`label > span > .byte-radio-inner` 的 class 包含 `checked`，且 `label > input` 的 `checked=true`

```js
var labels = document.querySelectorAll('label');
for (var i = 0; i < labels.length; i++) {
  var l = labels[i];
  if (l.className === 'byte-radio' && l.offsetParent !== null) {
    var span = l.querySelector('span');
    if (span && span.innerText && span.innerText.indexOf('无封面') !== -1) {
      l.click();  // 关键：click label，不是操作 radio input
      // 验证
      var input = l.querySelector('input');
      var inner = l.querySelector('.byte-radio-inner');
      // 应看到 input.checked=true 且 inner.className 含 checked
    }
  }
}
```

---

## 完整发布流程

### Step 1：打开头条号文章发布页

```bash
bb-browser open https://mp.toutiao.com/profile_v4/graphic/publish
```

获取 Tab ID，后续命令带 `--tab <TAB_ID>`。

---

### Step 2：确认登录状态

```bash
bb-browser snapshot -i --tab <TAB_ID>
```

正常登录后应能看到：
- `textbox "请输入文章标题（2～30个字）"`
- `button "预览并发布"`
- 用户主页链接

---

### Step 3：解析本地 Markdown

1. **Read 工具** 读全文。
2. 解析 frontmatter → `title`（可选，缺失则用正文首个 `# 一级标题` 或文件名）。
3. **正文** = 去掉 frontmatter 的 Markdown 内容。
4. **标题长度校验**：2-30 字，超出自动截断。
5. **本地图片检测**：正则扫描 `!\[[^\]]*\]\((?!https?:)[^)]+\)`，记录数量供报告标注。

---

### Step 4：填写标题

```bash
bb-browser snapshot -i --tab <TAB_ID>   # 先获取最新 ref
bb-browser fill @<标题ref> "<标题>" --tab <TAB_ID>
```

> ⚠️ 标题最多 30 字，超长时自动截断。

**如果 fill 后标题未生效**，用 JS 直接写入：

```bash
bb-browser eval "
var ta = document.querySelector('textarea[placeholder=\"请输入文章标题（2～30个字）\"]');
if (ta) {
  ta.value = '<标题>';
  ta.dispatchEvent(new Event('input', {bubbles: true}));
  ta.dispatchEvent(new Event('change', {bubbles: true}));
  ta.value + ' [' + ta.value.length + ' chars]';
} else { 'no-textarea'; }
" --tab <TAB_ID>
```

---

### Step 5：填写正文（ProseMirror 编辑器）

头条号使用 ProseMirror 编辑器（`.ProseMirror`）。

> ⚠️ **ProseMirror 写入方式**：使用 DOM 节点插入（createElement + appendChild），比 `execCommand` 更可靠。插入后必须 dispatch `input` + `change` 事件。

```bash
bb-browser eval "
var pm = document.querySelector('.ProseMirror');
if (!pm) { 'no-ProseMirror'; }
while (pm.firstChild) pm.removeChild(pm.firstChild);

var content = '<正文内容，\\n 换行分隔>';
var lines = content.split('\\\\n');
var frag = document.createDocumentFragment();
for (var i = 0; i < lines.length; i++) {
  var line = lines[i];
  if (line.startsWith('## ')) {
    var h = document.createElement('h2');
    h.textContent = line.replace(/^##\\\\s*/, '');
    frag.appendChild(h);
  } else if (line.trim() === '') {
    frag.appendChild(document.createElement('br'));
  } else {
    var p = document.createElement('p');
    p.textContent = line;
    frag.appendChild(p);
  }
}
pm.appendChild(frag);
pm.focus();
pm.dispatchEvent(new Event('input', {bubbles: true}));
pm.dispatchEvent(new Event('change', {bubbles: true}));
'written: ' + pm.innerText.length + ' chars';
" --tab <TAB_ID>
```

**校验正文**：

```bash
bb-browser eval "
var pm = document.querySelector('.ProseMirror');
pm ? (pm.innerText.slice(0, 60) + ' ... [' + pm.innerText.length + ' chars]') : 'no-editor';
" --tab <TAB_ID>
```

---

### Step 6：设置封面为「无封面」

> ⚠️ **必须点击 label 元素**，不能直接操作 radio input。

```bash
bb-browser eval "
var labels = document.querySelectorAll('label');
for (var i = 0; i < labels.length; i++) {
  var l = labels[i];
  if (l.className === 'byte-radio' && l.offsetParent !== null) {
    var span = l.querySelector('span');
    if (span && span.innerText && span.innerText.indexOf('无封面') !== -1) {
      l.click();
      var input = l.querySelector('input');
      var inner = l.querySelector('.byte-radio-inner');
      '封面已设置: inputChecked=' + input.checked + ' innerHasChecked=' + (inner.className.indexOf('checked') !== -1);
    }
  }
}
'未找到无封面选项';
" --tab <TAB_ID>
```

**验证设置成功**：

```bash
bb-browser eval "
var labels = document.querySelectorAll('label');
var results = [];
for (var i = 0; i < labels.length; i++) {
  var l = labels[i];
  if (l.className === 'byte-radio' && l.offsetParent !== null) {
    var span = l.querySelector('span');
    if (span) {
      var text = span.innerText.trim();
      if (text === '单图' || text === '三图' || text === '无封面') {
        var input = l.querySelector('input');
        var inner = l.querySelector('.byte-radio-inner');
        results.push(text + ': input=' + input.checked + ' inner=' + inner.className.indexOf('checked') !== -1);
      }
    }
  }
}
JSON.stringify(results);
" --tab <TAB_ID>
```

预期输出应包含：`无封面: input=true inner=true`

---

### Step 7：预览并发布

头条号需要先预览再发布。

```bash
bb-browser snapshot -i --tab <TAB_ID>   # 获取最新 ref
bb-browser click @<预览ref> --tab <TAB_ID>
sleep 2

bb-browser snapshot -i --tab <TAB_ID>   # 获取预览弹窗中的发布按钮 ref
bb-browser click @<发布ref> --tab <TAB_ID>
sleep 3
```

> ⚠️ **发布后行为**：头条号文章发布后保存到草稿箱，等待审核通过后才正式发布。

---

### Step 8：验证发布结果

```bash
bb-browser open https://mp.toutiao.com/profile_v4/manage/draft --tab <TAB_ID>
sleep 3
bb-browser snapshot -i --tab <TAB_ID>
```

查找文章标题链接，存在即表示发布成功。

---

## 完整发布示例

```bash
TAB_ID=$(bb-browser open https://mp.toutiao.com/profile_v4/graphic/publish 2>&1 | grep "Tab ID" | awk '{print $NF}')

# 获取 ref
bb-browser snapshot -i --tab $TAB_ID

# 填标题（先 snapshot 获取最新 ref，假设 ref=19）
bb-browser fill @19 "Java周报：JDK25、SpringAI、WildFly" --tab $TAB_ID

# 填正文
bb-browser eval "
var pm = document.querySelector('.ProseMirror');
while (pm.firstChild) pm.removeChild(pm.firstChild);
var lines = '第一段内容。\\n\\n## 二级标题\\n\\n第二段内容。'.split('\\\\n');
var frag = document.createDocumentFragment();
for (var i = 0; i < lines.length; i++) {
  var line = lines[i];
  if (line.startsWith('## ')) { var h = document.createElement('h2'); h.textContent = line.replace(/^##\\\\s*/, ''); frag.appendChild(h); }
  else if (line.trim() === '') { frag.appendChild(document.createElement('br')); }
  else { var p = document.createElement('p'); p.textContent = line; frag.appendChild(p); }
}
pm.appendChild(frag);
pm.dispatchEvent(new Event('input', {bubbles: true}));
pm.dispatchEvent(new Event('change', {bubbles: true}));
'written: ' + pm.innerText.length + ' chars';
" --tab $TAB_ID

# 设置无封面
bb-browser eval "
var labels = document.querySelectorAll('label');
for (var i = 0; i < labels.length; i++) {
  var l = labels[i];
  if (l.className === 'byte-radio' && l.offsetParent !== null) {
    var span = l.querySelector('span');
    if (span && span.innerText && span.innerText.indexOf('无封面') !== -1) {
      l.click();
      '封面已设置';
    }
  }
}
'未找到';
" --tab $TAB_ID

# 预览并发布（先 snapshot 获取最新 ref）
bb-browser snapshot -i --tab $TAB_ID
bb-browser click @22 --tab $TAB_ID   # 预览
sleep 2
bb-browser snapshot -i --tab $TAB_ID
bb-browser click @24 --tab $TAB_ID   # 发布
sleep 3

# 验证
bb-browser open https://mp.toutiao.com/profile_v4/manage/draft --tab $TAB_ID
sleep 3
bb-browser snapshot -i --tab $TAB_ID
```

---

## 错误排查

| 错误 | 原因 | 解决方法 |
|------|------|---------|
| 标题不在 2-30 字范围 | 标题太短/太长 | 调整标题字数 |
| ProseMirror 未找到 | 编辑器未加载完成 | 等待 3-5 秒后重试 |
| 正文写入后内容为空 | ProseMirror 事件未触发 | 确保 dispatch `input` + `change` 事件 |
| 封面设置无效 | 直接操作 radio input 而非点击 label | 改为 `label.click()` |
| 发布后无反应 | 需要先预览 | 先 click "预览"，再在弹窗中 click "发布" |
| 发布后仍在草稿箱 | 头条号文章需审核 | 正常行为，审核通过后自动展示 |
| ref 找不到 | ref 编号变化 | 每次操作前 `snapshot -i` 获取最新 ref |

---

## 输出格式

```
# 头条号文章发布报告

- 标题：xxx
- 正文：xxx (xxx 字)
- 封面设置：无封面
- 发布结果：✅ 已保存到草稿箱（待审核）
- 草稿箱链接：https://mp.toutiao.com/profile_v4/manage/draft
- 备注：头条号文章发布后需审核通过才会正式展示，审核时间通常为几分钟到几小时
```

---

## 迁移说明与实测订正（2026-10-10）

> 本文件 2026-10-10 从 `~/.agents/skills/toutiao-publish/` **原样**迁入
> `project-launcher/projects/md-publish/skills/toutiao-publish/`，源目录随后删除，本仓库成为唯一事实来源。
> 上一节起的行号未变动 —— `playbooks/toutiao.js` 的注释按 `L<行号>` 引用本文件，所以订正只能追加在末尾。
> 默认执行入口已不是本文件，而是确定性脚本 `../playbooks/toutiao.js`（经 `bridge.mjs` 跑 ego-browser，零大模型参与）；
> 本文件保留作选择器出处与人工/智能体兜底。

### 订正 1：工具从 bb-browser 换成 ego-browser（已验证）
本文件上文写的是 bb-browser 命令。项目内已把整套流程移植成 ego-browser 并在 2026-10-05 / 10-06 用真文跑通（job 19，结果 `DRAFT_OK`）。移植时最容易踩的是 `wait()` 单位：bb-browser 是毫秒，ego-browser 是**秒**。其余对应关系：`open`→`openOrReuseTab`、`eval`→`js(String.raw\`...\`)`、`snapshot -i`→`snapshotText`；`js()` 里不能用 `@N`/`ref=N`，也不能用 `:has-text()` 这类 Playwright 语法，要原生 CSS/XPath。

### 订正 2：正文必须走 paste 事件写进 ProseMirror
头条编辑器是 `.syl-editor .ProseMirror`（ProseMirror 模型）。直接 `appendChild` 或改 `innerHTML` **不会进入模型**，页面看着有字、提交却是空文。实测唯一有效的写法是构造 `ClipboardEvent('paste')` 并带 `text/html` 数据派发。校验用 `pm.innerText` 去空白后的长度（见 `playbooks/toutiao.js` 第 4 节）。

### 订正 3：封面是必填项，且本版 UI 的「无封面」选项点不动（2026-10-06 四条实测）
1. 提交按钮（新版页脚文案是「预览并发布」，没有裸「发布」）点下去后，页面只弹一条 `<p class="err-tip-cover">请完成封面图设置</p>` 的 toast，不拦截、不跳转，靠肉眼极易误判成功 —— 判据要用预先挂好的 `MutationObserver` + XHR/fetch 钩子回读。
2. 「无封面」是 Vue 自定义 radio（`.byte-radio`），状态位在看 `.byte-radio-inner` 是否含 `checked`，**不是** `input.checked`。6 种点击策略（`click()`、`dispatchEvent`、点 label、点 inner、键盘、直接改 class）都切不过去 —— 这是这版 UI 的选项失效，不是选择器没找对，别再猜。
3. 点封面「+」（`.article-cover-add`）之后，全页 `input[type=file]` 数量为 **0**，ego 的 `uploadFile(sel, path)` 要求选择器命中真实 file input（否则报 `Node is not a file input element`），所以脚本没有可用的自动传封面入口。
4. 结论：**头条只做到草稿箱**。`mode=publish` 也只做到落盘核验并打印人工步骤，不点最终提交。补封面可用项目自带的 `assets/cover-default.png`（1080×608）。

### 订正 4：草稿箱 / 作品管理的地址与判据
- 草稿箱：`https://mp.toutiao.com/profile_v4/manage/draft`，行元素是 `.article-draft-item`，「编辑/删除」都是 JS 绑定、没有 href；`/profile_v4/manage/content/draft` 是只渲染侧栏的空壳，别用。
- 已提交的权威判据是作品管理 `https://mp.toutiao.com/profile_v4/manage/content/all/manage/content/all`（域名以 `playbooks/toutiao.js` 里的 `CONTENT_ALL` 常量为准）：**不能拿草稿箱当发布成功的证据**，草稿箱里恰恰是"没提交出去"的东西。
- 头条编辑器会自动暂存并提示「草稿已保存」，落盘核验要轮询这个提示；自动暂存后 URL 常常不带 `?pgc_id=`，不能据 URL 判断成败。
