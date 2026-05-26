---
name: revela-export
description: Export Revela deck artifacts from Codex to PDF or PPTX.
---

# Revela Export

Use this skill when the user asks to export a Revela deck.

## Workflow

1. Resolve the target HTML deck path.
2. For PDF, call `revela_export_pdf`.
3. For PPTX, call `revela_export_pptx`.
4. Report output path or export errors.

`revela_run_deck_qa`, `revela_export_pdf`, and `revela_export_pptx` may launch a browser. In sandboxed Codex sessions, request user-approved command escalation when the browser cannot start inside the default sandbox.

Deck writes run post-write QA automatically. Do not run artifact QA as a pre-export blocker unless the user explicitly asks for diagnostics.

Do not treat narrative gaps as export blockers unless they affect technical artifact validity or data safety.
