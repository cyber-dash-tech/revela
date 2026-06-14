---
name: revela-research
description: Research from an existing or emerging Revela spec.md and public/workspace sources, using active domain/design guidance to save source-linked findings and hand off deck-plan.md.
---

# Revela Research

Use this skill when the user asks to start from a goal, inspect local materials, research missing inputs, gather public support, save findings, find source-linked examples/assets, or prepare the deck planning handoff.

## Contract

- Research is the source-preparation workflow for Codex Revela.
- Prefer root-level `spec.md` as the demand contract. If it is missing or the objective is unclear, route to `revela-spec` unless the user gave enough intent to research immediately.
- Research output is saved under `researches/**/*.md` and, when the user goal is a deck and materials are sufficient, handed off as `deck-plan.md`.
- Local materials are only usable after direct text review or extracted read-view review.
- Active/requested domain guidance informs audience, decision framing, claim standards, evidence expectations, objection/risk interpretation, and research-gap priority.
- Domain guidance is not evidence and must never be cited as proof for factual claims.
- Active/requested design tools define valid layouts, slots, components, nesting hints, and deck-plan design vocabulary.
- `deck-plan.md` is the formal research-to-make-deck handoff when a deck objective is sufficiently supported.
- Do not create deck artifacts, a Narrative Vault, or canonical evidence bindings during research.
- Do not invent URLs, quotes, page references, numbers, caveats, or licenses.

## Preconditions

- The user provides at least one of: existing `spec.md`, objective, topic, audience, decision/action, source materials, or deck intent.
- If intent is unclear, inspect the workspace first and ask only the smallest missing high-impact questions.

## Inputs

- Root-level `spec.md` when present.
- User objective, constraints, audience, decision/action, and language preference when available.
- Workspace materials, extracted material read views, existing `researches/**/*.md`, existing `deck-plan.md`, and `assets/`.
- Active or user-requested domain guidance.
- Optional external public sources when needed and allowed.

## Required Tool Order

1. Call `revela_domain_list`.
2. Call `revela_domain_read` for the active domain or user-requested domain.
3. Read `spec.md` when present and use it to scope material review, findings, and deck-plan handoff.
4. Call `revela_prepare_local_materials`.
5. For Office/PDF sources, read the provided `allowedReadPath` / `read_view_path`; if missing, call `revela_extract_document_materials`.
6. Read original text/Markdown/CSV files or extracted read views before treating a material as usable.
7. Call `revela_record_material_review` for each reviewed Office/PDF source.
8. Call `revela_check_material_intake` before reporting research readiness.
9. Use external research only for public facts, user-authorized questions, or gaps not covered by local materials or `spec.md`.
10. Save useful findings with `revela_research_save`.
11. For deck goals with sufficient materials, run Planning Handoff:
    - Call `revela_design_list`.
    - Call `revela_design_read` with `section: "rules"` for the active/requested design.
    - Call `revela_design_inventory`.
    - When a chosen component has a `contract` field, preserve that contract in the visual brief/render notes so Make Deck renders the required internal structure instead of a simplified lookalike.
    - Write `deck-plan.md` directly from reviewed materials, saved findings, assets, user intent, active domain framing, and active design vocabulary.
    - Call `revela_read_deck_plan` after writing `deck-plan.md`.
    - If diagnostics report `sourceLinks`, layout, slot, component, or `children` issues, patch `deck-plan.md` directly and call `revela_read_deck_plan` again.

## Finding Requirements

Saved research should use stable, reusable Markdown blocks. Evidence findings use:

```md
## Finding: <stable-id>

Source: <source name and date when known>
URL: <source URL when available>
Location: <page/slide/sheet/section when known>
Quote/Snippet: <short exact quote or compact snippet; note when no exact quote is available>
Supports: <narrow support scope or intended slide/source context>
Evidence boundary: <internal guardrail; what this finding does not prove>
Strength: <strong|directional|weak|context-only>
Deck use: <where this belongs in deck planning>
Display note: <optional short user-facing scope note for captions/source notes>
```

