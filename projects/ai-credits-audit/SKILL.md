---
name: ai-credits-audit
description: 盘点本地所有 AI 智能体/AI 编程工具的积分余额、每日签到状态与过期时间线，并生成可视化看板。当用户说"盘点积分"、"查 AI 工具积分"、"我的积分还有多少"、"积分盘点"、"哪些积分快过期"、"AI 工具额度"、"签到状态"、"credits 盘点"、"额度盘点"等指令时触发。覆盖 Qoder、Trae、扣子 Coze、MiniMax、Cursor、Claude、CodeBuddy、WorkBuddy、Kimi、豆包、Manus、商汤小浣熊、智谱系（AutoClaw/ZCode）等平台的积分账户。
---

# 本地 AI 工具积分盘点

产出一份**可信、可复核、带过期预警**的本地 AI 工具积分账单。

> 📍 已从 `~/.agents/skills/ai-credits-audit` 迁移至
> `~/soft/VSProjects/project-launcher/projects/ai-credits-audit`，
> 并注册进 project-launcher 管控台（http://localhost:8090 ，服务 id: `credits-dashboard`，端口 8787）。
> 启动/停止走管控台或 `./scripts/start-service.sh credits-dashboard`。
> 所有脚本已支持路径自定位，`SKILL` 环境变量留空即用脚本所在目录；旧路径残留会自动回退。

## ⚡ 刷新积分（最重要的一节）

说「盘点积分 / 刷新积分 / 更新看板」时，走这条链路，**不要手动一平台一平台点**。

```bash
SKILL=/Users/javaedge/soft/VSProjects/project-launcher/projects/ai-credits-audit

bash "$SKILL/scripts/serve.sh" 8787      # 启动看板 + 采集 API（幂等，已跑会自动打开页面）
# 然后在页面上点「立即采集刷新」→ 约 55 秒，实时采集并回写，页面顶部显示变化清单

# 或命令行等价：
bash "$SKILL/scripts/refresh.sh"          # 采集 → 解析 → 校验，一条龙
bash "$SKILL/scripts/refresh.sh" check    # 秒级体检：数据多旧了、服务在不在
```

### 三层自动化边界

| 层 | 谁做 | 说明 |
|----|------|------|
| 机械（导航+抓 DOM+落证据） | **全自动** | `collect-credits.js`，一次 8 平台 |
| 解析（余额/到期日/签到） | **全自动（3 家）** | `parse-evidence.py`。Trae/Qoder/扣子 的 DOM 文本格式高度规整，可确定性正则 |
| 判断（口径冲突/新平台） | **agent** | 格式不稳定的（Manus/豆包/CodeBuddy/商汤/MiniMax）脚本标 pending，不瞎猜 |

### ⚠️ 页面按钮有两个，别点错

- **「立即采集刷新」** → `POST /api/refresh`，真采集（55s），页面顶部列出变化
- **「只重读数据」** → 只重新 fetch 缓存的 JSON，秒级

早期版本只有一个按钮叫「立即刷新」，但只重读 JSON，名不副实 —— 已拆开。
**页面必须由 `scripts/server.py` 提供**，用 `python3 -m http.server` 没有
`/api/refresh`，按钮会报 `unknown endpoint`。

### 定时任务已装

`~/Library/LaunchAgents/com.ai-credits-audit.daily.plist` —— 每天 **09:07** 自动跑 `refresh.sh`。

```bash
launchctl list | grep credits                # 看状态
tail -f /Users/javaedge/soft/VSProjects/project-launcher/projects/ai-credits-audit/data/logs/launchd.out.log
launchctl unload ~/Library/LaunchAgents/com.ai-credits-audit.daily.plist   # 卸载
```

**已知限制**：launchd 后台会话没有图形登录上下文，ego-browser 可能起不来。
实测目前可用；失败时 `refresh.sh` 会 `touch data/NEEDS_AGENT`，开工先查：

```bash
ls /Users/javaedge/soft/VSProjects/project-launcher/projects/ai-credits-audit/data/NEEDS_AGENT 2>/dev/null && echo "需 agent 补做采集"
```

