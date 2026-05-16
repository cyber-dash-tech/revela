import type { DecksState } from "../decks-state"
import { recordWorkspaceAction } from "../workspace-state/actions"
import { evidenceBindingDiagnostic, type EvidenceBindingDiagnostic, type EvidenceBindingFailureReason } from "./research-binding-eval"
import { stableResearchGapId } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import { reviewNarrativeState } from "./readiness"
import type {
  NarrativeClaim,
  NarrativeReadinessIssue,
  NarrativeResearchGap,
  NarrativeResearchGapStatus,
  NarrativeResearchGapTargetType,
  NarrativeStateV1,
} from "./types"

export type ResearchTargetKind =
  | "research_gap"
  | "missing_evidence"
  | "weak_evidence"
  | "unsupported_scope"
  | "unhandled_objection"
  | "high_severity_risk"
  | "unattached_findings"
  | "claim_chain_gap"

export type { EvidenceBindingDiagnostic, EvidenceBindingFailureReason } from "./research-binding-eval"

export interface ResearchTarget {
  id: string
  kind: ResearchTargetKind
  targetType: NarrativeResearchGapTargetType | "findings" | "relation"
  targetId?: string
  priority: "high" | "medium" | "low"
  reason: string
  question: string
  status?: NarrativeResearchGapStatus | "unattached"
  findingsFile?: string
  claimId?: string
  claimText?: string
  requiredEvidence: string[]
  bindingFailureReasons?: EvidenceBindingFailureReason[]
  bindingDiagnostic?: EvidenceBindingDiagnostic
}

export interface ResearchTargetsResult {
  targets: ResearchTarget[]
  selected?: ResearchTarget
}

export interface UpsertResearchGapInput {
  id?: string
  targetType?: NarrativeResearchGapTargetType
  targetId?: string
  question: string
  status?: NarrativeResearchGapStatus
  priority?: "high" | "medium" | "low"
  findingsFile?: string
  evidenceBindingIds?: string[]
  createdFromIssueType?: NarrativeReadinessIssue["type"]
  notes?: string
}

export interface UpdateResearchGapInput {
  id: string
  status?: NarrativeResearchGapStatus
  findingsFile?: string
  evidenceBindingIds?: string[]
  notes?: string
}

export interface ResearchGapMutationResult {
  created: NarrativeResearchGap[]
  updated: NarrativeResearchGap[]
  skipped: Array<{ id?: string; question?: string; reason: string }>
  gaps: NarrativeResearchGap[]
}

export interface CloseResearchGapResult {
  closed: boolean
  skipped: boolean
  reason?: string
  gap?: NarrativeResearchGap
}

export function deriveResearchTargets(state: DecksState, options: { now?: string; workspaceRoot?: string } = {}): ResearchTargetsResult {
  const reviewed = reviewNarrativeState(state, { now: options.now })
  const narrative = reviewed.state.narrative!
  const targets = dedupeTargets([
    ...targetsFromResearchGaps(narrative, options.workspaceRoot),
    ...targetsFromClaims(narrative),
    ...targetsFromObjections(narrative),
    ...targetsFromRisks(narrative),
    ...targetsFromReadinessIssues(reviewed.result.issues),
    ...targetsFromUnattachedFindings(reviewed.state, narrative, options.workspaceRoot),
  ]).sort(compareResearchTargets)
  return { targets, selected: targets[0] }
}

export function deriveResearchGapsFromReadiness(state: DecksState, options: { now?: string } = {}): { state: DecksState; result: ResearchGapMutationResult } {
  const reviewed = reviewNarrativeState(state, { now: options.now })
  return upsertResearchGapsInState(reviewed.state, gapsFromIssues(reviewed.state.narrative!, reviewed.result.issues), options)
}

