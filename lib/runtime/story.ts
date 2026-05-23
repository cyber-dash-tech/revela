import { resolve } from "path"
import { loadStoryMap } from "../commands/narrative"
import { formatNarrativeMap, type NarrativeMap } from "../narrative-state/map"
import type { formatVaultDiagnosticReport } from "../narrative-vault"

export interface StoryReadInput {
  workspaceRoot?: string
  format?: "map" | "markdown"
}

export type StoryReadResult =
  | {
    ok: true
    narrativeHash: string
    map: NarrativeMap
    markdown?: string
    diagnostics: ReturnType<typeof formatVaultDiagnosticReport>
    diagnosticsMarkdown: string
  }
  | {
    ok: false
    error: string
    guidance: string
    diagnostics?: ReturnType<typeof formatVaultDiagnosticReport>
    diagnosticsMarkdown: string
  }

export function storyRead(input: StoryReadInput = {}): StoryReadResult {
  const loaded = loadStoryMap(root(input.workspaceRoot))
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.error,
      guidance: "Run `/revela init` first to initialize `revela-narrative/`, then retry Story reading.",
      diagnostics: loaded.diagnosticsReport,
      diagnosticsMarkdown: loaded.diagnosticsMarkdown,
    }
  }

  const map = loaded.map
  return {
    ok: true,
    narrativeHash: map.snapshot.narrativeHash,
    map,
    markdown: input.format === "markdown" ? formatNarrativeMap(map) : undefined,
    diagnostics: loaded.diagnosticsReport,
    diagnosticsMarkdown: loaded.diagnosticsMarkdown,
  }
}

function root(workspaceRoot: string | undefined): string {
  return resolve(workspaceRoot || process.cwd())
}
