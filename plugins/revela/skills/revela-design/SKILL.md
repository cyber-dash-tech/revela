---
name: revela-design
description: Use Revela design guidance in Codex for deck planning and artifact generation.
---

# Revela Design

Use this skill when the user asks about Revela designs or when generating deck HTML.

## Workflow

1. Call `revela_design_list` to inspect installed designs.
2. Call `revela_design_read` with `section: "rules"` before writing or patching `decks/*.html`; this records the Codex hook context required for deck writes.
3. When the user asks to switch designs for future work, call `revela_design_activate` with the requested design name, then read the active design again.
4. For one-off deck generation with a requested design, read that design by name and pass `designName` to `revela_create_deck_foundation` without changing active design unless the user asked to switch.
5. Use the current simplified built-in design grammar: `box`, `text-panel`, `media`, `echart-panel`, `data-table`, `steps`, `roadmap-horizontal`, `roadmap-vertical`, `hero`, `stat-card`, `quote`, `toc`, `page-number`, and `brand-watermark`.
6. Fetch chart/design guidance before creating ECharts or complex layouts.
7. Do not invent unsupported component names.

Deck HTML must keep exactly one direct `.slide-canvas` child inside every `<section class="slide" ...>`; place `.page` or layout containers inside `.slide-canvas`, not directly under `.slide`.

Design changes are visual/artifact-level unless they change claim meaning, evidence boundaries, decision, or recommendation.

## Creating Or Editing Designs

When the user asks to create a new design, use `starter` as the default base design unless they specify another base. Interview the user before saving anything: collect visual references such as images, webpages, brands, decks, or text descriptions, plus must-have and must-avoid constraints. Summarize the design brief and visual schema, then wait for the user to confirm before creating files.

After confirmation, read the base design with `revela_design_read`. Generate complete `DESIGN.md` and complete `preview.html` content, then call `revela_design_create`. For edits to an existing design, read the existing design first, preserve useful layout/component coverage, and call `revela_design_create` with `overwrite: true` only after the user confirms the edit brief. Always call `revela_design_validate` after creation or overwrite.

`DESIGN.md` must include frontmatter with `name`, `description`, `author`, and `version`, plus valid marker blocks for `@design:foundation`, `@design:rules`, at least one `@layout`, and at least one `@component`.

`preview.html` must be self-contained and directly openable in a browser. Every `<section class="slide">` must include `slide-qa` and exactly one direct `.slide-canvas` child. Include a cover slide with `data-slide-role="cover"`, a closing slide with `data-slide-role="closing"`, and a visible sample for every `@component:*` using `data-preview-component="<component-name>"`.

Do not automatically activate a newly created design. Report the saved path and tell the user they can activate it with `revela_design_activate`.
