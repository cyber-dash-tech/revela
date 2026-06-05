---
name: revela-research
description: Research source-linked findings for a Revela deck plan while preserving explicit source boundaries.
---

# Revela Research

Use this skill when the user asks to research missing deck inputs, gather public support, save findings, or find source-linked examples/assets for a deck.

## Contract

- Research output is saved under `researches/**/*.md` for deck-plan use.
- Do not bind findings into a Narrative Vault or canonical evidence graph.
- Do not create deck artifacts during research.
- Do not invent URLs, quotes, page references, numbers, caveats, or licenses.

## Workflow

1. Inspect material intake status, material review files, existing `researches/**/*.md`, and `deck-plan/` when present.
2. Identify the smallest research tasks needed for the deck objective: market facts, benchmarks, examples, source quotes, images/logos/screenshots, or caveats.
3. Use external research only for public facts or user-authorized questions.
4. Save useful findings with `revela_research_save`.
5. Each finding should include source URL/path, quote/snippet, what it supports, what it does not support, caveat, date checked, and optional image leads.
6. If a finding is context only, label it as context and do not present it as proof.

## Report

- Start with `Research: completed`.
- List saved findings paths, source limitations, unresolved inputs, and whether `/revela plan --deck` can proceed.
