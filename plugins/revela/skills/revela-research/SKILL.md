---
name: revela-research
description: Research Revela story gaps and bind evidence in Codex while preserving explicit source boundaries.
---

# Revela Research

Use this skill when the user asks to research, close evidence gaps, evaluate saved findings, or bind support to current Revela claims.

## Contract

- Saved findings in `researches/**/*.md` are not canonical evidence until specific evidence nodes or bindings preserve source trace, quote/snippet, support scope, unsupported scope, caveat, and strength.
- Missing evidence must stay visible as a gap.
- Do not broaden claims to fit a source.
- Do not write deck artifacts during research.

## Workflow

1. Call `revela_research_targets` to derive target order, selected target, saved findings diagnostics, and evidence gaps.
2. For existing saved findings, call `revela_evaluate_research_findings` before deciding whether they can support a claim.
3. Use external research only when the user allowed or requested it and the gap is publicly researchable.
4. After external research, call `revela_research_save` with structured Markdown findings and explicit source list.
5. Bind only when `bindingEval.status === "bindable"` by calling `revela_bind_research_findings`; do not hand-author evidence Markdown for bindable saved findings.
6. If a finding is incomplete, report missing fields instead of inventing them.
7. After binding or any narrative edit, call `revela_markdown_qa` and `revela_compile_narrative`.
8. Report evidence bound, unbound findings, remaining caveats, and the next smallest story action.

## Binding Criteria

Bind only when the supported claim exists and the evidence includes:

- source URL/path/findings file
- quote or traceable snippet
- support scope
- unsupported scope
- caveat
- strength
- explicit supported claim context
