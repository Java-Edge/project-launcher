# Fill spec JSON schema

Top-level object:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `style_slide_index` | int | no | 0-based index of the slide to clone. Default: first slide in the file that contains a table. |
| `auto_number_title` | bool | no | Default `true`. See title numbering rules below. |
| `output` | string | no | Output path used only if `--output` is not passed on the CLI. |
| `slides` | array | yes | One entry per output slide, in order. |

Each entry in `slides`:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `title` | string | yes | New title text for this slide. |
| `headers` | array of string | yes | Table header row text. Length may differ from the template's column count — the script redivides column widths evenly and clones the first column's cell style for any new columns. |
| `rows` | array of array | yes | Body rows. Each row is a list matching `headers` length. A cell value is either a plain string, or a list of strings rendered as separate paragraphs (multi-line bullet-style content) inside that cell. |

## Title numbering rules

Many Chinese report templates write the slide title as two runs: a bare
index like `"1 "` followed by the actual title, e.g. `"1 "` + `"工作目标"`.
When `auto_number_title` is true (default) and the style slide's title
paragraph has 2+ runs whose first run is a bare number (optionally followed
by `.` or `、` or a space), the script regenerates that first run as
`"{N} "` and puts the given title text into the second run, dropping any
extra runs. This reproduces `"1 工作目标"`, `"2 工作进度"`, etc. automatically
in slide order.

If the title shape does not match that two-run numbered pattern, the whole
title is written into the first run as `"{N}. {title}"` (or just `{title}`
if `auto_number_title` is false), and any other runs on that paragraph are
removed.

## Example

```json
{
  "style_slide_index": 0,
  "auto_number_title": true,
  "slides": [
    {
      "title": "工作目标",
      "headers": ["目标", "具体要求", "对应部门KPI", "类型"],
      "rows": [
        ["L4渐进式对接与交接", "推进车企云-云对接、数据链路稳定接入，逐步承接平台运维", "L4云云对接、结构化数据接入", "持续投入"],
        ["LLM赋能研发运维", ["探索AI工具在代码生成、文档生成中的应用", "落地1-2个场景"], "AI应用赋能（全年不少于2例）", "持续投入"]
      ]
    },
    {
      "title": "问题与解决方案",
      "headers": ["问题", "根因", "已采取的应对", "需要的支持"],
      "rows": [
        ["第三方组件联调失败", "外部环境/合作方配置问题", "持续排查并升级反馈，及时止损", "视具体卡点，可能需要跨部门协调"]
      ]
    }
  ]
}
```