### agent 仍需接手的场合

`refresh.sh` / `/api/refresh` 跑完后，仍要 agent 判断：
1. `data/credits.json` 里 `confidence:"pending"` / `"conflict"` 的平台 —— 要不要补录、口径对不对
2. `validate-data.py` 报的 WARN（尤其「同到期日多笔」要确认不是重复计数）
3. 新装的平台 —— 往 `platforms[]` 加对象，必要时给 `parse-evidence.py` 加解析器

### 采集脚本单独用

```bash
ego-browser nodejs < "$SKILL/scripts/collect-credits.js"
COLLECT_ONLY=trae-cn,qoder ego-browser nodejs < "$SKILL/scripts/collect-credits.js"
COLLECT_PROBE=1 ego-browser nodejs < "$SKILL/scripts/collect-credits.js"   # 只探登录态
```

⚠️ **必须用 `<` 重定向或 `-e`**，不能 `ego-browser nodejs <path>` ——
它的 CLI 只接受一个 source 参数，多传路径报 `accepts at most one source argument`。
⚠️ **脚本注释必须是 `//` 不是 `#`** —— 写成 `#` 整个脚本报
`SyntaxError` 且指向第一行，很容易查错方向。

## 先定 skill 根目录

skill 被触发时 cwd 是**用户当前项目目录**，不是 skill 目录。所以任何相对路径都会失效。
每次开工先解析绝对路径：

```bash
SKILL=/Users/javaedge/soft/VSProjects/project-launcher/projects/ai-credits-audit
# 若不确定装在哪，先找：
ls -d /Users/javaedge/soft/VSProjects/project-launcher/projects/ai-credits-audit 2>/dev/null || \
  find ~/.agents ~/.claude ~/.config/opencode -maxdepth 3 -type d -name ai-credits-audit 2>/dev/null
```

下文出现的 `$SKILL` 都指这个绝对路径。**不要直接用 `scripts/xxx` 这类相对路径。**

## 核心认知（决定成败的四条）

### 1. 枚举必须全量，禁止关键词过滤

**这是本任务最容易翻车的地方。** `/Applications/*.app` 有 75 个 App，用 `grep -E "qoder|trae|cursor"` 这类名单过滤会漏掉 20+ 个真实存在的平台（扣子、AutoClaw、OpenClaw、豆包、Manus、MiniMax、ZCode、Kimi Code、商汤小浣熊……）。

正确做法：**先全量列出，再逐个判定**。

```bash
ls -d /Applications/*.app          # 全量，不加 grep
ls ~/.local/bin ~/go/bin 2>/dev/null  # CLI 型
ls -d ~/Library/Application\ Support/*  # 找 Electron 应用的真实数据目录
```

判定依据是 **BundleID**，不是 App 显示名：

```bash
for a in /Applications/*.app; do
  printf "%-24s " "$(basename "$a" .app)"
  /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$a/Contents/Info.plist" 2>/dev/null
done
```

平台清单和「有/无积分体系」的预判见 `$SKILL/references/platforms.md`。

### 2. 余额几乎从不落盘

实测扫描 Trae / TRAE SOLO / WorkBuddy / CatPawAI / CodeBuddy / Qoder / Coze / QClaw / Manus / MiniMax / Kimi Code 的
`Local Storage` + `IndexedDB`，搜索 `credit|point|quota|balance|coin|bean` 数值字段——
**11 个平台只有 1 个命中**（商汤小浣熊 `available_points`）。

所以本地扫描的价值不是拿余额，而是拿：
- **签到痕迹**（哪些平台有签到机制、上次签到时间）
- **账户 ID**（多账号平台用来区分）
- **极少数缓存的余额**

余额**必须**走登录态实时读。

### 3. 桌面 App 的 token ≠ 浏览器登录态

Qoder 的 `~/.qoder/.auth/user` 是加密的；Chrome 对这些平台**全部未登录**。
不要指望导入的浏览器 profile 自带会话——大概率全部被重定向到登录页。

