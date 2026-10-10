---
name: douyin-publish
description: 用于把本地图文作品发布到个人抖音账号。支持两种输入方式：①本地图片/视频 + 文案；②推特/X 帖子链接（自动抓取文案 + 首图）。使用 bb-browser 浏览器自动化和登录态，支持发布前预览确认和账号登录检查。触发词：帮我发到抖音、发布图文到抖音、把这张图发抖音、抖音发布、douyin publish、转发到抖音。
allowed-tools: Bash(bb-browser:*), Bash(python3*)
compatibility: 需要已安装 bb-browser 工具，Chrome 已安装并连接 bb-browser 扩展，浏览器已登录目标抖音账号。
---

# 抖音图文发布技能

## 目标

将本地图片/视频与文案自动发布到用户个人抖音账号。

**支持两种输入方式：**
1. **本地文件**：用户提供本地图片/视频文件路径 + 文案
2. **推特/X 帖子链接**：用户提供推文 URL，自动抓取文案 + 首图下载

---

## 交互原则

每次向用户提问或需要用户输入时，必须明确告知用户**具体在哪里输入、怎么输入**。因为用户可能在不同的 IDE 环境中使用本 skill（如 Trae、Cursor 等），输入方式各有不同。具体来说：

- 当提供多个选项时，明确说"回复数字 1/2/3 选择"或"回复对应文字选择"
- 当需要用户输入路径、ID 等具体内容时，明确说"请直接输入 xxx"或"请将路径粘贴到输入框"
- 当问题既有预设选项又允许自定义输入时，明确说"回复选项编号，或直接输入自定义内容"
- 避免模糊的开放式提问，每个问题都给出明确的回复格式示例

---

## ⚠️ 关键警告（必读）

> **发布流程的最后 2 步（Step 8 点击发布 + Step 9 验证）是防止误报的核心环节，必须严格执行！**
> 
> **严禁行为**：
> - ❌ 点击"发布"按钮后不验证 URL 跳转就报告成功
> - ❌ 不检查"发布成功"提示就报告成功
> - ❌ 不导航到作品管理页确认作品存在就报告成功
> - ❌ 把旧作品当成新发布的作品
> - ❌ 跳过 Step 9 验证环节
> 
> **必须行为**：
> - ✅ 点击发布后等待 5 秒以上再检查
> - ✅ 验证 URL 是否跳转到内容管理页面
> - ✅ 验证页面是否显示"发布成功"提示
> - ✅ 导航到 `content/manage` 页面查找新作品
> - ✅ 通过标题或描述关键词确认是刚发布的作品
> - ✅ 所有验证项都通过才能报告"发布成功"
> - ✅ 任何验证失败必须如实报告，并提供截图和错误信息

---

## 使用前提（必须全部满足）

1. `bb-browser` 命令可调用（`which bb-browser` 有输出）
2. Chrome 已安装并启用 bb-browser 扩展，且 `bb-browser open https://creator.douyin.com/` 不返回 `错误: Chrome extension not connected.`
3. 浏览器中已登录目标抖音账号（创作者中心可正常访问）
4. 用户提供至少一个图片/视频文件路径 **或** 推特/X 帖子链接

> 若第 2 条失败，提示用户安装扩展：打开 `chrome://extensions/`，启用开发者模式，加载 bb-browser 扩展目录。

---

## 阻塞性前置检查（必须全部通过）

> ⚠️ **严格顺序执行**：本步骤未通过前，禁止执行后续任何发布操作。

### 检查 1：bb-browser 工具可用性

```bash
which bb-browser
```

**必须满足**：有输出，显示 bb-browser 的路径

**若不满足**：
- 提示用户安装 bb-browser 扩展
- 不要尝试其他方式替代

### 检查 2：Chrome 扩展连接状态

```bash
bb-browser open https://creator.douyin.com/
```

**必须满足**：返回 `已打开: https://creator.douyin.com/...` 和 Tab ID

**若不满足**：
- 错误 `Chrome extension not connected` → 提示用户打开 `chrome://extensions/`，启用开发者模式，加载 bb-browser 扩展目录
- 错误 `command not found` → 提示用户安装 bb-browser

### 检查 3：浏览器登录状态

```bash
bb-browser snapshot -i --tab <TAB_ID>
```

