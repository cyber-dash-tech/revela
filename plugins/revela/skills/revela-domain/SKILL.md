---
name: revela-domain
description: Use or switch Revela narrative domain guidance in Codex for init, research, and story work.
---

# Revela Domain

Use this skill when the user asks about Revela domains, wants domain-specific narrative guidance, asks to switch the active domain, or asks to create a new domain.

## Workflow

1. Call `revela_domain_list` to inspect installed domains and the active domain.
2. Call `revela_domain_read` for the active or requested domain.
3. When the user asks to switch domains for future narrative work, call `revela_domain_activate` with the requested domain name, then read the active domain again.
4. Use domain guidance for audience, decision, claim framing, objections, risks, and research-gap interpretation.
5. Do not treat domain guidance as evidence, source material, or proof for factual claims.

Domain changes are narrative-framing preferences. They do not rewrite existing claims, evidence boundaries, artifacts, or deck plans unless the user asks for those updates.

## Creating Or Editing Domains

When the user asks to create a new domain, interview the user before saving anything. Collect the communication context, typical audience, decisions, claim patterns, evidence expectations, common objections, risks, research-gap heuristics, terminology to use, and terminology to avoid. Summarize the domain brief, then wait for the user to confirm before creating files.

After confirmation, generate complete `INDUSTRY.md` content and call `revela_domain_draft_create` to save a workspace-local draft under `.revela/drafts/domains/<name>/`. Always call `revela_domain_draft_validate` after draft creation or overwrite.

Install the draft globally only after the user confirms the validated draft should be installed. Call `revela_domain_draft_install` to copy the draft into the user-level domain registry. If a user-level domain already exists, pass `overwrite: true` only after the user confirms replacement. In sandboxed Codex sessions, the install step may require permission to write Revela user config under `~/.config/revela`.

`INDUSTRY.md` must include frontmatter with `name`, `description`, `author`, and `version`, followed by concrete narrative guidance for audience framing, decision framing, claim standards, evidence expectations, objection/risk handling, and research-gap interpretation.

Do not automatically activate a newly installed domain. Report the draft path, installed path when installed, and tell the user they can activate it with `revela_domain_activate`.
