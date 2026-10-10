---
name: fund-trading-strategy
description: Use when analyzing fund and market strategy for the fund project, especially when adding or revising trading rules, risk controls, market-analysis flow, or AI prompt policy. Read the project rule documents before changing prompts or strategy logic.
---

# Fund Trading Strategy

This skill is the process wrapper for strategy-rule maintenance in the `fund` project.

## Source of truth

Read these rule documents first:

- [/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/core_principles.md](/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/core_principles.md)
- [/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/entry_rules.md](/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/entry_rules.md)
- [/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/reduction_rules.md](/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/reduction_rules.md)
- [/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/position_sizing_rules.md](/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/position_sizing_rules.md)
- [/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/risk_exceptions.md](/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/risk_exceptions.md)
- [/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/output_format_rules.md](/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/output_format_rules.md)
- [/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/README.md](/Users/javaedge/soft/PyCharmProjects/fund/docs/ai_rules/README.md)

## Workflow

1. Separate runtime code from strategy policy.
2. Treat Markdown rule docs as the editable rule layer.
3. Keep Python focused on data collection, orchestration, and rendering.
4. When changing prompts, inject rule text from docs instead of hardcoding new policy blocks.
5. When rules conflict, update the docs first, then adjust prompt wiring if needed.

## Guardrails

- Do not encode new trading rules directly in Python unless the rule is purely technical.
- Do not turn analysis output into deterministic buy/sell promises.
- Keep risk disclosures explicit.
