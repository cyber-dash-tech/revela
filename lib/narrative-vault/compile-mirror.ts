import { existsSync } from "fs"
import { join } from "path"
import { DECKS_STATE_FILE, readDecksState, writeDecksState, type DecksState } from "../decks-state"
import type { NarrativeApproval } from "../narrative-state/types"
import { writeNarrativeVaultCache } from "./cache"
import { compileNarrativeVault } from "./compile"
import { formatVaultDiagnosticReport, type VaultDiagnosticReport } from "./diagnostic-report"
import type { NarrativeVaultCompileResult } from "./types"

export type NarrativeVaultMirrorStatus = "updated" | "skipped_no_decks" | "preserved_failed_compile"

export interface CompileCacheMirrorNarrativeVaultOptions {
  state?: DecksState
  fallbackApprovals?: NarrativeApproval[]
}

export interface CompileCacheMirrorNarrativeVaultResult {
  result: NarrativeVaultCompileResult
  diagnosticReport: VaultDiagnosticReport
  mirrorStatus: NarrativeVaultMirrorStatus
  state?: DecksState
}

export function compileCacheMirrorNarrativeVault(
  workspaceRoot: string,
  options: CompileCacheMirrorNarrativeVaultOptions = {},
): CompileCacheMirrorNarrativeVaultResult {
  const decksPath = join(workspaceRoot, DECKS_STATE_FILE)
  const hasDecks = Boolean(options.state) || existsSync(decksPath)
  const state = options.state ?? (hasDecks ? readDecksState(workspaceRoot) : undefined)
  const fallbackApprovals = options.fallbackApprovals ?? state?.narrativeApprovals ?? state?.narrative?.approvals ?? []
  const result = compileNarrativeVault(workspaceRoot, { fallbackApprovals })
  const diagnosticReport = formatVaultDiagnosticReport(result.diagnostics)

  writeNarrativeVaultCache(workspaceRoot, result)

  if (!hasDecks || !state) return { result, diagnosticReport, mirrorStatus: "skipped_no_decks" }
  if (result.ok && result.narrative) {
    state.narrative = result.narrative
    writeDecksState(workspaceRoot, state)
    return { result, diagnosticReport, mirrorStatus: "updated", state }
  }

  return { result, diagnosticReport, mirrorStatus: "preserved_failed_compile", state }
}
