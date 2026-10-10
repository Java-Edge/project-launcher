---
name: x-batch-unfollow
description: Batch-unfollow X/Twitter accounts from the current user's Following list, filtered by a rule (default "no bio / 无简介"; extensible to no-avatar, inactive, or keyword). Trigger when the user says "把关注里没简介的取关", "批量取关", "清理关注列表", "unfollow all X accounts with no bio", or asks to prune their X following by any criterion. Reuses the user's browser login state via ego-browser — no credentials needed. All selectors were verified against live x.com in 2026-09. Delivers a scanned list, an unfollow report, and a re-verified zero-remaining result. Does not cover followers, blocks, or muted accounts.
agent_created: true
---

# X Batch Unfollow（X 关注列表批量取关）

按规则批量取关当前登录账号「Following（关注）」列表里的账号。默认规则是**无简介（no bio）**，但取关逻辑与选择器是通用的，换成「无头像 / 长期不活跃 / 含关键词」等判定条件即可复用。核心用 **ego-browser** 复用用户浏览器登录态，在隔离 task space 操作，**无需账号密码**。

> **本文所有选择器与流程均于 2026-09 在 x.com 实测验证**（含一次完整 547 账号取关 + 清零复核）。若页面改版，以 `snapshotText()` 实时结构为准，不要盲目重试同一失败选择器。

---

## ⚠️ 四个决定成败的硬约束（务必先读）

这些坑每一个都曾导致「假失败 / 漏网 / 误判到底」，务必在写脚本前理解：

1. **X 对部分账号「直接取关、不弹确认框」。** 点击 `-unfollow` 后按钮立刻变 `-follow`。若只检测弹窗会把成功判成失败。**正确校验顺序：先查 `-follow` 是否出现 → 再查确认弹窗 → 都没有才等一拍复查。**
2. **列表虚拟化导致滚动扫描覆盖不全。** 同一列表两次滚动扫描覆盖的集合不同（一次遍历命中 2 个、另一次命中 20 个）。**漏网账号不要用滚动遍历补，改为按 handle 直达主页点击取关**，100% 可靠。
3. **`stale` 计数器不能统计「视口内有没有目标」。** 目标密度约 2.6%（20/1007），绝大多数视口本无目标 → 滚几屏就误判到底。`stale` 只应统计**是否还有新账号 ID 加载**。
4. **滚动位置跨 heredoc 保留。** 上一轮停在底部时，新一轮直接开扫会从底部继续往下滚，什么都扫不到却因 stale 快速退出。**每轮扫描前必须 `window.scrollTo(0,0)`。**

---

## 自动化原则

**目标：全流程自动决策，人工介入只保留两次——取关前的不可逆确认、以及可能的风控熔断。**

- 扫描、判定（无简介等）、分批取关、清零复核**全部自动**。
- 唯一必须的人工节点：**正式开始取关前的一次确认**（展示将取关数量与样例）。若用户指令含「直接取关 / 不用确认 / auto」，跳过确认。
- **连续 4–5 次取关失败即熔断停止**，疑似触发 X 速率限制 / 临时锁号，交还控制权让用户稍后重试。
- 进度与结果**务必落盘 `/tmp`**（扫描 JSON、进度 JSON、复核 JSON），便于断点续跑与出报告。

---

## 完整工作流

task space 名统一 `'x batch unfollow'`，跨 heredoc 复用。

### 第 0 步：确认登录态与自身句柄

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('x batch unfollow')
cliLog('task space id: ' + task.id)
await openOrReuseTab('https://x.com', { wait: true, timeout: 30 })
await wait(4)
const info = await pageInfo()
cliLog('URL: ' + info.url)
// 取自身 handle：Profile 链接的 href
const me = await js(String.raw`(() => {
  const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')
  return a ? a.getAttribute('href') : null
})()`)
cliLog('me: ' + me)
EOF
```

- `URL` 仍为 `https://x.com` 或带 `/home` → 已登录。
- 被重定向到 `/login` → 未登录，走「登录 handoff」（见文末）。

### 第 1 步：打开 Following 列表并扫描

> 关键：每轮扫描前 `scrollTo(0,0)`；`stale` 只数新 ID；bio 判定见 DOM 表。

完整扫描脚本见 `references/x-dom-selectors.md` 的「scan_following 片段」——它负责翻页收集全部 `UserCell`，抽 handle + bio，写 `/tmp/x_following_scan.json`，并输出无简介名单。

### 第 2 步：判定与抽样复核（不可跳过）

- 对扫描结果里判定为「无简介」的账号，**随机抽 8–10 个访问其主页**，用主页 `UserDescription` 独立读取 bio 做一手复核，确认列表页判定准确率。
- 准确率不足 100% → 修正 bio 判定逻辑（通常是把「取消关注」文案或空 div 误判为有简介），不要继续。
- 详细判定逻辑见 `references/x-dom-selectors.md` 的「bio 判定」。

### 第 3 步：取关前确认（唯一人工节点）

用 question 工具一次性展示【自身账号 / 无简介总数 / 抽样复核准确率 / 样例前 10 个 handle】，选项：`确认取关` / `换个条件` / `取消`。
指令含「直接取关 / auto」→ 跳过此步。

