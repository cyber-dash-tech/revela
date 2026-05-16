import type { NarrativeApproval, NarrativeStateV1 } from "../narrative-state/types"
import { writeNarrativeVaultCache } from "./cache"
import { compileNarrativeVault } from "./compile"
import { hasNarrativeVault } from "./paths"
import type { NarrativeVaultCompileResult } from "./types"

export interface PreferredNarrativeLoadResult {
  source: "vault" | "state"
  narrative?: NarrativeStateV1
  compileResult?: NarrativeVaultCompileResult
}

export function loadNarrativeFromPreferredSource(workspaceRoot: string, stateNarrative: NarrativeStateV1 | undefined, fallbackApprovals?: NarrativeApproval[]): PreferredNarrativeLoadResult {
  if (!hasNarrativeVault(workspaceRoot)) return { source: "state", narrative: stateNarrative }
  const approvals: NarrativeApproval[] = fallbackApprovals ?? stateNarrative?.approvals ?? []
  const compileResult = compileNarrativeVault(workspaceRoot, { fallbackApprovals: approvals })
  writeNarrativeVaultCache(workspaceRoot, compileResult)
  return { source: "vault", narrative: compileResult.narrative, compileResult }
}
