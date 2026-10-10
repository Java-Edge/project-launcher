# Verification and Report Templates

How to prove a candidate is the right page, how to grade the result, and how to write the answer.

## The verification bar

**A 200 response proves nothing.** Doc sites happily return 200 for a soft-404 SPA shell, a search page, or a generic landing page. Require content match, not status code.

### Content anchors

Collect anchors from the *original* page first (Wayback snapshot, or your own memory of what the user described). Then check the candidate against them:

| Anchor type | Weight | Example |
|---|---|---|
| Page title / H1 | High | "Tools Overview" |
| Section headings (H2/H3) | High | "Adding Tools to Agents", "Tool Executors" |
| Distinctive sentences | High | "Tools are the primary mechanism for extending agent capabilities" |
| Code samples / API signatures | Very high | `agent.tool.file_read(path=..., mode="view")` |
| Tables, figures, callouts | Medium | A specific comparison table |
| Breadcrumb / sidebar position | Medium | sits under User Guide → Concepts |
| Meta description, og:title | Low-medium | often survives rewrites |
| Same owning organisation | Gate | check footer copyright, GitHub link |

**Rule: at least two independent high/very-high anchors must match**, or one very-high anchor (a matching code sample or API signature) plus the owning-org gate.

### Confidence levels

| Level | Criteria | How to phrase it |
|---|---|---|
| **Confirmed** | Fetched successfully, ≥2 content anchors match, same owning org | "新地址：X（已读取验证，内容完整）" |
| **Probable** | Fetched, topic and structure match but wording was rewritten; or org ownership ambiguous | "很可能是 X，内容已重写但主题一致" |
| **Candidate only** | Not fetched, or fetched but anchors do not match | "未验证的候选：X" — never present as the answer |
| **Not found** | All tiers + index + Wayback + search exhausted | Say so plainly; give the Wayback link and successors |
| **Access-blocked** | 403/paywall/login/DNS, page may still exist | "无法访问（原因），不代表页面已删除" |

Never upgrade a level without new evidence. Never let a `Probable` masquerade as `Confirmed` because the answer would be tidier.

### Traps

- **Soft 404**: 200 + SPA shell + no content. Check for real headings, not just a non-empty body.
- **Same title, different page**: two products with an "Observability" page. Verify the org and the surrounding breadcrumb.
- **Redirect to homepage**: the site lost the mapping. Treat as a 404, not as a success.
- **Search page echo**: a `/search?q=` URL returns 200 and contains your keywords. It is not the page.
- **Cached/stale third-party copy**: a blog reproducing the old doc. It is evidence of *what was*, not of *where it is now*.
- **Fragment-only change**: `#section` moved but the page is the same. Report the page URL and note the anchor.

## Report templates

### A. Confirmed relocation

```
找到了。旧地址 <OLD_URL> 现在 <failure mode>，内容迁移到了 <NEW_URL>。

我已实际读取验证，<what matched: title / 章节 / 代码示例>，确认是同一篇内容。

变化原因（如能确定）：<version 前缀取消 / 文件名改目录式 / 加了 /docs 前缀 / 站点重构>。

顺手修你其他旧链接的规则：
  <OLD_PATTERN> → <NEW_PATTERN>
  例：<concrete before> → <concrete after>
```

### B. Confirmed + broader migration context

Use when the path change reflects a product or docs restructure the user should know about:

```
找到了。新地址：<NEW_URL>（已读取验证）。

这次改版不只是加前缀，<describe the restructure>。原来 "<Old Section>" 下的内容现在拆成了两处：
- <Part A> → <URL A>
- <Part B> → <URL B>（现在是独立的 <thing>）

如果你手头还有其他旧链接，通用修法是：<rule>；也可以在 <index location> 里重新定位。
```

### C. Product pivoted (page loads, wrong product)

The user's real question here is "did they change direction?" — answer that, not a path.

```
你没看错——它确实换了技术路线/产品定位。

**现在是什么**（读自 <official sources + dates>）：
- <current positioning, in the vendor's own words>
- <install command / repo / license>
- <what replaced the old capability>

**怎么变过来的**：
| 时间 | 形态 |
| <date> | <old product> |
| <date> | <transition signal> |
| <date> | <current product> |

**你原来需要的那个能力去哪了**：
- 已核实：<what the current site says>
- 未核实：<what you could not check, e.g. login-gated legacy console>
- 现在该看：<concrete alternatives>

**为什么第三方资料还在讲旧版**：<wikis/reviews lag, with dates> — 可用来确认"以前是什么"，不能用来判断"现在是什么"。
```

### D. Not found