**必须满足**：页面显示创作者中心主页，能看到"作品发布"或"高清发布"按钮

**若不满足**：
- 看到"扫码登录"、"验证码登录"、"密码登录" → **停止执行**，提示用户先在浏览器中登录抖音账号
- 用户登录完成后，回复"继续"，重新执行检查

### 检查 4：素材文件存在性

**必须满足**：用户提供至少一个图片/视频文件路径，或推特/X 帖子链接

**若不满足**：
- 提示用户提供图片文件或推文链接
- 给出明确格式示例："请将图片文件路径粘贴到这里，如 `/Users/xxx/image.png`"

---

## 完整发布流程

### Step 0：准备素材（二选一）

#### 方式 A：本地文件

用户已提供本地图片/视频路径，跳过此步。

#### 方式 B：推特/X 帖子链接

若用户提供的是推文链接（如 `https://x.com/username/status/1234567890` 或 `https://twitter.com/username/status/1234567890`），执行以下流程：

##### 0a. 抓取推文内容

使用 `bb-browser` 打开推文页面，提取文案和图片：

```bash
# 打开推文页面
bb-browser open "推文 URL"
```

记录 Tab ID，然后截图确认页面加载：

```bash
bb-browser snapshot -i --tab <TAB_ID>
```

##### 0b. 提取推文文案

推文文案通常在 `div` 或 `p` 标签中，通过 eval 提取：

```bash
bb-browser eval "
var textEls = document.querySelectorAll('div[data-testid=\"tweetText\"], p[dir=\"ltr\"]');
var texts = Array.from(textEls).map(el => el.innerText.trim()).filter(t => t.length > 0);
texts.length > 0 ? '文案: ' + texts[0].substring(0, 280) : '未找到文案'
" --tab <TAB_ID>
```

##### 0c. 提取首图并下载

推文图片通常在 `img` 标签中，提取最高分辨率 URL 并下载：

```bash
# 获取所有图片的 src 和 data-src
bb-browser eval "
var imgs = Array.from(document.querySelectorAll('img[src*=\"photo\"], img[data-src*=\"photo\"]'));
var urls = imgs.map(img => img.src || img.getAttribute('data-src') || '').filter(u => u.includes('photo'));
urls.length > 0 ? urls[0] : '无图片'
" --tab <TAB_ID>
```

获取图片 URL 后，下载到本地：

```bash
# 使用 Python 下载图片（推荐方式，兼容所有环境）
python3 -c "import urllib.request; urllib.request.urlretrieve('图片 URL', '/tmp/douyin_cover.jpg')"
```

**预期输出**：文件成功下载，大小 > 0。

##### 0d. 确认素材

```bash
ls -lh /tmp/douyin_cover.jpg
```

**成功标志**：文件存在且大小合理（> 10KB）。

> ⚠️ **注意**：若推文无图片，告知用户推文无配图，无法生成抖音封面，请提供本地图片。

---

### Step 1：打开抖音创作者中心，获取 Tab ID

```bash
bb-browser open https://creator.douyin.com/
```

**预期输出**（记录 Tab ID，后续所有命令必须带 `--tab <TAB_ID>`）：
```
已打开: https://creator.douyin.com/creator-micro/home
标题: 抖音创作者中心
Tab ID: 142604228
```

截图确认登录状态：

```bash
bb-browser snapshot -i --tab <TAB_ID>
```

正常登录后应能看到 `button "高清发布"` 和各菜单项。如果看到登录弹窗，停止并提示用户先在浏览器登录。

---

### Step 2：进入图文发布页

```bash
# 先 snapshot 确认「高清发布」按钮的 ref 值
bb-browser snapshot -i --tab <TAB_ID>

# 点击「高清发布」按钮（通常 ref=0）
bb-browser click @0 --tab <TAB_ID>

# 再 snapshot 确认出现发布类型菜单
bb-browser snapshot -i --tab <TAB_ID>
```

找到 `menuitem "发布图文"` 对应的 ref，点击它：

```bash
bb-browser click @<图文ref> --tab <TAB_ID>

sleep 2
bb-browser snapshot -i --tab <TAB_ID>
```

**预期**：URL 变为 `...content/upload?default-tab=3`，出现 `button "上传图文"` 和 `button "选择文件"`。

> ⚠️ **注意**：ref 编号每次快照可能不同，每次操作前必须先 `snapshot -i` 按**文字内容**定位，不要死记编号。

