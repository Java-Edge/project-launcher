---
name: pptx-table-template-clone
description: Turn one existing "title + table" style slide in a PPTX into a multi-page report deck by cloning that slide N times and refilling each copy's title and table with new content, while preserving the original's exact fonts/colors/fills/borders. Use when the user gives an existing .pptx (or a slide inside one) as a style template and asks to "按这个PPT的标题和表格样式做几页"、"把文案套进这个模板"、"复用这个表格样式生成新页面"、"follow this pptx's title/table style for N slides", especially for monthly reports, 述职/汇报 decks, and other recurring 项目/进度/问题 table-based slides. Not for building a deck from scratch with no style source (use a general presentation-authoring skill for that), and not for decorative/free-form slide layouts without a table.
---

# PPTX Table-Template Clone & Fill

## When to use this

The user already has a PPTX whose slide look they like — typically a title
text box plus one data table (common in Chinese 部门例会/述职 report decks:
项目/进度/问题/需要的支持 style tables). They want several new pages that
look pixel-identical in style but carry different title text and table rows
(e.g. turning one month's report slide into a 4-page 年中述职 deck: 目标 /
进度 / 结果 / 问题与解决方案).

Do not rebuild the deck by hand in a slide-authoring tool and do not try to
match colors/fonts by eye — clone the existing slide's XML and only replace
text. This is the only way to guarantee an exact visual match.

## Prerequisites

The scripts need `python-pptx`. Check first, install if missing:

```bash
python3 -c "import pptx" 2>/dev/null || python3 -m pip install --break-system-packages python-pptx
```

If the environment has a managed Python env tool (e.g. VS Code's
`install_python_packages`), prefer that over raw pip.

## Workflow

1. **Inspect the template** to find which slide has the title+table style and see its current headers/row count:

   ```bash
   python3 <skill-dir>/scripts/inspect_pptx_slide.py "/path/to/template.pptx"
   ```

   This prints, per slide: layout name, every shape's name/type, and for the
   table shape the row/column count plus the header row and one sample body
   row of text. Pick the slide index whose table you want to reuse
   (`style_slide_index`, 0-based).

2. **Gather real content first.** Before writing slide copy, pull actual
   facts from the workspace (meeting notes, KPI sheets, project docs) — do
   not invent numbers, dates, or outcomes. This skill only handles the
   PPTX mechanics; the factual accuracy of what goes in each cell is the
   caller's responsibility.

3. **Write a JSON spec** describing every output slide. Each slide has a
   `title` string, a `headers` list, and a `rows` list (each row is a list
   matching `headers`' length; a cell value can be a plain string or a list
   of strings for multi-line content):

   ```json
   {
     "style_slide_index": 0,
     "auto_number_title": true,
     "slides": [
       {
         "title": "工作目标",
         "headers": ["目标", "具体要求", "对应部门KPI", "类型"],
         "rows": [
           ["L4渐进式对接与交接", "推进车企云-云对接、数据链路稳定接入", "L4云云对接", "持续投入"],
           ["LLM赋能研发运维", ["探索AI工具应用", "落地1-2个场景"], "AI应用赋能", "持续投入"]
         ]
       },
       {
         "title": "问题与解决方案",
         "headers": ["问题", "根因", "已采取的应对", "需要的支持"],
         "rows": [["...", "...", "...", "..."]]
       }
     ]
   }
   ```

   See `references/spec-schema.md` for the full field reference.

4. **Run the fill script**:

   ```bash
   python3 <skill-dir>/scripts/fill_pptx_template.py \
     --template "/path/to/template.pptx" \
     --spec "/path/to/spec.json" \
     --output "/path/to/output.pptx"
   ```

   Omit `--output` to overwrite the template in place (or set `"output"` in
   the spec). The script:
   - duplicates the style slide's shapes (title + table) once per extra
     content slide, via XML deep-copy — so fonts, header fill color, borders,
     and row banding are byte-identical to the source;
   - inserts the duplicates right after the style slide, keeping any other
     slides in the template in their original relative order;
   - rewrites each slide's title (auto-numbering "N " prefixes if the
     original title used that two-run pattern, e.g. "1 工作目标");
   - rebuilds each table's header row and body rows, adapting column count
     (redividing width, cloning the first column's cell style) and row count
     (cloning the body row's style, evenly dividing the original table
     height) as needed;
   - clears any leftover speaker notes on the produced slides.

5. **Verify, don't just trust it.** Re-inspect the output:

   ```bash
   python3 <skill-dir>/scripts/inspect_pptx_slide.py "/path/to/output.pptx"
   ```

   Confirm slide count, header/row text, and column counts match the spec.
   If the `office-to-markdown` skill is available, also reconvert the output
   PPTX to Markdown and read it — this is the fastest way to eyeball garbled
   text or wrong row order. There is no reliable headless PPTX renderer in
   most sandboxes (LibreOffice/soffice is often absent); do not promise a
   pixel-level visual check unless one is actually available.

## Known limitations (say these out loud, don't hide them)

- Only the **first run's** formatting in a cell/title is reused for the
  whole replacement text; mixed bold/color runs within one cell collapse to
  one style.
- Slide background/watermark graphics that live on the **slide layout or
  master** are inherited automatically (this covers most corporate
  templates). Background graphics that live directly on the style slide
  itself are copied too, since the whole shape tree is cloned — but stray
  per-slide decorative shapes can end up duplicated on every page, which is
  usually desired but should be sanity-checked with the inspect script.
- Charts, SmartArt, and embedded OLE objects on the style slide are cloned
  as opaque shapes (their XML is copied) but their **data is not
  re-templated** — only titles and native tables are content-aware.
- This skill edits an existing template; it does not design a new visual
  style from nothing. If no usable title+table slide exists, use a
  general presentation-authoring workflow instead.
