---
name: blog-translation-gap-audit
description: Audit which articles from a target tech blog are already translated in a local project and which are still missing. Use when the user provides a blog URL or site name (e.g. "claude blog", "openai blog", "anthropic engineering") and asks which posts they have translated locally vs which are still untranslated, or asks to check translation progress, 检查翻译进度, 哪些博客还没翻译, 翻译覆盖度, or 未翻译清单.
---

# Blog Translation Gap Audit

对目标技术博客做一次"本地翻译覆盖度审计"：输入博客网站，输出本地已翻译与未翻译两本清单，含每篇的重要性说明和优先级。

适用场景：用户说"帮我看哪些 X 博客我翻译过 / 还没翻译"、"补一份翻译进度清单"、"检查翻译覆盖"。

## Inputs

- **Target blog**：可以是 URL（`anthropic.com/engineering`）、站点名（"claude blog"）、或组织名（"Anthropic"）。
- **Local project root**：存放翻译的本地项目根目录。默认从 `File Access Context` 的 `Current workspace` 取。
- **Scope filter**（可选）：用户可能限定子集，如"只要软件工程/Agent"，排除数学、生物、硬件标准。

## Workflow

### 1. 建立本地翻译清单（**先本地后网站**，别反着来）

**1a. 按关键词扫描所有相关文件**

用 `search_files` 的 `target="files"` 扫描文件名匹配目标品牌的所有 `.md` 文件：

```
search_files(pattern="*claude*", path="<本地项目根>", target="files", limit=100)
search_files(pattern="*claude*", path="<本地项目根>", target="files", limit=100, offset=100)  # 超过 100 条继续翻页
```

如果命中数接近 limit，必须翻页到 0 命中为止。同时用 `bash ls` 补一次，验证没有漏掉的文件。

**1b. 按目录树补漏**

有些翻译文件不带品牌关键词（例如 `Cowork: 让 Claude Code 覆盖你其余工作的工具.md` 只出现在文件名中段，可能因大小写/分隔符漏掉）。用 `bash find -type f -name "*.md"` 扫目标品牌相关子目录的所有 `.md`，与 1a 结果取并集。

**1c. 抽样验证"真的翻译了吗"**

⚠️ **只凭文件名判定 = 假阳性**。文件可能只是"引用了原文"或"提到了一句话"，不是完整翻译。

对每篇候选文件抽样 `read_file` 前 20-40 行，检查：
- 是否有明显的 `原文来源` / `Source` / `原文链接` / URL front-matter
- 正文长度是否 > 3KB（短的可能是索引/引用/摘要）
- 是否只有引用段落、没有正文复述

判定规则：
- **完整翻译**：正文 > 5KB 且包含完整章节复述
- **部分/引用**：正文 < 2KB，或只有几段引用，或明确标注"引用/参考"
- **索引/摘要**：目录索引、速览、目录页

**1d. 记录已翻译清单**

每个已翻译条目记录：
- 本地文件相对路径
- 原文标题（从文件 front-matter 或首行提取）
- 发布日期（YYYY-MM 精度）
- 类别（Engineering / Product / Model Release / Customer Case / Docs）

### 2. 获取官网文章全量清单

**2a. 多次多角度搜索**

`web_search` 至少做 3-5 次不同角度的搜索，别只搜一次就下结论：

```
web_search(Query="<品牌> engineering blog", Count=10)
web_search(Query="<品牌> blog <年份>", Count=10)  # 按年份切
web_search(Query="<品牌> <关键词1> blog", Count=10)  # 按主题切，如 agent, MCP, skills
web_search(Query="site:<域> <年份>", Count=10)  # 定向站点搜索
web_search(Query="<品牌> 2025 2026 博客", Count=10)  # 中文视角补漏
```

**2b. 抽取官网聚合页**

优先抽 `web_extract` 官方博客聚合页（如 `anthropic.com/engineering`、`anthropic.com/news`），一次拿到最新 15-30 篇列表。比反复搜索效率高。

**2c. 补充搜索近期文章**

对每个搜索命中的"新文章"，如搜索结果标题里没日期，用定向搜索补日期：
```
web_search(Query="<文章标题片段>", Count=5)
```

**2d. 建立官网清单**

每条记录：
- 原文标题（英文原样）
- URL（完整）
- 发布日期（YYYY-MM-DD）
- 摘要（1 句话）
- 类别（Engineering / Product / Model / Customer / Research）

**2e. 去重 + 合并**

多次搜索得到的同篇文章按标题去重，取最新日期和最长摘要。

### 3. 应用用户范围过滤

如果用户限定了范围（如"只要软件工程"），先过滤官网清单：
- 排除：数学证明、生物安全、硬件标准、纯研究论文（除非用户明确要求）
- 保留：Agent 工程、工具设计、上下文工程、评测、产品功能公告、模型发布、客户案例

