# Codex Plugin Capability Matrix

| Revela capability | Current OpenCode surface | Codex MVP surface | Status |
| --- | --- | --- | --- |
| Help / product guidance | `/revela` and prompt injection | Plugin manifest, default prompts, skills | MVP |
| Init workspace | `/revela init`, OpenCode tools | `revela-init` skill + MCP QA/compile tools | MVP |
| Research workflow | `/revela research`, research subagent, research-save tool | `revela-research` skill + saved findings files + MCP compile/QA | Partial MVP |
| Story reading | `/revela story`, local HTML story UI | `revela-story` skill + compile narrative + optional file output later | MVP diagnostics first |
| Deck planning | `/revela make --deck`, deck-render prompt | `revela-make-deck` skill + read deck plan + create foundation | MVP |
| Deck foundation | `revela-deck-foundation` OpenCode tool | `revela_create_deck_foundation` MCP tool | MVP |
| Artifact QA | post-write hook and `revela-qa` tool | `revela_run_deck_qa` MCP tool + hook reminders | MVP |
| PDF export | `/revela export --deck pdf`, `revela-pdf` tool | `revela_export_pdf` MCP tool | MVP |
| PPTX export | `/revela export --deck pptx`, `revela-pptx` tool | `revela_export_pptx` MCP tool | MVP |
| Design list/read | `/revela design`, `revela-designs` tool | `revela_design_list`, `revela_design_read` MCP tools | MVP |
| Review deck UI | `/revela review --deck`, local refine server | `revela-review-deck` skill + artifact QA; full UI deferred | Deferred |
| OpenCode prompt transform | `experimental.chat.system.transform` | Not applicable; skills provide guidance | Not ported |
| OpenCode read/write hooks | `tool.execute.before/after` | Codex plugin hooks where supported | Partial |
| OpenCode subagents | `revela-research`, `revela-narrative-reviewer` | Skills first; Codex subagent packaging later | Deferred |

## Compatibility Rule

Codex support must be additive. If a capability is shared, implement it behind a platform-neutral runtime wrapper and keep the OpenCode surface calling the existing code path until tests justify refactoring.