---

### Step 3：注入图片文件（关键技术点）

> ⚠️ **重要**：`bb-browser` 没有 `upload` 命令。图片上传必须通过 Python 将文件转为 base64，
> 再通过 `bb-browser eval` 注入到 `input[type=file]` 元素。

#### 3a. 确认图片 file input 的 index

```bash
bb-browser eval "
var inputs = document.querySelectorAll('input[type=file]');
inputs.length + ' inputs: ' + Array.from(inputs).map((el,i) => i+':accept='+el.accept.substring(0,40)).join(', ')
" --tab <TAB_ID>
```

图文发布页通常有 2 个 file input：
- index 0：视频（`accept=video/*`）
- index 1：图片（`accept=image/png,image/jpeg,...`）  ← 使用这个

#### 3b. Python 生成并执行注入脚本

在终端运行以下 Python 脚本，将图片注入浏览器：

```python
import base64, subprocess

IMAGE_PATH = "/tmp/douyin_cover.jpg"   # ← 替换为实际路径（本地文件或下载的推文图片）
TAB_ID = "142604228"                      # ← 替换为 Step 1 中的 Tab ID

with open(IMAGE_PATH, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

fname = IMAGE_PATH.split("/")[-1]
js = f"""
(function() {{
    var b64 = '{b64}';
    var bStr = atob(b64);
    var n = bStr.length;
    var u8arr = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8arr[i] = bStr.charCodeAt(i);
    var file = new File([u8arr], '{fname}', {{ type: 'image/jpeg' }});
    var dt = new DataTransfer();
    dt.items.add(file);
    var imgInput = document.querySelectorAll('input[type=file]')[1];
    imgInput.files = dt.files;
    imgInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
    return 'Done: files=' + imgInput.files.length;
}})()
"""

with open("/tmp/inject_file.js", "w") as f:
    f.write(js)

result = subprocess.run(
    ["bb-browser", "eval", open("/tmp/inject_file.js").read(), "--tab", TAB_ID],
    capture_output=True, text=True
)
print(result.stdout)
```

**预期输出**：`Done: files=1`

等待 2 秒后截图确认：

```bash
sleep 2
bb-browser snapshot -i --tab <TAB_ID>
```

**成功标志**：URL 自动跳转到 `...content/post/image?...`，页面出现 `textbox "添加作品标题"`，说明图片已上传并进入编辑页。

---

### Step 4：填写标题

先 `snapshot -i` 确认 `textbox "添加作品标题"` 对应的 ref，再填写：

```bash
bb-browser fill @<标题ref> "作品标题（限 20 字）" --tab <TAB_ID>
```

---

### Step 5：填写作品描述（文案）

> ⚠️ **重要**：描述框是 `contenteditable` div，**不能**用 `bb-browser fill`，必须用 `eval + execCommand`。

```bash
bb-browser eval "
var desc = document.querySelectorAll('[contenteditable]')[0];
desc.focus();
document.execCommand('insertText', false, '你的文案 #话题1 #话题2');
'done: ' + desc.innerText.length + ' chars'
" --tab <TAB_ID>
```

**预期输出**：`done: N chars`（N > 0）

---

### Step 6：确认发布设置

验证可见性和发布时间选项：

```bash
bb-browser eval "
Array.from(document.querySelectorAll('input[type=checkbox]'))
  .map((el,i) => {
    var label = el.closest('label') ? el.closest('label').innerText.trim() : '?';
    return i + ': ' + el.checked + ' (' + label + ')';
  }).join(', ')
" --tab <TAB_ID>
```

**预期**：`公开: true`、`立即发布: true`。若不符，用 `bb-browser check @N --tab <TAB_ID>` 勾选对应项。

---

### Step 7：截图预览，向用户确认

```bash
bb-browser screenshot /tmp/douyin_preview.png --tab <TAB_ID>
```

将截图展示给用户，确认内容无误后继续。

---

### Step 8：点击发布

先 `snapshot -i` 确认 `button "发布"` 对应的 ref，再点击：

```bash
bb-browser click @<发布ref> --tab <TAB_ID>

sleep 5
bb-browser screenshot /tmp/douyin_published.png --tab <TAB_ID>
bb-browser get url --tab <TAB_ID>
```