export function upsertResearchGapsInState(state: DecksState, inputs: UpsertResearchGapInput[], options: { now?: string } = {}): { state: DecksState; result: ResearchGapMutationResult } {
  const now = options.now ?? new Date().toISOString()
  const narrative = ensureNarrative(state)
  const existing = new Map((narrative.researchGaps ?? []).map((gap) => [gap.id, gap]))
  const created: NarrativeResearchGap[] = []
  const updated: NarrativeResearchGap[] = []
  const skipped: ResearchGapMutationResult["skipped"] = []

  for (const input of inputs) {
    const question = clean(input.question)
    if (!question) {
      skipped.push({ reason: "question is required" })
      continue
    }
    const targetType = input.targetType ?? "narrative"
    const targetId = clean(input.targetId)
    const id = input.id?.trim() || stableResearchGapId([targetType, targetId, question].filter(Boolean).join("|"))
    const prior = existing.get(id)
    if (prior?.status === "closed") {
      skipped.push({ id, question, reason: "matching research gap is already closed" })
      continue
    }

    const next: NarrativeResearchGap = {
      id,
      targetType,
      targetId,
      question,
      status: input.status ?? prior?.status ?? "open",
      priority: input.priority ?? prior?.priority ?? "medium",
      findingsFile: clean(input.findingsFile) || prior?.findingsFile,
      evidenceBindingIds: mergeIds(prior?.evidenceBindingIds, input.evidenceBindingIds),
      createdFromIssueType: input.createdFromIssueType ?? prior?.createdFromIssueType,
      notes: clean(input.notes) || prior?.notes,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      closedAt: input.status === "closed" ? now : prior?.closedAt,
    }
    existing.set(id, next)
    if (prior) updated.push(next)
    else created.push(next)
  }

  const gaps = [...existing.values()].sort((a, b) => gapSortValue(a) - gapSortValue(b) || a.question.localeCompare(b.question))
  state.narrative = { ...narrative, researchGaps: gaps, updatedAt: now }
  if (created.length > 0) recordResearchGapAction(state, "research.gap_created", created, now)
  if (updated.length > 0) recordResearchGapAction(state, "research.gap_updated", updated, now)
  return { state, result: { created, updated, skipped, gaps } }
}

export function updateResearchGapInState(state: DecksState, input: UpdateResearchGapInput, options: { now?: string } = {}): { state: DecksState; result: ResearchGapMutationResult } {
  const narrative = ensureNarrative(state)
  const gap = (narrative.researchGaps ?? []).find((item) => item.id === input.id)
  if (!gap) return { state, result: { created: [], updated: [], skipped: [{ id: input.id, reason: "research gap not found" }], gaps: narrative.researchGaps ?? [] } }
  return upsertResearchGapsInState(state, [{ ...gap, ...input, question: gap.question, targetType: gap.targetType, targetId: gap.targetId }], options)
}

export function closeResearchGapInState(state: DecksState, id: string, reason?: string, options: { now?: string } = {}): { state: DecksState; result: CloseResearchGapResult } {
  const now = options.now ?? new Date().toISOString()
  const narrative = ensureNarrative(state)
  const gaps = narrative.researchGaps ?? []
  const gap = gaps.find((item) => item.id === id)
  if (!gap) return { state, result: { closed: false, skipped: true, reason: "research gap not found" } }
  const closed: NarrativeResearchGap = { ...gap, status: "closed", notes: clean(reason) || gap.notes, updatedAt: now, closedAt: now }
  state.narrative = { ...narrative, researchGaps: gaps.map((item) => item.id === id ? closed : item), updatedAt: now }
  recordResearchGapAction(state, "research.gap_closed", [closed], now)
  return { state, result: { closed: true, skipped: false, gap: closed } }
}

function gapsFromIssues(narrative: NarrativeStateV1, issues: NarrativeReadinessIssue[]): UpsertResearchGapInput[] {
  return issues.flatMap((issue) => {
    if (!researchableIssue(issue)) return []
    const target = targetForIssue(narrative, issue)
    return [{
      targetType: target.type,
      targetId: target.id,
      question: questionForIssue(issue),
      priority: issue.severity === "blocker" ? "high" : "medium",
      status: "open",
      createdFromIssueType: issue.type,
      notes: issue.suggestedAction,
      findingsFile: issue.source?.startsWith("researches/") ? issue.source : undefined,
    }]
  })
}

