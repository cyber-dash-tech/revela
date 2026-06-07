# Codex Plugin Capability Matrix

| Revela capability | Current OpenCode surface | Codex MVP surface | Status |
| --- | --- | --- | --- |
| Help / product guidance | `/revela` and prompt injection | `revela-helper` skill + `revela_doctor`, active design/domain reads, and workspace artifact status | MVP |
| Init workspace | `/revela init`, OpenCode tools | Folded into `revela-research`: local material prepare/extract/review/intake before findings | MVP |
| Research workflow | `/revela research`, research-save tool | `revela-research` skill + active domain read + `revela_research_save`; findings stay source-linked until used by deck-plan | Tool-backed MVP |
| Deck planning | `/revela plan --deck`, deck-plan prompt | `revela-make-deck` Plan phase writes `deck-plan.md` directly after `revela_design_list`, `revela_design_read`, and `revela_design_inventory`; `revela_read_deck_plan` provides QA/diagnostics | MVP |
| Make deck | `/revela make --deck`, deck-render prompt | `revela-make-deck` Render phase + create foundation + layout/component design reads + artifact QA | MVP |
| Deck foundation | `revela-deck-foundation` OpenCode tool | `revela_create_deck_foundation` MCP tool | MVP |
| Artifact QA | post-write hook and `revela-qa` tool | `revela_run_deck_qa` MCP tool + hook reminders | MVP |
| PDF export | `/revela export --deck pdf`, `revela-pdf` tool | `revela_export_pdf` MCP tool | MVP |
| PPTX export | `/revela export --deck pptx`, `revela-pptx` tool | `revela_export_pptx` MCP tool | MVP |
| PNG export | `/revela export --deck png`, runtime PNG export | `revela_export_png` MCP tool | MVP |
| Design list/read/activate | `/revela design`, `revela-designs` tool | Design MCP tools surfaced through `revela-helper` and required inside `revela-make-deck` | MVP |
| Domain list/read/activate | `/revela domain`, `revela-domains` tool | Domain MCP tools surfaced through `revela-helper` and required inside `revela-research` | MVP |
| Review deck UI and diagnostics | `/revela review --deck`, local Review server | `revela-review` skill + `revela_review_deck_open` QA/Comment UI + `revela_review_deck_read` aggregate diagnostics tool | Tool-backed MVP |
| OpenCode prompt transform | `experimental.chat.system.transform` | Not applicable; skills provide guidance | Not ported |
| OpenCode read/write hooks | `tool.execute.before/after` | Codex plugin hooks where supported | Partial |
| OpenCode subagents | `revela-research`, `revela-narrative-reviewer` | Skills and tool-backed workflows first; Codex subagent packaging later | Deferred |

## Compatibility Rule

Codex support must be additive. If a capability is shared, implement it behind a platform-neutral runtime wrapper and keep the OpenCode surface calling the existing code path until tests justify refactoring.
