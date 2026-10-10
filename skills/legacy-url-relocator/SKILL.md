---
name: legacy-url-relocator
description: Locate and verify the current replacement for a dead, moved, renamed, or stale URL. Use when a user supplies an old link that returns 404/410/redirect/empty, asks "这个网址迁移到哪了 / where did this page move to / 老链接失效了 / 这个页面现在是什么", needs a batch of outdated bookmarks or doc citations repaired, or when a documentation site, product, or domain has been restructured, re-versioned, renamed, or pivoted and the original path no longer resolves.
keywords: [死链修复, 网址迁移, 页面搬家, 404, 文档改版, url relocation, dead link, link rot, moved page, docs migration, 旧链接, 链接失效]
---

# Legacy URL Relocator

Turn one dead URL into a verified current URL — or into an honest "this content no longer exists" with the best available substitute.

## Core rule

**Never report a replacement URL you have not fetched and content-matched.** A plausible path, a search-result title, or a redirect target is a *candidate*, not an answer. The deliverable is a verified mapping plus evidence, not a guess.

## Workflow

### 1. Classify the failure mode

Fetch the original URL once and read the actual HTTP outcome. The mode determines the whole strategy:

| Observed | Mode | Strategy |
|---|---|---|
| 404 / 410 | Page moved or deleted | Steps 2 → 5 |
| 301/302 to a new path | Moved, site knows | Follow it, then verify content; done |
| 301/302 to homepage | Site lost the mapping | Treat as 404; steps 2 → 5 |
| 200 but unrelated content | Domain reused, parked, or product pivoted | Jump to step 6 (pivot branch) |
| 200 but "under construction" / empty shell | Site mid-migration | Steps 3 → 5, check announcements |
| DNS failure / cert error / timeout | Whole property gone | Wayback + successor hunt (step 4c, step 6) |
| 403 / paywall / login wall | Access issue, not a move | Say so; do not claim relocation |

Do not skip this step. A pivot and a path rename need completely different answers.

### 2. Generate and probe path candidates

Run the bundled generator to get an ordered, deduplicated candidate list — it is pure URL rewriting with no network dependency:

```bash
python scripts/gen_candidates.py "<ORIGINAL_URL>"
```

Then test candidates with the host's page-reading tool (`web_extract` or equivalent), **highest tier first**, and stop at the first content match. Batch independent probes in one tool-call round where the host allows it. Cap at ~12 probes before switching to step 3 — blind enumeration has poor yield beyond that.

See `references/probe-strategies.md` for the full transformation catalogue and the reason each one exists.

### 3. Read the site's machine-readable index (highest-yield step)

Modern doc sites publish structured indexes. Fetch these before doing any keyword search:

```
https://<host>/llms.txt          ← curated page index, often with descriptions
https://<host>/llms-full.txt     ← full corpus, best for locating a renamed section
https://<host>/sitemap.xml       ← exhaustive URL list
https://<host>/robots.txt        ← reveals Sitemap: lines and disallowed areas
https://<host>/docs/llms.txt     ← docs subtree index when /docs exists
```

Grep the index for the old page's distinctive slug words or topic. This directly resolves renames that path mutation cannot guess (e.g. `tools_overview/` → `tools/`, version prefix dropped entirely).

Append `.md` to any docs URL to get clean Markdown on many static-site generators, and to index entries for exact text.

### 4. Content-anchored search

Only after steps 2–3 fail. Search for the *page's identity*, not the topic in general:

- **4a.** Recover the original page's real H1/title and section headings from the Wayback Machine:
  `https://web.archive.org/web/<YYYYMMDD>/<ORIGINAL_URL>` — also try `https://archive.org/wayback/available?url=<ORIGINAL_URL>`. This tells you what you are actually looking for.
- **4b.** `site:<host> "<exact original page title>"` and `site:<host> <distinctive-heading>`.
- **4c.** `<product> docs moved OR restructured OR "new documentation site" OR migration`, plus the vendor's changelog/blog. Official "we redesigned our docs" posts often state the new path scheme outright.
- **4d.** If the whole domain died: search for the project name + "new home", GitHub org, or fork; the maintainer's repo README usually carries the current docs link.

### 5. Verify before claiming

Fetch the candidate and compare against the original. Require **at least two** independent matches from: page title/H1, section headings, distinctive sentences, code samples or API signatures, tables/figures. Record which ones matched.

Assign a level and use it in the report:

- **Confirmed** — fetched, ≥2 content anchors match, same owning org.
- **Probable** — fetched, topic matches but wording/structure differs (rewritten page), or ownership is ambiguous.
- **Unverified** — candidate only; say so explicitly and never present it as the answer.

### 6. Pivot branch (page loads, but the product changed)

When the URL resolves and the content is simply a *different product*, the user's real question is "did they change direction?" — not "what is the new path". Do this instead:

1. Read the site's own identity artifacts: homepage, `/llms.txt`, `/docs`, pricing, install command, repo link. These state the current positioning in the vendor's own words.
2. Rebuild a **dated timeline** from the vendor blog/changelog: find the posts where positioning language shifts. Date-stamped primary sources beat any summary.
3. Separate the old capability from the new product. Then answer three things: what it was, what it became and when, and **where the user's original need is served now** (name concrete alternatives).
4. Flag third-party lag: wikis, review sites, and comparison articles routinely describe the *pre-pivot* product for months. Useful for confirming what it used to be; never for current state.
5. Mark what you could not check (e.g. a login-gated legacy console for existing customers) as unverified rather than asserting it is gone.

### 7. Report

Always include, in this order:

1. **Old → New URL**, with the verification level.
2. **Evidence**: what was fetched and which content anchors matched.
3. **The migration rule**, generalized, so the user can repair their other links unaided (e.g. "drop the version prefix and add `/docs`"; "underscores became directory paths").
4. **If genuinely gone**: Wayback snapshot link + the closest living successor + alternatives for the original need.
5. **Unverified items**, listed plainly.

Templates in `references/verification-and-report.md`.

## Hard rules

- Search-result snippets and titles are leads, not page content. Only a successful fetch proves a page.
- A 200 response is not a match. Confirm the page is the same work, not a same-named different page.
- Never invent a URL from a known path pattern. If you did not fetch it, it does not go in the answer.
- Do not retry the same URL through the same backend repeatedly. Change the transformation, the index, or the search angle.
- Preserve the user's original URL verbatim in the report.
- If a page is behind auth or a paywall, report the access barrier; do not infer relocation from it.
- When several candidates partially match, present them ranked with their evidence instead of picking one silently.

## Resources

- `scripts/gen_candidates.py` — deterministic URL variant generator (no network needed). Use `--json` for programmatic handling, `--tier` to limit breadth.
- `references/probe-strategies.md` — full path-transformation catalogue, doc-platform conventions, index-discovery patterns.
- `references/verification-and-report.md` — content-matching checklist, confidence levels, report templates, real worked examples.
