# Probe Strategies

The path-transformation catalogue behind `scripts/gen_candidates.py`, plus the reasoning that decides probe order. Use the script for generation; use this file to decide *what to try next* when generation runs dry.

## Why order matters

Every probe costs one page fetch. Doc migrations are not random — they follow a small set of conventions, so a weighted order beats exhaustive enumeration. The tiers below are ordered by observed hit rate on documentation restructures.

## Tier 1 — near-deterministic

| Transformation | Why it hits |
|---|---|
| Drop the filename → parent directory | The single most common outcome. Section pages get folded into their index (`tools_overview.html` → `tools/`). **This alone resolves a large share of doc migrations.** |
| Add/remove trailing slash | Static generators disagree: MkDocs and Astro emit trailing slashes, Jekyll and Hugo often do not. A 404 here is frequently cosmetic. |
| Append `index.html` / `index.md` | Server misconfiguration, or the site exposes Markdown source directly (Docusaurus, Astro Starlight, many `llms.txt`-aware sites). |
| Add `/docs` prefix | Marketing-site and docs-site splits. The root becomes a landing page; docs move under `/docs`. **Observed: `strandsagents.com/user-guide/...` → `strandsagents.com/docs/user-guide/...`** |
| Add `/latest` prefix | Read the Docs style versioning. |
| Drop leading `/docs` | The reverse split — docs promoted to root. |

## Tier 2 — version, locale, extension

| Transformation | Why it hits |
|---|---|
| Drop version segment (`0.1.x`, `v2`, `1.0`, `stable`) | **Version archives get retired.** Most projects stop publishing old versions and collapse to a single current tree. **Observed: `strandsagents.com/0.1.x/user-guide/concepts/tools/tools_overview/` → `strandsagents.com/docs/user-guide/concepts/tools/`** — version dropped *and* filename dropped, i.e. two tiers combined. |
| Version → `/latest` or `/stable` | Project switched from explicit versions to a rolling alias. |
| Drop locale segment (`/en`, `/zh-cn`) | Locale routing moved to subdomain (`en.example.com`), cookie/header negotiation, or was removed. |
| Extension swap (`.html` ↔ none ↔ `.md` ↔ `.php`) | Clean-URL adoption, or a generator change (WordPress → Astro is common). |
| `www.` ↔ apex | CDN or DNS consolidation. Cheap to test, occasionally decisive. |

## Tier 3 — filename rewrites

Casing and separator conventions change with the generator:

| Pattern | Example |
|---|---|
| underscore → hyphen | `tools_overview` → `tools-overview` |
| underscore removed | `tools_overview` → `toolsoverview` |
| **generic suffix dropped** | `tools_overview` → `tools`, `intro_guide` → `intro`, `setup_docs` → `setup` |
| suffix dropped + hyphenated | `getting_started` → `getting-started` |
| Title-case | `tools_overview` → `Tools-Overview` |
| dots → hyphens | `api.v2.reference` → `api-v2-reference` |

The "generic suffix dropped" rule is the one to watch: `_overview`, `_index`, `_guide`, `_docs`, `_intro` are almost always redundant once the page *is* the section.

## Tier 4 — structural reorganisation

Lower yield, use when the whole IA changed:

- Drop leading segments progressively (`/a/b/c/page` → `/b/c/page` → `/c/page`).
- Insert known section roots before the filename: `docs`, `documentation`, `user-guide`, `learn`, `guide`, `en`, `latest`.
- Collapse intermediates, keeping only the deepest section + filename.
- Swap the two deepest segments (some migrations invert `topic/subtopic`).

Cap total probes around 12–15 before moving to Tier 5 and content search. Past that point, blind enumeration is almost always wasted.

## Tier 5 — archives and machine-readable indexes

These are not guesses; they are lookup services. **Always reach for them before keyword search.**

### `llms.txt` family (highest value)

An emerging convention where sites publish a Markdown index of every page for LLM consumption:

