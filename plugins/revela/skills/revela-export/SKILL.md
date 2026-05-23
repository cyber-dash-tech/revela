---
name: revela-export
description: Export Revela deck artifacts from Codex to PDF or PPTX after artifact QA.
---

# Revela Export

Use this skill when the user asks to export a Revela deck.

## Workflow

1. Resolve the target HTML deck path.
2. Call `revela_run_deck_qa` before export.
3. If QA hard errors exist, repair the HTML before exporting.
4. For PDF, call `revela_export_pdf`.
5. For PPTX, call `revela_export_pptx`.
6. Report output path and any export diagnostics.

`revela_run_deck_qa`, `revela_export_pdf`, and `revela_export_pptx` may launch a browser. In sandboxed Codex sessions, request user-approved command escalation when the browser cannot start inside the default sandbox.

Do not treat narrative gaps as export blockers unless they affect technical artifact validity or data safety.