流程：先用浏览器探测哪些已登录 → 把未登录的开成标签页 → `task.handOff()` 交给用户 → 用户回「好了」→ `takeOverTaskSpace(spaceId)` 接管。

### 4. 签到状态要靠「到期日反推」，不能只看按钮

平台常不告诉你「今天签没签」。但签到赠送的积分**有效期是固定的**，可以反推：

```
发放日 = 到期日 − 固定天数
```

实测值：
- **Trae CN：到期 = 发放 + 31 天**
- **Qoder：到期 = 发放 + 30 天**

反推出来的发放日期序列若包含今天 → 今天已签到。
**务必用本地时间戳交叉验证**（见下步），确认偏移量对得上再下结论。

## 工作流程

### Step 1：全量枚举 + 分类

```bash
python3 "$SKILL/scripts/scan-local-credits.py" --enumerate
```

输出：所有 AI 相关 App / CLI / 数据目录 + BundleID + 体积。
按 `$SKILL/references/platforms.md` 的表判定每家属于哪一类：

| 类别 | 处理方式 |
|------|---------|
| 有积分 + 每日签到 | 必须查余额 + 签到状态 |
| 有积分，无签到 | 查余额 |
| 订阅制（Cursor/Claude/ChatGPT/Antigravity） | 只记套餐名，标 N/A |
| 自托管 / 纯 API Key（Letta/opencode/Cherry Studio） | 标 N/A |
| 已下架 / 无 Web 控制台（QClaw） | 划掉 |

### Step 2：本地扫描（免费，先做）

```bash
python3 "$SKILL/scripts/scan-local-credits.py" --local
```

会做三件事：
1. 遍历所有 Electron 应用的 `Local Storage` / `IndexedDB`，搜积分/额度数值字段
2. dump 所有 `state.vscdb` 里含 `credit|point|quota|checkin|balance|grant` 的 key 和 value（**签到证据的主要来源**）
3. 把 `<key>` 里的 unix 毫秒时间戳转成日期

重点看 Trae 系的两个 key，它们直接给出签到历史：
```
solo-lite.commercial-banner.commercial:soloLite.banner:credits.dailyCheckin.banner:user:<uid>
commercial-banner-popup:commercial:ide.bannerPopup:credits.dailyCheckIn.ideBanner:user:<uid>
```
value 里 `lastWriteDay` = 上次签到日期，`count` = 本月次数。

### Step 3：浏览器读实时余额

**用 ego-browser**（复用用户登录态）。关键约束：

- **Page 预算只有 8 个**。每读完一个平台的数据就 `page.close()` 释放槽位，别一次性开 12 个。
- 一个 TaskSpace 贯穿全程，不要换 space。
- 抓数字优先 `page.evaluate(() => document.body.innerText)`；SPA 抓不到时用 `screenshot()` 视觉读。

```js
const task = await taskSpace("ai-credits-audit");
const pg = task.page("p1");
await pg.goto("https://example.com/account/usage");
await pg.waitForTimeout(2500);
console.log(await pg.evaluate(() => document.body.innerText));
await pg.close();   // 释放预算
```

各平台的余额页路径见 `$SKILL/references/platforms.md`。

**判登录态**：
```js
const L = (await pg.evaluate(()=>document.body.innerText)).split("\n").map(s=>s.trim()).filter(Boolean);
const needLogin = L.filter(l => /^(登录|登录\/注册|登录以|Sign in|Log in)/.test(l)).length > 0;
```
注意陷阱：扣子未登录时会显示落地页 + 一句「登录怎么又失败了」的 toast，但 URL 不是 `/login`——**别只看 URL**。

**多候选路径**：找不到余额页时依次试（Qoder 就是 `/account/billing`、`/account/quota` 全被重定向回 `/account/profile`，最后在 `/account/usage` 找到）：
```
/account/usage → /account/billing → /account/quota → /account/credits → /account
```

### Step 4：交叉验证签到状态

拿到「签到明细列表」后做三件事：