function targetsFromResearchGaps(narrative: NarrativeStateV1, workspaceRoot: string | undefined): ResearchTarget[] {
  return (narrative.researchGaps ?? [])
    .filter((gap) => gap.status !== "closed" && gap.status !== "evidence_bound")
    .map((gap) => {
      const claim = gap.targetType === "claim" ? narrative.claims.find((item) => item.id === gap.targetId) : undefined
      const bindingDiagnostic = gap.findingsFile ? evidenceBindingDiagnostic(workspaceRoot, gap.findingsFile) : undefined
      return {
        id: `gap:${gap.id}`,
        kind: "research_gap",
        targetType: gap.targetType,
        targetId: gap.targetId,
        priority: gap.priority,
        reason: gap.status === "findings_saved" || gap.status === "attached"
          ? "Saved findings exist; inspect and bind explicit evidence before launching new research."
          : "Open canonical research gap needs findings or binding progress.",
        question: gap.question,
        status: gap.status,
        findingsFile: gap.findingsFile,
        claimId: claim?.id,
        claimText: claim?.text,
        requiredEvidence: requiredEvidenceForClaim(claim),
        bindingFailureReasons: bindingDiagnostic?.failureReasons ?? (gap.findingsFile ? ["missing_quote", "unclear_source", "unsupported_scope"] : undefined),
        bindingDiagnostic,
      } satisfies ResearchTarget
    })
}

function targetsFromClaims(narrative: NarrativeStateV1): ResearchTarget[] {
  return narrative.claims.flatMap((claim) => {
    const targets: ResearchTarget[] = []
    if (claim.evidenceRequired && claim.evidenceStatus === "missing") {
      targets.push(claimTarget("missing_evidence", claim, claim.importance === "central" ? "high" : "medium", "Evidence-required claim has no bound support."))
    }
    if (claim.evidenceRequired && (claim.evidenceStatus === "weak" || claim.evidenceStatus === "partial")) {
      targets.push(claimTarget("weak_evidence", claim, claim.importance === "central" ? "high" : "medium", `Claim evidence is ${claim.evidenceStatus}; strengthen source trace or narrow scope.`))
    }
    if (claim.unsupportedScope) {
      targets.push(claimTarget("unsupported_scope", claim, claim.importance === "central" ? "high" : "medium", "Claim records unsupported scope that needs evidence, narrowing, or explicit caveat."))
    }
    return targets
  })
}

function targetsFromObjections(narrative: NarrativeStateV1): ResearchTarget[] {
  return narrative.objections
    .filter((objection) => objection.priority === "high" && !objection.response)
    .map((objection) => ({
      id: `objection:${objection.id}`,
      kind: "unhandled_objection",
      targetType: "objection",
      targetId: objection.id,
      priority: "high",
      reason: "High-priority objection has no recorded response or evidence boundary.",
      question: `Find response or evidence for objection: ${objection.text}`,
      claimId: objection.claimId,
      claimText: narrative.claims.find((claim) => claim.id === objection.claimId)?.text,
      requiredEvidence: ["response evidence or boundary", "source", "quote/snippet", "caveat"],
    } satisfies ResearchTarget))
}

function targetsFromRisks(narrative: NarrativeStateV1): ResearchTarget[] {
  return narrative.risks
    .filter((risk) => risk.severity === "high" && !risk.mitigation)
    .map((risk) => ({
      id: `risk:${risk.id}`,
      kind: "high_severity_risk",
      targetType: "risk",
      targetId: risk.id,
      priority: "high",
      reason: "High-severity risk has no mitigation or evidence boundary.",
      question: `Find mitigation, evidence boundary, or caveat for risk: ${risk.text}`,
      claimId: risk.claimId,
      claimText: narrative.claims.find((claim) => claim.id === risk.claimId)?.text,
      requiredEvidence: ["mitigation evidence or boundary", "source", "quote/snippet", "caveat"],
    } satisfies ResearchTarget))
}

