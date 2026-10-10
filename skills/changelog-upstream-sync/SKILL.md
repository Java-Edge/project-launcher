---
name: changelog-upstream-sync
description: 基于本地已部分翻译的 changelog，定位官方最全上游 CHANGELOG，diff 出缺失版本，按本地既有格式补全并翻译为中文。当用户要求"找到官方最全 changelog 补全到本地""这个 changelog 有缺口帮我补上""把更新日志补全并翻译成中文""changelog 版本不连续""同步上游更新日志"时触发。适用于本地文件已覆盖部分版本、需按官方源补齐且保持格式一致的场景。与 changelog-curator 互补：curator 负责精简删减，本 skill 负责补全与翻译。
agent_created: true
---

# Changelog Upstream Sync（按官方源补全 + 中文化）

把一份**本地已部分翻译、版本不连续**的 changelog，对照官方最全上游源补全缺失版本，翻译为中文，并**严格沿用本地已有排版格式**。

## 核心原则（先看这三条）

1. **只做增量，绝不删除本地已有条目。** 本地记录可能来自不同的历史来源，官方未必最全。
2. **格式向本地对齐，不向官方对齐。** 官方用什么分区名不重要，本地用什么就继续用什么。
3. **用 Edit 锚点插入，不要重写整个文件。** 重写有转录损坏已有内容的风险。

## 与 changelog-curator 的边界

| | changelog-curator | 本 skill |
|---|---|---|
| 方向 | 减（删噪声） | 增（补缺失） |
| 翻译 | 禁止改写，不翻译 | 翻译缺失部分 |
| 源 | 只动本地文件 | 需拉取官方上游做 diff |

若用户既要补全又要精简，**先跑本 skill 补全，再跑 curator 精简**。

---

## Workflow

### 1. 定位官方最全源

不要猜 URL，按以下顺序确认：

1. 搜 `<项目名> changelog`，优先命中官方仓库（GitHub/GitLab）。
2. **用 raw 直链下载全文，不要用 WebFetch。** WebFetch 会摘要/截断，changelog 动辄数千行：
   ```bash
   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/CHANGELOG.md -o /tmp/official.md
   wc -l /tmp/official.md   # 确认量级，几千行属正常
   ```
3. **项目易主/改名时顺藤摸瓜。** 若仓库描述出现 "continuing from upstream X `3.53.0`"、"fork of X"、"community-maintained"，说明当前仓库的 CHANGELOG 可能只含接手后的版本，老版本要去**上游原仓库**取。典型：Zoo Code 承接 Roo Code，3.54.0 及以上在 `Zoo-Code-Org/Zoo-Code`，3.53.0 及以下在 `RooCodeInc/Roo-Code`。

### 2. 建立版本清单，做 diff

```bash
grep -nE "^## " /tmp/official.md   # 官方全部版本 + 行号
grep -nE "^## " <本地文件>          # 本地全部版本 + 行号
```

人工比对两份清单，得出：
- **缺失版本**（官方有、本地无）→ 本次要补
- **本地独有版本**（本地有、官方无）→ **保留不动，并在最终汇报中点名**

> 真实案例：Zoo Code 官方 CHANGELOG 缺失 v3.47.0、v3.46.2/1/0，而本地有（源自 Roo Code 上游）。若盲目"以官方为准"就会误删。

### 3. 补齐发布日期

官方 CHANGELOG 常在某个版本后不再写日期。用 releases API 补齐：

```bash
# 当前维护者仓库
curl -s "https://api.github.com/repos/<org>/<repo>/releases?per_page=100" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{JSON.parse(d).forEach(x=>console.log(x.tag_name,'|',(x.published_at||'').slice(0,10)))})"

# 老版本去上游原仓库再取一次
```

要点：
- 只取需要的 tag，避免输出过长。
- **日期以官方 release 的 `published_at` 为准**，不要从 changelog 正文猜。
- 若本地对某版本已有日期但与官方不符（如本地 3.45.0 写 01-28、官方写 01-27），**保留本地日期**，不改动已有条目。

### 4. 翻译与分区映射

先把官方分区映射到**本地已有分区名**，不要新造：

| 官方常见分区 | 本地典型对应 |
|---|---|
| Added / Minor Changes / Features | `### 新增功能：` |
| Changed / Improved / Refactor | `### 改进：` |
| Fixed / Patch Changes | `### 问题修复：` |
| Provider Updates | `### 提供商更新：` |
| BREAKING / 重大公告 | `### 重大更新：` |

**格式必须逐字符复制本地样本**（全角冒号、`v` 前缀是否带、日期括号样式、`---` 分隔符的空行节奏）：

```
## v3.50.0 (2026-02-19)

### 新增功能：

- **Gemini 3.1 Pro 支持** — 描述正文。(#11608)

---
```

### 5. 噪声过滤与合并

changelog 里常有大量无信息量条目，按本地文件的既有粒度决定是否过滤：

- **直接丢弃**：Renovate/依赖版本升级（除非标注 `[security]`）、"Prepare CLI release vX"、 "Changeset version bump"、"Merge the vX release preparation branch"。
- **合并为一行**：大批量同构条目（如 15 条"Migrate X provider tests to shared stream helpers"）压缩成一条并列出 PR 号区间。
- **保留**：安全更新（显式标注 CVE/安全）、废弃项、不兼容变更、公告类内容。

判断标准与 curator 一致：**关掉这条，用户看到的结果会不一样吗？**

### 6. 写入：锚点插入

用 Edit 在**版本边界**插入，而非 Write 整个文件。典型两个锚点：

- 最新缺失版本 → 插在文件头部条目之后、本地最高版本之前
- 老版本缺口 → 插在对应相邻版本标题之前

```bash
# 插入后必查
grep -nE "^## " <本地文件>   # 复核严格降序、无重复、无跳号
```

再 Read 抽查两处衔接位置（新旧交界、文件末尾），确认 `---` 与空行正确。

### 7. 收尾汇报

必须包含：
- 补了哪些版本（列全）
- 文件规模变化（行数、版本条目数）
- **本地独有、官方缺失的版本**（提醒用户这些是有价值的历史记录）
- **遗留项**：本地哪些版本条目比官方简略（若本次未展开），并说明未展开的理由

---

## 高频陷阱

| 陷阱 | 处理 |
|---|---|
| 用 WebFetch 拉 changelog | 会被摘要/截断。改用 `curl` + raw 直链 |
| 以为官方就是全集 | 本地可能有官方缺失版本。diff 双向看，只增不删 |
| 官方新版不写日期 | 用 GitHub releases API 补；易主项目要查两个仓库 |
| 重写整个文件 | 转录易损坏已有内容。用 Edit 锚点插入 |
| 照抄官方分区名 | 格式向本地对齐 |
| 依赖升级条目逐条翻译 | 合并或丢弃，否则文件膨胀数倍且无信息量 |
| 顺手"顺便优化"已有条目 | 禁止。用户说"基于已更新的记录"时，已有条目即权威 |

## 审校清单

- [ ] 官方源是 raw 直链全文，不是摘要？
- [ ] diff 双向做过：缺失版本已补、本地独有版本已保留？
- [ ] 日期来自 releases API，不是猜的？
- [ ] 分区名、全角冒号、`v` 前缀、`---` 节奏与本地样本逐字符一致？
- [ ] 只用了 Edit 插入，没有重写已有段落？
- [ ] `grep '^## '` 复核为严格降序、无重复？
- [ ] 依赖升级/发布准备类噪声已合并或丢弃，安全更新已保留？
- [ ] 汇报中点明了本地独有版本与遗留简略项？
