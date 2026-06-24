---
name: revela-make-deck
description: Generate Revela HTML deck artifacts in Codex from an existing deck-plan.md and active design files.
---

# Revela Make Deck

Use this skill when the user asks to make, generate, render, or update a Revela HTML deck from an existing `deck-plan.md`.

## Contract

- Deck execution planning comes from canonical `deck-plan.md`.
- Local materials, material reviews, `researches/`, `assets/`, and user intent provide source context.
- Slide argument copy comes from `deck-plan.md` `Claim`, `Reasoning`, and `Audience takeaway` fields when present; raw findings are evidence/source context, not default body copy.
- Active/requested design tools define page-template styling, design rules, assets, and HTML writing rules.
- Built-in page template tools define semantic page templates, foundation/scaffold HTML, editable slots, stable DOM contracts, and template QA contracts.
- Deck-local `decks/_revela-design/**/design.css` files are generated design snapshots. Do not patch them during deck making; regenerate the deck foundation or enter the design workflow instead.
- Active/requested domain guidance may inform communication framing, but it is not source evidence.
- Generated artifacts live under `decks/*.html`.
- After final Artifact QA passes, reply with the generated HTML deck as a standalone localhost website link/card that the user can click to open in Codex Browser for native browsing and annotation.
- Do not require a Narrative Vault before generating a deck.
- This skill does not own normal plan authoring; `revela-research` owns source preparation and `deck-plan.md` planning handoff.
- `deck-plan.md` is required for normal deck generation.

## Preconditions

- Required: readable `deck-plan.md`.
- An active or user-requested design must be readable.
- If `deck-plan.md` is missing, stop and tell the user to run `revela` for routing, `revela-spec` for missing requirements, or `revela-research` for the Planning Handoff.
- If `deck-plan.md` is structurally invalid, only repair technical plan diagnostics reported during render preflight.

## Inputs

- `researches/**/*.md`
- Reviewed workspace materials and material review records.
- `assets/`
- User deck objective, audience, and constraints.
- Existing `deck-plan.md`.
- Active/requested design and optional active/requested domain.

## Required Design Tools

Before render preflight:

1. Call `revela_design_list`.
2. Call `revela_design_read` with `section: "rules"` for the active/requested design.
3. Call `revela_design_inventory` and use its `pageTemplates` summary as the public design vocabulary.
4. Call `revela_list_page_templates` when the deck-plan uses `template` fields or when adding a new page.
5. For each template used in the current batch, call `revela_page_template_foundation` before creating or editing scaffold HTML.
6. Do not plan new slides from legacy design layouts or components.

Before HTML writing:

1. Call `revela_read_deck_plan`.
2. Read the returned `htmlWritingBatches`.
3. For new slides with `template`, call `revela_render_template_scaffold` or `revela_add_template_scaffold`, then bounded-edit only the inserted slide's `data-template-slot` regions.
4. Use `revela_render_template_slide` / `revela_add_template_slide` only as a compatibility path for existing full `Template Content` JSON plans.
5. For legacy slides without `template`, report the compatibility diagnostic from `revela_read_deck_plan`; do not fetch hidden layout/component tools.
6. Fetch chart rules before creating or modifying ECharts.

## Plan Preflight And Repair

Call `revela_read_deck_plan` before HTML generation and treat the result as the render blueprint.

Allowed plan repairs are limited to technical diagnostics from `revela_read_deck_plan`:

- Broken Markdown/frontmatter structure.
- Invalid or missing `sourceLinks` field structure, without adding new unsupported source links.
- Missing or misspelled built-in `template` ids reported by `revela_read_deck_plan`.

Do not redesign the argument structure, add new slides, remove supported slides, rewrite claims, or add source links that were not reviewed or saved by `revela-research`. If normal plan authoring is needed, stop and send the user back to `revela` routing or `revela-research` Planning Handoff.

If a non-structural slide plan has source links but lacks `Claim`, `Reasoning`, or `Audience takeaway`, treat it as synthesis-thin: do not fill the gap by copying raw findings into slide body copy. Report that the plan needs `revela-research` Planning Handoff repair.

## Render Phase

Use this phase when the user asks to make, generate, render, or update an HTML deck and `deck-plan.md` is readable.

1. Call `revela_read_deck_plan` before HTML generation and follow the current projection.
2. Read `htmlWritingBatches` before any HTML write. `revela_read_deck_plan` is QA/diagnostics, not a writer.
3. For new HTML files, call `revela_create_deck_foundation`.
4. Use the deck-plan's `Claim`, `Reasoning`, and `Audience takeaway` as the primary slide copy. Keep finding text in source notes, captions, evidence charts, or speaker notes unless the plan explicitly calls for a direct evidence quote.
5. For template slides, use the deck-plan `template` to create a scaffold with `revela_add_template_scaffold`; use `Template Content` only as seed or compatibility input, not as the final authoring interface.
6. After scaffold insertion, bounded-edit the current slide HTML: preserve `.slide`, `.slide-canvas`, `data-template`, required template classes, and `data-template-slot` semantics.
7. Visual slots may be replaced by image, chart, table, or diagram containers only when the replacement keeps a clear semantic container for QA and export.
8. A single HTML write/edit/apply_patch may add or rewrite at most 5 slide sections.
9. If a chapter is longer than 5 slides, use the consecutive batch parts returned by `revela_read_deck_plan`.
10. Patch slides into the foundation between Revela slide markers.
11. Preserve positive 1-based `data-slide-index` values.
12. Every slide must have exactly one direct `.slide-canvas` child.
13. Keep the HTML valid after each write.
14. After every HTML write, call `revela_run_deck_qa` and repair hard errors before continuing or export.
15. After the final `revela_run_deck_qa` passes with zero hard errors, do not open the deck file directly. Start a read-only local static server from the workspace root and reply with a standalone Markdown link to the generated HTML deck artifact so the user can click it open in Codex Browser.
16. Use the exact `http://127.0.0.1:<port>/decks/<file>.html` URL for the card, replacing `<port>` with the actual localhost port. Keep `file://` only for non-Codex surfaces that allow direct local-file navigation.

## Outputs

- `decks/*.html`.
- Artifact QA status.
- Website card/link for the QA-passed HTML deck.
- Unresolved render/design issues and any plan diagnostics that require `revela-research` Planning Handoff.

## Must Not

- Do not skip or synthesize `deck-plan.md` for normal decks.
- Do not claim ownership of normal plan authoring.
- Do not write a new `deck-plan.md` when it is missing.
- Do not use legacy design inventory names, slots, or components for new slides.
- Do not delete template required classes or slots during bounded edits. If the required structure cannot be satisfied, choose a simpler valid template/component or stop with the contract issue.
- Do not patch more than 5 slide sections in one HTML write.
- Do not invent source links, quotes, URLs, page references, caveats, or licenses.
- Do not write remote image candidates directly into deck HTML; save them as workspace assets first.
- Do not require a Narrative Vault.
