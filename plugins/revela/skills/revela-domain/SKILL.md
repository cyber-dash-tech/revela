---
name: revela-domain
description: Use or switch Revela narrative domain guidance in Codex for init, research, and story work.
---

# Revela Domain

Use this skill when the user asks about Revela domains, wants domain-specific narrative guidance, or asks to switch the active domain.

## Workflow

1. Call `revela_domain_list` to inspect installed domains and the active domain.
2. Call `revela_domain_read` for the active or requested domain.
3. When the user asks to switch domains for future narrative work, call `revela_domain_activate` with the requested domain name, then read the active domain again.
4. Use domain guidance for audience, decision, claim framing, objections, risks, and research-gap interpretation.
5. Do not treat domain guidance as evidence, source material, or proof for factual claims.

Domain changes are narrative-framing preferences. They do not rewrite existing claims, evidence boundaries, artifacts, or deck plans unless the user asks for those updates.
