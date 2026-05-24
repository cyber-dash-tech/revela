---
name: revela-design
description: Use Revela design guidance in Codex for deck planning and artifact generation.
---

# Revela Design

Use this skill when the user asks about Revela designs or when generating deck HTML.

## Workflow

1. Call `revela_design_list` to inspect installed designs.
2. Call `revela_design_read` for the active or requested design.
3. When the user asks to switch designs for future work, call `revela_design_activate` with the requested design name, then read the active design again.
4. For one-off deck generation with a requested design, read that design by name and pass `designName` to `revela_create_deck_foundation` without changing active design unless the user asked to switch.
5. Use the current simplified built-in design grammar: `box`, `text-panel`, `media`, `echart-panel`, `data-table`, `steps`, `roadmap-horizontal`, `roadmap-vertical`, `hero`, `stat-card`, `quote`, `toc`, `page-number`, and `brand-watermark`.
6. Fetch chart/design guidance before creating ECharts or complex layouts.
7. Do not invent unsupported component names.

Design changes are visual/artifact-level unless they change claim meaning, evidence boundaries, decision, or recommendation.
