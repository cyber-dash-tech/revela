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

  it("keeps README Codex install pins aligned with the package version", () => {
    const expectedPluginLauncher = "bun ./mcp/revela-server.ts"
    const expectedMarketplaceRef = `codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v${pkg.version}`

    for (const file of ["README.md", "README.zh-CN.md"]) {
      const text = readFileSync(join(repoRoot, file), "utf-8")

      expect(text).toContain(expectedPluginLauncher)
      expect(text).toContain(expectedMarketplaceRef)
    }
  })
})
