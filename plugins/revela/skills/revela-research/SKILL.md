---
name: revela-research
description: Research workspace materials and public sources for a Revela deck objective, using active domain guidance and saving source-linked findings.
---

# Revela Research

Use this skill when the user asks to start from a goal, inspect local materials, research missing inputs, gather public support, save findings, or find source-linked examples/assets for a deck.

## Contract

- Research is the source-preparation workflow for Codex Revela.
- Research output is saved under `researches/**/*.md` for later `deck-plan.md` use.
- Local materials are only usable after direct text review or extracted read-view review.
- Active/requested domain guidance informs audience, decision framing, claim standards, evidence expectations, objection/risk interpretation, and research-gap priority.
- Domain guidance is not evidence and must never be cited as proof for factual claims.
- Do not create `deck-plan.md`, deck artifacts, a Narrative Vault, or canonical evidence bindings during research.
- Do not invent URLs, quotes, page references, numbers, caveats, or licenses.

## Preconditions

- The user provides at least one of: objective, topic, audience, decision/action, source materials, or deck intent.
- If intent is unclear, inspect the workspace first and ask only the smallest missing high-impact questions.

## Inputs

- User objective, constraints, audience, decision/action, and language preference when available.
- Workspace materials, extracted material read views, existing `researches/**/*.md`, existing `deck-plan.md`, and `assets/`.
- Active or user-requested domain guidance.
- Optional external public sources when needed and allowed.

## Required Tool Order

1. Call `revela_domain_list`.
2. Call `revela_domain_read` for the active domain or user-requested domain.
3. Call `revela_prepare_local_materials`.
4. For Office/PDF sources, read the provided `allowedReadPath` / `read_view_path`; if missing, call `revela_extract_document_materials`.
5. Read original text/Markdown/CSV files or extracted read views before treating a material as usable.
6. Call `revela_record_material_review` for each reviewed Office/PDF source.
7. Call `revela_check_material_intake` before reporting research readiness.
8. Use external research only for public facts, user-authorized questions, or gaps not covered by local materials.
9. Save useful findings with `revela_research_save`.

## Finding Requirements

Each saved finding should include:

- Source URL or workspace path.
- Quote/snippet or explicit note when no exact quote is available.
- What it supports.
- What it does not support.
- Caveat or limitation.
- Date checked.
- Optional image/logo/screenshot leads with known source and license/attribution status.

If a finding is context only, label it as context and do not present it as proof.

## Outputs

- `researches/{topic}/{filename}.md`
- Material review records for reviewed Office/PDF sources.
- Source limitations and unresolved gaps.
- A clear statement of whether `revela-make-deck` can proceed or whether more research is needed.

## Must Not

- Do not generate `revela-narrative/`.
- Do not write `deck-plan.md`.
- Do not write `decks/*.html`.
- Do not bind findings into a Narrative Vault or canonical evidence graph.
- Do not treat domain guidance as source evidence.
