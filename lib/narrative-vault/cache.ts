import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { narrativeVaultCachePath } from "./paths"
import type { NarrativeVaultCompileResult } from "./types"

export function writeNarrativeVaultCache(workspaceRoot: string, result: NarrativeVaultCompileResult): void {
  const cacheDir = narrativeVaultCachePath(workspaceRoot)
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(join(cacheDir, "compiled-narrative.json"), JSON.stringify(result.narrative ?? null, null, 2) + "\n", "utf-8")
  writeFileSync(join(cacheDir, "graph.json"), JSON.stringify(result.graph, null, 2) + "\n", "utf-8")
  writeFileSync(join(cacheDir, "diagnostics.json"), JSON.stringify(result.diagnostics, null, 2) + "\n", "utf-8")
}
