---
name: work-report-ppt
description: Create concise leadership work-report PowerPoint decks from local materials such as KPI/OKR sheets, monthly or weekly notes, meeting minutes, project reports, Markdown docs, existing PPT references, spreadsheets, code-change summaries, and metric data. Use when the user asks for 月度汇报PPT, 周报PPT, 部门例会材料, 工作汇报, OKR/KPI汇报, executive update deck, or wants Agent-generated structured report content that can become a PPTX for PowerPoint/Gamma/Beautiful.ai/Canva workflows.
---

# Work Report PPT

## Operating Mode

Use this skill to turn evidence into a short executive update deck. The stable shape is:

`source evidence -> structured report spine -> PPT draft -> visual QA -> final PPTX`

Default to a 6-8 slide deck for a 3-5 minute meeting unless the user requests another length. If the user only wants content for Gamma or Beautiful.ai, stop after the structured report spine and formatting-ready slide text.

If a company PPT template is explicitly supplied, route the build as template-following through the Presentations skill. If no template is supplied, create a clean editable PPTX from scratch.

## Source Intake

Work local-first. Search the workspace before drafting:

- Use `rg --files` and targeted `rg` searches for KPI, OKR, 月度, 周报, 项目, 汇报, 进展, 风险, 计划, and project names.
- For Excel KPI/OKR files, inspect sheet names and non-empty rows. Use the Spreadsheets skill or the bundled Python runtime when appropriate.
- For existing PPTs, extract slide text and use them as tone/structure references unless the user says they are templates.
- For Markdown, meeting notes, code logs, and reports, preserve file paths as source evidence.
- If a source link or current external fact is involved, browse or fetch it according to the active browsing rules.

Optional helper:

```bash
python <skill-dir>/scripts/extract_report_sources.py --root <workspace> --keywords "KPI,OKR,5月,月度,汇报,项目名"
```

Use this helper for quick source inventory and text extraction from `.md`, `.txt`, `.xlsx`, `.pptx`, `.csv`, and `.tsv`. It is only a first pass; still open the most relevant source files directly before making claims.

## Evidence Rules

Read `references/source-evidence-rules.md` when the report could affect performance review, leadership decisions, compliance, finance, or project status.

Core rules:

- Do not invent completed work, numbers, dates, blockers, owners, or risks.
- Convert vague activity into outcome language only when the source supports it.
- Mark missing evidence as `待确认` or omit it from the deck.
- Keep source notes during drafting. Final slides can use quiet footers instead of bulky citations.
- If the evidence says a deployment or validation has not happened, say that plainly and frame the next step.

## Narrative Spine

Before designing slides, write a short claim spine:

- thesis: one sentence that says what changed this period
- audience: who will hear the update
- time limit: usually 3 minutes, not over 5 minutes
- KPI/OKR mapping: which goals this work supports
- slide claims: one conclusion per slide, each with one proof object
- omissions: what is intentionally not claimed because evidence is missing

Prefer this default 8-slide deck:

1. Cover: project/topic, period, presenter
2. One-page conclusion: 3 takeaways and red/yellow/green status
3. KPI/OKR alignment: goals mapped to this period's work
4. Core proof: workflow, architecture, timeline, or metric dashboard
5. Period delivery evidence: high-impact outcomes, not task lists
6. Risks and blockers: issue, impact, solution, needed decision
7. Collaboration and AI/process improvement: reusable mechanism and cross-team work
8. Next period plan: 3-5 actions, owners, deadlines, support needed

For the exact executive update structure, read `references/executive-update-pattern.md`.

## Visual Direction

Use a restrained internal-report style:

- light background, strong contrast, sparse text
- one claim title per slide
- data cards only for metrics or repeated evidence
- workflow/timeline diagrams for technical progress
- red/yellow/green status when useful
- quiet source footer and page number

Avoid:

- dense bullet walls
- decorative hero pages
- invented logos or brand marks
- repeated card grids
- screenshots as the main design unless they are evidence
- unsourced charts or fake precision

## PPTX Build Workflow

When producing the actual deck:

1. Use the Presentations skill and artifact-tool presentation JSX.
2. Create a thread-scoped workspace under `outputs/<thread-id>/presentations/<task-slug>/`.
3. Keep `source-notes`, `claim-spine`, `design-system`, and `contact-sheet-plan` in the workspace while drafting.
4. Build editable slides with native text, shapes, tables, and diagram elements.
5. Render previews and a contact sheet.
6. Run layout QA with `check_layout_quality.mjs`; fix overlap, overflow, tight text, and broken hierarchy.
7. Inspect the contact sheet at thumbnail size. The deck should read as a clear authored story before the details are read.
8. Export the final `.pptx`.
9. Clean intermediate files, leaving only final deliverables in the output directory.

If `.xlsx` sources contain KPI tables or metrics, use the Spreadsheets skill for inspection. If a `.docx` or PDF source is provided, use the Documents or PDF workflow as appropriate before drafting.

## Speaker Compression

For a 3-minute leadership update, cap the speaking script to:

- 20 seconds: why this work matters
- 40 seconds: KPI/OKR alignment and current status
- 60 seconds: main progress proof
- 40 seconds: blockers and solution
- 20 seconds: next actions and support needed

Write slide text so it supports the speaker, not replaces the speaker. Put detail in appendix only if the user asks for it.

## Final Response

Return:

- the final PPTX path as a Markdown file link
- a one-sentence summary of what the deck covers
- verification performed, especially render/layout QA

Mention missing inputs only if they affect trust, such as no official company template, no current metrics file, or unverified external data.
