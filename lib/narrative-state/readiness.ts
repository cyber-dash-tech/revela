import type { DecksState } from "../decks-state"
import { recordWorkspaceAction } from "../workspace-state/actions"
import { computeNarrativeHash, stableHash } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import type {
  NarrativeApproval,
  NarrativeClaim,
  NarrativeReadinessIssue,
  NarrativeReadinessResult,
  NarrativeReadinessStatus,
  NarrativeStateV1,
} from "./types"

interface NarrativeApprovalState {
  current: boolean
  stale: boolean
  latest?: NarrativeApproval
}

export interface ReviewNarrativeOptions {
  now?: string
}

export interface ApproveNarrativeOptions {
  now?: string
  approvedBy?: "user" | "override"
  scope?: "narrative" | "render_override"
  note?: string
}

export interface ApproveNarrativeResult {
  approved: boolean
  skipped: boolean
  reason?: string
  narrativeHash: string
  approval?: NarrativeApproval
  readiness: NarrativeReadinessResult
}

export function reviewNarrativeState(state: DecksState, options: ReviewNarrativeOptions = {}): { state: DecksState; result: NarrativeReadinessResult } {
  const next: DecksState = { ...state, narrative: normalizeNarrativeState(state) }
  const result = computeNarrativeReadiness(next.narrative!, next, options)
  next.narrative = { ...next.narrative!, status: narrativeStatusFromReadiness(result.status), updatedAt: options.now ?? next.narrative!.updatedAt }
  return { state: next, result }
}

export function approveNarrativeState(state: DecksState, options: ApproveNarrativeOptions = {}): { state: DecksState; result: ApproveNarrativeResult } {
  const now = options.now ?? new Date().toISOString()
  const reviewed = reviewNarrativeState(state, { now })
  const narrative = reviewed.state.narrative!
  const scope = options.scope ?? "narrative"
  const approvedBy = options.approvedBy ?? "user"
  const override = approvedBy === "override" || scope === "render_override"
  const blocking = reviewed.result.issues.filter((issue) => issue.severity === "blocker")
  const incomplete = blocking.some((issue) => issue.type !== "approval_missing" && issue.type !== "approval_stale")

  if (incomplete && !override) {
    return {
      state: reviewed.state,
      result: {
        approved: false,
        skipped: true,
        reason: "narrative has unresolved readiness blockers; use an explicit override to record a render override",
        narrativeHash: reviewed.result.narrativeHash,
        readiness: reviewed.result,
      },
    }
  }

  const approval: NarrativeApproval = {
    id: `approval:${stableHash(`${reviewed.result.narrativeHash}:${now}:${scope}:${approvedBy}`)}`,
    narrativeHash: reviewed.result.narrativeHash,
    approvedAt: now,
    approvedBy,
    scope,
    note: clean(options.note),
  }
  const approvals = dedupeApprovals([...(narrative.approvals ?? []), approval])
  const updatedNarrative: NarrativeStateV1 = {
    ...narrative,
    approvals,
    status: scope === "narrative" && approvedBy === "user" ? "approved" : narrative.status,
    updatedAt: now,
  }
  const next: DecksState = { ...reviewed.state, narrative: updatedNarrative }
  const readiness = computeNarrativeReadiness(updatedNarrative, next, { now })
  next.narrative = { ...updatedNarrative, status: narrativeStatusFromReadiness(readiness.status) }
  return {
    state: next,
    result: {
      approved: true,
      skipped: false,
      narrativeHash: reviewed.result.narrativeHash,
      approval,
      readiness,
    },
  }
}

export function recordNarrativeReviewAction(state: DecksState, result: NarrativeReadinessResult): void {
  recordWorkspaceAction(state, {
    type: "review.performed",
    actor: "revela-decks",
    inputs: { kind: "narrative", narrativeId: state.narrative?.id },
    outputs: {
      kind: "narrative",
      status: result.status,
      narrativeHash: result.narrativeHash,
      blockerCount: result.blockers.length,
      warningCount: result.warnings.length,
      issueCount: result.issues.length,
      approvalCurrent: result.approval?.current ?? false,
      approvalStale: result.approval?.stale ?? false,
    },
    status: "success",
    summary: `Reviewed narrative readiness: ${result.status}.`,
    nodeIds: state.narrative ? [state.narrative.id] : [],
  })
}

export function recordNarrativeApprovalAction(state: DecksState, result: ApproveNarrativeResult): void {
  recordWorkspaceAction(state, {
    type: "narrative.approved",
    actor: "revela-decks",
    inputs: { narrativeId: state.narrative?.id, approvedBy: result.approval?.approvedBy, scope: result.approval?.scope },
    outputs: {
      approved: result.approved,
      skipped: result.skipped,
      reason: result.reason,
      narrativeHash: result.narrativeHash,
      approvalId: result.approval?.id,
    },
    status: result.skipped ? "skipped" : "success",
    summary: result.skipped ? `Skipped narrative approval: ${result.reason ?? "not approved"}.` : `Recorded narrative ${result.approval?.scope ?? "narrative"} approval.`,
    nodeIds: [state.narrative?.id, result.approval?.id].filter((item): item is string => Boolean(item)),
  })
}

