---
name: drawio-diagram-style
description: Conventions for building and polishing draw.io (.dio/.drawio) mxGraphModel XML diagrams by hand — multi-column pipeline/process diagrams, color-coded stage grouping, header badges, icon+label boxes, dashed tree connectors. Use when creating or beautifying a .dio/.drawio file's XML directly (not through the GUI), or when reviewing one for aesthetic/consistency issues. Complements svg-diagram (that skill is for SVG figures embedded in docs; this one is for editable draw.io files).
---

# draw.io Diagram Styling (mxGraphModel XML)

## When to use this vs svg-diagram
- Target file is `.dio`/`.drawio` (mxfile/mxGraphModel XML) → this skill.
- Target file is a static `.svg` referenced from markdown → use `svg-diagram` instead.
- Many pixel/spacing/arrow-direction rules below mirror `svg-diagram`; the two are deliberately consistent so a diagram can be ported between formats.

## File size / complexity guardrails (avoid a file that crashes the editor)
- Keep a single `.dio` file under **500KB** and **under ~2000 mxCells**. Split large systems into multiple files (overview + per-domain detail) instead of one mega-diagram.
- Never embed raster images (base64) if a native shape or a unicode glyph will do — embedded images balloon file size and are the #1 cause of "file suddenly huge / editor freezes".
- Avoid deep `group` nesting (>5 levels) — it causes visible lag when moving/resizing.
- Turn on draw.io's autosave + keep the file under version control so a browser crash doesn't lose work.

## Structure for a "multi-stage pipeline" diagram (columns = stages)
This is the most common layout for architecture/process diagrams (N sequential stages, each with sub-items):

1. **One outer rounded container per stage**, plain white fill, 2px colored border unique to that stage (`rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=<stageColor>;strokeWidth=2;arcSize=3;`). Give it an **empty label** — put the heading as separate cells (see next point) so vertical centering of inner boxes isn't fought by a top-anchored container label.
2. **Header = numbered circle + title text, as two separate cells**, not baked into the container:
   - Circle: `ellipse;fillColor=<stageColor>;strokeColor=none;fontColor=#FFFFFF;fontSize=24;fontStyle=1;align=center;verticalAlign=middle;` sized ~56×56.
   - Title: `text;html=1;fontSize=22;fontStyle=1;fontColor=<stageColor>;align=left;verticalAlign=middle;` placed to the right of the circle, vertically aligned with it.
3. **Inner item boxes**: rounded rectangles, `arcSize=8` (softer than the outer container's `arcSize=3`, creating a visual hierarchy), `align=left;verticalAlign=middle;spacingLeft=20` so icon+text never touches the border.
4. **Icon + title + subtitle in one HTML label**, not separate shapes — much less cell overhead for a small aesthetic gain:
   ```
   <b>&#8984; 代码仓库</b><br><font style="font-size:13px" color="#374151">历史会话</font>
   ```
   Bold title line ~16px, optional gray (`#374151` or `#6B7280`) subtitle line ~13px below it via `<font style="font-size:...">`.
5. **Solid black arrows (`strokeColor=#1F2937`, `endArrow=classic`)** connect boxes that are a strict sequence within a column. Boxes that are just "also relevant, not a direct next step" (e.g. an aside/annotation box) get spacing but **no arrow** — don't force a connector where there is no real sequential dependency.
6. **Dashed gray tree connectors** (`dashed=1;dashPattern=4 4;strokeColor=#94A3B8;endArrow=block;endSize=6;edgeStyle=orthogonalEdgeStyle`) for "parent classifies into children" relationships (e.g. one box branching into two categorized child boxes). Use `exitX=0.5;exitY=1` / `entryX=0.5;entryY=0` so the branch reads top-to-bottom.
7. **Inter-stage arrows connect container-to-container**, not box-to-box: `source="containerA" target="containerB"` with `exitX=1;exitY=0.5;entryX=0;entryY=0.5`. This way the arrow always leaves/enters at the vertical mid-point of the panel regardless of panel height, and stays correct if inner boxes are added/removed later.

## Color system
- Pick one accent color per stage/column; reuse it consistently for: container border, header circle fill, header title font color, and (usually) that stage's item-box borders.
- Item boxes that represent "the same category but called out for a different reason" (e.g. a user-intervention/override step) can borrow a **different** semantic color (e.g. green for "human-approved/safe") even inside a column with another accent color — this signals meaning, not just decoration.
- Light tint fills for inner boxes (`#FFF7ED`, `#F0FDF4`, `#EFF6FF`) pair with a saturated stroke of the same hue family; plain white fill + colored stroke is the "neutral/default" box.
- Body text stays neutral gray (`#374151` primary, `#6B7280` secondary/annotation) regardless of the stage's accent color — only headings and borders carry the accent.

## Spacing & sizing rules of thumb
- Outer container padding: header starts ~20px from the container top; first inner box starts ~120px from the top (leaves room for the header row).
- Vertical gap between stacked item boxes in the same column: ~20px (box height 90–170px depending on how many lines of text).
- Column-to-column gap (for the connector arrow): ~40px.
- Keep box widths consistent within a column; only widen a column when it must host side-by-side children (e.g. a parent box branching into two child boxes side by side) — compute the column width as `left margin + child1 width + gap + child2 width + right margin`, not an arbitrary round number.
- Icons: prefer single unicode glyphs (⌘ ▥ ⬡ ✎ ☁ 🔍 ✛ ■) inline in the HTML label over separate icon shapes/embedded images — same visual effect, far fewer cells and no file-size cost.

## Verification checklist before calling a draw.io diagram done
- [ ] Every stage container uses one accent color consistently (border + header + related boxes)
- [ ] No arrow drawn between boxes that aren't a real sequential/causal step
- [ ] Inter-container arrows attach to containers (`exitY=0.5`/`entryY=0.5`), not to a specific inner box
- [ ] All rounded rects in the same tier share the same `arcSize`
- [ ] No embedded raster images; total file size and cell count checked against the guardrails above
- [ ] XML validates (`xmllint --noout file.dio`) before considering the edit complete
