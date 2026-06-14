# Codex Plugin Capability Matrix

| Revela capability | Legacy OpenCode surface | Codex primary surface | Status |
| --- | --- | --- | --- |
| Workflow routing | `/revela` and prompt injection | `revela` router skill + `revela_doctor`, active design/domain reads, and workspace artifact status across `spec.md`, `researches/`, `deck-plan.md`, and deck artifacts | MVP |
| Help / product guidance | `/revela` and prompt injection | `revela-helper` skill + `revela_doctor`, active design/domain reads, and workspace artifact status | MVP |
| Spec / requirements discovery | Intent capture inside `/revela init` and planning prompts | `revela-spec` skill writes root-level `spec.md` with objective, audience, output, language, domain/use-case framing, design, constraints, gaps, acceptance criteria, and recommended next step | MVP |
| Init workspace | `/revela init`, OpenCode tools | Folded into `revela-research`: local material prepare/extract/review/intake before findings | MVP |
| Research workflow | `/revela research`, research-save tool | `revela-research` skill reads `spec.md` when present + active domain read + `revela_research_save`; for deck goals, Planning Handoff reads active design inventory and writes validated `deck-plan.md` | Tool-backed MVP |
| Deck planning | `/revela plan --deck`, deck-plan prompt | Folded into `revela-research` Planning Handoff: `deck-plan.md` is written after `revela_design_list`, `revela_design_read`, and `revela_design_inventory`; `revela_read_deck_plan` provides QA/diagnostics | MVP |
| Make deck | `/revela make --deck`, deck-render prompt | `revela-make-deck` Render phase requires existing `deck-plan.md`, reads `htmlWritingBatches`, creates foundation, performs layout/component design reads, runs artifact QA, and opens the QA-passed deck in Codex Browser for native annotation | MVP |
| Deck foundation | `revela-deck-foundation` OpenCode tool | `revela_create_deck_foundation` MCP tool | MVP |
| Artifact QA | post-write hook and `revela-qa` tool | `revela_run_deck_qa` MCP tool + hook reminders | MVP |
| PDF export | `/revela export --deck pdf`, `revela-pdf` tool | `revela_export_pdf` MCP tool | MVP |
| PPTX export | `/revela export --deck pptx`, `revela-pptx` tool | `revela_export_pptx` MCP tool | MVP |
| PNG export | `/revela export --deck png`, runtime PNG export | `revela_export_png` MCP tool | MVP |
| Design list/read/author/install/share/activate | `/revela design`, `revela-designs` and `revela-designs-author` tools | `revela-design` skill + design MCP tools, defaulting to draft create/validate/install; `revela_design_pack` shares `.tar`/`.tar.gz` archives and `revela_design_install_archive` installs them; design reads also surface through `revela`, `revela-helper`, `revela-spec`, `revela-research`, and `revela-make-deck` | MVP |
| Domain list/read/author/install/activate | `/revela domain`, `revela-domains` tool | `revela-domain` skill + domain MCP tools, defaulting to draft create/validate/install; domain reads also surface through `revela`, `revela-helper`, `revela-spec`, and `revela-research` | MVP |
| Deck annotation after make | `/revela review --deck`, local Review server (legacy compatibility) | Codex Browser native annotation on the generated `decks/*.html`; no public `revela-review` Codex skill | Codex-native |
| OpenCode prompt transform | `experimental.chat.system.transform` | Not applicable; skills provide guidance | Not ported |
| OpenCode read/write hooks | `tool.execute.before/after` | Codex plugin hooks where supported | Partial |
| OpenCode subagents | `revela-research`, `revela-narrative-reviewer` | Skills and tool-backed workflows first; Codex subagent packaging later | Deferred |

## Codex-First Rule

Codex is the primary product surface. OpenCode entries document legacy compatibility only. New capability rows should define the Codex CLI/MCP/plugin surface first; OpenCode parity is optional and should not be assumed. If a capability is shared, implement it behind a platform-neutral runtime wrapper and keep legacy OpenCode behavior from breaking when practical.