**默认保留**（当用户未指定时）：Engineering 博客 + Product 公告 + Model Release。
**默认排除**：Research/RLHF/对齐/数学/生物（除非用户点名要）。

### 4. 比对得出差异

对官网每篇文章，用以下顺序匹配本地：
1. **原文 URL 匹配**：本地文件 front-matter 里的 `原文链接` 是否等于官网 URL（最高置信度）
2. **原文标题匹配**：本地标题里的英文片段与官网标题的相似度
3. **发布日期匹配**：YYYY-MM 相同 + 主题关键词重叠

匹配判定：
- **已翻译**：URL 完全匹配，或标题相似度 > 80% + 日期 ±1 月
- **不确定**：标题相似但日期差 > 2 月，或摘要主题不同（可能是同名不同篇）
- **未翻译**：官网有但本地完全无匹配

### 5. 生成清单文档

写入本地项目下的 Markdown 文件，路径示例：`<品牌目录>/博客翻译进度清单.md`。

**结构模板**：

```markdown
# <品牌> 官方博客翻译进度清单（<年份区间>）

> 更新时间：YYYY-MM-DD
> 范围：说明本次审计覆盖的博客子集（如 Engineering 博客 + 产品公告，排除数学/生物）
> 本地目录：列出扫描过的目录路径

---

## 一、<主要类别，如 2025 年 Engineering 博客>

### ✅ 已翻译

| # | 官方文章 | 发布日期 | 本地文件 |
|---|---|---|---|
| 1 | 原文标题 | YYYY-MM | 相对路径 |
| ...

### ❌ 未翻译

| # | 官方文章 | 发布日期 | 为什么重要 |
|---|---|---|---|
| 1 | **原文标题** | YYYY-MM-DD | 1 句话说明价值 |
| ...

---

## 二、<次要类别>
（重复上面结构）

---

## 三、产品/功能公告
（如用户关心，单独列出）

---

## 四、总结

| 维度 | 数量 |
|---|---|
| <类别 A> 总数 | N |
| 已翻译 | M |
| 未翻译 | K |

### 最急需补的 N 篇（按优先级排序）

| 优先级 | 文章 | 理由 |
|---|---|---|
| 🔴 1 | ... | ... |
| 🟡 6 | ... | ... |
```

### 6. 最终回复

回复中只说核心结论 + 清单文件路径 + 最急需补的 5-10 篇。不要复述完整清单（文件里有）。

用中文回复（除非用户指定）。结尾问一句"要不要按这个优先级逐篇翻译？从哪篇开始？"给用户下一步指令。

## Reliability rules

- **不要只凭文件名判定已翻译**：至少抽 30% 候选文件读正文验证，短文件（<2KB）几乎都是引用/索引而非完整翻译。
- **不要一次搜索就下结论**：至少 3-5 次不同角度的 `web_search`，覆盖年份、主题、站点定向。
- **官网聚合页优先于搜索**：`web_extract` 聚合页一次拿到 15-30 篇，比反复搜索效率高 10 倍。
- **区分"完整翻译"与"引用/部分"**：文件名相同但正文是引用摘要的，必须归为"未翻译"。
- **匹配 URL 优先于匹配标题**：本地 front-matter 的原文链接是最强证据。
- **日期精度统一到 YYYY-MM**：搜索和比对都用月度精度，避免同日不同篇混淆。
- **用户范围过滤要在比对前应用**：不要把数学/生物这类明确排除的文章混进"未翻译"清单，会让清单失去参考价值。
- **不要伪造发布日期**：搜索没返回日期的条目，标"未标注"而不是猜一个。
- **清单文件必须给出相对路径**：让用户能直接跳到本地看已翻译文件。
- **未翻译条目必须给"为什么重要"**：一句价值说明，否则清单只是目录，不是优先级判断依据。

## Anti-patterns

- ❌ 用 `grep` 匹配博客标题就宣布"翻译过了"（本地文件里可能只是引了一句话）
- ❌ 一次 `web_search` 就认为拿到全部文章（官网通常有几百篇，搜索只覆盖热门 20 篇）
- ❌ 按年份切分搜索时忽略边界文章（2024-12 的文章容易被 2025 搜索漏掉）
- ❌ 把"研究论文"和"Engineering 博客"混在一起统计（受众和用途完全不同）
- ❌ 生成清单但不给"为什么重要"（用户无法判断优先级）
- ❌ 清单过长不分节（应按类别、年份、优先级分块）
- ❌ 用绝对路径引用本地文件（应给相对路径，方便用户在自己目录里跳转）

## Optional extensions

- **翻译执行**：清单确定后，用户可按优先级指定要翻译哪几篇，走 `bilibili-video-to-article` 类似的转录+改写流程（这里是文字而非视频）。
- **定时提醒**：结合 `scheduled-task` skill，每月/每季度自动审计一次，输出增量。
- **同步到 Obsidian**：清单产出后用 `obsidian_create_note` 写入 Vault 的笔记文件夹。
