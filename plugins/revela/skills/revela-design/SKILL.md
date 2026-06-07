---
name: revela-design
description: Create, edit, validate, install, activate, inspect, or list Revela design packages in Codex using design MCP tools.
---

# Revela Design

Use this skill when the user asks to create, customize, edit, validate, install, activate, inspect, list, or switch a Revela design.

## Contract

- Designs define deck visual systems: rules, foundation, layouts, components, chart rules, and preview coverage.
- Default authoring is workspace draft first, then validate, then install only when appropriate.
- Direct user-level creation is reserved for explicit create/install-now requests.
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
4. Call `revela_design_draft_create`.
5. Call `revela_design_draft_validate`.
6. If validation fails, revise the draft content and repeat draft create/validate.
7. Call `revela_design_draft_install` only after the draft validates and the user intent is to install it.
8. Call `revela_design_activate` only when the user asks to make it active.

Use `revela_design_create` only when the user explicitly requests direct local creation outside the workspace draft workflow. Follow it with `revela_design_validate`.

## Design Package Requirements

- Use a kebab-case design name.
- `DESIGN.md` must include valid frontmatter and complete design marker sections.
- Include design rules, foundation guidance, at least one layout, and at least one component.
- `preview.html` must use the fixed Revela preview canvas contract and visibly preview the design.
- Preview must include cover and closing examples and showcase every component.
- Preserve source inspiration and limitations explicitly; do not copy copyrighted design text or assets into the package.

## Outputs

- Design draft path/status or installed design name.
- Validation result and any remaining diagnostics.
- Whether the design was activated.
- Next step, usually `revela-research` for planning with the design or `revela-make-deck` when a valid `deck-plan.md` already exists.

## Must Not

- Do not write `deck-plan.md`.
- Do not write `decks/*.html`.
- Do not install or activate a design unless the user requested that outcome.
- Do not invent licenses, asset provenance, or brand permissions.
