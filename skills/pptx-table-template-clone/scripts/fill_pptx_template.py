#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clone a title+table style slide from a PPTX N times and refill each copy
with new title/table content, while preserving the original slide's exact
styling (fonts, colors, fills, borders) via XML-level shape duplication.

This is the general form of the technique: take one existing "report page"
slide (a title text box + a table), and turn it into a multi-page deck where
every page looks identical in style but carries different title/table data.

Usage:
    python3 fill_pptx_template.py --template deck.pptx --spec spec.json --output out.pptx

Spec JSON schema:
{
  "style_slide_index": 0,        // optional; default = first slide with exactly one table
  "auto_number_title": true,     // optional; default true. See set_title() docstring.
  "output": "out.pptx",          // optional; overridden by --output
  "slides": [
    {
      "title": "工作目标",
      "headers": ["目标", "具体要求", "对应部门KPI", "类型"],
      "rows": [
        ["L4渐进式对接与交接", "推进车企云-云对接...", "L4云云对接", "持续投入"],
        ["...", ["多行内容第一行", "多行内容第二行"], "...", "..."]
      ]
    },
    { "title": "...", "headers": [...], "rows": [...] }
  ]
}

Notes / known limitations:
- Only the FIRST run's formatting (font, size, color, bold) in a cell/title is
  reused for the whole replacement text. Mixed-formatting rich text within one
  cell is not preserved.
- Table column count can differ from the template: extra/removed columns are
  handled by evenly redividing the total table width and cloning the first
  column's cell style for every column.
- Row count can differ freely; row height is evenly divided from the
  template table's total height minus the header row height.
- Background/theme graphics are inherited from the slide layout/master, not
  copied per-shape, so this only works if the template's watermark/logo/etc.
  live on the layout (true for most corporate PPTX templates). If the
  template slide itself carries decorative picture shapes as part of the
  slide (not the layout), duplicate_slide() copies those too since it clones
  every shape on the style slide.
"""
from __future__ import annotations

import argparse
import copy
import json
from typing import List, Optional, Union

from pptx import Presentation

A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"


def qa(tag: str) -> str:
    return f"{{{A_NS}}}{tag}"


# ---------------------------------------------------------------------------
# Slide-level helpers
# ---------------------------------------------------------------------------

def find_title_shape(slide):
    if slide.shapes.title is not None:
        return slide.shapes.title
    for shp in slide.shapes:
        if shp.has_text_frame and not shp.has_table:
            return shp
    raise RuntimeError("No title/text shape found on the style slide")


def find_table_shape(slide):
    for shp in slide.shapes:
        if shp.has_table:
            return shp
    raise RuntimeError("No table shape found on the style slide")


def auto_detect_style_slide_index(prs) -> int:
    for i, slide in enumerate(prs.slides):
        if any(shp.has_table for shp in slide.shapes):
            return i
    raise RuntimeError(
        "No slide with a table was found; pass --style-slide-index explicitly"
    )


def duplicate_slide(prs, source_slide):
    """Deep-copy every shape on source_slide onto a brand-new slide that uses
    the same layout, so the visual style (including any background image
    shapes on the slide itself) is preserved exactly."""
    layout = source_slide.slide_layout
    new_slide = prs.slides.add_slide(layout)
    for shp in list(new_slide.shapes):
        shp._element.getparent().remove(shp._element)
    for shp in source_slide.shapes:
        new_slide.shapes._spTree.append(copy.deepcopy(shp._element))
    return new_slide


def move_slide(prs, slide, new_index: int):
    sldIdLst = prs.slides._sldIdLst
    slide_id = slide.slide_id
    elements = list(sldIdLst)
    el = next(e for e in elements if int(e.get("id")) == slide_id)
    sldIdLst.remove(el)
    sldIdLst.insert(new_index, el)


def clear_notes(slide):
    if slide.has_notes_slide:
        slide.notes_slide.notes_text_frame.text = ""


# ---------------------------------------------------------------------------
# Title text
# ---------------------------------------------------------------------------

def set_title(shape, title_text: str, index: Optional[int] = None, auto_number: bool = True):
    """Replace a title shape's text.

    If auto_number is True, index is given, the paragraph has >=2 runs, and
    the first run's text looks like a bare number/prefix (matching the
    common "1 工作目标" two-run pattern), the number is regenerated and the
    rest of the text goes in the second run. Otherwise the whole title is
    written into the first run (optionally prefixed with "N. ") and any
    extra runs are dropped.
    """
    tf = shape.text_frame
    p = tf.paragraphs[0]._p
    runs = p.findall(qa("r"))
    if not runs:
        raise RuntimeError("Title paragraph has no runs to clone formatting from")

    first_text_el = runs[0].find(qa("t"))
    first_text = (first_text_el.text or "").strip() if first_text_el is not None else ""
    looks_numbered = first_text.rstrip(".、 ").isdigit()

    if auto_number and index is not None and len(runs) >= 2 and looks_numbered:
        first_text_el.text = f"{index} "
        runs[1].find(qa("t")).text = title_text
        for extra in runs[2:]:
            extra.getparent().remove(extra)
        return

    prefix = f"{index}. " if (auto_number and index is not None) else ""
    first_text_el.text = prefix + title_text
    for extra in runs[1:]:
        extra.getparent().remove(extra)


# ---------------------------------------------------------------------------
# Table content
# ---------------------------------------------------------------------------

def set_cell_lines(tc, lines: List[str]):
    """Replace a table cell's text with one paragraph per line, cloning the
    first existing paragraph/run's formatting for every new paragraph."""
    txBody = tc.find(qa("txBody"))
    paras = txBody.findall(qa("p"))
    template_p = paras[0]
    template_r = template_p.find(qa("r"))
    for p in paras:
        txBody.remove(p)
    if not lines:
        lines = [""]
    for line in lines:
        new_p = copy.deepcopy(template_p)
        for child in list(new_p):
            if child.tag != qa("pPr"):
                new_p.remove(child)
        new_r = copy.deepcopy(template_r)
        new_r.find(qa("t")).text = line
        new_p.append(new_r)
        txBody.append(new_p)