**成功标志**：
- 页面顶部出现绿色「✅ 发布成功」提示
- URL 跳转到 `https://creator.douyin.com/creator-micro/content/manage?enter_from=publish`

---

### Step 9：【强制验证】确认发布成功（必须执行，不可跳过）

> ⚠️ **严重警告**：此步骤是防止发布失败的最后一道防线，**必须严格执行**，不可跳过或简化！

#### 9a. 验证 URL 跳转

```bash
bb-browser get url --tab <TAB_ID>
```

**必须满足**：URL 包含 `content/manage` 或 `content/post/image`（发布后详情页）

**若不满足**：
- 检查是否有弹窗或确认框
- 重新点击"发布"按钮
- 截图查看页面状态

#### 9b. 验证"发布成功"提示

```bash
bb-browser snapshot -i --tab <TAB_ID>
```

查找包含"发布成功"或"success"的文本：

```bash
bb-browser eval "
var successMsg = document.querySelector('[class*=\"success\"], [class*=\"成功\"], [class*=\"publish\"]');
successMsg ? successMsg.innerText.substring(0, 100) : '未找到成功提示'
" --tab <TAB_ID>
```

**必须满足**：检测到"发布成功"或类似成功提示

**若不满足**：
- 截图查看页面错误信息
- 检查是否内容违规被拒
- 联系用户确认

#### 9c. 【最终验证】导航到作品管理页确认作品存在

```bash
bb-browser open https://creator.douyin.com/creator-micro/content/manage --tab <TAB_ID>
sleep 3
bb-browser snapshot -i --tab <TAB_ID>
```

**必须执行以下检查**：

1. 查找作品标题（用户提供的标题）：
```bash
bb-browser eval "
var allText = document.body.innerText;
allText.includes('用户提供的标题关键词') ? '✅ 找到作品' : '❌ 未找到作品'
" --tab <TAB_ID>
```

2. 检查作品数量是否增加：
```bash
bb-browser eval "
var workCount = document.querySelector('[class*=\"作品\"]');
workCount ? workCount.innerText : '未找到作品数量'
" --tab <TAB_ID>
```

**最终成功标志**（必须全部满足）：
- ✅ URL 已跳转到内容管理页面
- ✅ 检测到"发布成功"提示
- ✅ 在作品列表中能找到刚发布的作品（通过标题或描述关键词匹配）
- ✅ 作品状态显示为"已发布"

**若任何一项不满足**：
- 立即报告用户发布可能失败
- 提供截图和错误信息
- 不要报告"发布成功"

---

## 多图上传

在 Step 3b 中，用 `DataTransfer` 添加多个文件：

```python
IMAGE_PATHS = ["/path/img1.jpg", "/path/img2.jpg", "/path/img3.jpg"]

def get_mime_type(fname):
    ext = fname.lower().split('.')[-1]
    mime_map = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'bmp': 'image/bmp', 'gif': 'image/gif'}
    return mime_map.get(ext, 'image/jpeg')

dt_init = "var dt = new DataTransfer();"
file_blocks = []
for i, path in enumerate(IMAGE_PATHS):
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    fname = path.split("/")[-1]
    mime_type = get_mime_type(fname)
    file_blocks.append(f"""
    (function() {{
        var b = atob('{b64}');
        var u = new Uint8Array(b.length);
        for(var k=0;k<b.length;k++) u[k]=b.charCodeAt(k);
        dt.items.add(new File([u], '{fname}', {{type:'{mime_type}'}}));
    }})();""")

js = f"(function() {{ {dt_init} {''.join(file_blocks)} var inp=document.querySelectorAll('input[type=file]')[1]; inp.files=dt.files; inp.dispatchEvent(new Event('change',{{bubbles:true}})); return 'Done: files='+inp.files.length; }})()"
```

---

## 错误排查

