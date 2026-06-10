# Codex Plugin Smoke Checklist

## Purpose

Use this checklist to verify that the Revela CLI/MCP runtime and optional local Codex plugin can run a file-native Revela workflow from Codex.

## CLI/MCP First

From the Revela repository root:

```bash
bun bin/revela.ts doctor
bun scripts/codex-mcp-smoke.ts bin/revela.ts mcp
bun scripts/codex-mcp-smoke.ts bin/revela.ts mcp --raw
```

Expected:

- `doctor` returns JSON with `ok: true`.
- Both MCP smokes return `initialize` and `tools/list` responses containing `revela_doctor`, `revela_story_read`, `revela_review_deck_read`, `revela_review_deck_open`, `revela_design_activate`, and `revela_domain_activate`.
- `revela review-read --file <deck.html>` is available for CLI-level Review diagnostics after a deck exists.

## Install Or Refresh

From the Revela repository root:

```bash
codex plugin marketplace add .
codex plugin add revela@revela
```

For Git marketplace installs, use the full repository ref. Do not install with `--sparse plugins/revela`; the Codex plugin resolves the shared runtime, built-in designs, and domains from the repository snapshot.

Start a new Codex thread after reinstalling. Codex loads plugin skills, MCP config, and hooks at thread startup.

Verify local state:

```bash
codex plugin list
codex mcp list
bun scripts/codex-mcp-smoke.ts bin/revela.ts mcp
```

Expected:

- `revela@revela` is installed and enabled.
- MCP server `revela` is enabled.
- The local MCP smoke through `bin/revela.ts mcp` prints an `initialize` response and a `tools/list` response containing `revela_doctor`, `revela_story_read`, `revela_review_deck_read`, `revela_review_deck_open`, `revela_design_activate`, and `revela_domain_activate`.

## Normal Smoke Flow

Run the smoke in a separate workspace, not the Revela source repository.

1. Choose the narrative domain before authoring.

```text
Use Revela to list available domains, switch to the general domain, and use that framing for the narrative workflow.
```

2. Choose the deck design before rendering.

```text
Use Revela to list available designs, switch to the starter design, and use it for the next deck.
```

3. Initialize the narrative from local materials.

```text
Use Revela to initialize this workspace. Read the local materials, identify the audience, decision, thesis, claims, existing evidence, risks, objections, and gaps, then create or update the narrative vault.
```

4. Research the gaps and bind only source-supported evidence.

```text
Use Revela research to inspect the current narrative gaps, derive research targets, gather or evaluate findings, save research under researches/, and bind only source-supported evidence back into the narrative vault.
```

5. Read Story before rendering.

```text
Use Revela Story to show the current claim flow, evidence support, caveats, unsupported scope, and open gaps.
```

6. Create or update the deck plan before generating HTML.

```text
Use Revela to create or update the deck plan before generating HTML. Read the current narrative, inspect any existing deck-plan/, define the slide order, chapter structure, evidence trace, caveats, and visual intent, then report the plan diagnostics.
```

7. Make an HTML deck from the deck plan and repair hard QA errors.

```text
Use Revela to make a deck from the current deck plan and narrative. Generate an HTML deck under decks/, run deck QA, and repair hard QA errors before review or export.
```

8. Review the generated deck.

```text
Use Revela to review the generated deck. Open the Review UI for the HTML deck and also summarize diagnostics.
```

9. Export PDF.

```text
Use Revela to export the deck to PDF.
```

10. Export PPTX.

```text
Use Revela to export the deck to PPTX.
```

During the smoke, confirm Codex uses the corresponding MCP tools: `revela_doctor`, `revela_domain_activate`, `revela_design_activate`, `revela_design_pack`, `revela_design_install_archive`, `revela_markdown_qa`, `revela_compile_narrative`, `revela_research_targets`, `revela_research_save`, `revela_evaluate_research_findings`, `revela_bind_research_findings`, `revela_story_read`, `revela_read_deck_plan`, `revela_create_deck_foundation`, `revela_run_deck_qa`, `revela_review_deck_open`, `revela_review_deck_read`, `revela_export_pdf`, and `revela_export_pptx`.

## Expected Result

- Markdown QA passes or reports explicit repair cards.
- Narrative compile passes or reports explicit vault diagnostics.
- Deck-plan read returns slide projections and diagnostics.
- Deck foundation creates a valid active-design shell.
- Domain list/read/author/install/activate tools are discoverable, and domain guidance is treated as framing rather than evidence.
- Design list/read/author/install/activate tools are discoverable, and active design guidance is read before selecting layouts/components.
- Artifact QA passes with `hardErrorCount: 0`.
- Story reading returns a deterministic map or Markdown view from `revela-narrative/`.
- Review deck open returns a local Review URL hosted by the MCP process with saved comments and the `codex-exec` Apply bridge.
- Review deck reading returns artifact QA, deck-plan/narrative diagnostics, and skipped legacy inspection context when diagnostics are explicitly requested.

## Known Smoke Notes

- MCP tools should be available through normal Codex tool discovery in a new thread after plugin reinstall.
- If tools are not discoverable, check `codex mcp list`, reinstall the plugin, and start another new thread.
- If Codex reports `MCP startup incomplete (failed: revela)`, run `codex mcp get revela` and confirm the plugin wrapper resolves the repo `bin/revela.ts` entry rather than a machine-specific stale server path or a literal `${PLUGIN_ROOT}` placeholder.
- The plugin wrapper locates the CLI from the current source checkout, the `revela` marketplace source in `~/.codex/config.toml`, the legacy `revela-local` marketplace source, or the installed Codex plugin cache when available.
- If Codex reports a 30-second MCP startup timeout but `bun scripts/codex-mcp-smoke.ts bin/revela.ts mcp` passes, try one new Codex session with `-c 'mcp_servers.revela.startup_timeout_sec=60'` and inspect `~/.codex/log/codex-tui.log` for the `revela` startup lines.
- Direct JSON-RPC invocation of `plugins/revela/mcp/revela-server.ts` is a developer fallback only.
- Browser-based QA and export may require user-approved command escalation in sandboxed Codex sessions.
- Standalone smoke decks may warn that they are not the active legacy deck target; this is non-blocking when the requested artifact passes hard QA.
- Text clipping on smoke covers should be fixed by reducing title size, line length, padding, or line-height.

## Debug Fallback

If normal Codex MCP discovery fails, a developer can call the MCP server directly:

```bash
bun scripts/codex-mcp-smoke.ts bin/revela.ts mcp
```

For a single tool call without the Codex client:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"revela_doctor","arguments":{"workspaceRoot":"/path/to/workspace"}}}' \
  | bun plugins/revela/mcp/revela-server.ts
```

Set `REVELA_REPO_ROOT=/path/to/revela` only when testing the MCP server outside the source checkout or installed Codex marketplace cache.

Do not present direct JSON-RPC as the normal product workflow.
