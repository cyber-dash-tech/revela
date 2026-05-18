import { describe, expect, it } from "bun:test"
import { existsSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { DECKS_STATE_FILE } from "../lib/decks-state"
import { executeDecksTool, tempWorkspace } from "./helpers/tool-helpers"

describe("file-native workspaces", () => {
  it("does not create DECKS.json for read-only deck tool actions", async () => {
    const root = tempWorkspace("revela-file-native-read-")
    try {
      for (const action of ["read", "readDeckPlan", "compileDeckPlan"] as const) {
        const result = await executeDecksTool({ action, summary: true }, root)
        expect(result).toHaveProperty("ok")
        expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("creates the narrative vault without creating DECKS.json", async () => {
    const root = tempWorkspace("revela-file-native-vault-")
    try {
      const result = await executeDecksTool({ action: "initNarrativeVault" }, root)

      expect(result.ok).toBe(true)
      expect(existsSync(join(root, "revela-narrative", "index.md"))).toBe(true)
      expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("registers init diagnostics without creating DECKS.json in fresh workspaces", async () => {
    const root = tempWorkspace("revela-file-native-init-")
    try {
      writeFileSync(join(root, "brief.md"), "# Brief\n", "utf-8")

      const result = await executeDecksTool({
        action: "init",
        sourceMaterials: [{
          path: "brief.md",
          type: "md",
          size: 8,
          fingerprint: "brief-md",
          status: "discovered",
          summary: "Brief",
          bestUsedFor: "Intent",
          firstSeen: "2026-05-18T00:00:00.000Z",
          lastChecked: "2026-05-18T00:00:00.000Z",
        }],
      }, root)

      expect(result.ok).toBe(true)
      expect(result.persisted).toBe(false)
      expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