```
没能找到对应的新页面。已尝试：
- 路径变体探测（<N> 个候选，含 <key transformations>）
- <llms.txt / sitemap.xml>：<present? what it showed>
- Wayback Machine：<snapshot exists? date?>
- 站内搜索与 <product> + "docs moved"：<results>

结论：<deleted / merged / access-blocked>，而非简单的路径变更。

可用替代：
- 原页面存档：<wayback URL>（<date> 快照）
- 最接近的现行内容：<URL>（<how it differs>）
- 若你需要 <original need>，现在该看：<alternatives>
```

### E. Batch repair

When the user hands over a list of dead links:

```
共 <N> 条，<M> 条已确认新地址，<K> 条确认失效。

| 旧地址 | 新地址 | 状态 | 依据 |
|---|---|---|---|
| ... | ... | 已确认 | 标题+代码示例匹配 |
| ... | — | 已删除 | Wayback 有存档，现行站点无对应 |

通用规则（可自动套用剩余链接）：<rule>
建议：把 <N> 条链接的书签/引用按上表更新；对"已删除"类，改引用 <successor> 或标注存档链接。
```

## Generalizing the rule (always do this)

The single most valuable part of the answer is the *rule*, not the URL — it lets the user fix the other 40 links themselves. State it as a pattern transform:

| Observed change | Generalized rule |
|---|---|
| `/<ver>/<path>` → `/<path>` | 版本前缀整体取消，归档路径下线 |
| `/user-guide/x` → `/docs/user-guide/x` | 全站加 `/docs` 前缀 |
| `/a/b/page_overview/` → `/a/b/page/` | 下划线文件名改为目录式短路径，去掉冗余后缀 |
| `/docs/foo.html` → `/docs/foo/` | 去掉扩展名，改 clean URL |
| `/en/docs/x` → `/docs/x` | locale 移到子域或协商头 |

Give one concrete before/after pair alongside the rule so the user can sanity-check it.

## Worked example 1 — version prefix + filename dropped

**Input**: `https://strandsagents.com/0.1.x/user-guide/concepts/tools/tools_overview/` → 404

**Process**:
1. Classify: 404, path has a version segment and an underscore filename → expect a two-part change.
2. Tier 1 probe: added `/docs` → still 404. Plain path without version → 404.
3. Tier 5: fetched `/llms.txt` and `/llms-full.txt` → index showed a `tools/` section under User Guide, no `tools_overview`.
4. Combined transform (Tier 2 version drop + Tier 3 suffix drop): `https://strandsagents.com/docs/user-guide/concepts/tools/`
5. Verify: fetched → H1 "Tools Overview", sections "Adding Tools to Agents" / "Using Tools" / "Tool Executors" / "Building & Loading Tools", code `agent.tool.file_read(path=..., mode="view")`. ≥2 high anchors + code sample → **Confirmed**.

**Answer rule given to user**: 版本前缀已取消；下划线文件名改目录式短路径。`/0.1.x/user-guide/concepts/tools/tools_overview/` → `/docs/user-guide/concepts/tools/`。

## Worked example 2 — product pivot, not a move

**Input**: a screenshot of `vellum.ai/assistant/conversations/...` showing a plain chat UI, user asks "这不是那个构建/测试复杂工作流的 GUI 工具吗？难道改技术路线了？"

**Process**:
1. Classify: URL resolves fine — this is the *pivot branch* (step 6), not a relocation.
2. Read identity artifacts: `vellum.ai`, `/llms.txt`, `/docs/llms.txt` → "personal AI assistant", `curl ... install.sh`, `github.com/vellum-ai/vellum-assistant`, MIT, Memory v3 / Skills / Channels. No canvas, no evals suite.
3. Build the dated timeline from the vendor blog: 2024-10 rebrand (LLMOps platform) → 2025-07 $20M Series A ("standard of how the world builds AI products") → 2025-09 Agent Builder beta → 2026-01-13 "Vellum for Agents" ("all you do is chat") → 2026-05-15 "the most effective way to automate work isn't to build a workflow at all" → 2026-07+ open-source personal assistant.
4. Separate old capability from new product; name where the original need now lives (Langflow, n8n, Dify, Flowise, Gumloop, Stack AI, Bedrock AgentCore / Strands Evals).
5. Flag third-party lag with dates: AI Wiki entry (2026-06-05) and a review (2026-06-12) still described the pre-pivot platform.
6. Mark unverified honestly: whether the legacy `app.vellum.ai` console still runs for existing enterprise customers — needs login, could not confirm.

**Answer shape**: confirmed the pivot with the vendor's own words, dated timeline table, what happened to the old capability, explicit verified/unverified boundary, plus the meta-lesson for tool selection.

## What never goes in the report

- A URL you did not fetch.
- A search-result title presented as the page's content.
- "应该是这个" without stating it is unverified.
- Silence about a failed probe — list what you tried when the answer is "not found".
- Conflating "I could not access it" with "it does not exist".
