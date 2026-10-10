# X 批量取关 — DOM 选择器与可直接复制的 heredoc 片段

本文件是 `x-batch-unfollow` 的实战细节层：精确选择器、`bio` 判定算法、四个踩坑的逐条复现，以及**可直接复制进 Bash 的 `ego-browser nodejs <<'EOF'` 片段**。所有片段在 2026-09 实测跑通。

> 编码铁律：**片段内不使用 `${}` 模板插值**。动态选择器一律用 Node 侧字符串拼接 + `JSON.stringify(sel)` 传给 `js(...)` / `click(...)`。heredoc 统一 `<<'EOF'`（引号包裹）禁用 shell 展开。这样从根上规避「Bad substitution」与正则被转义两大坑。

---

## 1. 精确选择器（实测 2026-09）

| 目标 | 选择器 | 备注 |
|------|--------|------|
| 账号单元 | `[data-testid="UserCell"]` | 列表每一项 |
| 取句柄 | `[data-testid^="UserAvatar-Container-"]`，去掉前缀 `UserAvatar-Container-` | 例：`UserAvatar-Container-iJavaEdge` → `iJavaEdge` |
| 取 userId | `[data-testid$="-unfollow"]`，去掉后缀 `-unfollow` | 例：`123-unfollow` → `123` |
| 取关按钮 | `[data-testid="<userId>-unfollow"]` | 点击后该节点 `data-testid` 变为 `<userId>-follow` |
| 取关成功标志 | `[data-testid="<userId>-follow"]` | 文案「关注」/「回关」 |
| 列表页 bio | cell 内 `div[dir="auto"]` 中**第一个 `innerText.trim()` 非空且不含「取消关注」**的元素 | **不在 `UserDescription`**（那是主页选择器）；无简介账号该元素根本不存在 |
| 确认弹窗 | `[data-testid="confirmationSheetDialog"]` | **不是** `[role="dialog"]` |
| 确认按钮 | `[data-testid="confirmationSheetConfirm"]` | 取消：`confirmationSheetCancel` |
| 自身 Profile 链接 | `[data-testid="AppTabBar_Profile_Link"]` | `getAttribute('href')` → `/<handle>` |

---

## 2. bio 判定算法（核心，最容易错）

列表页「Following」里每个 `UserCell` 含若干 `div[dir="auto"]`：有的是显示名、有的是 `@handle`、有的是 bio、有的是「正在关注 / 取消关注」操作区。**bio 不是 `UserDescription`**（那是点进主页才有的选择器）。

判定规则（一个 cell 内）：

```js
const dirs = [...cell.querySelectorAll('div[dir="auto"]')]
const bioEl = dirs.find(d => d.innerText.trim() && !d.innerText.includes('取消关注'))
const noBio = !bioEl            // 无简介 = 找不到这样的元素
const bio = bioEl ? bioEl.innerText.trim() : ''
```

- 必须排除含「取消关注」的元素：操作区文案（如「取消关注」「正在关注」）也包在 `div[dir="auto"]` 里，会被误判为 bio。
- 必须要求 `innerText.trim()` 非空：空 div 很多，不能算 bio。
- **抽样复核**：列表页判定后，随机 8–10 个「无简介」账号访问其主页，用主页 `UserDescription` 独立读 bio 做一手比对。实测 10/10 一致（100%）才放行。

---

## 3. scan_following 片段（翻页收集全部关注）

> 关键：开头**仅一次** `scrollTo(0,0)`；之后**渐进向下**滚动（不要每轮重置到 0，否则永远扫同一屏）。`stale` 只数「新加载的 ID 数」，连续 4 轮无新增才停。
> `me` 来自第 0 步（如 `/iJavaEdge`，带前导斜杠）。

```bash
ego-browser nodejs <<'EOF'
const fs = (await import('fs')).default
const task = await useOrCreateTaskSpace('x batch unfollow')
const me = '/iJavaEdge'   // 改为第 0 步实测到的自身 handle
await openOrReuseTab('https://x.com' + me + '/following', { wait: true, timeout: 30 })
await wait(5)
await js('window.scrollTo(0,0)')   // 仅开头一次
const seen = new Map()
let stale = 0
for (let i = 0; i < 220; i++) {
  await scrollBy(1200)
  await wait(1.3)
  const batch = await js(String.raw`(() => {
    const cells = [...document.querySelectorAll('[data-testid="UserCell"]')]
    return cells.map(cell => {
      const av = cell.querySelector('[data-testid^="UserAvatar-Container-"]')
      const handle = av ? av.getAttribute('data-testid').replace('UserAvatar-Container-','') : null
      const ub = cell.querySelector('[data-testid$="-unfollow"]')
      const id = ub ? ub.getAttribute('data-testid').replace('-unfollow','') : null
      const dirs = [...cell.querySelectorAll('div[dir="auto"]')]
      const bioEl = dirs.find(d => d.innerText.trim() && !d.innerText.includes('取消关注'))
      return { id, handle, bio: bioEl ? bioEl.innerText.trim() : '', noBio: !bioEl }
    }).filter(r => r.id)
  })()`)
  let added = 0
  for (const r of batch) if (!seen.has(r.id)) { seen.set(r.id, r); added++ }
  cliLog('scroll ' + i + ' seen=' + seen.size + ' +' + added)
  if (added === 0) { stale++; if (stale >= 4) break } else stale = 0
}
const all = [...seen.values()]
fs.writeFileSync('/tmp/x_following_scan.json', JSON.stringify(all, null, 1))
const noBio = all.filter(r => r.noBio)
cliLog('TOTAL=' + all.length + ' NOBIO=' + noBio.length)
EOF
```