### 第 4 步：分批取关

完整取关脚本见 `references/x-dom-selectors.md` 的「unfollow_batch 片段」——按用户选定批大小（推荐每批 ~100）逐账号：`scrollIntoView` → 点 `-unfollow` → 按校验顺序确认成功（含无弹窗情况）→ 进度落盘 → 连续失败熔断。

### 第 5 步：漏网主页直达补漏

滚动遍历补不到的漏网账号，改为按 handle 直达主页取关（见 references「homepage_unfollow 片段」），100% 可靠。

### 第 6 步：清零复核（慢速全量）

重新跑一次完整扫描（同第 1 步，但放慢滚动、增大 maxSteps），确认 `noBioCount === 0`。覆盖不到 100% 列表时不要宣称清零。

### 第 7 步：出报告 + 收尾

```bash
python3 - <<'PY'
import json, csv
scan = json.load(open('/tmp/x_following_scan.json'))
total = len(scan)
no_bio = [r for r in scan if r.get('noBio')]
with open('/tmp/x_nobio_unfollow_list.csv','w',newline='',encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['handle','userId','bioLen'])
    for r in no_bio: w.writerow([r.get('handle'), r.get('id'), len(r.get('bio',''))])
print(f"关注总数={total} 无简介={len(no_bio)}")
PY
```

把 CSV 路径与复核结论返回用户，最后 `completeTaskSpace('x batch unfollow', { keep: false })`。

---

## 页面结构速查（实测 2026-09）

| 目标 | 选择器 / API | 说明 |
|------|-------------|------|
| 账号单元 | `[data-testid="UserCell"]` | 列表每一项 |
| 句柄 | `[data-testid^="UserAvatar-Container-"]` 的 `data-testid` 去掉前缀 | 形如 `UserAvatar-Container-<handle>` |
| 取关按钮 | `[data-testid="<userId>-unfollow"]` | 点后变 `-follow` |
| 取关后按钮 | `[data-testid="<userId>-follow"]` | 文案「关注 / 回关」，成功标志 |
| 列表页 bio | cell 内 `div[dir="auto"]` 中**第一个非空且不含「取消关注」**的元素 | **不在 `UserDescription`**（那是主页选择器）；无简介账号该元素根本不存在 |
| 确认弹窗 | `[data-testid="confirmationSheetDialog"]` | **不是** `[role="dialog"]` |
| 确认按钮 | `[data-testid="confirmationSheetConfirm"]` | 取消：`confirmationSheetCancel` |
| 自身 Profile 链接 | `[data-testid="AppTabBar_Profile_Link"]` | 取自身 handle |

---

## ego-browser 编码规则（复用时照抄，避免昂贵踩坑）

- heredoc 一律用 `<<'EOF'`（**引号包裹**）以禁用 shell 变量展开；这样模板里的 `${...}` 才安全（见下条）。
- **首选纯 DOM 遍历、不用 `${}` 插值**：扫描/取关逻辑用 `querySelectorAll` 循环直接读 `data-testid` 属性，根本不需要把变量拼进模板，从根上规避 shell 展开风险。
- 确实需要插值（如 `gotoAndWait('https://x.com/'+handle)`）时：数据先写盘（`fs.readFileSync` 读回），在 `js(String.raw\`...\`)` 里**用字符串拼接而非 `${}`**；或走 base64（参考 51cto-publish skill）。
- 含正则的模板必须是 `String.raw`：普通模板里 `/\n/g` 的 `\n` 会被转成真实换行，导致 `Invalid regular expression`。
- **顶层 `await` 非法（关键）**：`ego-browser nodejs <<'EOF'` 经 `vm.runInContext` 以 sloppy/CommonJS 上下文执行，裸写顶层 `await` 会报 `await is only valid in async functions and the top level bodies of modules`。所有片段必须整体包进 `(async () => { ... })();`。本会话因此两次探针失败。
- ESM 环境读文件：`const fs = (await import('fs')).default`。
- `wait()` / `timeout` 单位是**秒**；`@N`/`ref=N` 只对 ego helper 有效，不能在 `js()` 里当选择器。
- 见 `references/x-dom-selectors.md` 取可直接复制的 heredoc 片段。

---

## 登录 handoff（未登录时）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('x batch unfollow')
await handOffTaskSpace(task.id)
cliLog('已交还浏览器控制权，请完成 X 登录')
EOF
```

告知用户登录后回复「继续」；确认后用 `takeOverTaskSpace('x batch unfollow')` 收回控制权，回到第 0 步。

---

## 拓展到其他取关条件

- **无头像**：在 scan 片段里加 `img[src*="default_profile"]` 判定（X 默认灰头像是 `default_profile_...`）。
- **长期不活跃**：主页取 `Joined` / 最后推文时间需逐账号访问，成本高，建议先抽样确认可行性。
- **含关键词**：bio 判定改为 `bio.includes('关键词')`。
- 取关主流程（第 4–6 步）完全不变，只换第 1–2 步的判定函数。

详细片段与四个坑的逐条复现记录见 `references/x-dom-selectors.md`。
