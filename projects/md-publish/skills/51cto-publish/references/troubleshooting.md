# 51CTO 发文故障排查

按发生概率排序。所有结论均来自 2026-09 的实测。

## 1. 发布后出现空文（最严重）

**现象**：发布成功，但文章正文为空。

**根因**：在发布弹窗**打开**的状态下写正文。此时 `$VM.wukcontent` 为 `undefined`，
`setForm()` 执行 `$data.form.content = $VM.wukcontent` 会把内容清空。

**验证**：
```js
JSON.stringify({
  vmWukLen: (window.$VM.wukcontent||'').length,
  formContentLen: (window.submitForm.content||'').length
})
```
任一为 0 即为未同步。

**修复**：关闭弹窗（点「取消」或 `.close-dialog.cancel`）→ 重新 `setMarkdown` →
等 4 秒 → 重新校验，两者均 > 0 再打开发布弹窗。

---

## 2. 标题发布成旧标题

**现象**：DOM 输入框显示新标题，但发布后是上一次的标题。

**根因**：`fillInput()` 只改了 DOM value，没同步 Vue 模型 `$VM.title.titleValue`。
`setForm()` 里 `$data.form.title = $VM.title.titleValue` 会用旧值覆盖。

**修复**：三重写入（顺序不可变）
```js
window.$VM.changeTitleValue({ type: "title", value: T });
window.submitForm.title = T;
document.getElementById('title').value = T;
```
注意 `$VM.changeTitleValue` 的签名是 **对象** `{type:"title", value}`，传字符串无效。

---

## 3. 点击「发布文章」/「发布」没反应

**根因**：用 `js()` 里的 `element.click()` 合成点击，不触发 Vue/jQuery 事件委托。

**修复**：必须用 ego 的 `click()` helper（真实鼠标事件）。
- 打开弹窗：先 `snapshotText()` 取「发布文章」按钮 `ref=N`，再 `click('@N')`
- 最终发布：`click('button.release')`
- 违禁词确认：`click('xpath=//button[normalize-space(text())="继续发布"]')`

---

## 4. 标签没保存

**现象**：`window.submitForm.tag` 一直是 `""`。

**这是正常的**。发布点击时才执行 `$data.form.tag = $methods.getTagStr()`，
从 `.tage-list-arr span` 的 DOM chip 读取。校验标签要看 chip DOM：

```js
[...document.querySelectorAll('.has-list.tage-list-arr span')].map(e => e.textContent.trim())
```

若 chip 为空，则发布时标签为空 → 触发「请设置标签」校验错误。

---

## 5. 二级分类选不中 / 选完被清空

**根因**：一级分类的点击处理器会把 `cate_id` 置空并重新拉取二级列表：
```js
$data.form.pid = value;
$data.form.cate_id = "";
$methods.getTwoCateData(value);
```

**修复**：严格「先一级 → `wait(2.5)` 等 AJAX → 再二级」。
以下一级分类**没有**二级分类，此时 `cate_id` 为空属正常，跳过二级点击：
软件测试、软件研发、物联网、开源、区块链、运维、网络安全、考试认证、
数字化转型、音视频、低代码、办公效率、OpenClaw、代码人生、游戏开发。

---

## 6. 发布后 heredoc 抛 `parameter 1 is not of type 'Element'`

**根因**：发布成功后整页跳转，`.editor-dialog__wrapper` 已从 DOM 移除，
再对它 `getComputedStyle` 就会抛错。

**修复**：发布后**只**用 `pageInfo().url` 判定，不要查询弹窗 DOM。
成功 URL 形如 `https://blog.51cto.com/blogger/success/<articleId>`。

---

## 7. 打开发布页被重定向到登录页

**现象**：URL 变成 `home.51cto.com/index?from_service=blog`。

**修复**：走登录 handoff —— `handOffTaskSpace(task.id)`，请用户手动登录，
回复"继续"后用 `takeOverTaskSpace` 收回。
若用户主动接管过 task space，必须先 `claimTaskSpace(id)`，不得自行 takeOver。

---

## 8. heredoc 报 `Cannot determine intended module format`

**根因**：ego 的 heredoc 是 **ESM**（支持顶层 await），混用 `require` 会冲突。

**修复**：`const fs = (await import('fs')).default`。

---

## 9. 正文里的特殊字符破坏脚本

**根因**：Markdown 含反引号、`${`、换行，直接插值进模板字符串会截断。

**修复**：正文/标题/标签/摘要**一律 base64 传参**：
```js
// Node 侧
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64')
// 浏览器侧
decodeURIComponent(escape(atob("<b64>")))   // 正确处理 UTF-8 中文
```
heredoc 始终用 `<<'EOF'`（带引号，禁止 shell 展开）。

---

## 10. 本地图片丢失

**现象**：正文图片不显示。

**根因**：Markdown 里的本地相对路径图片无法随正文上传。

**处理**：`prepare_article.py` 会输出 `local_images` 列表。
发布前提示用户改图床，或发布后在编辑器里手动补图。不阻断发布。

---

## 11. 分类 ID 对不上 / 需要新增分类

分类表快照在 `references/categories.json`，来源接口：
```
GET https://blog.51cto.com/category/get-child
```
返回 31 个一级分类及其二级子树。若平台新增分类，重新拉取并覆盖该 JSON 即可（脚本无硬编码 ID）。

---

## 12. 误发测试文章需要删除

1. 打开文章页 `https://blog.51cto.com/<用户名>/<articleId>`
2. 真实点击 `a.delete-btn`（文本「删除」）
3. 确认框里点 `.msgbtn_y`（文本「确定」）

> 注意：确认框有两套按钮（`.report-btn-concert` 与 `.msgbtn_y`），
> 删除确认用的是 **`.msgbtn_y`**，另一套不可见。点错不会删除。

删除成功后会跳转回博客主页；再访问文章 URL 应显示「文章不存在或已删除」。

---

## 13. 清理误建的草稿

发布页会自动保存草稿。若需清理：

1. 打开草稿箱 `https://blog.51cto.com/creative-center/draft`
   （也可在编辑器页点击顶部「草稿箱」计数 `#draft_num` 进入）
2. 定位目标草稿的容器 `div.common-article-list`，其删除控件为 `div.delBtn`
3. 真实点击 `.delBtn`（坐标点击或 xpath 均可）
4. 确认框点 `.msgbtn_y`（文本「确定」）

按时间判断归属，**不要误删早于本次会话的既有草稿**。
页面还有「一键清空」，会清空全部草稿，**严禁使用**。
