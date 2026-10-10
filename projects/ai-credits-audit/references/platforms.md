# 平台清单 · BundleID / 余额页路径 / 过期规则

盘点时间 2026-10-01，基于 macOS 75 个 App 的实测结果。

## 一、有积分 + 每日签到（必须查余额 + 签到）

| 平台 | BundleID | 余额页路径 | 签到证据来源 | 有效期规则 |
|------|----------|-----------|-------------|-----------|
| **Trae CN** | `cn.trae.app` | `www.trae.cn/dashboard` → 用量管理 | `state.vscdb` 的 `credits.dailyCheckIn.ideBanner:user:<uid>`，value 里 `lastWriteDay` + `count` | **到期 = 发放 + 31 天** |
| **Qoder** | `com.qoder.app` | **`qoder.com/account/usage`**（其他路径全重定向回 `/account/profile`） | 资源包到期日列表反推 | **到期 = 发放 + 30 天** |
| **MiniMax** | `com.minimax.hub.global` | 首页点「升级套餐」弹窗（免费版**不显示余额**） | 首页「每日签到」浮层，签到后首格显示 ✓ | 阶梯 800/800/800/2000/800/800/2000 + 额外 400 |
| **扣子 Coze** | `cn.coze.desktop` | `www.coze.cn/space/<spaceId>/develop` 左下「总积分」 | **无签到机制** | 未知 |

### 关键数据点

**Trae CN**
- 多账号：`3604678328453932`（主）、`520530025003546`、`4493055025223388`
- vscdb 四个相关 key：`credits.dailyCheckIn.ideBanner`、`credits.monthlyGranted.ideBannerPopup`（按月分 key）
- 「每日签到」是可展开的 `<button class="groupHeader-...">` accordion，展开后列出每笔的**到期日**
- 反推漏签：`漏签日 = 缺失的到期日 − 31 天`
- 页面顶部还有「下载 TraeWork 桌面端奖励」和「每月登录赠送」，到期规则可能与签到不同，**别混算**

**Qoder**
- 余额页里三类资源分开显示：订阅额度 / 个人资源包 / 获赠资源包（逐包列到期日）
- 套餐 `personal_standard`（体验版）订阅额度为 0，全靠签到包
- `/account/usage` 是唯一有效路径。依次试 `/account/billing` `/account/quota` `/account/credits` 会全部弹回 `/account/profile`

**扣子**
- **未登录时会显示落地页 + toast「登录怎么又失败了」，但 URL 不是 `/login`** —— 别只看 URL 判断
- 空间页「总积分 1,500」与会话页「积分剩余 23% / 当前积分不足」**口径冲突**，可能是总额度 vs 某模型配额。发现矛盾并列呈现、标注未确认
- 官方明确**无每日签到**：免费积分只靠不定期活动（积分膨胀季）、失败任务 1 工作日自动补发、付费订阅

## 一之二、有积分，额度自动重置（不过期）

| 平台 | 入口 | 机制 | 余额读取 |
|------|------|------|---------|
| **Freebuff** | `freebuff.com` · npm `freebuff` | 每日 100 **Freebucks**，太平洋时间零点重置、**不过期不结转**、无需手动签到。可换各模型额度：Solar Mini 4 / Space Bunny Alpha 无限时，MiMo 2.6 Flash 10h，Solar Pro 4 10h，GLM 5.3 Flash 6h，DeepSeek V4.1 Flash 6h，GPT-6 Luna 5h，MiMo 2.6 Pro 3h | `freebuff.com/dashboard`，需 GitHub/Google/Apple 授权登录 |

**与本表其他平台的模型完全相反**：Trae 31 天过期、Qoder 30 天过期，Freebuff 不过期。
所以它**不进过期时间线**，也别拿「过期压力比」去衡量它。

Freebuff 是 Codebuff 的免费层（页脚 `codebuff.com`，GitHub `CodebuffAI/codebuff`）。
若日后收录 Codebuff 原站，按 pilot 原则「link 不同即不同入口」两条都要留。

## 一之三、token 额度池（单位不是积分，单独统计）

⚠️ **智谱系共三套独立额度池，禁止合并。** 已登录实测（2026-10-05）。

