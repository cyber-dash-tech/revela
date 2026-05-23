# Codex Plugin Smoke Checklist

## Purpose

Use this checklist to verify that the local Revela Codex plugin can run a file-native Revela workflow from Codex, not only install successfully.

## Install Or Refresh

From the Revela repository root:

```bash
codex plugin marketplace add .
codex plugin add revela@revela-local
```

Start a new Codex thread after reinstalling. Codex loads plugin skills, MCP config, and hooks at thread startup.

Verify local state:

```bash
codex plugin list
codex mcp list
bun scripts/codex-mcp-smoke.ts
```

Expected:

- `revela@revela-local` is installed and enabled.
- MCP server `revela` is enabled.
- The local MCP smoke prints an `initialize` response and a `tools/list` response containing `revela_doctor`.

## Normal Smoke Flow

Run the smoke in a separate workspace, not the Revela source repository.

1. Ask Codex to use Revela to initialize the workspace.
2. Confirm Codex can call `revela_doctor`.
3. Ask Codex to run `revela_markdown_qa` and `revela_compile_narrative`.
4. Ask Codex to create or read `deck-plan/`.
5. Ask Codex to call `revela_create_deck_foundation` for a smoke deck.
6. Add a minimal valid slide set.
7. Ask Codex to call `revela_run_deck_qa`.
8. Repair hard QA errors and rerun QA.

## Expected Result

- Markdown QA passes or reports explicit repair cards.
- Narrative compile passes or reports explicit vault diagnostics.
- Deck-plan read returns slide projections and diagnostics.
- Deck foundation creates a valid active-design shell.
- Artifact QA passes with `hardErrorCount: 0`.

## Known Smoke Notes

- MCP tools should be available through normal Codex tool discovery in a new thread after plugin reinstall.
- If tools are not discoverable, check `codex mcp list`, reinstall the plugin, and start another new thread.
- If Codex reports `MCP startup incomplete (failed: revela)`, run `codex mcp get revela` and confirm the args use the `bun --eval` launcher, not a machine-specific absolute path or a literal `${PLUGIN_ROOT}` placeholder.
- The launcher locates the MCP server from the current source checkout, the `revela-local` marketplace source in `~/.codex/config.toml`, or the installed Codex plugin cache.
- If Codex reports a 30-second MCP startup timeout but `bun scripts/codex-mcp-smoke.ts` passes, try one new Codex session with `-c 'mcp_servers.revela.startup_timeout_sec=60'` and inspect `~/.codex/log/codex-tui.log` for the `revela` startup lines.
- Direct JSON-RPC invocation of `plugins/revela/mcp/revela-server.ts` is a developer fallback only.
- Browser-based QA and export may require user-approved command escalation in sandboxed Codex sessions.
- Standalone smoke decks may warn that they are not the active legacy deck target; this is non-blocking when the requested artifact passes hard QA.
- Text clipping on smoke covers should be fixed by reducing title size, line length, padding, or line-height.

## Debug Fallback

If normal Codex MCP discovery fails, a developer can call the MCP server directly:

```bash
bun scripts/codex-mcp-smoke.ts
```

For a single tool call without the Codex client:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"revela_doctor","arguments":{"workspaceRoot":"/path/to/workspace"}}}' \
  | bun plugins/revela/mcp/revela-server.ts
```

Set `REVELA_REPO_ROOT=/path/to/revela` only when testing the MCP server outside the source checkout or installed Codex marketplace cache.

Do not present direct JSON-RPC as the normal product workflow.
