---
name: office-to-markdown
description: Convert local Microsoft Office files (.docx, .pptx, .xlsx, .xls) to Markdown using the local MarkItDown tool, extracting embedded images to an assets directory and rewriting Markdown image links to local paths. Use when the user asks to turn Word, PowerPoint, Excel, Office documents, reports, slides, or spreadsheets into Markdown/MD while preserving structure, tables, headings, slide text, and image references as faithfully as Markdown allows.
---

# Office To Markdown

## Core Rule

Do not promise pixel-perfect Office layout in Markdown. Markdown cannot encode exact fonts, colors, text boxes, absolute positioning, merged-cell styling, animations, or full slide/page layout. Preserve all representable structure and images, then report anything that may not be faithfully represented.

Use strict validation when the user asks for "完全符合原文", "不丢格式", or "高保真":

```bash
python3 /Users/javaedge/.codex/skills/office-to-markdown/scripts/convert_office_to_markdown.py \
  "/path/to/input.docx" \
  --out "/path/to/output.md" \
  --strict
```

If strict mode reports unsupported features or unplaced images, say that the Markdown conversion is incomplete rather than claiming success.

## Workflow

1. Check the input file exists and is `.docx`, `.pptx`, `.xlsx`, or `.xls`.
2. Run the converter script. It uses local `markitdown --keep-data-uris` for DOCX/XLSX/XLS, uses a structure-aware `python-pptx` engine by default for PPTX, extracts images to disk, rewrites image links, and writes a JSON quality report.
3. Inspect the generated `*.report.json`.
4. Open the Markdown briefly when the task is high stakes: verify PPT slide titles, section headings, list syntax, tables, image links, and warnings.
5. Return the output Markdown path, assets directory, and any fidelity warnings.

## Converter

Default output goes beside the source file:

```bash
python3 /Users/javaedge/.codex/skills/office-to-markdown/scripts/convert_office_to_markdown.py \
  "/path/to/source.pptx"
```

Useful options:

- `--out /path/to/output.md`: choose the Markdown path.
- `--asset-dir /path/to/assets`: choose where extracted images are copied.
- `--strict`: exit non-zero if unsupported Office features or unplaced images are detected.
- `--no-append-unplaced`: extract images but do not append images whose exact inline position was unavailable.
- `--report-out /path/to/report.json`: choose quality report path.
- `--pptx-engine structured|markitdown`: PPTX defaults to `structured`; use `markitdown` only when debugging or comparing raw output.
- `--pptx-list-mode auto|aggressive|off`: PPTX defaults to `auto`; use `aggressive` when many short text boxes are visually parallel but not encoded as bullet lists.

The script prints a compact JSON summary and writes a report containing the MarkItDown engine used, image counts, extracted asset paths, unsupported feature hints, and warnings.

## PPTX Structure Rules

For PPTX, prefer the default structured engine. Do not rely on raw MarkItDown output when slide typography clearly distinguishes titles, body text, and parallel items.

The structured engine:

- Converts each slide to `## Slide N: title`.
- Converts subtitle or heading-like text boxes to `### heading`.
- Converts body placeholders, explicit bullets, nested paragraph levels, and short parallel text-box paragraphs to Markdown lists.
- Preserves nested bullet levels with Markdown indentation.
- Converts simple tables to Markdown tables.
- Extracts slide images to local files and emits Markdown image links in slide order.
- Records `structure.stats` in the JSON report, including slide title, heading, list item, table, and chart counts.

If a PPTX output has obvious parallel lines but few or no list items in `structure.stats.list_items`, rerun with:

```bash
python3 /Users/javaedge/.codex/skills/office-to-markdown/scripts/convert_office_to_markdown.py \
  "/path/to/source.pptx" \
  --pptx-list-mode aggressive
```

## Fidelity Policy

- DOCX: headings, paragraphs, lists, tables, links, and inline images are usually preserved by MarkItDown/Mammoth. Headers, footers, comments, tracked changes, embedded files, charts, SmartArt, equations, and exact page layout are risk areas.
- PPTX: slide order, slide titles, heading-like text boxes, body/list paragraph hierarchy, tables, notes, chart placeholders, and images are extracted. Absolute layout, theme styling, animations, transitions, and overlapping objects are risk areas.
- XLSX/XLS: sheets become Markdown tables. Cell styling, merged-cell visual layout, formulas vs displayed values, comments, charts, pivot tables, frozen panes, and positioned images are risk areas.
- Images must be local files referenced by Markdown paths. If MarkItDown exposes an image as `data:image/...`, convert it in place. If an Office package contains additional media not exposed inline, extract it and append it under `## Extracted Images` unless `--no-append-unplaced` is set.

See `references/fidelity-notes.md` when deciding whether a warning is acceptable or whether to ask the user for a visual/PDF-first workflow.
