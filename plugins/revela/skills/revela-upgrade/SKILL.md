---
name: revela-upgrade
description: Guide Revela Codex plugin upgrade, update, version, and reinstall requests while checking the running runtime version first.
---

# Revela Upgrade

Use this skill when the user asks how to upgrade, update, reinstall, or check the version of the Revela Codex plugin.

## Workflow

1. Call `revela_doctor` first to inspect the currently running Revela runtime version.
2. Report the current runtime version from doctor output. Do not check the latest version online unless the user explicitly asks you to look it up.
3. Explain that the Codex Git marketplace ref and `.mcp.json` npm runtime pin are published together for the same Revela release.
4. If the user wants a fixed release, guide them through removing the installed plugin, removing the marketplace entry, adding the desired release tag, then adding the plugin again:

```bash
codex plugin remove revela@revela
codex plugin marketplace remove revela
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref vX.Y.Z
codex plugin add revela@revela
```

5. If the user already tracks a branch or movable ref, guide them through upgrading the marketplace clone, then re-adding the plugin:

```bash
codex plugin marketplace upgrade revela
codex plugin add revela@revela
```

6. Tell the user to start a new Codex thread after upgrading so Codex reloads the Revela skills, MCP tools, hooks, and runtime pin.

Do not run `codex plugin remove`, `codex plugin marketplace remove`, `codex plugin marketplace add`, `codex plugin marketplace upgrade`, or `codex plugin add` unless the user explicitly asks you to perform the upgrade or reinstall.
