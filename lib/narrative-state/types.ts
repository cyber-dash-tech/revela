export type NarrativeStatus = "draft" | "needs_research" | "needs_user_confirmation" | "ready_for_approval" | "approved"

export type NarrativeClaimKind = "context" | "problem" | "opportunity" | "evidence" | "recommendation" | "risk" | "assumption" | "ask"

export type NarrativeEvidenceStatus = "supported" | "partial" | "weak" | "missing" | "not_required"

export type NarrativeResearchGapStatus = "open" | "in_progress" | "findings_saved" | "attached" | "evidence_bound" | "closed"

export type NarrativeResearchGapTargetType = "claim" | "objection" | "risk" | "decision" | "narrative"

export type NarrativeClaimRelationType = "leads_to" | "supports" | "depends_on" | "contrasts_with" | "constrains" | "answers"

export interface NarrativeStateV1 {
  version: 1
  id: string
  status: NarrativeStatus
  audience: AudienceIntent
  decision: DecisionIntent
  thesis?: NarrativeThesis
  claims: NarrativeClaim[]
  claimRelations?: NarrativeClaimRelation[]
  evidenceBindings: NarrativeEvidenceBinding[]
  objections: NarrativeObjection[]
  risks: NarrativeRisk[]
  researchGaps?: NarrativeResearchGap[]
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

export interface NarrativeClaimRelation {
  id: string
  fromClaimId: string
  toClaimId: string
  relation: NarrativeClaimRelationType
  rationale?: string
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

export interface NarrativeResearchGap {
  id: string
  targetType: NarrativeResearchGapTargetType
  targetId?: string
  question: string
  status: NarrativeResearchGapStatus
  priority: "high" | "medium" | "low"
  findingsFile?: string
  evidenceBindingIds?: string[]
  createdFromIssueType?: NarrativeReadinessIssueType
  notes?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
}

export interface NarrativeApproval {
  id: string
  narrativeHash: string
  approvedAt: string
  approvedBy: "user" | "override"
  scope: "narrative" | "render_override"
  note?: string
}

export type NarrativeReadinessStatus = "blocked" | "needs_research" | "needs_user_confirmation" | "ready_for_approval" | "approved"

export type NarrativeReadinessIssueType =
  | "missing_audience"
  | "missing_belief_shift"
  | "missing_decision"
  | "missing_thesis"
  | "claim_chain_gap"
  | "missing_evidence"
  | "weak_evidence"
  | "unsupported_scope"
  | "unhandled_objection"
  | "missing_risk"
  | "approval_missing"
  | "approval_stale"
  | "artifact_stale"
  | "research_findings_unattached"
  | "research_gap_open"

export interface NarrativeReadinessIssue {
  type: NarrativeReadinessIssueType
  severity: "blocker" | "warning"
  message: string
  suggestedAction: string
  claimId?: string
  claimText?: string
  source?: string
}

export interface NarrativeReadinessResult {
  status: NarrativeReadinessStatus
  narrativeHash: string
  reviewedAt: string
  blockers: string[]
  warnings: string[]
  issues: NarrativeReadinessIssue[]
  approval?: {
    current: boolean
    stale: boolean
    latest?: NarrativeApproval
  }
  nextActions: string[]
}