def rebuild_table(table_shape, headers: List[str], rows: List[List[Union[str, List[str]]]]):
    tbl = table_shape.table._tbl
    grid = tbl.find(qa("tblGrid"))
    grid_cols = grid.findall(qa("gridCol"))
    trs = tbl.findall(qa("tr"))
    header_tr = trs[0]
    body_template_tr = trs[1] if len(trs) > 1 else trs[0]

    template_cols = len(grid_cols)
    target_cols = len(headers)

    if target_cols != template_cols:
        total_width = sum(int(gc.get("w")) for gc in grid_cols)
        base_w = total_width // target_cols
        remainder = total_width - base_w * target_cols
        for gc in list(grid_cols):
            grid.remove(gc)
        for i in range(target_cols):
            gc = grid.makeelement(qa("gridCol"), {})
            gc.set("w", str(base_w + (remainder if i == target_cols - 1 else 0)))
            grid.append(gc)

        header_tc_style = header_tr.findall(qa("tc"))[0]
        body_tc_style = body_template_tr.findall(qa("tc"))[0]
        for tc in list(header_tr.findall(qa("tc"))):
            header_tr.remove(tc)
        for tc in list(body_template_tr.findall(qa("tc"))):
            body_template_tr.remove(tc)
        for _ in range(target_cols):
            header_tr.append(copy.deepcopy(header_tc_style))
            body_template_tr.append(copy.deepcopy(body_tc_style))

    for tc, text in zip(header_tr.findall(qa("tc")), headers):
        set_cell_lines(tc, [text])

    body_template_copy = copy.deepcopy(body_template_tr)
    header_h = int(header_tr.get("h", "0"))
    total_h = sum(int(tr.get("h", "0")) for tr in trs)
    for tr in trs[1:]:
        tbl.remove(tr)

    n_body = max(1, len(rows))
    body_h = max(1, (total_h - header_h) // n_body) if total_h > header_h else int(body_template_tr.get("h", "500000"))

    for row_values in rows:
        new_tr = copy.deepcopy(body_template_copy)
        new_tr.set("h", str(body_h))
        tcs = new_tr.findall(qa("tc"))
        for tc, value in zip(tcs, row_values):
            lines = value if isinstance(value, list) else [str(value)]
            set_cell_lines(tc, lines)
        tbl.append(new_tr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build(template_path: str, spec: dict, output_path: str):
    prs = Presentation(template_path)

    style_idx = spec.get("style_slide_index")
    if style_idx is None:
        style_idx = auto_detect_style_slide_index(prs)
    style_slide = prs.slides[style_idx]

    # validate the style slide has what we need before touching anything
    find_title_shape(style_slide)
    find_table_shape(style_slide)

    contents = spec["slides"]
    auto_number = spec.get("auto_number_title", True)

    ordered_slides = [style_slide]
    for _ in range(len(contents) - 1):
        ordered_slides.append(duplicate_slide(prs, style_slide))
    for offset, slide in enumerate(ordered_slides[1:], start=1):
        move_slide(prs, slide, style_idx + offset)

    for i, (slide, content) in enumerate(zip(ordered_slides, contents), start=1):
        title_shape = find_title_shape(slide)
        set_title(title_shape, content["title"], index=i, auto_number=auto_number)
        table_shape = find_table_shape(slide)
        rebuild_table(table_shape, content["headers"], content["rows"])
        clear_notes(slide)

    prs.save(output_path)
    print(f"saved: {output_path} ({len(prs.slides)} slides)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--template", required=True, help="Path to the source PPTX with the style slide")
    ap.add_argument("--spec", required=True, help="Path to the JSON content spec")
    ap.add_argument("--output", default=None, help="Output PPTX path (default: spec['output'] or overwrite template)")
    ap.add_argument("--style-slide-index", type=int, default=None, help="Override spec's style_slide_index")
    args = ap.parse_args()

    with open(args.spec, encoding="utf-8") as f:
        spec = json.load(f)

    if args.style_slide_index is not None:
        spec["style_slide_index"] = args.style_slide_index

    output_path = args.output or spec.get("output") or args.template
    build(args.template, spec, output_path)
