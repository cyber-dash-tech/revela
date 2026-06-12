# ADR 0001: Codex Plugin Adapter

## Status

Accepted for local development. Superseded in part by the Codex-first maintenance policy adopted on 2026-06-12.

## Superseding Note

The original additive-adapter decision kept OpenCode as a peer release surface while Codex support was built. Current policy makes Codex the primary product surface. OpenCode `plugin.ts` remains intact for legacy compatibility, but new features should target the Codex CLI/MCP/plugin surface unless a task explicitly asks for OpenCode legacy maintenance.

## Context

Revela currently ships as an OpenCode plugin. Its main entry point, `plugin.ts`, registers slash commands, OpenCode tools, subagents, prompt injection, and file hooks. Codex plugins use a different model: a plugin manifest can bundle skills, MCP server config, hooks, apps, and assets. The OpenAI Apps SDK MCP server path is for ChatGPT apps and hosted UI components; Revela's near-term Codex surface is local, file-native workspace automation.

## Decision

Build Codex support as an adapter over shared runtime capabilities:

- Add `bin/revela.ts` as the stable local CLI and `revela mcp` entry.
- Add `plugins/revela/` as the Codex plugin package.
- Add `.agents/plugins/marketplace.json` for repo-local installation.
- Expose deterministic capabilities through `lib/runtime/*` and a thin MCP server.
- Use skills for Codex workflow guidance.
- Use Codex hooks only as safety nets.
- Treat the Codex plugin marketplace as optional packaging, not the source of runtime truth.
- Keep OpenCode `plugin.ts` intact for legacy compatibility.

## Consequences

- OpenCode behavior remains available as legacy compatibility while Codex becomes the primary product surface.
- Codex and OpenCode can converge on shared runtime functions over time.
- Local debugging can start from `revela` CLI and MCP smoke tests before testing plugin install state.
- Some OpenCode lifecycle behavior cannot be made exactly equivalent in Codex; skills and MCP tools must explicitly run critical QA steps.