`/tmp/x_following_scan.json` 结构：`[{id, handle, bio, noBio}, ...]`。

---

## 4. unfollow_batch 片段（分批取关 + 校验顺序 + 熔断）

> 校验顺序（硬约束 #1）：先查 `-follow` 出现 → 再查确认弹窗点确认 → 都没有等一拍复查。
> 连续 5 次失败即熔断（硬约束：疑似风控）。

```bash
ego-browser nodejs <<'EOF'
const fs = (await import('fs')).default
const task = await useOrCreateTaskSpace('x batch unfollow')
const scan = JSON.parse(fs.readFileSync('/tmp/x_following_scan.json','utf8'))
const targets = scan.filter(r => r.noBio)
const progPath = '/tmp/x_unfollow_progress.json'
const progress = JSON.parse(fs.readFileSync(progPath,'utf8').replace(/}^/,'}') || '{"done":[],"failed":[]}')
const BATCH = 100
let consecutiveFail = 0
for (const t of targets) {
  if (progress.done.includes(t.id)) continue
  if (BATCH && progress.done.length >= BATCH) break
  const usel = '[data-testid="' + t.id + '-unfollow"]'
  let inView = await js('!!document.querySelector(' + JSON.stringify(usel) + ')')
  if (!inView) {
    await js('document.querySelector(' + JSON.stringify('[data-testid="UserAvatar-Container-'+t.handle+'"]') + ')?.scrollIntoView({block:"center"})')
    await wait(1.2)
  }
  const clicked = await click(usel, { label: 'unfollow ' + t.handle }).then(()=>true).catch(()=>false)
  if (!clicked) { progress.failed.push(t.id); if (++consecutiveFail >= 5){ cliLog('BREAK circuit'); break } continue }
  await wait(1.5)
  const fsel = '[data-testid="' + t.id + '-follow"]'
  let ok = await js('!!document.querySelector(' + JSON.stringify(fsel) + ')')
  if (!ok) {
    const dialog = await js('!!document.querySelector(\'[data-testid="confirmationSheetDialog"]\')')
    if (dialog) {
      await click('[data-testid="confirmationSheetConfirm"]', { label: 'confirm unfollow' })
      await wait(1.5)
      ok = await js('!!document.querySelector(' + JSON.stringify(fsel) + ')')
    } else {
      await wait(1.5)
      ok = await js('!!document.querySelector(' + JSON.stringify(fsel) + ')')
    }
  }
  if (ok) { progress.done.push(t.id); consecutiveFail = 0 }
  else { progress.failed.push(t.id); if (++consecutiveFail >= 5){ cliLog('BREAK circuit'); break } }
  fs.writeFileSync(progPath, JSON.stringify(progress))
  cliLog('done=' + progress.done.length + ' failed=' + progress.failed.length + ' last=' + t.handle)
}
cliLog('BATCH END done=' + progress.done.length)
EOF
```

> 注意 `progress` 解析处的 `.replace(/}^/,'}')` 是兜底容错；正常写盘是合法 JSON，无需它。若遇到历史脏文件再启用。

---

## 5. homepage_unfollow 片段（漏网账号 100% 可靠补漏）

虚拟列表滚动遍历补不到的漏网账号，改用**按 handle 直达主页点击取关**（硬约束 #2）。`stragglers` = 复核后仍 `noBio` 且不在 `progress.done` 的账号。

