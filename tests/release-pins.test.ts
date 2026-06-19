import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import pkg from "../package.json"
const repoRoot = join(import.meta.dir, "..")

describe("release pins", () => {
  it("launches the Codex MCP server from the installed plugin cache", () => {
    const config = JSON.parse(readFileSync(join(repoRoot, "plugins", "revela", ".mcp.json"), "utf-8"))
    const server = config.mcpServers.revela

    expect(server).toEqual({
      cwd: ".",
      command: "bun",
      args: ["./mcp/revela-server.ts"],
    })
  })

  it("keeps README Codex install guidance aligned with the plugin launcher", () => {
    const expectedPluginLauncher = "bun ./mcp/revela-server.ts"
    const defaultMarketplaceInstall = "codex plugin marketplace add https://github.com/cyber-dash-tech/revela"
    const pinnedMarketplaceInstall = "codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref vX.Y.Z"

    for (const file of ["README.md", "README.zh-CN.md"]) {
      const text = readFileSync(join(repoRoot, file), "utf-8")

      expect(text).toContain(expectedPluginLauncher)
      expect(text).toContain(defaultMarketplaceInstall)
      expect(text).toContain(pinnedMarketplaceInstall)
      expect(text).not.toContain("codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v0.")
    }
  })

  it("keeps the Codex plugin manifest version aligned with the package version", () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, "plugins", "revela", ".codex-plugin", "plugin.json"), "utf-8"))

    expect(manifest.version).toBe(pkg.version)
  })
})
