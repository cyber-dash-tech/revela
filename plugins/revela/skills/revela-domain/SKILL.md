---
name: revela-domain
description: Create, edit, validate, install, activate, inspect, or list Revela narrative domain packages in Codex using domain MCP tools.
---

# Revela Domain

Use this skill when the user asks to create, customize, edit, validate, install, activate, inspect, list, or switch a Revela narrative domain.

## Contract

- Domains guide narrative authoring: audience framing, decision standards, evidence expectations, objection/risk handling, and research priorities.
- Domain guidance is not evidence and must never be cited as proof for factual claims.
- Default authoring is workspace draft first, then validate, then install only when appropriate.
- Direct user-level creation is reserved for explicit create/install-now requests.
- Do not use design tools for narrative domain work.

## Required Tools

For status, inspection, activation, or selection:

1. Call `revela_domain_list`.
2. Call `revela_domain_read` when the user asks for detail or comparison.
3. Call `revela_domain_activate` only when the user asks to use a domain.

For new or edited domains:

1. Call `revela_domain_list`.
2. Read a relevant existing domain with `revela_domain_read` when useful as a reference.
3. Draft complete `INDUSTRY.md` content.
4. Call `revela_domain_draft_create`.
5. Call `revela_domain_draft_validate`.
6. If validation fails, revise the draft content and repeat draft create/validate.
7. Call `revela_domain_draft_install` only after the draft validates and the user intent is to install it.
8. Call `revela_domain_activate` only when the user asks to make it active.

Use `revela_domain_create` only when the user explicitly requests direct local creation outside the workspace draft workflow. Follow it with `revela_domain_validate`.

## Domain Package Requirements

- Use a kebab-case domain name.
- `INDUSTRY.md` must be complete domain guidance, not a research report.
- Include audience/decision framing, claim standards, evidence expectations, objection/risk guidance, and research-gap priorities.
- Keep guidance procedural and reusable; do not include unsupported factual claims as evidence.
- Preserve source limitations explicitly when domain guidance is based on user-provided context.

## Outputs

- Domain draft path/status or installed domain name.
- Validation result and any remaining diagnostics.
- Whether the domain was activated.
- Next step, usually `revela-research` so the active domain informs material intake and planning.

## Must Not

- Do not write `researches/**/*.md`, `deck-plan.md`, or `decks/*.html`.
- Do not install or activate a domain unless the user requested that outcome.
- Do not treat domain guidance as source evidence.
- Do not invent citations, claims, URLs, or industry facts.
