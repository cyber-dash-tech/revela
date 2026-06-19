---
name: revela-design
description: Create, edit, validate, package, share, install, activate, inspect, or list Revela design packages in Codex using design MCP tools.
---

# Revela Design

Use this skill when the user asks to create, customize, edit, validate, package, share, install, activate, inspect, list, or switch a Revela design.

## Contract

- Designs define deck visual systems: rules, foundation, layouts, components, chart rules, and page-template foundation styling.
- CSS-native designs include `design.css` as the executable visual source. `DESIGN.md` explains the design contract; `design.css` styles the stable template DOM classes.
- Designs should define executable visual contracts, not only mood, fonts, and palettes. Capture grid/safe-area, spacing scale, type scale, surface behavior, chart tokens, component states, and preview fixtures in the design package.
- Designs may include package-owned `assets/**` such as cover or closing backgrounds; design tools surface these as design elements, not source evidence.
- When the user uploads or provides logo, cover, closing, background, texture, brand image, or similar design material, store it inside the design package with `revela_design_draft_create.assets`; use paths under `assets/**` only.
- Design previews are generated from Revela's built-in page-template preview plus the draft or installed `design.css`.
- Default authoring is workspace draft first, then validate, then install only when appropriate.
- Direct user-level creation is reserved for explicit create/install-now requests.
- Shareable design archives are `.tar` or `.tar.gz`; install archives only from trusted local paths.
- Do not use domain tools for visual design work.
- Do not write `decks/*.html` while authoring a design. Use `revela_design_preview` to generate a workspace-local design preview.

## Required Tools

For status, inspection, activation, or selection:

1. Call `revela_design_list`.
2. Call `revela_design_read`, `revela_design_inventory`, `revela_design_read_layout`, `revela_design_read_component`, or `revela_page_template_foundation` as needed.
3. Call `revela_design_activate` only when the user asks to use a design for future planning/rendering.
4. For an existing `decks/*.html` artifact, call `revela_switch_deck_design` with the deck file and design name. This refreshes the deck-local active design snapshot and can reopen the deck without rewriting slide content.

For new or edited designs:

1. Call `revela_design_list`.
2. Read the requested base design or active design with `revela_design_read`.
3. Call `revela_design_inventory` and inspect its `pageTemplates` summary.
4. Call `revela_page_template_foundation` for any built-in page templates the design should style or preview.
5. Draft complete `DESIGN.md` and complete `design.css` content.
6. Call `revela_design_draft_create` with `designCss`; when uploaded or local design material exists, pass `assets: [{ path: "assets/...", contentBase64|content|sourcePath }]` so the files are written into the draft package.
7. Call `revela_design_draft_validate`.
8. Call `revela_design_preview` for the draft, start a read-only local static server from the returned `browserHandoff.serveRoot`, and reply with the resulting localhost preview link for the user to open in Codex Browser.
9. If validation or preview review fails, revise the draft content and repeat draft create/validate/preview.
10. Call `revela_design_draft_install` only after the draft validates and the user intent is to install it.
11. Call `revela_design_activate` only when the user asks to make it active for future work; use `revela_switch_deck_design` for an already-rendered deck.

For sharing or installing design archives:

1. Call `revela_design_draft_validate` or `revela_design_validate` before packaging.
2. Call `revela_design_pack` to create a `.tar.gz` archive from a workspace draft or installed design.
3. Call `revela_design_install_archive` to install a local `.tar` or `.tar.gz` archive.
4. After archive installation, call `revela_design_inventory` or `revela_design_read` to confirm the design and assets are readable.
5. Call `revela_design_activate` only when the user asks to make the installed design active, or use `activate: true` on archive install when the request is explicit.

Use `revela_design_create` only when the user explicitly requests direct local creation outside the workspace draft workflow. Follow it with `revela_design_validate`.

## Design Package Requirements

- Use a kebab-case design name.
- `DESIGN.md` must include valid frontmatter and complete design marker sections.
- `design.css` should be present for CSS-native designs and is the only executable CSS source for package-owned template styling.
- Include design rules, foundation guidance, at least one layout, and at least one component.
- In `@design:foundation`, document the design contract: grid columns or layout rails, safe area, spacing/baseline scale, typography scale, surfaces/borders/shadows, and chart tokens when charts are supported.
- Use page-template foundation as the starting point for built-in template styling. Style template classes, but do not remove structural classes or `data-template-slot` semantics.
- Layouts must declare stable slots and use grid/flex structure as the source of alignment. Avoid one-off absolute positioning that bypasses the declared layout contract.
- Components should describe normal, dense, and long-copy behavior where relevant. Chart, table, media, and source-note components need stable container dimensions.
- Optional assets must live under `assets/**`; reference them as package-relative paths like `assets/cover-background.png`.
- `DESIGN.md` may reference package assets in rules, layouts, or components with `assets/...`; do not reference workspace `assets/` media manifest entries for design-owned visuals.
- `revela_design_preview` must generate the visual preview; do not hand-write package `preview.html` for ordinary CSS-native design drafts.
- Do not open `file://` preview URLs in Codex Browser. Use the returned `browserHandoff` fields to serve the preview over `http://127.0.0.1:<port>/preview.html` and let the user click the link.
- If design assets are present, the generated preview should visibly use the saved `assets/...` files when the design CSS references them.
- Generated preview should show the built-in page templates with normal, dense, chart/table, timeline, image, and source-note-like states.
- Preserve source inspiration and limitations explicitly; do not copy copyrighted design text or assets into the package.

## Outputs

- Design draft path/status, generated preview path/status, or installed design name.
- Archive path/status when packaging or installing a shareable design.
- Asset metadata surfaced by read/inventory tools when `assets/**` exists.
- Saved asset paths and intended uses, for example `assets/cover-background.png -> cover hero background`.
- Validation result and any remaining diagnostics.
- Whether the design was activated or an existing deck was switched to that design.
- Next step, usually `revela-research` for planning with the design or `revela-make-deck` when a valid `deck-plan.md` already exists.

## Must Not

- Do not write `deck-plan.md`.
- Do not rewrite slide content in `decks/*.html` while switching design; use `revela_switch_deck_design` to refresh the deck-local active CSS/assets snapshot.
- Do not patch `decks/_revela-design/**/design.css`; those files are regenerated deck-local snapshots.
- Do not install or activate a design unless the user requested that outcome.
- Do not invent licenses, asset provenance, or brand permissions.
