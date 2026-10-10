---
name: workbuddy-checkin
description: 打开 WorkBuddy 应用并点击"立即领取"按钮完成每日 100 积分签到。当用户说"workbuddy 积分签到"、"WorkBuddy 签到"、"领取 WorkBuddy 每日积分"等类似指令时使用。
---

# WorkBuddy 每日积分签到

## 输入

用户指令（一句话）：`workbuddy 积分签到` / `WorkBuddy 签到` / `领取每日积分`

## 前置条件

- WorkBuddy.app 已安装在 `/Applications/WorkBuddy.app`
- 应用处于登录状态（左侧底部显示用户头像和名称）
- 需要 macOS 辅助功能权限（用于屏幕截图和鼠标点击）

## 流程

### 1. 激活 WorkBuddy 窗口

```bash
open -a WorkBuddy
sleep 3
```

验证窗口位置（通过 Quartz CGWindowList）：

```python
from Quartz import CGWindowListCopyWindowInfo, kCGWindowListOptionAll, kCGNullWindowID
wl = CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID)
for w in wl:
    if w.get('kCGWindowOwnerName')=='WorkBuddy' and w.get('kCGWindowName')=='WorkBuddy':
        bounds = dict(w.get('kCGWindowBounds'))
        onscreen = w.get('kCGWindowIsOnscreen')
        print(f'onscreen={onscreen}, bounds={bounds}')
```

记录窗口的 `X, Y, Width, Height`，用于后续坐标计算。

### 2. 截图定位"立即领取"按钮

截取 WorkBuddy 窗口区域（而不是整个屏幕）：

```bash
screencapture -x -R"<X>,<Y>,<Width>,<Height>" /tmp/wb_window.png
```

用视觉模型识别"立即领取"按钮在截图中的像素坐标 (btn_x, btn_y)。

> 按钮在窗口内典型位置：约 `(171, 765)` 附近（窗口左下角"Buddy加油站"卡片上），但不同版本/分辨率会有差异，**必须以视觉识别为准**。

### 3. 计算绝对坐标并点击

```python
abs_x = window_x + btn_x
abs_y = window_y + btn_y
pyautogui.moveTo(abs_x, abs_y, duration=0.2)
pyautogui.mouseDown()
time.sleep(0.1)
pyautogui.mouseUp()
```

### 4. 验证结果

等待 3 秒后再次截图，检查：
- 左下角"Buddy加油站 今日可领100积分"卡片是否消失或变为"已领取"
- 是否弹出领取成功的 toast / 弹窗

## 已知问题与处理

| 问题 | 原因 | 处理方式 |
|------|------|----------|
| 截图显示的是 Windows 远程桌面而非 WorkBuddy | WorkBuddy 窗口被移到其他 Space 或负坐标区域 | 重新 `open -a WorkBuddy`，并用 Quartz 确认 `onscreen=True` 且 `X >= 0` |
| 点击后按钮无响应 | WorkBuddy 窗口未真正获得焦点 | 先 `open -a WorkBuddy` 激活，再用 pyautogui 点击前先 moveTo 按钮附近停留 200ms |
| 窗口位置为负数（如 X=-1300） | 窗口被拖到多显示器排列外 | 用 `open -a WorkBuddy` 重新激活，窗口通常会自动回到主屏 |
| 多次点击无效 | 按钮可能需要窗口先获得键盘焦点 | 尝试先点击窗口标题栏（约窗口顶部中央），再点击按钮 |

## 依赖

- `pyautogui`（sandbox 中 `pip install pyautogui`）
- `pyobjc-framework-Quartz`（macOS 系统自带 python3 可用）
- 视觉模型（用于截图识别按钮位置）
- macOS `screencapture` 命令
