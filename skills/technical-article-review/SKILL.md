---
name: technical-article-review
version: 1.0.0
description: "Review and score technical articles (blog posts, docs, tutorials) for accuracy, structure, code quality, completeness, and writing quality. When the user asks to 'review an article', 'critique this post', 'score this technical content', 'analyze this documentation', or 'give feedback on my article', use this skill."
---

# Technical Article Review

A structured framework for reviewing and scoring technical articles. Applies to blog posts, internal docs, tutorials, and knowledge-base articles.

## Scoring Dimensions

Each dimension is scored **0–10**. The final score is the weighted average:

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| **Accuracy** | 25% | Technical correctness — no false claims, outdated info, or misleading code |
| **Structure** | 15% | Logical flow, clear sections, progressive difficulty, signposting |
| **Code Quality** | 20% | Code examples are correct, complete, idiomatic, and match their description |
| **Completeness** | 20% | Covers edge cases, known pitfalls, performance implications, and "what's next" |
| **Writing Quality** | 10% | Readable prose, consistent terminology, proper formatting, no jargon without explanation |
| **Originality / Insight** | 10% | Goes beyond "what is X" — offers unique perspective, real-world context, or lessons learned |

### Dimension Details

#### Accuracy (25%)

- **10**: Every claim is verifiable; code runs as shown; no outdated APIs or deprecated patterns
- **7**: Minor inaccuracies (e.g., a parameter name changed in a recent version) but no misleading guidance
- **4**: Contains a factual error that could mislead implementation (e.g., wrong API usage, incorrect algorithm)
- **1**: Fundamentally wrong — the article teaches a bad pattern as best practice, or code doesn't even compile

**Checklist:**
- [ ] Code examples compile / run without modification
- [ ] API versions mentioned are current (or clearly labeled as legacy)
- [ ] No "magic numbers" or hardcoded values presented as general advice
- [ ] Claims about behavior (e.g., "this is O(1)") are correct
- [ ] No internal API misuse (e.g., calling `Utils.murmur2()` which may be internal/unstable)

#### Structure (15%)

- **10**: Clear narrative arc — problem → why naive approach fails → correct approach → deeper cases → summary
- **7**: Sections are logical but transitions feel abrupt; some sections could be merged or split
- **4**: Hard to follow — jumps between topics, no clear progression, or missing context setup
- **1**: No discernible structure; reads like a notes dump

