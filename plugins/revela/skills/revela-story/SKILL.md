---
name: revela-story
description: Inspect a Revela narrative graph in Codex without mutating artifacts or canonical meaning.
---

# Revela Story

Use this skill when the user asks to view, inspect, understand, or audit the current Revela story.

## Workflow

1. Call `revela_compile_narrative`.
2. Call `revela_markdown_qa` if a vault is present.
3. Present audience, belief shift, decision/action, thesis, central claims, evidence, objections, risks, research gaps, and diagnostics.
4. Keep claim ids, evidence ids, source facts, quotes, URLs, numbers, and caveats exact.
5. Do not write deck HTML, bind evidence, or alter canonical narrative unless the user explicitly asks.

## Output

Lead with the narrative status and key diagnostics. Then show the claim flow and evidence boundaries. Separate structural Markdown QA from evidence trust.