| # | 池子 | 入口 | 单位 | 实测值 | 到期 |
|---|------|------|------|--------|------|
| ① | **bigmodel.cn 资源包** | `bigmodel.cn/finance-center/resource-package/package-mgmt?tab=my` | token | 【实名认证】500万 GLM-4.7 体验包，当前=可用=**5,000,000** | **2026-11-30** |
| ② | **ZCode Start Plan** | `zcode.z.ai/zcode-api/coding-plan/start-plan-balance` | token | GLM-5.3 **3M** + GLM-5.3-Flash **5M** = **8,000,000/天** | **2026-10-06** |
| ③ | **AutoClaw autoglm 积分** | 仅桌面 App（Web 无入口） | credit | 查不到，见下 | 活动积分可短至 3 天 |

**GLM Coding Plan 付费档：未订阅** —— `bigmodel.cn/coding-plan/personal/usage` 登录态实读显示「未产生调用量」。
bigmodel 财务总览：可用余额 ¥0 / 累计充值 ¥0 / 赠送金额 ¥0 / 信用余额未开通。

⚠️ ① 只适用于 **glm-4.7** 推理，**不能**用于 GLM-5.3 / GLM-5.3-Flash。

### ② ZCode —— Start Plan（实测快照 2026-10-02）

```json
{"balance":{"plans":[{
  "plan_id":"zcode-v3-start-plan-0817","name":"ZCode Start Plan",
  "description":"免费 GLM 旗舰模型体验","status":"active",
  "starts_at":1790930662,"ends_at":1791302399,
  "entitlements":[
    {"show_name":"GLM-5.3",      "grant_units":3000000,"unit_type":"token","period":"daily"},
    {"show_name":"GLM-5.3-Flash","grant_units":5000000,"unit_type":"token","period":"daily"}]}]}}
```

- **每日额度 8,000,000 token**，`period=daily` 自动重置，**无签到机制**
- **计划窗口 `ends_at` = 2026-10-06 23:59:59 → 到期即额度归零，无顺延**
- 付费档单位是 **Credits**，双周期（5 小时 + 每周）刷新，与 token 额度不是同一套：

| 套餐 | 5 小时积分 | 每周积分 | 价格 |
|------|-----------|---------|------|
| Lite | 2,000 | 10,000 | $18 |
| Pro | 12,000 | 60,000 | $80（6× Lite）|
| Max | 28,000 | 140,000 | $168（14× Lite）|

  折算 token：Lite 约 0.48–0.97 亿/周（GLM-5.3，95% 缓存命中）。
- 支持 6 个独立 plan 连接：`zai-individual` / `zai-team` / `zai-start` / `bigmodel-individual` / `bigmodel-team` / `bigmodel-start`
- **数据落盘**：`Application Support/ZCode/session/Partitions/zcode-coding-plan/Cache/Cache_Data/`
  响应体 **brotli 压缩**，本机唯一能离线读到完整额度明细的平台：
  ```bash
  P="$HOME/Library/Application Support/ZCode/session/Partitions/zcode-coding-plan/Cache/Cache_Data"
  for f in "$P"/*_0; do
    node -e 'const f=require("fs"),z=require("zlib"),d=f.readFileSync(process.argv[1]);
      for(let o=0;o<6000;o++){try{const t=z.brotliDecompressSync(d.subarray(o)).toString();
        if(/^\s*[[{"]/.test(t)&&/entitlements/.test(t)){console.log(t.slice(0,800));break}}catch(e){}}' "$f"
  done
  ```
- ⚠️ `~/.zcode/v2/coding-plan-cache.json` 里 4 个 plan 全 `unavailable`，
  但 `updatedAt=2026-09-19` **早于** 10-02 的 z.ai 登录，**不能据此断言「没套餐」**。

### ③ AutoClaw / AutoClaw2 —— autoglm 积分（规则已实测，余额查不到）

**奖励规则**（从本地 `autoclaw-promotion-config` API 响应体解压得到）：

