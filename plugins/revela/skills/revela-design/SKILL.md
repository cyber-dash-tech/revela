---
name: revela-design
description: Use Revela design guidance in Codex for deck planning and artifact generation.
---

# Revela Design

Use this skill when the user asks about Revela designs or when generating deck HTML.

## Workflow

1. Call `revela_design_list` to inspect installed designs.
2. Call `revela_design_read` for the active or requested design.
3. Use the current simplified built-in design grammar: `box`, `text-panel`, `media`, `echart-panel`, `data-table`, `steps`, `roadmap-horizontal`, `roadmap-vertical`, `hero`, `stat-card`, `quote`, `toc`, `page-number`, and `brand-watermark`.
4. Fetch chart/design guidance before creating ECharts or complex layouts.
5. Do not invent unsupported component names.

Design changes are visual/artifact-level unless they change claim meaning, evidence boundaries, decision, or recommendation.