1. **算偏移量**：用列表里**非今天**的条目，和本地 vscdb 记录的上次签到时间戳对齐，算出「到期 − 发放 = ?天」
2. **验证偏移量一致**：Trae 实测 31 天，反推最后一条到期日 `2026/11/01 15:04` → 发放 `2026/10/01 15:04` = 今天 ✅
3. **验算术**：分档金额求和应等于总额（Trae `200×3 + 150×20 + 100×2 = 3800` ✅）。对不上说明数据有重复行或漏行，回头查

**别只信空间页总数。** 扣子空间页显示「总积分 1,500」，会话页却报「积分剩余 23% / 当前积分不足」——两者口径不一致（总额度 vs 某模型配额）。发现矛盾要**并列呈现并标注未确认**，不要挑一个当结论。

### Step 5：过期分析（这是用户最需要的）

把所有带到期日的额度按日期铺开，按平台堆叠：

- **7 天内到期** → 红色，最紧急
- **30 天内到期** → 黄色
- **超 30 天** → 绿色

必算三个数：
```
30 天内过期 / 有到期日总额 = 过期压力比
7 天内过期额
最近一条到期日（通常是明天）
```

实测参考：Trae 每天签到送 150~200 分但**有效期仅 31 天** —— 不消耗就等于白送，这是最容易被忽略的坑，要在看板顶部做成告警条。

### Step 6：写入数据层（唯一需要改的地方）

看板是**纯渲染器**，不含任何硬编码数据。所有视图（过期时间线、30 天压力比、签到日历、余额表）都由 `data/credits.json` 推导。

