---
name: revela-design
description: Create, edit, validate, package, share, install, activate, inspect, or list Revela design packages in Codex using design MCP tools.
---

# Revela Design

Use this skill when the user asks to create, customize, edit, validate, package, share, install, activate, inspect, list, or switch a Revela design.

## Contract

- Designs define deck visual systems: rules, foundation, layouts, components, chart rules, and preview coverage.
- Designs should define executable visual contracts, not only mood, fonts, and palettes. Capture grid/safe-area, spacing scale, type scale, surface behavior, chart tokens, component states, and preview fixtures in the design package.
- Designs may include package-owned `assets/**` such as cover or closing backgrounds; design tools surface these as design elements, not source evidence.
- When the user uploads or provides logo, cover, closing, background, texture, brand image, or similar design material, store it inside the design package with `revela_design_draft_create.assets`; use paths under `assets/**` only.
- Generated `preview.html` must actually reference uploaded design assets with package-relative `assets/...` paths rather than describing them only in text.
- Default authoring is workspace draft first, then validate, then install only when appropriate.
- Direct user-level creation is reserved for explicit create/install-now requests.
- Shareable design archives are `.tar` or `.tar.gz`; install archives only from trusted local paths.
- Do not use domain tools for visual design work.
- Do not generate deck HTML while authoring a design.

## Required Tools

For status, inspection, activation, or selection:

1. Call `revela_design_list`.
2. Call `revela_design_read`, `revela_design_inventory`, `revela_design_read_layout`, or `revela_design_read_component` as needed.
3. Call `revela_design_activate` only when the user asks to use a design.

For new or edited designs:

1. Call `revela_design_list`.
2. Read the requested base design or active design with `revela_design_read`.
3. Draft complete `DESIGN.md` and complete `preview.html` content.
4. Call `revela_design_draft_create`; when uploaded or local design material exists, pass `assets: [{ path: "assets/...", contentBase64|content|sourcePath }]` so the files are written into the draft package.
5. Call `revela_design_draft_validate`.
6. If validation fails, revise the draft content and repeat draft create/validate.
7. Call `revela_design_draft_install` only after the draft validates and the user intent is to install it.
8. Call `revela_design_activate` only when the user asks to make it active.

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
- Include design rules, foundation guidance, at least one layout, and at least one component.
- In `@design:foundation`, document the design contract: grid columns or layout rails, safe area, spacing/baseline scale, typography scale, surfaces/borders/shadows, and chart tokens when charts are supported.
- Layouts must declare stable slots and use grid/flex structure as the source of alignment. Avoid one-off absolute positioning that bypasses the declared layout contract.
- Components should describe normal, dense, and long-copy behavior where relevant. Chart, table, media, and source-note components need stable container dimensions.
- Optional assets must live under `assets/**`; reference them as package-relative paths like `assets/cover-background.png`.
- `DESIGN.md` may reference package assets in rules, layouts, or components with `assets/...`; do not reference workspace `assets/` media manifest entries for design-owned visuals.
- `preview.html` must use the fixed Revela preview canvas contract and visibly preview the design.
- If design assets are present, `preview.html` must visibly use the saved `assets/...` files, for example a cover hero background or logo image.
- Preview must include cover and closing examples and showcase every component.
- Preview should showcase every layout with `data-preview-layout="<layout-name>"` and every component with `data-preview-component="<component-name>"`.
- Preview should behave like a design test fixture: include normal content, dense content, mixed-language text where relevant, chart/table examples when supported, readable media, and source-note behavior.
- Preserve source inspiration and limitations explicitly; do not copy copyrighted design text or assets into the package.

## Outputs

- Design draft path/status or installed design name.
- Archive path/status when packaging or installing a shareable design.
- Asset metadata surfaced by read/inventory tools when `assets/**` exists.
- Saved asset paths and intended uses, for example `assets/cover-background.png -> cover hero background`.
- Validation result and any remaining diagnostics.
- Whether the design was activated.
- Next step, usually `revela-research` for planning with the design or `revela-make-deck` when a valid `deck-plan.md` already exists.

## Must Not

- Do not write `deck-plan.md`.
- Do not write `decks/*.html`.
- Do not install or activate a design unless the user requested that outcome.
- Do not invent licenses, asset provenance, or brand permissions.