function computeNarrativeReadiness(narrative: NarrativeStateV1, state: DecksState, options: ReviewNarrativeOptions): NarrativeReadinessResult {
  const now = options.now ?? new Date().toISOString()
  const narrativeHash = computeNarrativeHash(narrative)
  const issues: NarrativeReadinessIssue[] = []
  const add = (issue: NarrativeReadinessIssue) => issues.push(issue)

  if (!narrative.audience.primary) add(blocker("missing_audience", "Primary audience is missing.", "Define the primary audience before reviewing the narrative."))
  if (!narrative.audience.beliefBefore || !narrative.audience.beliefAfter) add(blocker("missing_belief_shift", "Audience belief shift is incomplete.", "Add both beliefBefore and beliefAfter so the narrative has a persuasion target."))
  if (!narrative.decision.action) add(blocker("missing_decision", "Decision or action is missing.", "Define the decision, approval, alignment, or action this narrative should drive."))
  if (isDecisionOriented(narrative) && !narrative.thesis?.statement) add(blocker("missing_thesis", "Decision-oriented narrative has no thesis.", "Add a compact thesis that carries the recommendation and evidence boundary."))

  const centralClaims = narrative.claims.filter((claim) => claim.importance === "central")
  if (isDecisionOriented(narrative) && centralClaims.length === 0) add(blocker("claim_chain_gap", "Decision-oriented narrative has no central claims.", "Add one to three central claims that the narrative must prove."))
  if (centralClaims.length > 4) add(warning("claim_chain_gap", "Narrative has many central claims.", "Tighten the claim chain to the few claims the audience must believe."))

  for (const claim of narrative.claims) {
    if (!claim.evidenceRequired) continue
    if (claim.evidenceStatus === "missing" && claim.importance === "central") add(claimIssue("missing_evidence", "blocker", claim, "Central claim lacks evidence.", "Bind source-backed evidence or revise the claim scope before approval."))
    else if (claim.evidenceStatus === "missing") add(claimIssue("missing_evidence", "warning", claim, "Supporting claim lacks evidence.", "Bind evidence or mark the claim as not evidence-required if it is purely framing."))
    else if (claim.evidenceStatus === "weak" || claim.evidenceStatus === "partial") add(claimIssue("weak_evidence", "warning", claim, `Claim evidence is ${claim.evidenceStatus}.`, "Add stronger source trace, caveats, or narrow the claim to the supported scope."))
    if (claim.unsupportedScope) add(claimIssue("unsupported_scope", "warning", claim, "Claim has unsupported scope.", "Keep unsupported scope visible or revise the claim before rendering."))
  }

  for (const binding of narrative.evidenceBindings) {
    if (binding.unsupportedScope) {
      const claim = narrative.claims.find((item) => item.id === binding.claimId)
      add({
        type: "unsupported_scope",
        severity: "warning",
        message: "Evidence binding records unsupported scope.",
        suggestedAction: "Preserve the unsupported scope caveat or add separate evidence before expanding the claim.",
        claimId: binding.claimId,
        claimText: claim?.text,
        source: binding.source,
      })
    }
  }

  if (hasRecommendation(narrative) && !hasRiskHandling(narrative)) add(blocker("missing_risk", "Recommendation narrative lacks risk, assumption, or caveat handling.", "Add a risk, assumption, caveat, or tradeoff before approval."))
  for (const objection of narrative.objections) {
    if (objection.priority === "high" && !objection.response) add({
      type: "unhandled_objection",
      severity: "blocker",
      message: "High-priority objection has no response.",
      suggestedAction: "Add a response, evidence boundary, or fallback framing for this objection.",
      claimId: objection.claimId,
      claimText: objection.text,
    })
  }

  for (const action of state.actions ?? []) {
    if (action.type !== "research.findings_saved") continue
    const path = typeof action.outputs?.path === "string" ? action.outputs.path : undefined
    if (!path) continue
    const attached = Object.values(state.decks ?? {}).some((deck) => deck.researchPlan.some((axis) => axis.findingsFile === path))
    const boundToNarrative = narrative.evidenceBindings.some((binding) => binding.findingsFile === path)
    if (!attached && !boundToNarrative && !isVisualOrMediaFindings(action.inputs?.axis, path)) add({
      type: "research_findings_unattached",
      severity: "warning",
      message: `Research findings are saved but not attached: ${path}`,
      suggestedAction: "Attach the findings to a research axis or bind specific evidence before treating them as canonical support.",
      source: path,
    })
  }

  const approval = approvalState(narrative, narrativeHash)
  if (!approval.current) add({
    type: approval.stale ? "approval_stale" : "approval_missing",
    severity: "warning",
    message: approval.stale ? "Latest narrative approval is stale." : "Narrative is not approved yet.",
    suggestedAction: approval.stale ? "Review changes and approve the current narrative hash." : "Ask the user to approve the narrative before deck handoff.",
  })

  const blockers = issues.filter((issue) => issue.severity === "blocker").map((issue) => issue.message)
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  const status = readinessStatus(issues, approval.current)
  return {
    status,
    narrativeHash,
    reviewedAt: now,
    blockers,
    warnings,
    issues,
    approval,
    nextActions: nextActions(issues, approval.current),
  }
}

