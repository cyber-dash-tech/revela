# ADR 0001: Codex Plugin Adapter

## Status

Accepted for local development.

## Context

Revela currently ships as an OpenCode plugin. Its main entry point, `plugin.ts`, registers slash commands, OpenCode tools, subagents, prompt injection, and file hooks. Codex plugins use a different model: a plugin manifest can bundle skills, MCP server config, hooks, apps, and assets. The OpenAI Apps SDK MCP server path is for ChatGPT apps and hosted UI components; Revela's near-term Codex surface is local, file-native workspace automation.

## Decision

Build Codex support as an additive adapter:

- Add `bin/revela.ts` as the stable local CLI and `revela mcp` entry.
- Add `plugins/revela/` as the Codex plugin package.
- Add `.agents/plugins/marketplace.json` for repo-local installation.
- Expose deterministic capabilities through `lib/runtime/*` and a thin MCP server.
- Use skills for Codex workflow guidance.
- Use Codex hooks only as safety nets.
- Treat the Codex plugin marketplace as optional packaging, not the source of runtime truth.
- Keep OpenCode `plugin.ts` intact.

## Consequences

- OpenCode behavior remains stable while Codex support develops.
- Codex and OpenCode can converge on shared runtime functions over time.
- Local debugging can start from `revela` CLI and MCP smoke tests before testing plugin install state.
- Some OpenCode lifecycle behavior cannot be made exactly equivalent in Codex; skills and MCP tools must explicitly run critical QA steps.