| 活动 | 规则 | 备注 |
|------|------|------|
| 国庆登录畅享 7000 积分 | 10/1–10/7，**每日登录领 1000** | 进行中 |
| 限时积分加油站 | **周一至周三每日登录领 5,000–10,000** | |
| 积分跃迁 M8W4 | 周一至周三登陆即送 2,000 | ⚠️ **有效期 3 天** |
| 积分加油站第二期 | 登录即领 2 亿 tokens；预告「每日 200,000,000 tokens」 | 「2 亿」的出处 |
| GLM-5.3-Flash 积分卡 | 邀请绑定，至高 130,000 积分 | |
| 付费积分限时 100% 返还 | 会员专属，9/2–9/6 | 已结束 |

另有**月度**口径（官网文案）：「每月登陆 AutoClaw，即领大额积分 · Lite 5,000 / Pro 10,000 / Max 26,000」。
`inConversationList[0].pointsThreshold = 0` → 积分耗尽时的推广触发阈值。

**为什么余额查不到**（三条都实测过）：
1. `autoclaw.zhipuai.cn/console` 与 `/account` → **404**
2. `autoglm.aminer.cn/autoclaw/promotion/inspiration-center/points-tasks-section/` → `ERR_ABORTED`，
   那是 **App 内嵌 webview 路由**，外部浏览器打不开
3. 本地 Electron 缓存全量解压后**无余额字段**，只有 `creditConsumptionLevel`（低/中/高）与 `pointsThreshold`

→ **只能开桌面 App 看**。营销页 `autoclaw.zhipuai.cn` / `autoclaw.z.ai` 有登录按钮但无控制台。
`autoglm.zhipuai.cn`（AutoGLM 小凹）是**另一个产品**，虽与 AutoClaw 共用 AutoGLM 统一账号，但积分不互通。

- 数据目录：`autoclaw/`（v1，2.7G）、`AutoClaw-official/`（v2，83M）
- 云沙箱：`autoglm-api.zhipuai.cn/autoclaw-cloud/ws?sandbox_id=...`
- API 网关：`autoglm-acceleration-api.zhipuai.cn/autoclaw-proxy/proxy/{autoclaw-promotion-config,autoclaw-model-config,third-party-provider-config}`
- 已关闭的推广弹窗 key（Local Storage `promotion_modal.v2`）：
  `newbie` · `creditJump` · `invite` · `agent_cluster` · `GLM53FS` · `Token_Rush_M9W4_2BS` · `member_perk` · `new_harness_old` · `socialmedia` · `national_day_100`

### ⚠️ 扫缓存的安全纪律

AutoClaw 内嵌 webview 导航的 URL 查询参数里带 **`autoglm_token=Bearer eyJ...` 明文 JWT**。
枚举缓存 URL 时**只输出域名 + 路径，绝不整条打印 URL**，否则凭据进日志/对话记录。
同理适用于所有 Electron `Cache/Cache_Data` 与 `Local Storage/leveldb`。

## 二、有积分，无签到

| 平台 | BundleID | 数据位置 |
|------|----------|---------|
| **商汤小浣熊 / 商量** | `com.sensetime.desktop.raccoon` | 本地 `office-raccoon/Local Storage` → `available_points`。**11 个平台里唯一能从缓存读到余额的** |

网页版 `chat.sensetime.com` 无积分入口。

## 三、订阅制（只记套餐名，标 N/A）

| 平台 | BundleID | 实测 |
|------|----------|------|
| Cursor | `com.todesktop.230313mzl4w4u92` | Free；`cursor.com/dashboard/usage` 显示 Included 50.5K tokens |
| Claude | `com.anthropic.claudefordesktop` | Free；「Usage settings are only available on Pro and Max plans」 |
| ChatGPT | `com.openai.codex` | Free；API `plan_type: "guest"`，`plan_display_name: "Free"` |
| Antigravity / Antigravity IDE | `com.google.antigravity(-ide)` | Google 订阅制 |

## 四、自托管 / 纯 API Key（N/A）

Letta（`com.todesktop.260305dtu2nh5`）、Letta Code、OpenCode（`ai.opencode.desktop`）、
Cherry Studio（`com.kangfenmao.CherryStudio`）、Cline（`bot.cline.app`）、
SkillDeck（`com.github.skilldeck`）、Kimi Code（`com.kimi.code.desktop`）、KimiCU（`ai.kimi.cu`）、
Copilot / M365 Copilot（`com.microsoft.m365copilot`）、codex CLI、claude CLI、qodercli、codebuddy CLI

