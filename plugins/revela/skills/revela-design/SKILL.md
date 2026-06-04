---
name: revela-design
description: Use Revela design guidance in Codex for deck planning and artifact generation.
---

# Revela Design

Use this skill when the user asks about Revela designs or when generating deck HTML.

## Workflow

1. Call `revela_design_list` to inspect installed designs.
2. Call `revela_design_read` with `section: "rules"` before writing or patching `decks/*.html`; this records the Codex hook context required for deck writes.
3. Call `revela_design_inventory` before authoring or repairing `deck-plan/` so planned layout/component names come from the active design. Use `revela_upsert_deck_plan_slide` for slide-plan writes; do not hand-write slide plan Markdown.
4. Read required details with `revela_design_read_layout` and `revela_design_read_component` before writing slide HTML that uses those layouts/components.
5. When the user asks to switch designs for future work, call `revela_design_activate` with the requested design name, then read the active design again.
6. For one-off deck generation with a requested design, read that design by name, call `revela_design_inventory` with that name, and pass `designName` to `revela_create_deck_foundation` without changing active design unless the user asked to switch.
7. Use the current simplified built-in design grammar: `box`, `text-panel`, `media`, `echart-panel`, `data-table`, `steps`, `roadmap-horizontal`, `roadmap-vertical`, `hero`, `stat-card`, `quote`, `toc`, `page-number`, and `brand-watermark`.
8. Fetch chart/design guidance before creating ECharts or complex layouts.
9. Do not invent unsupported component names.

Deck HTML must keep exactly one direct `.slide-canvas` child inside every `<section class="slide" ...>`; place `.page` or layout containers inside `.slide-canvas`, not directly under `.slide`.

Design changes are visual/artifact-level unless they change claim meaning, evidence boundaries, decision, or recommendation.

## Inventory-First Planning

Deck planning uses design vocabulary before HTML. Inspect the inventory, choose a valid layout for each slide, and choose valid component names for each planned element. Every component plan must include a semantic `slot` such as `left`, `right`, `top`, `main`, `bottom`, `footer`, or `fullbleed`, plus a non-empty kebab-case `position` such as `left-top`, `left-middle`, `right-bottom`, `center`, or `overlay-top-right`.

Use `placementNote` for natural-language placement detail when slot and position are not enough. Slot and position are planning anchors; before HTML generation, fetch the actual layout/component definitions and implement the final structure with the design's CSS and markup.

## Creating Or Editing Designs

When the user asks to create a new design, use `starter` as the default base design unless they specify another base. Interview the user before saving anything: collect visual references such as images, webpages, brands, decks, or text descriptions, plus must-have and must-avoid constraints. Summarize the design brief and visual schema, then wait for the user to confirm before creating files.

After confirmation, read the base design with `revela_design_read`. Generate complete `DESIGN.md` and complete `preview.html` content, then call `revela_design_draft_create` to save a workspace-local draft under `.revela/drafts/designs/<name>/`. Always call `revela_design_draft_validate` after draft creation or overwrite. The direct registry tools `revela_design_create` and `revela_design_validate` remain available for existing workflows, but Codex design authoring should use the draft workflow before install.

Install the draft globally only after the user confirms the validated draft should be installed. Call `revela_design_draft_install` to copy the draft into the user-level design registry. If a user-level design already exists, pass `overwrite: true` only after the user confirms replacement. In sandboxed Codex sessions, the install step may require permission to write Revela user config under `~/.config/revela`.

`DESIGN.md` must include frontmatter with `name`, `description`, `author`, and `version`, plus valid marker blocks for `@design:foundation`, `@design:rules`, at least one `@layout`, and at least one `@component`.

`preview.html` must be self-contained and directly openable in a browser. Every `<section class="slide">` must include `slide-qa` and exactly one direct `.slide-canvas` child. Every direct `.slide-canvas` is the fixed 1920px x 1080px export surface and must use explicit CSS with `width: 1920px` and `height: 1080px`; `.slide` may remain a viewport/navigation wrapper. Include a cover slide with `data-slide-role="cover"`, a closing slide with `data-slide-role="closing"`, and a visible sample for every `@component:*` using `data-preview-component="<component-name>"`.

Do not automatically activate a newly created design. Do not automatically activate a newly installed design. Report the draft path, installed path when installed, and tell the user they can activate it with `revela_design_activate`.