function readinessStatus(issues: NarrativeReadinessIssue[], approvalCurrent: boolean): NarrativeReadinessStatus {
  const blockers = issues.filter((issue) => issue.severity === "blocker")
  if (blockers.some((issue) => issue.type === "missing_evidence" || issue.type === "unsupported_scope")) return "needs_research"
  if (blockers.length > 0) return "blocked"
  if (issues.some((issue) => issue.type === "missing_audience" || issue.type === "missing_belief_shift" || issue.type === "missing_decision" || issue.type === "missing_thesis" || issue.type === "claim_chain_gap")) return "needs_user_confirmation"
  return approvalCurrent ? "approved" : "ready_for_approval"
}

function narrativeStatusFromReadiness(status: NarrativeReadinessStatus): NarrativeStateV1["status"] {
  if (status === "blocked") return "needs_user_confirmation"
  if (status === "needs_research") return "needs_research"
  return status
}

function approvalState(narrative: NarrativeStateV1, narrativeHash: string): NarrativeApprovalState {
  const narrativeApprovals = [...(narrative.approvals ?? [])].filter((approval) => approval.scope === "narrative" && approval.approvedBy === "user")
  const latest = narrativeApprovals[narrativeApprovals.length - 1]
  return { current: Boolean(latest && latest.narrativeHash === narrativeHash), stale: Boolean(latest && latest.narrativeHash !== narrativeHash), latest }
}

function isVisualOrMediaFindings(axis: unknown, path: string): boolean {
  const value = `${typeof axis === "string" ? axis : ""} ${path}`.toLowerCase()
  return /(^|[-_/\s])(image|images|media|asset|assets|visual|visuals|logo|logos|screenshot|screenshots)([-_/\s.]|$)/.test(value)
}

function nextActions(issues: NarrativeReadinessIssue[], approvalCurrent: boolean): string[] {
  const blockers = issues.filter((issue) => issue.severity === "blocker")
  if (blockers.length > 0) return unique(blockers.map((issue) => issue.suggestedAction))
  const approvalIssue = issues.find((issue) => issue.type === "approval_missing" || issue.type === "approval_stale")
  if (!approvalCurrent && approvalIssue) return [approvalIssue.suggestedAction]
  return unique(issues.slice(0, 3).map((issue) => issue.suggestedAction))
}

function isDecisionOriented(narrative: NarrativeStateV1): boolean {
  return Boolean(narrative.decision.action || narrative.decision.decisionType && narrative.decision.decisionType !== "understand" || narrative.claims.some((claim) => claim.kind === "recommendation" || claim.kind === "ask"))
}

function hasRecommendation(narrative: NarrativeStateV1): boolean {
  return narrative.claims.some((claim) => claim.kind === "recommendation" || claim.kind === "ask") || /recommend|approve|invest|prioriti[sz]e|建议|批准|投资|优先/i.test(narrative.decision.action)
}

function hasRiskHandling(narrative: NarrativeStateV1): boolean {
  return narrative.risks.length > 0 || narrative.claims.some((claim) => claim.kind === "risk" || claim.kind === "assumption" || claim.caveats?.length || claim.unsupportedScope) || narrative.evidenceBindings.some((binding) => binding.caveat || binding.unsupportedScope)
}

function blocker(type: NarrativeReadinessIssue["type"], message: string, suggestedAction: string): NarrativeReadinessIssue {
  return { type, severity: "blocker", message, suggestedAction }
}

function warning(type: NarrativeReadinessIssue["type"], message: string, suggestedAction: string): NarrativeReadinessIssue {
  return { type, severity: "warning", message, suggestedAction }
}

function claimIssue(type: NarrativeReadinessIssue["type"], severity: "blocker" | "warning", claim: NarrativeClaim, message: string, suggestedAction: string): NarrativeReadinessIssue {
  return { type, severity, message, suggestedAction, claimId: claim.id, claimText: claim.text }
}

function dedupeApprovals(approvals: NarrativeApproval[]): NarrativeApproval[] {
  return [...new Map(approvals.map((approval) => [approval.id, approval])).values()]
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}
