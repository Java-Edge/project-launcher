---
name: article-dedup-analysis
description: 对一批 Markdown 文章/知识库做重复内容排查：整篇近重复检测 + 跨文章重复板块检测 + 逐字相同板块匹配，输出逐条可执行的去重合并清单报告。Use when the user asks to find duplicate content, similar articles, or repeated sections across a corpus of articles and produce a dedup/merge checklist. 触发词：文章查重、重复内容排查、去重合并、相似文章、重复板块、dedup、duplicate sections.
---

# Article Dedup Analysis（文章库重复内容排查）

对一整个 Markdown 文章库做证据驱动的重复内容排查，产出一份**逐条列出、可直接照单去重**的清单报告。

适用场景：用户说"分析这批文章有没有重复 / 找出相似文章 / 排查重复内容板块 / 帮我去重合并 / 生成查重清单"。

## 硬性规则

- **只读分析**：绝不修改、移动、删除用户的文章文件。只产出报告与中间产物。
- **证据先行**：报告里每一条重复判定都必须落到真实文件路径 + 板块标题；未经抽查核对的结论标注"待核对"。
- **排除副本目录**：扫描时跳过所有点开头目录（`.git`、`.kilo`、`.workbuddy`/`.workbuddy-ai`、`.obsidian` 等）及 `node_modules`（脚本已内置），避免把备份/工作树副本误判为重复。
- **相对路径**：报告中所有文件路径一律相对扫描根目录，不写绝对路径。
- **规模先行**：扫描前先告知用户文件总数与总体积；超过 5000 篇时建议先按子目录分批。

## Workflow

### 1. 确定范围

1. 用 `search_files`（`target="files"`, `pattern="*.md"`）确认用户所指的文章目录与数量，必要时翻页到 0 命中。
2. 用 bash `wc -c` 统计总体积，向用户通报规模。
3. 明确扫描根目录（用户说"文章库/这些文章"时，优先取含文章的实际目录而非 workspace 根）。

### 2. 运行检测流水线

脚本位于本 skill 的 `scripts/dedup_pipeline.py`（目录：`/Users/javaedge/soft/VSProjects/project-launcher/skills/article-dedup-analysis`）：

```bash
cd <当前任务/输出目录>
"$BOX_AGENT_PYTHON" /Users/javaedge/soft/VSProjects/project-launcher/skills/article-dedup-analysis/scripts/dedup_pipeline.py \
    "<文章根目录>" analysis
```

中间产物写入 `analysis/`：

| 产物 | 内容 |
| --- | --- |
| `corpus_sections.jsonl` | 每篇文件的标题、归一化长度、整篇指纹、板块清单 |
| `dup_articles.json` | 整篇近重复聚类（含两两 jaccard / containment） |
| `dup_sections.json` | 跨文章重复板块聚类（按覆盖文件数、板块长度排序） |
| `exact_dup_sections.json` | 逐字完全相同的板块组 |

方法：正文归一化（剔代码块/图片/链接/标点/空白）→ 8 字符 shingle 指纹 → MinHash 分桶召回 → Jaccard / containment 精确验证 → 并查集聚类。

### 3. 解读结果（判断语义，不要只报数字）

- **整篇 jaccard ≥ 0.55**：同源拷贝/互为翻译版，整篇二选一。
- **containment ≥ 0.75（jaccard 不高）**：短文是长文的子集，或一篇被拆分复用 → 合并进主干，不是二选一。
- **板块组内 `exact_hash` 相同**：逐字相同，去重零风险。
- **同一目录/系列内多组板块同批重复**：通常是同一篇教程被复制拆分，按"主干 + 增量"方案处理。
- **中英双语对应文章**：先问用户是否要保留双语，再给建议。

### 4. 抽查验证（必做，防止假阳性）

对**相似度最高的 2-3 组**和**随机 2 组**：`read_file` 打开原文，核对重复板块确实存在且内容一致（可搜索板块标题或首句）。核对结果写进报告（如"已人工核对"）。发现假阳性（如模板性免责声明、目录页）要在报告中降级或剔除。

### 5. 生成报告《文章重复内容排查报告.md》

报告写到输出根目录，结构固定为三部分：

```markdown
# 文章库重复内容排查报告
- 扫描范围 / 方法 / 判定阈值 / 总结论（几组整篇重复、几组板块重复）

## 一、整篇近重复文章（建议优先合并）
### 第 N 组｜<主题概括>
| 文件 | 归一化字数 | 说明 |   ← 每组一个表，末尾给一句处理建议

## 二、跨文章重复板块清单（逐条列出）
### A. <按主题/目录分组>
| # | 板块 | 出现位置 | 状态 |   ← 状态写"逐字相同 / 高度重合 / 包含关系"，附字数

## 三、汇总统计
| 维度 | 数量 |   ← 扫描总数、板块数、整篇重复组、板块重复组、逐字相同组、预计可削减字数
建议处理优先级：🔴🟡⚪ 分级列出
```

最后在回复里用中文摘要 Top 发现（最高优先级的 2-3 组），并引用报告文件名。

## 参数与阈值调整

阈值常量在脚本顶部：整篇 `ART_J=0.55 / ART_C=0.75`，板块 `SEC_J=0.60 / SEC_C=0.80`。语料偏短（如笔记、片段）可下调板块级阈值至 0.5/0.7；语料含大量模板前言时可上调。`--min-section-chars`（默认 80）控制纳入比对的板块最小归一化长度。

## 局限性（报告末尾或回复中如实说明）

- 代码块、图片、链接在比对前已剔除：纯代码搬运但文字改写的情况不会被判重。
- 归一化后不足 80 字的短板块不参与板块级比对。
- MinHash 为概率召回，极端改写型重复可能漏检；阈值判定是相似度证据，最终合并决策由用户执行。