```bash
ego-browser nodejs <<'EOF'
const fs = (await import('fs')).default
const task = await useOrCreateTaskSpace('x batch unfollow')
const scan = JSON.parse(fs.readFileSync('/tmp/x_following_scan.json','utf8'))
const progress = JSON.parse(fs.readFileSync('/tmp/x_unfollow_progress.json','utf8'))
const stragglers = scan.filter(r => r.noBio && !progress.done.includes(r.id))
for (const t of stragglers) {
  await gotoAndWait('https://x.com/' + t.handle, { timeout: 20, settle: 2 })
  await wait(2)
  const usel = '[data-testid="' + t.id + '-unfollow"]'
  await click(usel, { label: 'home unfollow ' + t.handle }).then(()=>true).catch(()=>false)
  await wait(1.5)
  const fsel = '[data-testid="' + t.id + '-follow"]'
  let ok = await js('!!document.querySelector(' + JSON.stringify(fsel) + ')')
  if (!ok) {
    const dialog = await js('!!document.querySelector(\'[data-testid="confirmationSheetDialog"]\')')
    if (dialog) { await click('[data-testid="confirmationSheetConfirm"]',{label:'confirm'}); await wait(1.5); ok = await js('!!document.querySelector(' + JSON.stringify(fsel) + ')') }
  }
  if (ok) progress.done.push(t.id)
  fs.writeFileSync('/tmp/x_unfollow_progress.json', JSON.stringify(progress))
  cliLog('home done=' + progress.done.length + ' ' + t.handle)
}
EOF
```

---

## 6. verify 片段（清零复核）

复用第 3 步 scan，但 `maxSteps` 调大（如 260）、`wait` 放慢（1.8s），覆盖更全。跑完断言：

```js
const all = JSON.parse(fs.readFileSync('/tmp/x_following_scan.json','utf8'))
const noBio = all.filter(r => r.noBio)
cliLog('total=' + all.length + ' noBio=' + noBio.length)
// noBio.length === 0 才算清零
```

> 若复核 `noBio > 0`，把剩余账号作为 `stragglers` 走第 5 步主页直达补漏，再复核，直到 0。

---

## 7. 四个踩坑的逐条复现（为何这样设计）

1. **直接取关无弹窗（假失败）**
   第 1 批 17 个报 `no-dialog`，经抽样访问主页复核 **5/5 全部已取关**——X 对部分账号点 `-unfollow` 不弹确认框，按钮立刻变 `-follow`。若只检测弹窗会把成功判失败、导致重复点击甚至误以为未取关。→ 校验顺序强制先看 `-follow`。

2. **虚拟列表覆盖不全（漏网）**
   同一列表两次滚动扫描命中集合不同：一次遍历 977 命中 2 个目标，另一次 983 找到 20 个。滚动遍历本身不可靠。→ 漏网账号一律走「主页直达」(第 5 步)，实测 20/20 成功。

3. **stale 误判到底**
   20 个目标分散在 1007 个账号（密度 2.6%），绝大多数视口本无目标。若 `stale` 统计「视口内有无目标」→ 滚 15 屏误判到底、处理 0 个。→ `stale` 只统计「是否还有新账号 ID 加载」（`seen` 新增数）。

4. **滚动位置跨 heredoc 保留**
   上一轮结束页面停在底部（`scrollY=149081 / docHeight=149716`），新一轮直接开扫从底部继续往下滚，扫不到东西却因 `stale` 快速退出。→ **每轮扫描开头 `window.scrollTo(0,0)` 一次**（注意：只在开头，循环内渐进向下，不要每轮重置）。

---

## 8. ego-browser 编码坑（复用时照抄）

- heredoc 用 `<<'EOF'`（引号包裹）→ 禁用 shell 变量展开，模板里的 `${...}` 才不会被 shell 吃掉。
- **首选无 `${}` 插值**：动态选择器用 `JSON.stringify(sel)` 拼接传给 `js()`/`click()`，彻底规避风险。
- 需要浏览器侧正则时，整段用 `String.raw`；普通模板里 `/\n/g` 的 `\n` 会被转真实换行 → `Invalid regular expression`。
- 不要把 `String.raw\`...\` + 变量 + \`...\`` 拼接：反引号提前截断，后半变普通模板，正则照样炸。整段一个 `String.raw`，内部需插值就走 `JSON.stringify`。
- ESM 读文件：`const fs = (await import('fs')).default`。
- **顶层 `await` 非法**：`ego-browser nodejs <<'EOF'` 实际经 `vm.runInContext` 以 sloppy/CommonJS 上下文执行，**顶层 `await` 会报 `await is only valid in async functions and the top level bodies of modules`**（本会话两次踩坑）。所有片段必须整体包进 `(async () => { ... })();`，不能裸写顶层 `await`。本文件所有片段已按此修正。
- `wait()`/`timeout` 单位**秒**；`@N`/`ref=N` 只对 ego helper 有效，不能进 `js()`。
- 长任务务必进度落盘（`/tmp/x_unfollow_progress.json`）+ 连续失败熔断。

---

## 9. 维护者检索提示

- 选择器改版 → 先 `snapshotText()` 抓实时 `ref=N` / `loc=...`，改 `data-testid` 选择器。
- bio 误判 → 检查 `div[dir="auto"]` 过滤条件（空串 / 含「取消关注」）。
- 弹窗没出现 → 确认用的是 `confirmationSheetDialog` 而非 `role="dialog"`。