| 错误 | 原因 | 解决方法 |
|------|------|----------|
| `错误: Chrome extension not connected.` | bb-browser 扩展未安装/未启用 | Chrome 扩展页面安装扩展，重启 Chrome |
| `Done: files=0` | file input 未找到或 index 错误 | 重新 `snapshot` 确认页面已加载，检查 file input index |
| 注入后页面未跳转到编辑页 | `change` 事件未触发 | 尝试点击页面空白区域，或改用 `InputEvent` |
| 标题填写后为空 | ref 对应了错误元素 | `snapshot -i` 重新确认 `textbox "添加作品标题"` 的 ref |
| 文案填写后为空 | 用了 `fill` 而非 `eval+execCommand` | 改用 Step 5 的 `eval` 方式 |
| 发布后无「发布成功」 | 内容违规或网络问题 | 查看页面错误提示，截图确认具体原因 |
| 推文抓取失败 | 推文已删除或需要登录 | 确认推文链接有效，或改用本地文件方式 |
| 推文无图片 | 推文只有文字 | 告知用户推文无配图，无法生成封面，请提供本地图片 |
| `python3 << 'EOF'` 返回 BLOCKED | 系统拦截了 heredoc 方式的 Python 执行 | 先用 `write_file` 将脚本写入 `/tmp/xxx.py`，再用 `python3 /tmp/xxx.py` 执行 |
| `bb-browser eval` async IIFE 返回 `{}` | 异步函数在 eval 中无法返回结果 | 所有 bb-browser eval 必须使用同步代码，不要用 async/await |
| `querySelector('button:contains(...)')` 报错 | `:contains` 不是有效 CSS 选择器 | 改用 `Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('...'))` |
| `browser_snapshot` 返回 "Empty page" | 该工具对某些页面渲染不可靠 | 始终使用 `bb-browser snapshot -i --tab <TAB_ID>` 替代 |
| 截图显示空白页面 | 浏览器渲染延迟 | 优先用 eval 检查 URL/状态（如 `bb-browser get url --tab <TAB_ID>`），而非依赖截图 |

---

## 输出格式

> ⚠️ **重要**：只有在 Step 9 所有验证都通过后，才能输出以下成功报告。若任何验证失败，必须如实报告失败原因。

### 成功报告格式

```
✅ 抖音图文作品发布成功

| 项目 | 内容 |
|------|------|
| 来源 | 本地文件 / 推特帖子（https://x.com/xxx/status/xxx） |
| 本地文件 | image-xxx.png |
| 标题 | 作品标题 |
| 文案 | 发布文案 #话题1 #话题2 |
| 可见性 | 公开 |
| 发布时间 | 立即发布 |
| 作品管理页 | https://creator.douyin.com/creator-micro/content/manage |

验证项：
- URL 跳转：✅ 已跳转到内容管理页
- 成功提示：✅ 检测到"发布成功"
- 作品存在：✅ 在作品列表中确认找到

备注：图片通过 base64 eval 注入上传；文案通过 contenteditable + execCommand 填写。
```

### 失败报告格式

```
❌ 抖音图文作品发布失败

| 项目 | 内容 |
|------|------|
| 来源 | 本地文件 / 推特帖子（https://x.com/xxx/status/xxx） |
| 本地文件 | image-xxx.png |
| 标题 | 作品标题 |
| 文案 | 发布文案 #话题1 #话题2 |
| 失败原因 | [具体原因，如"点击发布后页面未跳转"、"未检测到成功提示"、"作品列表中未找到新作品"] |
| 页面截图 | /tmp/douyin_error.png |

建议：[针对失败原因的具体建议]
```

---

## 迁移说明（2026-10-10）

> 本目录（`SKILL.md` + `OPTIMIZED_WORKFLOW.md` + `evals/evals.json`）2026-10-10 从 `~/.agents/skills/douyin-publish/` **原样**迁入
> `project-launcher/projects/md-publish/skills/douyin-publish/`，源目录随后删除，本仓库是唯一副本。
> 迁入时字节级一致（3 个文件 / 20,904 字节，`diff -r` 无差异），迁入后除本节追加外正文未改。

- **抖音图文仍是 bb-browser 路线**（正文 50+ 处 bb-browser 命令都是实测过的），这是「博客发文一律用 ego-browser」这条偏好下**目前仅剩的例外**，照本文件执行不算违规。
- 本平台在同步台里**没有 playbook**（`index.html` 的 `DEFAULTS` 中 `douyin` 无 `pb:true`，且 `noDraft:true` 没有草稿态），所以点按钮不会走本地脚本 —— 只能「复制指令」交给智能体按本文执行。若将来要接成确定性脚本，参考 `../playbooks/` 任一平台的写法（ego-browser + `bridge.mjs`），并把 `wait` 单位从毫秒换成秒。
