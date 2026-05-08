import {
  applyEvidenceCandidates,
  hasDecksState,
  readDecksState,
  reviewDeckState,
  writeDecksState,
  type AppliedEvidenceCandidate,
  type DecksState,
  type EvidenceBindingCandidate,
  type EvidenceCandidateSearchDiagnostic,
  type EvidenceRef,
  type ReadinessIssue,
  type SkippedEvidenceCandidate,
} from "../decks-state"
import { compileInspectionContext, type InspectionEvidenceTrace, type InspectionGap } from "../inspection-context/compile"
import { matchInspectionElement, type InspectionElementMatch, type InspectionElementSnapshot, type InspectionMatchConfidence } from "../inspection-context/match"
import { recordWorkspaceAction } from "./actions"
import type { WorkspaceAction } from "./types"

export interface EvidenceStatusForSelection {
  version: 1
  selection: EvidenceStatusSelection
  match: EvidenceStatusMatch
  boundEvidence: EvidenceStatusEvidence[]
  gaps: EvidenceStatusGap[]
  candidateEvidence: EvidenceStatusCandidate[]
  searchDiagnostics: EvidenceCandidateSearchDiagnostic[]
  actionTrace: EvidenceStatusActionTrace[]
}

export interface EvidenceStatusSelection {
  slideIndex?: number
  selectedText?: string
  scope?: InspectionElementSnapshot["scope"]
}

export interface EvidenceStatusMatch {
  confidence: InspectionMatchConfidence
  reason: string
  slideIndex?: number
  slideTitle?: string
  claimId?: string
  canonicalClaimId?: string
  claimText?: string
  claimEvidenceSensitive?: boolean
  claimEvidenceSupport?: string
  evidenceBindingIds: string[]
  supportedScope?: string
  unsupportedScope?: string
  caveats: string[]
}

export interface EvidenceStatusEvidence extends EvidenceRef {
  slideIndex: number
  slideTitle: string
  hasDetail: boolean
  evidenceBindingId?: string
  claimId?: string
  supportScope?: string
  unsupportedScope?: string
  strength?: "strong" | "partial" | "weak"
}

export interface EvidenceStatusGap {
  type: InspectionGap["type"]
  slideIndex: number
  slideTitle: string
  claimText: string
  message: string
}

export interface EvidenceStatusCandidate extends EvidenceBindingCandidate {
  relevant: boolean
}

export interface EvidenceStatusActionTrace {
  id: string
  type: WorkspaceAction["type"]
  timestamp: string
  actor?: string
  status: WorkspaceAction["status"]
  summary?: string
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  nodeIds?: string[]
}

export interface ApplyEvidenceBindingsResult {
  applied: AppliedEvidenceCandidate[]
  skipped: SkippedEvidenceCandidate[]
  nextReviewNeeded: boolean
}

export function getEvidenceStatusForSelection(workspaceRoot: string, snapshot: InspectionElementSnapshot, options: { slug?: string } = {}): EvidenceStatusForSelection {
  if (!hasDecksState(workspaceRoot)) throw new Error("DECKS.json is required before checking evidence status. Run /revela init first.")
  const state = readDecksState(workspaceRoot)
  return getEvidenceStatusInState(state, snapshot, { ...options, workspaceRoot })
}

export function getEvidenceStatusInState(
  state: DecksState,
  snapshot: InspectionElementSnapshot,
  options: { workspaceRoot?: string; slug?: string } = {},
): EvidenceStatusForSelection {
  const normalizedSnapshot = normalizeEvidenceSnapshot(snapshot)
  const context = compileInspectionContext(state, options.slug)
  const match = matchInspectionElement(context, normalizedSnapshot)
  const reviewed = reviewDeckState(state, context.slug, { workspaceRoot: options.workspaceRoot })
  const candidates = relevantCandidates(reviewed.result.evidenceCandidates ?? [], match)
  const diagnostics = relevantSearchDiagnostics(reviewed.result.issues, match)

  return {
    version: 1,
    selection: {
      slideIndex: normalizedSnapshot.slideIndex,
      selectedText: normalizedSnapshot.selectedText || normalizedSnapshot.text,
      scope: normalizedSnapshot.scope,
    },
    match: projectMatch(match),
    boundEvidence: match.evidence.map(projectEvidence),
    gaps: evidenceStatusGaps(match, reviewed.result.issues),
    candidateEvidence: candidates,
    searchDiagnostics: diagnostics,
    actionTrace: actionTraceForMatch(state.actions ?? [], match),
  }
}

export function applyEvidenceBindings(workspaceRoot: string, candidateIds: string[]): ApplyEvidenceBindingsResult {
  if (!hasDecksState(workspaceRoot)) throw new Error("DECKS.json is required before applying evidence bindings. Run /revela init first.")
  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) throw new Error("candidateIds are required for evidence binding application.")

  const state = readDecksState(workspaceRoot)
  const applied = applyEvidenceCandidates(state, ids, { workspaceRoot })
  recordEvidenceBindingAction(applied.state, ids, applied.result)
  writeDecksState(workspaceRoot, applied.state)
  return applied.result
}

export function recordEvidenceBindingAction(state: DecksState, candidateIds: string[], result: ApplyEvidenceBindingsResult): DecksState {
  return recordWorkspaceAction(state, {
    type: "evidence.binding_applied",
    actor: "revela-decks",
    inputs: { candidateIds },
    outputs: {
      applied: result.applied.map((item) => ({ candidateId: item.candidateId, slideIndex: item.slideIndex, evidence: item.evidence })),
      skipped: result.skipped,
      nextReviewNeeded: result.nextReviewNeeded,
    },
    status: result.applied.length > 0 ? "success" : "skipped",
    summary: `Applied ${result.applied.length} evidence candidate${result.applied.length === 1 ? "" : "s"}.`,
    nodeIds: result.applied.map((item) => `slide:${item.slideIndex}`),
  })
}