**Checklist:**
- [ ] Has a clear introduction that states what the article covers (and what it doesn't)
- [ ] Sections are labeled with descriptive headings
- [ ] Each section has a purpose that connects to the article's main thesis
- [ ] There is a summary or key takeaways section
- [ ] Code blocks are introduced with context (not dropped in isolation)

#### Code Quality (20%)

- **10**: Production-quality examples — proper error handling, resource cleanup, comments only where needed, idiomatic
- **7**: Works but missing some best practices (e.g., no try-with-resources, no logging)
- **4**: Contains bugs, anti-patterns, or code that contradicts the article's own advice
- **1**: Non-functional, pseudocode presented as real code, or copy-paste errors

**Checklist:**
- [ ] Code is complete enough to compile/run (no "… rest is left as exercise")
- [ ] Error handling is present (callbacks, try-catch, or similar)
- [ ] Resources are properly cleaned up (close(), try-with-resources, finally blocks)
- [ ] No hardcoded values that should be configurable (unless explicitly a demo)
- [ ] Code matches the surrounding narrative — no copy-paste from a different context
- [ ] Variable names are descriptive, not `data`, `tmp`, `x`

#### Completeness (20%)

- **10**: Covers the topic thoroughly — edge cases, performance, alternatives, and common pitfalls
- **7**: Covers the main topic well but misses one or two important aspects (e.g., no performance tuning)
- **4**: Skims the surface — mentions concepts but doesn't explain them; misses critical edge cases
- **1**: Only covers the happy path; no mention of failures, limits, or trade-offs

**Checklist:**
- [ ] Addresses the "why" not just the "how"
- [ ] Mentions known limitations or trade-offs of the recommended approach
- [ ] Covers what happens when things go wrong (error scenarios, edge cases)
- [ ] Discusses performance implications where relevant
- [ ] Mentions alternatives and why one is preferred
- [ ] Includes a "pitfalls" or "gotchas" section for non-trivial topics

#### Writing Quality (10%)

- **10**: Clear, engaging prose; consistent tone; proper formatting; code blocks highlighted correctly
- **7**: Readable but has minor issues (e.g., inconsistent code fence language tags, occasional jargon)
- **4**: Hard to read — long walls of text, inconsistent terminology, or formatting errors that break rendering
- **1**: Unreadable — no structure, broken formatting, or language barriers

**Checklist:**
- [ ] Code fences use correct language tags (e.g., `java` not `Java`)
- [ ] Technical terms are explained on first use
- [ ] Consistent terminology throughout (don't switch between "partition" and "shard")
- [ ] Prose is concise — no filler sentences
- [ ] Formatting is consistent (bold for emphasis, italics for terms, etc.)

#### Originality / Insight (10%)

- **10**: Offers unique perspective — real production experience, novel analogy, or deep analysis not found elsewhere
- **7**: Solid explanation with some real-world context, but mostly covers well-known material
- **4**: Reads like a documentation summary or API reference rephrased
- **1**: Pure copy-paste from docs or Stack Overflow with minimal rewording

**Checklist:**
- [ ] Goes beyond "what does X do" to "when should you use X vs Y"
- [ ] Includes real-world examples or production experience
- [ ] Offers a unique angle, analogy, or framework for thinking about the topic
- [ ] Cites sources or references when building on others' work

## Review Process

### Step 1: Read the Full Article

Read the entire article before scoring. Take notes on:
- What is the article trying to teach?
- What is the target audience?
- Are there any claims that need verification?

### Step 2: Score Each Dimension

For each dimension, assign a score 0–10 and write 1–2 sentences of justification. Be specific — cite line numbers, code snippets, or claims.

### Step 3: Calculate Weighted Score

```
final_score = (accuracy × 0.25) + (structure × 0.15) + (code_quality × 0.20)
            + (completeness × 0.20) + (writing × 0.10) + (originality × 0.10)
```

Round to one decimal place.

### Step 4: Generate Report

Output the review in the following format:

```markdown
## Technical Article Review

**Article**: <title>
**Final Score**: <weighted average>/10

### Scores

| Dimension | Score | Weight | Weighted | Notes |
|-----------|-------|--------|----------|-------|
| Accuracy | X/10 | 25% | X.X | <brief note> |
| Structure | X/10 | 15% | X.X | <brief note> |
| Code Quality | X/10 | 20% | X.X | <brief note> |
| Completeness | X/10 | 20% | X.X | <brief note> |
| Writing Quality | X/10 | 10% | X.X | <brief note> |
| Originality | X/10 | 10% | X.X | <brief note> |

### Strengths
- <specific positive point>
- <specific positive point>

### Issues
1. **[Severity: Critical/Major/Minor]** <issue description> — <where>, <why it matters>, <suggested fix>
2. ...

### Recommendations
- <actionable improvement, prioritized>
- <actionable improvement>

### Verdict
<2–3 sentence summary: who should read this, what it's good for, what needs fixing before publishing>
```

### Severity Labels

| Label | Meaning |
|-------|---------|
| **Critical** | Factually wrong, code doesn't compile, teaches a harmful anti-pattern. Must fix before publishing. |
| **Major** | Misleading, incomplete, or missing a significant concept. Should fix before publishing. |
| **Minor** | Cosmetic, typo, formatting, or a small improvement. Can publish as-is but worth fixing. |

## Anti-Patterns to Flag

When reviewing, watch for these common problems:

1. **No warning on bad examples** — showing a bad pattern (e.g., `hashCode % N`) without clearly marking it as wrong
2. **Internal API usage** — calling undocumented or internal APIs (e.g., `Utils.murmur2()`, `org.apache.kafka.common.utils.*`)
3. **Missing error paths** — code that only shows the happy path with no error handling
4. **Version blindness** — using APIs that have been deprecated or changed in recent versions without noting the version
5. **Magic numbers** — hardcoded partition counts, timeouts, batch sizes without explanation
6. **Missing resource cleanup** — producers, connections, streams not closed
7. **Off-by-one / edge cases** — `numPartitions - 1` when `numPartitions == 1`, division by zero, empty collections
8. **Copy-paste drift** — code examples that don't match the surrounding text's description
9. **Overclaiming** — "this is the best way" without comparing alternatives
10. **No performance context** — discussing throughput, latency, or scaling without mentioning relevant tuning parameters

## Quick Reference: Score Interpretation

| Score | Interpretation | Action |
|-------|---------------|--------|
| 9.0+ | Excellent — publish-ready with minimal polish | Light edit |
| 7.5–8.9 | Good — minor issues to address | Fix Critical/Major issues |
| 6.0–7.4 | Fair — significant gaps | Substantial revision needed |
| 4.0–5.9 | Poor — multiple serious issues | Major rewrite recommended |
| Below 4.0 | Unacceptable — fundamental problems | Rewrite from scratch |