```
https://<host>/llms.txt          curated index with descriptions
https://<host>/llms-full.txt     entire corpus inline — best for locating a renamed section
https://<host>/docs/llms.txt     docs subtree
https://<host>/<section>/llms.txt
```

Adopted by Astro/Starlight sites, Mintlify, Fumadocs, and many hand-rolled doc stacks. On Astro Starlight, **any page URL also accepts `.md` appended** or an `Accept: text/markdown` header.

Grep the index for the old slug's distinctive words. This resolves renames that no amount of path mutation can guess.

### Sitemap and robots

```
https://<host>/sitemap.xml         exhaustive URL list — grep for the slug stem
https://<host>/robots.txt          may declare `Sitemap:` lines, plus disallowed areas
https://<host>/sitemap_index.xml   sitemap index (WordPress, large sites)
```

### Wayback Machine

```
https://web.archive.org/web/2/<URL>                        latest snapshot
https://web.archive.org/web/<YYYYMMDD>HHMMSS/<URL>         specific date
https://archive.org/wayback/available?url=<URL>            JSON availability check (fast)
https://web.archive.org/web/*/<URL>                       calendar of all captures
```

Two uses: **(a)** recover the original page's title and headings so you know what you are searching for; **(b)** sometimes the archive captured the redirect notice or the site's own "this page moved" banner.

### On-site search

`https://<host>/search?q=<slug-stem>` — many doc platforms (Starlight, Docusaurus, Mintlify, GitBook) expose a queryable endpoint.

## Deciding the next move

```
Tier 1 misses  → Tier 2 (is there a version/locale segment? extension?)
Tier 2 misses  → llms.txt / sitemap.xml  ← STOP GUESSING, START LOOKING UP
Index found    → grep for slug stem → fetch the matching entry → verify
No index       → Wayback (recover original title) → site: search on that title
Still nothing  → vendor blog/changelog for a "new docs site" announcement
Domain dead    → GitHub org / repo README (usually carries the live docs link)
```

## Platform-specific conventions

| Platform | Path convention | Migration signature |
|---|---|---|
| **Astro Starlight** | `/<section>/<page>/`, trailing slash | `.md` suffix works on any page; `llms.txt` common |
| **Docusaurus** | `/docs/<category>/<slug>` | `/docs` prefix added; slugs lowercased-hyphenated |
| **MkDocs Material** | `/<page>/` trailing slash | `index.md` → `index.html`; version plugin adds `/<ver>/` |
| **Read the Docs** | `/en/<ver>/<page>.html` | `en/latest` collapses; `.html` often dropped |
| **GitBook** | `/<section>/<page>` | Space renames break paths wholesale; check `sitemap.xml` |
| **Mintlify** | `/<page>` flat | Flat slugs survive reorgs better; `llms.txt` standard |
| **WordPress** | `/?p=<id>` or `/<slug>/` | `?p=<id>` permalinks usually still resolve → follow the 301 |
| **Hugo/Jekyll** | `/<slug>/` or `/<slug>.html` | Generator swaps change extension and trailing slash |
| **Confluence** | `/pages/viewpage.action?pageId=<n>` | pageId survives space renames — prefer it over the title path |
| **Notion** | `/<slug>-<32hex>` | The hex id is stable; slug text is not |
| **GitHub Pages** | `/<repo>/<page>` | Repo rename → old path 404s; check the new repo name |

## When the host blocks fetching

Some sites 403 automated readers while serving browsers fine. Before concluding "page gone":

1. Retry with the `.md` suffix or `Accept: text/markdown` (bypasses some SSR-only routes).
2. Try the Wayback copy to confirm the page existed and capture its content anchors.
3. Use the host's managed browser tool if available — a real browser often succeeds where a plain fetch does not.
4. If all readers fail, report it as **access-blocked**, not **deleted**. These are different facts and the user needs the right one.