function targetsFromReadinessIssues(issues: NarrativeReadinessIssue[]): ResearchTarget[] {
  return issues.flatMap((issue) => {
    if (issue.type !== "claim_chain_gap") return []
    return [{
      id: `issue:${issue.type}:${stableResearchGapId(issue.message)}`,
      kind: "claim_chain_gap",
      targetType: "relation",
      priority: issue.severity === "blocker" ? "high" : "medium",
      reason: issue.message,
      question: issue.suggestedAction,
      requiredEvidence: ["claim relation rationale", "supporting source or explicit user rationale", "caveat if relation is assumption-based"],
    } satisfies ResearchTarget]
  })
}

function targetsFromUnattachedFindings(state: DecksState, narrative: NarrativeStateV1, workspaceRoot: string | undefined): ResearchTarget[] {
  return (state.actions ?? []).flatMap((action) => {
    if (action.type !== "research.findings_saved") return []
    const path = typeof action.outputs?.path === "string" ? action.outputs.path : undefined
    if (!path || isFindingsAttachedOrBound(state, narrative, path)) return []
    const bindingDiagnostic = evidenceBindingDiagnostic(workspaceRoot, path)
    return [{
      id: `findings:${path}`,
      kind: "unattached_findings",
      targetType: "findings",
      targetId: path,
      priority: "medium",
      reason: "Saved findings are not attached to a research axis or bound as canonical evidence.",
      question: `Inspect and attach or bind saved findings: ${path}`,
      status: "unattached",
      findingsFile: path,
      requiredEvidence: ["source", "quote/snippet", "support scope", "unsupported scope", "caveat", "strength"],
      bindingFailureReasons: bindingDiagnostic?.failureReasons ?? ["missing_quote", "unclear_source", "context_only_finding", "unsupported_scope"],
      bindingDiagnostic,
    } satisfies ResearchTarget]
  })
}

function claimTarget(kind: Extract<ResearchTargetKind, "missing_evidence" | "weak_evidence" | "unsupported_scope">, claim: NarrativeClaim, priority: "high" | "medium", reason: string): ResearchTarget {
  return {
    id: `claim:${kind}:${claim.id}`,
    kind,
    targetType: "claim",
    targetId: claim.id,
    priority,
    reason,
    question: questionForClaimTarget(kind, claim),
    claimId: claim.id,
    claimText: claim.text,
    requiredEvidence: requiredEvidenceForClaim(claim),
    bindingFailureReasons: bindingFailuresForClaim(claim),
  }
}

function questionForClaimTarget(kind: ResearchTargetKind, claim: NarrativeClaim): string {
  if (kind === "missing_evidence") return `Find evidence for claim: ${claim.text}`
  if (kind === "weak_evidence") return `Strengthen evidence for claim: ${claim.text}`
  if (kind === "unsupported_scope") return `Resolve unsupported scope for claim: ${claim.text}`
  return claim.text
}

function requiredEvidenceForClaim(claim: NarrativeClaim | undefined): string[] {
  const base = ["source", "quote/snippet", "support scope", "unsupported scope", "caveat", "strength"]
  if (!claim) return base
  if (claim.unsupportedScope) return [...base, `address unsupported scope: ${claim.unsupportedScope}`]
  return base
}

function bindingFailuresForClaim(claim: NarrativeClaim): EvidenceBindingFailureReason[] {
  const reasons: EvidenceBindingFailureReason[] = ["missing_quote", "unclear_source"]
  if (claim.evidenceStatus === "weak") reasons.push("weak_source")
  if (claim.unsupportedScope) reasons.push("unsupported_scope", "over_broad_claim")
  return reasons
}

function isFindingsAttachedOrBound(state: DecksState, narrative: NarrativeStateV1, path: string): boolean {
  const attached = Object.values(state.decks ?? {}).some((deck) => deck.researchPlan.some((axis) => axis.findingsFile === path))
  const bound = narrative.evidenceBindings.some((binding) => binding.findingsFile === path)
  return attached || bound
}

