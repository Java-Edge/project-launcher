---
name: weekly-ai-news-summary
description: Summarize global AI news from the past week across Chinese and international sources, covering Agent ecosystems, Infra, and major厂商 releases. Strictly filter to the past 7-day window. Use when the user asks for a weekly AI news summary, 本周 AI 资讯, AI 周报, or similar.
---

# Weekly AI News Summary

Summarize global AI news from the **past 7 days only**, covering Chinese and international sources. Focus on Agent ecosystems, Infra, and major厂商 releases.

## Time Window

**Strictly limit to the past 7 days from today's date.** If today is 2026-08-27, cover 2026-08-20 to 2026-08-27. Discard any news older than 7 days.

## Information Sources

Use these sources in order of priority. For each, fetch the latest articles and filter by date:

### Chinese Sources (优先)

| Source | URL | Notes |
|--------|-----|-------|
| 36氪 AI | `https://36kr.com/information/AI/` | JS-rendered, use ego-browser or bb-browser |
| 爱范儿 AI | `https://www.ifanr.com/category/aigc` | Also check `https://www.ifanr.com/feed` for RSS |
| InfoQ AI | `https://www.infoq.cn` | Also check `https://www.infoq.cn/feed/rss` for RSS |
| 新智元 | `https://www.aixiniyuan.com` | May require browser; check WeChat public account |
| 智东西 | `https://www.zhiuxidong.com` | May require browser |
| DataEye AI | `https://www.dataeye.com` | Focus on AI gaming/app sections |
| 眸娱 | `https://www.mouyupro.com` | AI + entertainment focus |
| 知产力 | `https://www.zhichanli.com` | AI IP/patent news |

### International Sources (补充)

| Source | URL | Notes |
|--------|-----|-------|
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/` | |
| The Verge AI | `https://www.theverge.com/ai-artificial-intelligence` | |
| Ars Technica AI | `https://arstechnica.com/ai/` | |
| OpenAI Blog | `https://openai.com/blog` | Official announcements |
| Anthropic News | `https://www.anthropic.com/news` | Official announcements |
| Meta AI | `https://ai.meta.com/blog/` | Official announcements |
| Google AI Blog | `https://blog.google/technology/ai/` | Official announcements |

## Fetch Strategy

1. **Try RSS feeds first** (fastest, most structured): `infoq.cn/feed/rss`, `ifanr.com/feed`, `36kr.com/feed`
2. **Fall back to browser automation** for JS-rendered sites (36kr, 新智元, 智东西): use ego-browser or bb-browser
3. **Use web fetch tools** for international sources
4. **Extract article title, date, summary, and source** for each item

## Filtering Criteria

### Must Include

- Major model releases (Kimi K3, Qwen3.8-Max, DeepSeek V4, etc.)
- Agent ecosystem updates (new tools, platforms, frameworks)
- Infra developments (training clusters, inference optimization, open-source models)
- Regulatory/policy changes affecting AI
- Significant funding rounds or acquisitions
- Major product launches from top厂商

### Must Exclude

- News older than 7 days
- Reposts or derivative coverage of already-cited stories
- Generic "AI will change X" opinion pieces without concrete developments
- Product marketing without substantive technical or business impact
- Rumors without credible sourcing

## Output Format

Structure the summary as follows:

### 1. 本周焦点 (Top 3-5 stories)

The most impactful stories of the week. One paragraph each, with source attribution.

### 2. 中国 AI 圈 (China AI Circle)

Group by sub-topic:
- Model releases & benchmarks
- Agent & application ecosystem
- Infra & open-source
- Policy & regulation

### 3. 全球 AI 动态 (Global AI)

Group by厂商 or theme:
- OpenAI / Anthropic / Meta / Google / Microsoft
- Other notable developments

### 4. 值得关注的项目 (Notable Projects)

New open-source projects, tools, or frameworks that emerged this week.

Each item should include:
- **Title** (in original language)
- **Source** (with link if available)
- **Date** (YYYY-MM-DD)
- **1-2 sentence summary**

## Quality Bar

- Every story must have a verifiable date within the 7-day window
- Every story must have a source attribution
- No duplicate coverage (if 36kr and InfoQ cover the same story, pick the better one)
- Prioritize technical depth over hype
- Flag any stories that need verification (e.g., unconfirmed rumors)

## Error Handling

- If a source is unavailable (SSL errors, 404, etc.), note it and skip
- If RSS feeds return no results, fall back to browser automation
- If all sources return insufficient content, report "insufficient data for this period" rather than fabricating
- Never invent dates, sources, or story details
