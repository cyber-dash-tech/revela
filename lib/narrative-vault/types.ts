import type { NarrativeClaimRelationType, NarrativeStateV1 } from "../narrative-state/types"

export type VaultNodeType = "index" | "audience" | "decision" | "thesis" | "claim" | "evidence" | "objection" | "risk" | "research-gap"
export type WorkspaceGraphNodeType = VaultNodeType | "deck-plan" | "deck-plan-slide"
export type WorkspaceGraphRelationType = NarrativeClaimRelationType | "uses_claim" | "uses_evidence" | "addresses_risk" | "answers_objection" | "mentions_gap"

export type VaultDiagnosticSeverity = "error" | "warning"

export interface VaultDiagnostic {
  severity: VaultDiagnosticSeverity
  code: string
  message: string
  file?: string
  nodeId?: string
}

export interface VaultRelation {
  id?: string
  fromId: string
  relation: WorkspaceGraphRelationType
  toId: string
  rationale?: string
  file: string
  source?: "inline"
}

export interface VaultDocument {
  path: string
  relativePath: string
  frontmatter: Record<string, string | string[] | boolean>
  body: string
  sections: Record<string, string>
  relations: VaultRelation[]
}

export interface NarrativeVaultCompileResult {
  ok: boolean
  narrative?: NarrativeStateV1
  diagnostics: VaultDiagnostic[]
  graph: NarrativeVaultGraph
}

export interface NarrativeVaultGraph {
  nodes: Array<{ id: string; type: WorkspaceGraphNodeType; file: string }>
  relations: VaultRelation[]
}