function normalizeEvidenceSnapshot(snapshot: InspectionElementSnapshot): InspectionElementSnapshot {
  const selectedText = snapshot.selectedText || snapshot.text
  return {
    ...snapshot,
    text: snapshot.text || selectedText,
    selectedText,
  }
}

function projectMatch(match: InspectionElementMatch): EvidenceStatusMatch {
  return {
    confidence: match.confidence,
    reason: match.reason,
    slideIndex: match.slide?.index,
    slideTitle: match.slide?.title,
    claimId: match.claim?.id,
    canonicalClaimId: match.claim?.canonicalClaimId,
    claimText: match.claim?.text,
    claimEvidenceSensitive: match.claim?.evidenceSensitive,
    claimEvidenceSupport: match.claim?.evidenceSupport,
    evidenceBindingIds: match.claim?.evidenceBindingIds ?? [],
    supportedScope: match.claim?.supportedScope,
    unsupportedScope: match.claim?.unsupportedScope,
    caveats: match.claim?.caveats ?? [],
  }
}

function projectEvidence(trace: InspectionEvidenceTrace): EvidenceStatusEvidence {
  return {
    ...trace,
    slideIndex: trace.slideIndex,
    slideTitle: trace.slideTitle,
    hasDetail: trace.hasDetail,
  }
}

function projectGap(gap: InspectionGap): EvidenceStatusGap {
  return {
    type: gap.type,
    slideIndex: gap.slideIndex,
    slideTitle: gap.slideTitle,
    claimText: gap.claimText,
    message: gap.message,
  }
}

function evidenceStatusGaps(match: InspectionElementMatch, issues: ReadinessIssue[]): EvidenceStatusGap[] {
  const gaps = match.gaps.map(projectGap)
  const slideIndex = match.slide?.index
  for (const issue of issues) {
    if (issue.slideIndex !== slideIndex) continue
    if (typeof issue.slideIndex !== "number") continue
    if (issue.type !== "missing_evidence" && issue.type !== "weak_evidence") continue
    if (gaps.some((gap) => gap.type === issue.type && gap.claimText === issue.claimText)) continue
    gaps.push({
      type: issue.type,
      slideIndex: issue.slideIndex,
      slideTitle: issue.slideTitle ?? match.slide?.title ?? "",
      claimText: issue.claimText ?? match.claim?.text ?? "",
      message: issue.message,
    })
  }
  return gaps
}

function relevantCandidates(candidates: EvidenceBindingCandidate[], match: InspectionElementMatch): EvidenceStatusCandidate[] {
  const slideIndex = match.slide?.index
  return candidates
    .filter((candidate) => candidate.slideIndex === slideIndex)
    .map((candidate) => ({
      ...candidate,
      relevant: candidateRelevantToMatch(candidate, match),
    }))
}

function candidateRelevantToMatch(candidate: EvidenceBindingCandidate, match: InspectionElementMatch): boolean {
  const claimText = normalizeText(match.claim?.text)
  if (!claimText || !candidate.claimText) return true
  const candidateClaim = normalizeText(candidate.claimText)
  if (candidateClaim === claimText || candidateClaim.includes(claimText) || claimText.includes(candidateClaim)) return true
  const quote = normalizeText(candidate.quote)
  if (quote.includes(claimText)) return true
  return (candidate.supportScope ?? []).some((scope) => {
    const normalizedScope = normalizeText(scope)
    return normalizedScope === claimText || normalizedScope.includes(claimText) || claimText.includes(normalizedScope)
  })
}

function relevantSearchDiagnostics(issues: ReadinessIssue[], match: InspectionElementMatch): EvidenceCandidateSearchDiagnostic[] {
  const slideIndex = match.slide?.index
  return issues
    .filter((issue) => issue.slideIndex === slideIndex && issue.evidenceCandidateSearch)
    .map((issue) => issue.evidenceCandidateSearch!)
}

function actionTraceForMatch(actions: WorkspaceAction[], match: InspectionElementMatch): EvidenceStatusActionTrace[] {
  const slideNodeId = match.slide ? `slide:${match.slide.index}` : undefined
  const evidenceKeys = new Set([
    match.claim?.id,
    match.claim?.canonicalClaimId,
    ...(match.claim?.evidenceBindingIds ?? []),
    ...match.evidence.flatMap((item) => [item.source, item.sourcePath, item.findingsFile, item.evidenceBindingId, item.claimId]),
  ].filter((value): value is string => Boolean(value)))
  return actions
    .filter((action) => actionRelevantToMatch(action, slideNodeId, evidenceKeys))
    .slice(-12)
    .map((action) => ({
      id: action.id,
      type: action.type,
      timestamp: action.timestamp,
      actor: action.actor,
      status: action.status,
      summary: action.summary,
      inputs: action.inputs,
      outputs: action.outputs,
      nodeIds: action.nodeIds,
    }))
}

function actionRelevantToMatch(action: WorkspaceAction, slideNodeId: string | undefined, evidenceKeys: Set<string>): boolean {
  if (slideNodeId && action.nodeIds?.includes(slideNodeId)) return true
  if (action.type === "evidence.binding_applied" || action.type === "evidence.candidate_generated") return true
  const text = JSON.stringify({ inputs: action.inputs, outputs: action.outputs, nodeIds: action.nodeIds })
  for (const key of evidenceKeys) {
    if (key && text.includes(key)) return true
  }
  return false
}

function normalizeText(value: string | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase()
}
