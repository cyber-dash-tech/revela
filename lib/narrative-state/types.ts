export type NarrativeStatus = "draft" | "needs_research" | "needs_user_confirmation" | "ready_for_approval" | "approved"

export type NarrativeClaimKind = "context" | "problem" | "opportunity" | "evidence" | "recommendation" | "risk" | "assumption" | "ask"

export type NarrativeEvidenceStatus = "supported" | "partial" | "weak" | "missing" | "not_required"

export interface NarrativeStateV1 {
  version: 1
  id: string
  status: NarrativeStatus
  audience: AudienceIntent
  decision: DecisionIntent
  thesis?: NarrativeThesis
  claims: NarrativeClaim[]
  evidenceBindings: NarrativeEvidenceBinding[]
  objections: NarrativeObjection[]
  risks: NarrativeRisk[]
  approvals: NarrativeApproval[]
  updatedAt: string
}

export interface AudienceIntent {
  primary: string
  secondary?: string[]
  beliefBefore: string
  beliefAfter: string
  decisionContext?: string
  successCriteria?: string[]
}

export interface DecisionIntent {
  action: string
  owner?: string
  deadline?: string
  decisionType?: "approve" | "invest" | "prioritize" | "align" | "choose" | "understand" | "other"
  consequenceOfNoDecision?: string
}

export interface NarrativeThesis {
  id: string
  statement: string
  confidence: "high" | "medium" | "low"
  caveat?: string
}

export interface NarrativeClaim {
  id: string
  kind: NarrativeClaimKind
  text: string
  importance: "central" | "supporting" | "background"
  evidenceRequired: boolean
  evidenceStatus: NarrativeEvidenceStatus
  supportedScope?: string
  unsupportedScope?: string
  caveats?: string[]
}

export interface NarrativeEvidenceBinding {
  id: string
  claimId: string
  source: string
  sourcePath?: string
  findingsFile?: string
  quote?: string
  location?: string
  url?: string
  caveat?: string
  supportScope?: string
  unsupportedScope?: string
  strength: "strong" | "partial" | "weak"
}

export interface NarrativeObjection {
  id: string
  text: string
  claimId?: string
  priority: "high" | "medium" | "low"
  response?: string
}

export interface NarrativeRisk {
  id: string
  text: string
  claimId?: string
  severity: "high" | "medium" | "low"
  mitigation?: string
}

export interface NarrativeApproval {
  id: string
  narrativeHash: string
  approvedAt: string
  approvedBy: "user" | "override"
  scope: "narrative" | "render_override"
  note?: string
}
