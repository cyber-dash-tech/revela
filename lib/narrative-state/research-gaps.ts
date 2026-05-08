import type { DecksState } from "../decks-state"
import { recordWorkspaceAction } from "../workspace-state/actions"
import { stableResearchGapId } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import { reviewNarrativeState } from "./readiness"
import type {
  NarrativeReadinessIssue,
  NarrativeResearchGap,
  NarrativeResearchGapStatus,
  NarrativeResearchGapTargetType,
  NarrativeStateV1,
} from "./types"

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
