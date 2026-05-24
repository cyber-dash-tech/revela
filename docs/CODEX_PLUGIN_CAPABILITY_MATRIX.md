# Codex Plugin Capability Matrix

| Revela capability | Current OpenCode surface | Codex MVP surface | Status |
| --- | --- | --- | --- |
| Help / product guidance | `/revela` and prompt injection | Plugin manifest, default prompts, skills | MVP |
| Init workspace | `/revela init`, OpenCode tools | `revela-init` skill + MCP QA/compile tools | MVP |
| Research workflow | `/revela research`, research subagent, research-save tool | `revela-research` skill + MCP targets/save/evaluate/bind tools + compile/QA | Tool-backed MVP |
| Story reading | `/revela story`, local HTML story UI | `revela-story` skill + `revela_story_read` deterministic map/Markdown tool; HTML/local UI parity remains OpenCode surface | Tool-backed MVP |
| Deck planning | `/revela make --deck`, deck-render prompt | `revela-make-deck` skill + read deck plan + create foundation | MVP |
| Deck foundation | `revela-deck-foundation` OpenCode tool | `revela_create_deck_foundation` MCP tool | MVP |
| Artifact QA | post-write hook and `revela-qa` tool | `revela_run_deck_qa` MCP tool + hook reminders | MVP |
| PDF export | `/revela export --deck pdf`, `revela-pdf` tool | `revela_export_pdf` MCP tool | MVP |
| PPTX export | `/revela export --deck pptx`, `revela-pptx` tool | `revela_export_pptx` MCP tool | MVP |
| Design list/read/activate | `/revela design`, `revela-designs` tool | `revela-design` skill + `revela_design_list`, `revela_design_read`, `revela_design_activate` MCP tools | MVP |
| Domain list/read/activate | `/revela domain`, `revela-domains` tool | `revela-domain` skill + `revela_domain_list`, `revela_domain_read`, `revela_domain_activate` MCP tools | MVP |
| Review deck UI and diagnostics | `/revela review --deck`, local refine server | `revela-review-deck` skill + `revela_review_deck_open` Codex Insight and Apply Fix bridge by default + `revela_review_deck_read` aggregate diagnostics tool | Tool-backed MVP |
| OpenCode prompt transform | `experimental.chat.system.transform` | Not applicable; skills provide guidance | Not ported |
| OpenCode read/write hooks | `tool.execute.before/after` | Codex plugin hooks where supported | Partial |
| OpenCode subagents | `revela-research`, `revela-narrative-reviewer` | Skills and tool-backed workflows first; Codex subagent packaging later | Deferred |

## Compatibility Rule

Codex support must be additive. If a capability is shared, implement it behind a platform-neutral runtime wrapper and keep the OpenCode surface calling the existing code path until tests justify refactoring.
