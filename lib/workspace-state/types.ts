import type { DecksState } from "../decks-state"

export const WORKSPACE_STATE_FILE = "DECKS.json"

export type WorkspaceStateVersion = 1 | 2

export interface WorkspaceStateRepositoryOptions<TState> {
  fileName?: string
  normalize?: (state: TState) => TState
}

export interface WorkspaceStateV2 {
  version: 2
  workspace: WorkspaceMeta
  graph: WorkspaceGraph
  actions: WorkspaceAction[]
  renderTargets: RenderTarget[]
  reviews: ReviewSnapshot[]
  compatibility?: DecksStateV1Projection
}

export interface WorkspaceMeta {
  brief?: string
  preferences?: {
    user: string[]
    workflow: string[]
  }
  openQuestions?: string[]
}

export interface WorkspaceGraph {
  nodes: Record<string, GraphNode>
  edges: GraphEdge[]
}

export interface GraphNode {
  id: string
  type: GraphNodeType
  label?: string
  data?: Record<string, unknown>
}

export type GraphNodeType =
  | "source"
  | "extraction"
  | "finding"
  | "claim"
  | "narrativeIntent"
  | "objection"
  | "risk"
  | "slide"
  | "artifact"
  | "researchGap"

export interface GraphEdge {
  id: string
  type: GraphEdgeType
  from: string
  to: string
  data?: Record<string, unknown>
}

export type GraphEdgeType =
  | "contains"
  | "extracted_as"
  | "produced"
  | "supports"
  | "leads_to"
  | "depends_on"
  | "contrasts_with"
  | "answers"
  | "appears_in"
  | "challenges"
  | "constrained_by"
  | "renders_from"
  | "derived_from"

export interface WorkspaceAction {
  id: string
  type: WorkspaceActionType
  timestamp: string
  actor?: string
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  status: "success" | "failed" | "skipped"
  summary?: string
  nodeIds?: string[]
}

export type WorkspaceActionType =
  | "workspace.scanned"
  | "source.discovered"
  | "source.extracted"
  | "research.findings_saved"
  | "research.findings_attached"
  | "research.gap_created"
  | "research.gap_updated"
  | "research.gap_closed"
  | "narrative.upserted"
  | "deck.plan_compiled"
  | "artifact.coverage_backfilled"
  | "evidence.candidate_generated"
  | "evidence.binding_applied"
  | "narrative.approved"
  | "review.performed"
  | "artifact.rendered"

export interface RenderTarget {
  id: string
  type: "html_deck" | "pdf" | "pptx" | "brief" | "executive_brief" | "appendix" | "qa_view" | "interactive_page"
  outputPath?: string
  sourceNodeIds: string[]
  artifactVersion?: string
  contractStatus?: "unknown" | "valid" | "invalid" | "stale"
  data?: Record<string, unknown>
}

export interface ReviewSnapshot {
  id: string
  targetId?: string
  inputHash: string
  status: "blocked" | "ready" | "written"
  blockers: string[]
  warnings: string[]
  issues: unknown[]
  evidenceCandidates?: unknown[]
  reviewedAt: string
}

export type DecksStateV1Projection = DecksState
export type WorkspaceState = DecksState | WorkspaceStateV2