```bash
# 编辑 data/credits.json（唯一数据源），重点字段：
#   snapshot / today            —— 快照时间，页面用它算 T+N
#   platforms[].unit            —— credit（默认）| token。**非 credit 的平台单独统计，
#                                 不进积分加总、不进过期压力比、不进签到日历**
#   platforms[].quotaWindows[]  —— 非积分额度池的构成（模型 / 额度 / period / entitlementId）
#   platforms[].grants[]        —— {granted, expires, amount, unit, kind, label}
#                                 kind: checkin | monthly | task-reward | subscription
#                                 expires 是权威到期日；granted 按平台固定偏移反推
#   platforms[].checkin         —— {applicable, done, amount, evidence}
#                                 done 是三态：true 已签 / false 确认未签 / **null 未查**
#   platforms[].confidence      —— confirmed | stale | conflict | partial | pending
#                                 页面据此打「已确认 / 缓存快照 / 口径冲突 / 部分 / 未查」标签
#   naPlatforms                 —— subscription / selfhosted / dropped 三组
#   meta.limitations            —— 页脚方法论，数组每项渲染成一条

加新平台 = 往 `platforms[]` 里加一个对象，**不需要动 HTML**。

### ⚠️ 智谱系共三套独立额度池，不要合并

旧版本把三者并成一条「智谱系 · 额度合并在 bigmodel.cn」，**这是错的**。2026-10-05 登录实测：

| 池子 | 入口 | 单位 | 实测 | 到期 |
|------|------|------|------|------|
| **bigmodel.cn 资源包** | `bigmodel.cn/finance-center/resource-package/package-mgmt?tab=my` | token | 【实名认证】500万 GLM-4.7 体验包，5,000,000（未消耗） | **2026-11-30** |
| **ZCode Start Plan** | `zcode.z.ai/zcode-api/coding-plan/start-plan-balance` | token | 3M + 5M = **8,000,000/天** | **2026-10-06** |
| **AutoClaw autoglm 积分** | 仅桌面 App | credit | 规则已实测，余额查不到 | 活动积分可短至 3 天 |

- GLM Coding Plan 付费档**未订阅**（`/coding-plan/personal/usage` 显示「未产生调用量」）
- bigmodel 财务：可用余额 ¥0 / 累计充值 ¥0 / 赠送金额 ¥0 / 信用余额未开通
- ⚠️ bigmodel 那个资源包**仅适用 glm-4.7**，不能用于 GLM-5.3 / GLM-5.3-Flash

**ZCode 的额度能离线读到**（唯一一个额度数值能离线读的）：Electron HTTP cache 里是 brotli 压缩的
`zcode-api/coding-plan/start-plan-balance` 响应，含完整 `entitlements`：

```bash
SKILL=/Users/javaedge/soft/VSProjects/project-launcher/projects/ai-credits-audit
P="$HOME/Library/Application Support/ZCode/session/Partitions/zcode-coding-plan/Cache/Cache_Data"
for f in "$P"/*_0; do
  node -e 'const f=require("fs"),z=require("zlib"),d=f.readFileSync(process.argv[1]);
    for(let o=0;o<6000;o++){try{const t=z.brotliDecompressSync(d.subarray(o)).toString();
      if(/^\s*[[{"]/.test(t)&&/entitlements/.test(t)){console.log(t.slice(0,800));break}}catch(e){}}' "$f"
done
```

AutoClaw 的 `autoclaw-promotion-config` 同样能离线解压，但里面**只有活动规则没有余额**。

⚠️ `~/.zcode/v2/coding-plan-cache.json` 里 4 个 plan 全 `unavailable`，
但那文件 `updatedAt` **早于**实际登录时间，**不能据此断言「没套餐」** —— 权威数据在上面那个 API。
⚠️ 「每日/注册 1~2 亿 token」是 AutoClaw 侧的活动（积分加油站第二期「每日 200,000,000 tokens」/
新用户 2 亿礼包），**不是 ZCode 的**。ZCode Start Plan 是 **800 万/天**。

### Step 7：起服务 + 验证渲染

```bash
bash "$SKILL/scripts/serve.sh" 8787    # 自动 open 浏览器
```

浏览器会每 5 分钟自动重读 `data/credits.json`，页面右上角显示数据新鲜度；超过 12 小时标红。

验证必须用 **DOM 断言**，不要只靠截图 —— ego-browser 在 `window.scrollTo` / `mouse.wheel` 之后
`screenshot()` 恒返回空白（合成层限制），容易误判成页面坏了：

```js
const v = await pg.evaluate(() => ({
  live:   document.querySelector("#liveTx").textContent,
  err:    getComputedStyle(document.querySelector("#err")).display,   // 期望 "none"
  tlRows: document.querySelectorAll(".tl-row").length,
  axis:   document.querySelector(".tl-axis .tl-x")?.textContent,     // 合计要与 JSON 对得上
  rows:   document.querySelectorAll("tbody tr").length,
  cal:    {on:document.querySelectorAll(".cal i.on").length,
           miss:document.querySelectorAll(".cal i.miss").length,
           unk:document.querySelectorAll(".cal i.unk").length,
           today:document.querySelectorAll(".cal i.today").length},
  overflowX: document.documentElement.scrollWidth > window.innerWidth, // 期望 false
}));
```

`cal.on + cal.miss + cal.unk` 应等于回溯窗口天数（默认 60）。
`cal.today` 必须是 1。**注意 ego-browser 有广告拦截扩展**，看到 `AdBlock`、`MultiPost` 之类的
executionContext 是正常的，不是页面异常。

## 关于「自动化」的真实边界

余额**不可能**自动刷新：它只存在于各平台登录态页面里，必须 ego-browser 逐个打开 + DOM 提取，
且要处理登录墙、SPA、超时、Page 预算。这层离不开 agent。

能做到自动的是：
- **渲染层全自动** —— 改 JSON 立即生效，页面自己轮询
- **数据层单点维护** —— 加平台不用碰代码
- **新鲜度可见** —— 页面显示快照时间，超期标红，不会拿旧数据糊弄你

也就是说：说「盘点积分」→ 我跑一遍采集 → 写 JSON → 页面 5 分钟内自动更新。

## 反面教材（不要重犯）

| 错误 | 后果 | 正确做法 |
|------|------|---------|
| 用名字 grep 过滤 `/Applications` | 漏掉 20+ 个平台，用户当场质疑 | 全量列出 + BundleID 判定 |
| 只报「余额」不报「过期」 | 用户真正痛点是 98% 会过期 | 到期时间线 + 过期压力比 |
| 把不同单位的额度加在一起 | ZCode 的 800 万 token 灌进积分加总，「共 5,049 分」会变成 800 万 | `platforms[].unit` 闸门，token 池单独一块 |
| 直接点「签到」按钮 | 未经授权的写操作 | 先问；本 skill 默认**只读** |
| 8 个标签页全开满再采数据 | 撞 Page budget，被迫中断 | 边采边 `close()` |
| 用空格数推断签到天数 | Trae 是 31 天不是 30，结论会错位一天 | 用本地时间戳交叉验证 |
| 挑一个数字当结论 | 扣子 1,500 vs 23% 口径冲突 | 并列呈现 + 标注未确认 |
| 提交缓存快照当实时余额 | 商汤 11,061 是旧快照 | 用 `confidence:"stale"` 标注，页面打「缓存快照」标签 |
| 登录页判��漏了 OAuth CTA | 只匹配「登录/Sign in」，Freebuff 的「Continue with GitHub」被误判成已登录 → 静默产出空数据 | `LOGIN_RE` 必须覆盖 `Continue with Xxx` / `Sign up` / `Log in` |
| 同一条命令里前缀赋值不生效 | `SKILL=x cmd < "$SKILL/f"` 展开成空 → `no such file or directory: /f` | 变量赋值与使用**分行写**，或先 `export` |
| 在 HTML 里硬编码数据 | 加平台要改代码，容易前后不一致 | 数据只写 `data/credits.json`，页面纯推导 |
| 签到日历取多平台并集 | Qoder 签到日掩盖 Trae 漏签，6 天误报成 4 天 | 日历只跟**单一平台**（checkin grant 最多的那个） |
| 把「无数据」当「漏签」 | 回溯窗口一大就满屏假漏签 | 早于最早发放日的格子标 `unk`（灰），不计入漏签 |
| 局部变量命名遮蔽模块函数 | `const days=[]` 遮蔽 `days(a,b)` → TDZ 报错 | 派生逻辑里的数组别叫 `days`/`parseD` 等模块级同名 |
| ego-browser 传两个参数 | `ego-browser nodejs <path>` 报 `accepts at most one source argument` | 用 `< "$SKILL/scripts/x.js"` 重定向；配置走环境变量 |
| JS 里写 `#` 注释 | 整脚本 `SyntaxError` 且报错指向第一行，方向容易看错 | 用 `//`；写完先 `node --check` |
| 用相对路径 | skill 触发时 cwd 是项目目录，`bash scripts/x.sh` 找不到 | 全文用 `$SKILL` 绝对路径变量 |
| 页面里用相对 fetch | 页面在 `/assets/`，`fetch("api/refresh")` → `/assets/api/refresh` → `unknown endpoint` | API 与 JSON 一律用根绝对路径 `/api/...`、`/data/...` |
| 按钮名不副实 | 叫「立即刷新」却只重读缓存，用户点了没反应 | 拆成「立即采集刷新」+「只重读数据」两个按钮 |
| 用静态服务器 | `python3 -m http.server` 没有 `/api/refresh` | 用 `scripts/server.py` |
| 校验器把「今天到期」当「已过期」 | `expires == today` 误报 ERROR | 只有 `expires < today` 才算错误，`== today` 是 warn |
| 解析器残留旧状态 | 页面这次没渲染签到入口，旧 `done=true` 留着被误报 | `applicable=false` 时必须显式清 `done`/`amount` |
| 扫缓存时整条打印 URL | AutoClaw 内嵌 webview 的 URL 查询参数带 `autoglm_token=Bearer eyJ...` 明文 JWT，凭据进日志 | 枚举缓存 URL 只输出域名 + 路径，token 只按名字引用 |
| 把「未查」渲染成「未签」 | `checkin.done` 用 `!done` 判空，`null` 落进「未签」分支，凭空多一个漏签 | `done` 三态：`true` / `false` / `null` |
| 时间线 bonus 扫全量平台 | 非积分平台的 `grant.label` 漏进积分时间线，还撑出横向滚动条 | `flatMap` 只扫 `creditPlats`，`td` 加 `overflow-wrap:anywhere` |
| 滚动后靠截图验证 | ego-browser 滚动后 screenshot 恒空白，易误判 | 用 DOM 断言验证，见 Step 7 |

## 权限边界

- 默认**只读**。用户明确说「顺手帮我补签到」才做写操作，且签到前先报数量。
- 不清 cookie、不改浏览器 profile 状态。ego-browser 的 `references/clearing-state.md` 警告过：某些清理动作会波及整个浏览器 profile。
- 不打印 token / 凭据明文。需要判断登录态时看 URL 和页面文案，不 dump 密钥。

## 参考

以下均在 `$SKILL` 下：

| 文件 | 作用 |
|------|------|
| `data/credits.json` | **唯一数据源**。加平台只改这里 |
| `assets/dashboard.html` | 看板（纯渲染器，零硬编码数据） |
| `references/platforms.md` | 平台清单、BundleID、余额页路径、有效期规则、vscdb 签到 key 速查 |
| `scripts/scan-local-credits.py` | 枚举 + 本地扫描 |
| `scripts/serve.sh` | 启动看板 + 采集 API（**不能用 `python3 -m http.server`**） |
| `scripts/server.py` | 带 `/api/status` `/api/refresh` 的服务实现 |
| `scripts/parse-evidence.py` | 页面文本 → 结构化数据，回写 credits.json（Trae/Qoder/扣子 自动） |
| `scripts/refresh.sh` | **每日刷新入口**（采集 + 体检） |
| `scripts/collect-credits.js` | ego-browser 采集脚本（8 平台） |
| `scripts/validate-data.py` | 数据层一致性校验，改完必跑 |
| `scripts/com.ai-credits-audit.daily.plist` | launchd 每日 09:07 定时任务 |
| `data/raw/` | 每次采集的原始证据 |

### 已停服，不再统计（2026-10-02）

QClaw、clawdbot、clawdis、catpaw-moon 已从本机磁盘删除，并从 `data/credits.json`
的 `naPlatforms.dropped` 组移除（该组已整体删除，页面不再有「已下架」区块）。

它们**故意没有**写进 `scripts/scan-local-credits.py` 的 `AI_HINTS` —— 加进去下次盘点
又会冒出来。`platforms[]` 里也没有它们。

⚠️ **AutoClaw / AutoClaw2（`com.zhipuai.autoclaw*`，智谱）仍在跟踪**，名字带 claw 但
和 clawdbot 无关，别误删。
⚠️ **智谱系不要合并**：ZCode（`dev.zcode.app`）走 z.ai 的 Start Plan token 额度，
AutoClaw / AutoClaw2 走 autoglm 积分任务，是两套独立池子。
详见「一之三、token 额度池」。
⚠️ `Application Support/CatPawAI`（737M）尚未删除，待确认。
| `data/logs/` | 刷新与扫描日志 |

## 脚本已知坑（都已修，别改回去）

| 坑 | 现象 | 现状 |
|----|------|------|
| BSD grep 不可靠 | `grep -oE` 在二进制 + 区间量词下**静默漏匹配**，`available_points`明明在文件里却搜不到 | 改用纯 Python 读文件 + `re` |
| LevelDB protobuf 前缀 | 字段名前**没有**引号，形如 `\x1d\x00...\x13\x00available_points":11029`，强制前引号的正则必然漏 | 前引号设为可选，并吃掉 `\x00-\x20` |
| 同名误命中 | `obsidian` 的 Java 类名 `BeanFactoryB = 0` 被当成积分 | 加 `CREDIT_FALSE` 黑名单 + 要求值 > 0 |
| 坏 vscdb | CodeBuddy 的 `state.vscdb` 报 `database disk image is malformed` | 捕获 `sqlite3.DatabaseError`，标注而非崩溃 |
| 运行时长 | 全量扫 `Local Storage`（含 Qoder 4.4G / TRAE 3.5G）约 15 秒 | 正常范围，不必优化 |