Use synthesis blocks to turn multiple findings into decision-relevant interpretation before deck planning:

```md
## Synthesis: <stable-id>

Question answered: <research question this synthesis resolves>
Basis: <finding ids, source files, or URLs used>
Interpretation: <what the evidence means when read together>
So what: <why this matters for the audience or decision>
Decision implication: <what should change in the recommendation, story, or slide argument>
Confidence: <high|medium|low>
Alternative reading: <plausible competing interpretation or contradiction>
Evidence boundary: <internal guardrail; what this synthesis must not overclaim>
Deck use: <where this belongs in deck planning>
Display note: <optional short user-facing scope note>
```

Use `## Analysis: <stable-id>` for user/LLM analytical frameworks, `## Implementation Note: <stable-id>` for render/data/API contracts, `## Asset Lead: <stable-id>` for image/logo/media leads, and `## Gaps` for missing or insufficient source support.

Each saved evidence finding should include:

- Source URL or workspace path.
- Quote/snippet or explicit note when no exact quote is available.
- What it supports.
- `Evidence boundary` for internal support limits, unsupported scope, or uncertainty.
- `Deck use` for likely planning placement.
- Optional `Display note` for short audience-facing scope text.
- Date checked.
- Optional image/logo/screenshot leads with known source and license/attribution status.

If a finding is context only, label it as context and do not present it as proof. Internal boundaries must not be mechanically copied into deck text; use `Display note` for default visible caption/source-note scope, and expose `Evidence boundary` only when needed to avoid a misleading audience conclusion.

Do not use raw findings as the default deck argument. For deck goals, synthesize findings first; findings provide evidence basis, while `Synthesis` provides the interpretation, decision implication, and audience takeaway that should drive `deck-plan.md`.

## Outputs

- `researches/{topic}/{filename}.md`
- Material review records for reviewed Office/PDF sources.
- `deck-plan.md` when the user goal is a deck and reviewed materials/findings are sufficient for a traceable plan.
- Source limitations and unresolved gaps.
- A clear statement of whether `revela-make-deck` can proceed or whether more research is needed.

## Planning Handoff

Use this final stage only for deck goals. If sources are too thin, report unresolved inputs and source limitations instead of drafting unsupported slides.

Every `deck-plan.md` handoff should include Cover, Table of Contents, Closing, 3-5 chapter headings, explicit slide ranges, and `---` slide separators under `## Slides`.

Each non-structural slide block must include:

- Slide title and role when relevant.
- `#### Content Plan`
- In `#### Content Plan`: `Claim`, `Reasoning`, `Audience takeaway`, `Evidence basis`, and `Boundary handling`.
- `#### Source Links` for materials, finding-level references when available, assets, URLs, and caveats.
- `#### Design Plan`
- Selected layout from design inventory.
- Component plan using component names from design inventory.
- Valid slots from the selected layout.
- Valid component nesting hints, including `box.children` when multiple child components support one semantic idea.
- Base slide arguments on `Synthesis` blocks when available; use finding text as evidence/source context, not as default body copy.
- Use `Display note` for short visible caption/source-note scope.
- Keep `Evidence boundary` internal unless it is required to avoid a misleading audience conclusion.
- `Analysis` and `Implementation Note` entries may support deck structure or rendering, but must not be cited as external factual proof.
- Unresolved inputs, source limitations, and user review notes instead of AI-authored caveat/risk judgement.

Do not duplicate the same child as both nested and top-level. Do not add source links that were not reviewed or saved during research.

## Must Not

- Do not generate `revela-narrative/`.
- Do not write `spec.md`; route demand changes to `revela-spec`.
- Do not write `decks/*.html`.
- Do not bind findings into a Narrative Vault or canonical evidence graph.
- Do not treat domain guidance as source evidence.
