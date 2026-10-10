# Fidelity Notes

Use this reference when a user asks for complete Office-to-Markdown fidelity.

## What Markdown Can Preserve

- Document order, headings, paragraphs, basic emphasis, links, lists, tables, and extracted images.
- PPTX slide order, slide titles, subtitle/section headings, body paragraph hierarchy, bullet and nested bullet levels, short parallel text-box items, simple tables, notes text, chart placeholders, and image files.
- XLSX/XLS sheet names and tabular values.

## What Markdown Cannot Fully Preserve

- Exact page or slide layout, fonts, colors, theme styling, shape positions, text wrapping around floating objects, animations, transitions, comments as comments, tracked-change semantics, and spreadsheet visual styling.
- Excel merged-cell visual layout, frozen panes, filters, formulas as formulas, number-format display rules, charts, pivot tables, and positioned drawings.

## Required Behavior

- If the user asks for "完全符合原文", run the converter with `--strict`.
- Treat strict failures as real blockers. Do not describe the output as complete if the report lists unsupported features or unplaced images.
- If exact visual appearance is the actual requirement, recommend a visual/PDF-first workflow: render the Office file to PDF or page/slide images, then create Markdown that embeds those rendered images. This local skill is for structured Markdown extraction, not pixel-perfect rendering.

## Report Review Checklist

Open the generated `*.report.json` and check:

- `counts.remaining_data_uris` must be `0`.
- `strict.passed` must be `true` when strict mode is used.
- `supplemental_unplaced_images` means the image file was copied, but exact inline placement was not available from MarkItDown output.
- `unsupported_features` lists likely loss points that should be disclosed.
- For PPTX, `structure.stats.list_items` should be greater than zero when the slide visibly contains bullets or parallel short lines. If it is unexpectedly low, rerun with `--pptx-list-mode aggressive` and compare the Markdown.