function dedupeTargets(targets: ResearchTarget[]): ResearchTarget[] {
  const seen = new Set<string>()
  const result: ResearchTarget[] = []
  for (const target of targets) {
    const key = `${target.kind}:${target.targetType}:${target.targetId ?? target.claimId ?? target.question}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(target)
  }
  return result
}

function compareResearchTargets(a: ResearchTarget, b: ResearchTarget): number {
  return priorityValue(a.priority) - priorityValue(b.priority)
    || kindValue(a.kind) - kindValue(b.kind)
    || a.question.localeCompare(b.question)
}

function priorityValue(priority: ResearchTarget["priority"]): number {
  if (priority === "high") return 0
  if (priority === "medium") return 1
  return 2
}

function kindValue(kind: ResearchTargetKind): number {
  const values: Record<ResearchTargetKind, number> = {
    research_gap: 0,
    unattached_findings: 1,
    missing_evidence: 2,
    weak_evidence: 3,
    unsupported_scope: 4,
    unhandled_objection: 5,
    high_severity_risk: 6,
    claim_chain_gap: 7,
  }
  return values[kind]
}

function researchableIssue(issue: NarrativeReadinessIssue): boolean {
  return issue.type === "missing_evidence" || issue.type === "weak_evidence" || issue.type === "unsupported_scope" || issue.type === "unhandled_objection" || issue.type === "missing_risk"
}

function targetForIssue(narrative: NarrativeStateV1, issue: NarrativeReadinessIssue): { type: NarrativeResearchGapTargetType; id?: string } {
  if (issue.claimId) return { type: "claim", id: issue.claimId }
  const objection = narrative.objections.find((item) => item.text === issue.claimText)
  if (objection) return { type: "objection", id: objection.id }
  if (issue.type === "missing_risk") return { type: "decision", id: narrative.decision.action ? stableResearchGapId(`decision:${narrative.decision.action}`) : undefined }
  return { type: "narrative", id: narrative.id }
}

function questionForIssue(issue: NarrativeReadinessIssue): string {
  if (issue.claimText && issue.type === "missing_evidence") return `Find evidence for claim: ${issue.claimText}`
  if (issue.claimText && issue.type === "weak_evidence") return `Strengthen evidence for claim: ${issue.claimText}`
  if (issue.claimText && issue.type === "unsupported_scope") return `Resolve unsupported scope for claim: ${issue.claimText}`
  if (issue.type === "unhandled_objection") return `Find response or evidence for objection: ${issue.claimText ?? issue.message}`
  if (issue.type === "missing_risk") return "Identify risk, assumption, caveat, or tradeoff handling for the recommendation."
  return issue.message
}

function ensureNarrative(state: DecksState): NarrativeStateV1 {
  state.narrative = normalizeNarrativeState(state)
  return state.narrative
}

function recordResearchGapAction(state: DecksState, type: "research.gap_created" | "research.gap_updated" | "research.gap_closed", gaps: NarrativeResearchGap[], timestamp: string): void {
  recordWorkspaceAction(state, {
    type,
    actor: "revela-decks",
    timestamp,
    inputs: { narrativeId: state.narrative?.id },
    outputs: { gaps: gaps.map((gap) => ({ id: gap.id, status: gap.status, targetType: gap.targetType, targetId: gap.targetId, findingsFile: gap.findingsFile, evidenceBindingIds: gap.evidenceBindingIds })) },
    status: "success",
    summary: `${type === "research.gap_created" ? "Created" : type === "research.gap_closed" ? "Closed" : "Updated"} ${gaps.length} research gap${gaps.length === 1 ? "" : "s"}.`,
    nodeIds: gaps.map((gap) => gap.id),
  })
}

function gapSortValue(gap: NarrativeResearchGap): number {
  const statusValue: Record<NarrativeResearchGapStatus, number> = { open: 0, in_progress: 1, findings_saved: 2, attached: 3, evidence_bound: 4, closed: 5 }
  const priorityValue = gap.priority === "high" ? 0 : gap.priority === "medium" ? 1 : 2
  return statusValue[gap.status] * 10 + priorityValue
}

function mergeIds(existing: string[] | undefined, next: string[] | undefined): string[] {
  return [...new Set([...(existing ?? []), ...(next ?? [])].map(clean).filter(Boolean))].sort()
}

function clean(value: string | undefined): string {
  return value?.trim() ?? ""
}
