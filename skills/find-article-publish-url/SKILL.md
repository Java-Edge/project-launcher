---
name: find-article-publish-url
description: Given a local markdown article path, search across the web to find where this article was originally published or reposted under a different pen name. Use for tracking down blog article origins, especially when the author used different pen names across platforms.
---

# Find Article Publish URL

Given a local markdown article file path, search across the web to find where this article was originally published or reposted under a different pen name.

## When to Use

- User asks to find where a blog article was previously published
- User wants to locate the original source of an article that may have been reposted
- User has a local markdown file and wants to know its publishing history
- User wants to verify if an article was published under a different pen name

## Workflow

### Step 1: Read the Article

Read the local markdown file to extract:
- **Title**: First heading or filename (without numbering)
- **Author name**: Look for `image by <name>`, `prompt by <name>`, or any author attribution
- **Key content**: Extract the first 2-3 paragraphs for content matching
- **Unique identifiers**: Image URLs, specific phrases, references to other articles
- **Pen name**: Identify the pen name used in the file (e.g., "JavaEdge", "alswl")

### Step 2: Identify Known Platforms

Based on the pen name, check these platforms:
- **掘金 (Juejin)**: `https://juejin.cn/user/<user_id>/posts`
- **CSDN**: `https://blog.csdn.net/<username>`
- **博客园 (cnblogs)**: `https://www.cnblogs.com/<username>`
- **知乎**: `https://www.zhihu.com/people/<username>`
- **GitHub**: `https://github.com/<username>`
- **个人博客**: Any personal blog domain found in the content

### Step 3: Search Strategies

Use Playwright (headless browser) to search, as APIs are often blocked:

```javascript
// Use playwright-core for browser automation
import pkg from '/path/to/playwright-core/index.js';
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });
```

**Search order:**
1. **Exact title search** on Juejin, CSDN, cnblogs
2. **Content matching**: Compare the first paragraph of the article with search results
3. **Author verification**: Check if the article author matches the expected pen name
4. **Cross-reference**: Check if the pen name and "alswl" (or other common pen names) are the same person

**Search queries:**
- `site:juejin.cn "<article title>"`
- `site:csdn.net "<article title>"`
- `site:cnblogs.com "<article title>"`
- Direct article URL if known (e.g., `juejin.cn/post/<id>`)

### Step 4: Verify Matches

When a potential match is found:
1. **Content comparison**: Check if the first paragraph matches the local file
2. **Author check**: Verify the author name on the platform
3. **Image verification**: Check if image URLs or "image by" annotations match
4. **Date check**: Compare publication dates if available

### Step 5: Report Results

Present findings in this format:

| Platform | URL | Author | Match Confidence |
|----------|-----|--------|-----------------|
| 掘金 | https://... | alswl | ✅ Content matches |
| 个人博客 | https://... | alswl | ✅ Content matches |
| CSDN | - | - | ❌ Not found |

**Important notes:**
- If the article was found under a **different pen name**, clearly state this
- If the article was **not found** on the expected author's platforms, state this
- If the article appears to be **copied from another author**, note this
- Provide the **original source URL** if different from where the user expected

## Tools

- **Playwright** (bundled): For browser-based searching when APIs are blocked
  - Path: `/Users/javaedge/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js`
- **curl**: For quick HTTP checks (may be blocked by anti-scraping)
- **grep**: For extracting content from markdown files

## Edge Cases

- **Anti-scraping**: CSDN and Juejin APIs often block automated requests. Use Playwright browser instead.
- **Multiple pen names**: The same person may use different pen names (e.g., JavaEdge vs alswl). Check if they could be the same person.
- **Deleted articles**: Articles may have been deleted from platforms. Note this in results.
- **Reposted articles**: The article may have been reposted under a different title. Compare content, not just titles.
- **Image references**: "image by <name>" annotations are strong indicators of the original author.