## 五、查不到余额的（已登录但页面不存在）

| 平台 | 情况 |
|------|------|
| **Manus / Cue** | `ai.manus.agents`；已登录，但 `/settings` `/billing` `/credits` 全 404 |
| **豆包** | `com.bot.pc.doubao`；已登录，对话页/工作台无积分入口 |

> ⚠️ 智谱系已移出本表 → 见「一之三、token 额度池」。ZCode / AutoClaw / AutoClaw2 是三套独立额度池，
> 不能像旧版那样合并成一条「智谱系 · 额度合并在 bigmodel.cn」。

## 六、已停服（2026-10-02 从本机移除，不再统计）

以下已从磁盘删除，且**故意不写入** `scripts/scan-local-credits.py` 的 `AI_HINTS`，
否则下次盘点会被重新枚举出来。

| 平台 | BundleID / 目录 | 处理 |
|------|-----------------|------|
| QClaw | `com.tencent.qclaw` | 已下架。删 `Application Support/QClaw`(1.2G) + `com.tencent.qclaw`(12K) + 偏好 |
| clawdbot | `clawdbot` | 删（0B 空目录） |
| clawdis | `clawdis` | 删（0B 空目录） |
| catpaw-moon | `catpaw-moon` | 删（25M）+ 偏好 `com.catpaw.ide` `com.catx.catpaw` |
| TRAE SOLO CN 旧账号 | `cn.trae.solo.app` / 账号 `520530025003546` | 自 09-16 起无活动，账号弃用 |

⚠️ **AutoClaw / AutoClaw2（`com.zhipuai.autoclaw*`）仍在跟踪**，别跟 `clawdbot` 混为一谈 ——
名字里有 claw 但不是同一个东西。

⚠️ `Application Support/CatPawAI`（737M）**尚未删除**，等确认。

## 七、本地数据目录速查

```
~/Library/Application Support/
  Coze/                     233M   扣子桌面端
  Doubao/                   2.5G   豆包
  Kimi, kimi-code-app       4K/4.1M
  Letta, Letta Code         12M/15M
  Manus/                    15M    Cue
  MiniMax/                  138M
  OpenClaw/                 36K    SQLite
  Qoder, QoderWork          4.4G/26M
  TRAE SOLO(CN), Trae CN    3.5G/3.7G/1.8G
  WorkBuddy/WorkBuddy AI    679M/0
  ZCode/                    31M    智谱 · 内含 Partitions/zcode-coding-plan 与 zcode-rewards
  autoclaw/                 2.7G   AutoClaw (v1)
  AutoClaw-official/        83M    AutoClaw2 (v2)
  comate/                   1.2G   百度 Comate
  kimi-desktop/             785M
  office-raccoon/           256M   ★ 唯一有余额缓存
```

**注意**：`WorkBuddy AI` 和 `Windsurf` 目录是 **0B**，说明应用已装但数据目录空——大概率是空壳或从未登录过。

## 八、vscdb 里的签到 key 速查

```
# TRAE SOLO CN
solo-lite.commercial-banner.commercial:soloLite.banner:credits.dailyCheckin.banner:user:<uid>:true
solo-lite.commercial-banner.commercial:soloLite.banner:credits.newUserGranted.soloLiteBanner:user:<uid>:new_user_credits

# Trae CN
commercial-banner-popup:commercial:ide.bannerPopup:credits.dailyCheckIn.ideBanner:user:<uid>
commercial-banner-popup:commercial:ide.bannerPopup:credits.monthlyGranted.ideBannerPopup:user:<uid>:YYYY-MM

# Qoder
secret://aicoding.auth.creditUsage          （Buffer，需 base64 解）
```

value 统一结构：`{"triggered":true,"count":N,"lastWriteAt":<unix_ms>,"lastWriteDay":"YYYY-M-D","firstWriteAt":<unix_ms>}`

`count` = 本月次数，`lastWriteDay` = 上次签到日。