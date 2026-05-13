import type { DecksState } from "../decks-state"
import type { RenderTarget } from "../workspace-state/types"
import { computeNarrativeHash } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import {
  getArtifactClaimRefs,
  getClaimEvidenceBoard,
  getObjectionRiskClaimIndex,
  type ClaimEvidenceRecord,
  type ClaimEvidenceBindingRecord,
  type ClaimSlideRef,
} from "./queries"
import { reviewNarrativeState } from "./readiness"
import type { NarrativeClaim, NarrativeClaimRelation, NarrativeResearchGap, NarrativeStateV1 } from "./types"

export interface NarrativeMap {
  version: 1
  snapshot: NarrativeMapSnapshot
  claims: Record<NarrativeClaim["evidenceStatus"], NarrativeMapClaim[]>
  claimFlow: NarrativeMapClaim[]
  claimRelations: NarrativeMapClaimRelation[]
  objections: NarrativeMapObjection[]
  risks: NarrativeMapRisk[]
  researchGaps: NarrativeMapResearchGap[]
  artifactCoverage: NarrativeMapArtifact[]
  workbench: NarrativeMapWorkbench
  nextActions: string[]
}

export interface NarrativeMapSnapshot {
  narrativeId: string
  narrativeHash: string
  status: NarrativeStateV1["status"]
  primaryAudience: string
  beliefBefore: string
  beliefAfter: string
  decisionAction: string
  thesis?: string
  approval: "current" | "stale" | "missing"
}

export interface NarrativeMapClaim extends ClaimEvidenceRecord {
  nextActions: NarrativeMapNextAction[]
  workbenchFlags: NarrativeMapFilterId[]
}

export type NarrativeMapActionKind = "research" | "attach_findings" | "narrow_claim" | "approve_narrative" | "make_deck" | "remake_artifact"

export type NarrativeMapArtifactStatus = "current" | "stale" | "partial" | "missing" | "no_target"

export interface NarrativeMapNextAction {
  kind: NarrativeMapActionKind
  label: string
  command: string
  reason: string
}

export type NarrativeMapFilterId = "all" | "missing_evidence" | "partial_evidence" | "stale_artifacts" | "open_gaps" | "risks" | "high_priority_objections"

export interface NarrativeMapWorkbenchFilter {
  id: NarrativeMapFilterId
  label: string
  count: number
  claimIds: string[]
}

export interface NarrativeMapArtifactWorkItem {
  artifactId: string
  type: RenderTarget["type"]
  outputPath?: string
  coverageStatus: NarrativeMapArtifact["coverageStatus"]
  contractStatus?: RenderTarget["contractStatus"]
  affectedClaimIds: string[]
  missingClaimIds: string[]
  affectedSlides: Array<{ claimId: string; slideIndex: number; slideTitle: string; role: string; location: string }>
  staleReasons: string[]
  statusNote: string
  recommendedNextCommand: string
}

export interface NarrativeMapWorkbenchSummary {
  approval: NarrativeMapSnapshot["approval"]
  evidenceBlockersCount: number
  artifactStatus: NarrativeMapArtifactStatus
  primaryNextCommand: string
  readinessNextActions: string[]
}

export interface NarrativeMapWorkbench {
  summary: NarrativeMapWorkbenchSummary
  filters: NarrativeMapWorkbenchFilter[]
  artifactCoverage: NarrativeMapArtifactWorkItem[]
  renderTargetAction?: NarrativeMapNextAction
}

export type NarrativeMapEvidence = ClaimEvidenceBindingRecord

export interface NarrativeMapClaimRelation extends NarrativeClaimRelation {
  fromClaimText?: string
  toClaimText?: string
  inferred?: boolean
}

export interface NarrativeMapObjection {
  id: string
  text: string
  claimId?: string
  claimText?: string
  priority: "high" | "medium" | "low"
  response?: string
}

export interface NarrativeMapRisk {
  id: string
  text: string
  claimId?: string
  claimText?: string
  severity: "high" | "medium" | "low"
  mitigation?: string
}

export type NarrativeMapResearchGap = NarrativeResearchGap & { targetText?: string }

export interface NarrativeMapArtifact {
  id: string
  type: RenderTarget["type"]
  outputPath?: string
  contractStatus?: RenderTarget["contractStatus"]
  sourceNodeIds: string[]
  claimIds: string[]
  narrativeIds: string[]
  slideRefs: ClaimSlideRef[]
  coverageStatus: "current" | "stale" | "partial" | "missing"
  affectedClaimIds: string[]
  missingClaimIds: string[]
  staleReasons: string[]
  stale: boolean
  staleReason?: string
  note?: string
}

export function buildNarrativeMap(state: DecksState): NarrativeMap {
  const narrative = state.narrative ?? normalizeNarrativeState(state)
  const reviewed = reviewNarrativeState({ ...state, narrative })
  const readiness = reviewed.result
  const narrativeHash = computeNarrativeHash(narrative)
  const rawBoard = getClaimEvidenceBoard({ ...state, narrative })
  const objectionRisk = getObjectionRiskClaimIndex({ ...state, narrative })
  const researchGaps = (narrative.researchGaps ?? []).map((gap) => ({ ...gap, targetText: targetText(narrative, gap) }))
  const artifactCoverage = getArtifactClaimRefs({ ...state, narrative }).map((artifact) => ({
    id: artifact.artifactId,
    type: artifact.type,
    outputPath: artifact.outputPath,
    contractStatus: artifact.contractStatus,
    sourceNodeIds: artifact.sourceNodeIds,
    claimIds: artifact.claimIds,
    narrativeIds: artifact.narrativeIds,
    slideRefs: artifact.slideRefs,
    coverageStatus: artifact.coverageStatus,
    affectedClaimIds: artifact.affectedClaimIds,
    missingClaimIds: artifact.missingClaimIds,
    staleReasons: artifact.staleReasons,
    stale: artifact.stale,
    staleReason: artifact.staleReason,
    note: artifact.note,
  }))
  const claims = withWorkbenchClaimData(rawBoard.claims, narrative, readiness.approval?.current === true, objectionRisk, researchGaps, artifactCoverage)
  const claimFlow = claimRecordsInNarrativeOrder(narrative, claims)

  return {
    version: 1,
    snapshot: {
      narrativeId: narrative.id,
      narrativeHash,
      status: readiness.status === "approved" ? "approved" : narrative.status,
      primaryAudience: narrative.audience.primary,
      beliefBefore: narrative.audience.beliefBefore,
      beliefAfter: narrative.audience.beliefAfter,
      decisionAction: narrative.decision.action,
      thesis: narrative.thesis?.statement,
      approval: readiness.approval?.current ? "current" : readiness.approval?.stale ? "stale" : "missing",
    },
    claims,
    claimFlow,
    claimRelations: mapClaimRelations(narrative),
    objections: objectionRisk.objections,
    risks: objectionRisk.risks,
    researchGaps,
    artifactCoverage,
    workbench: buildWorkbench(claimFlow, artifactCoverage, readiness.approval?.current === true, readiness.nextActions, readiness.approval?.current ? "current" : readiness.approval?.stale ? "stale" : "missing"),
    nextActions: readiness.nextActions,
  }
}

function withWorkbenchClaimData(
  claimsByStatus: Record<NarrativeClaim["evidenceStatus"], ClaimEvidenceRecord[]>,
  narrative: NarrativeStateV1,
  approved: boolean,
  objectionRisk: ReturnType<typeof getObjectionRiskClaimIndex>,
  researchGaps: NarrativeMapResearchGap[],
  artifacts: NarrativeMapArtifact[],
): Record<NarrativeClaim["evidenceStatus"], NarrativeMapClaim[]> {
  return Object.fromEntries(Object.entries(claimsByStatus).map(([status, claims]) => [
    status,
    claims.map((claim) => ({
      ...claim,
      nextActions: claimNextActions(claim, narrative, approved, objectionRisk, researchGaps, artifacts),
      workbenchFlags: claimWorkbenchFlags(claim, objectionRisk, researchGaps, artifacts),
    })),
  ])) as Record<NarrativeClaim["evidenceStatus"], NarrativeMapClaim[]>
}

function claimNextActions(
  claim: ClaimEvidenceRecord,
  narrative: NarrativeStateV1,
  approved: boolean,
  objectionRisk: ReturnType<typeof getObjectionRiskClaimIndex>,
  researchGaps: NarrativeMapResearchGap[],
  artifacts: NarrativeMapArtifact[],
): NarrativeMapNextAction[] {
  const actions: NarrativeMapNextAction[] = []
  const claimGaps = researchGaps.filter((gap) => gap.targetType === "claim" && gap.targetId === claim.id)
  const hasSavedFindings = claimGaps.some((gap) => gap.status === "findings_saved" || gap.status === "attached")
  const needsEvidence = claim.evidenceRequired && (claim.evidenceStatus === "missing" || claim.evidenceStatus === "weak")
  const partialEvidence = claim.evidenceRequired && claim.evidenceStatus === "partial"
  const affectedArtifacts = artifacts.filter((artifact) => artifact.coverageStatus !== "current" && (artifact.affectedClaimIds.includes(claim.id) || artifact.missingClaimIds.includes(claim.id) || artifact.claimIds.includes(claim.id)))

  if (needsEvidence || claimGaps.some((gap) => gap.status === "open" || gap.status === "in_progress")) actions.push({
    kind: "research",
    label: "Research this gap",
    command: "/revela research",
    reason: needsEvidence ? "Required evidence is missing or weak for this claim." : "An open research gap targets this claim.",
  })
  if (hasSavedFindings) actions.push({
    kind: "attach_findings",
    label: "Attach findings",
    command: "/revela research",
    reason: "Saved or attached findings still need canonical evidence binding.",
  })
  if (partialEvidence || Boolean(claim.unsupportedScope)) actions.push({
    kind: "narrow_claim",
    label: "Narrow claim",
    command: "/revela story",
    reason: claim.unsupportedScope || "Evidence only partially supports the claim scope.",
  })
  if (!approved) actions.push({
    kind: "approve_narrative",
    label: "Approve narrative",
    command: "/revela story",
    reason: "The current narrative is not approved for artifact rendering.",
  })
  if (approved && artifacts.length === 0) actions.push({
    kind: "make_deck",
    label: "Make deck",
    command: "/revela make --deck",
    reason: "No render target is recorded for this approved narrative.",
  })
  if (approved && affectedArtifacts.length > 0) actions.push({
    kind: "remake_artifact",
    label: "Remake stale artifact",
    command: "/revela make --deck",
    reason: "Artifact coverage is stale, partial, or missing for this claim.",
  })
  if (approved && actions.length === 0 && claim.importance === "central") actions.push({
    kind: "make_deck",
    label: "Make deck",
    command: "/revela make --deck",
    reason: "Central claim is ready to hand off to an artifact.",
  })

  return dedupeActions(actions)
}

function claimWorkbenchFlags(
  claim: ClaimEvidenceRecord,
  objectionRisk: ReturnType<typeof getObjectionRiskClaimIndex>,
  researchGaps: NarrativeMapResearchGap[],
  artifacts: NarrativeMapArtifact[],
): NarrativeMapFilterId[] {
  const flags: NarrativeMapFilterId[] = ["all"]
  if (claim.evidenceRequired && claim.evidenceStatus === "missing") flags.push("missing_evidence")
  if (claim.evidenceRequired && (claim.evidenceStatus === "partial" || claim.evidenceStatus === "weak")) flags.push("partial_evidence")
  if (researchGaps.some((gap) => gap.targetType === "claim" && gap.targetId === claim.id && (gap.status === "open" || gap.status === "in_progress" || gap.status === "findings_saved"))) flags.push("open_gaps")
  if (objectionRisk.risks.some((risk) => risk.claimId === claim.id)) flags.push("risks")
  if (objectionRisk.objections.some((objection) => objection.claimId === claim.id && objection.priority === "high")) flags.push("high_priority_objections")
  if (artifacts.some((artifact) => artifact.coverageStatus !== "current" && (artifact.affectedClaimIds.includes(claim.id) || artifact.missingClaimIds.includes(claim.id) || artifact.claimIds.includes(claim.id)))) flags.push("stale_artifacts")
  return [...new Set(flags)]
}

function buildWorkbench(
  claims: NarrativeMapClaim[],
  artifacts: NarrativeMapArtifact[],
  approved: boolean,
  readinessNextActions: string[],
  approval: NarrativeMapSnapshot["approval"],
): NarrativeMapWorkbench {
  const filterLabels: Record<NarrativeMapFilterId, string> = {
    all: "All claims",
    missing_evidence: "Missing evidence",
    partial_evidence: "Partial evidence",
    stale_artifacts: "Stale artifacts",
    open_gaps: "Open gaps",
    risks: "Risks",
    high_priority_objections: "High-priority objections",
  }
  const filterIds: NarrativeMapFilterId[] = ["all", "missing_evidence", "partial_evidence", "stale_artifacts", "open_gaps", "risks", "high_priority_objections"]
  const renderTargetAction = artifacts.length === 0 ? {
    kind: approved ? "make_deck" as const : "approve_narrative" as const,
    label: approved ? "Make deck" : "Approve narrative",
    command: approved ? "/revela make --deck" : "/revela story",
    reason: approved ? "No render target is recorded for this approved narrative." : "Narrative approval is required before rendering artifacts.",
  } : undefined
  return {
    summary: buildWorkbenchSummary(claims, artifacts, approval, readinessNextActions, renderTargetAction?.command),
    filters: filterIds.map((id) => {
      const claimIds = claims.filter((claim) => claim.workbenchFlags.includes(id)).map((claim) => claim.id)
      return { id, label: filterLabels[id], count: claimIds.length, claimIds }
    }),
    artifactCoverage: artifacts.map((artifact) => ({
      artifactId: artifact.id,
      type: artifact.type,
      outputPath: artifact.outputPath,
      coverageStatus: artifact.coverageStatus,
      contractStatus: artifact.contractStatus,
      affectedClaimIds: artifact.affectedClaimIds,
      missingClaimIds: artifact.missingClaimIds,
      affectedSlides: artifact.slideRefs
        .filter((ref) => artifact.affectedClaimIds.includes(ref.claimId) || artifact.missingClaimIds.includes(ref.claimId) || artifact.coverageStatus !== "current")
        .map((ref) => ({ claimId: ref.claimId, slideIndex: ref.slideIndex, slideTitle: ref.slideTitle, role: ref.role, location: ref.location })),
      staleReasons: artifact.staleReasons,
      statusNote: artifactStatusNote(artifact, artifacts),
      recommendedNextCommand: recommendedArtifactCommand(artifact, artifacts),
    })),
    renderTargetAction,
  }
}

function buildWorkbenchSummary(
  claims: NarrativeMapClaim[],
  artifacts: NarrativeMapArtifact[],
  approval: NarrativeMapSnapshot["approval"],
  readinessNextActions: string[],
  renderTargetCommand?: string,
): NarrativeMapWorkbenchSummary {
  const evidenceBlockersCount = claims.filter((claim) => claim.evidenceRequired && (claim.evidenceStatus === "missing" || claim.evidenceStatus === "weak" || claim.evidenceStatus === "partial")).length
  const artifactStatus = aggregateArtifactStatus(artifacts)
  return {
    approval,
    evidenceBlockersCount,
    artifactStatus,
    primaryNextCommand: primaryNextCommand({ approval, evidenceBlockersCount, artifactStatus, artifacts, renderTargetCommand }),
    readinessNextActions,
  }
}

function primaryNextCommand(input: { approval: NarrativeMapSnapshot["approval"]; evidenceBlockersCount: number; artifactStatus: NarrativeMapArtifactStatus; artifacts: NarrativeMapArtifact[]; renderTargetCommand?: string }): string {
  if (input.evidenceBlockersCount > 0) return "/revela research"
  if (input.approval !== "current") return "/revela story"
  if (input.artifactStatus === "no_target") return input.renderTargetCommand ?? "/revela make --deck"
  if (input.artifactStatus !== "current") return input.artifacts.map((artifact) => recommendedArtifactCommand(artifact, input.artifacts)).find((command) => command !== "/revela review --deck") ?? "/revela make --deck"
  return "/revela review --deck"
}

function aggregateArtifactStatus(artifacts: NarrativeMapArtifact[]): NarrativeMapArtifactStatus {
  if (artifacts.length === 0) return "no_target"
  if (artifacts.some((artifact) => artifact.coverageStatus === "stale")) return "stale"
  if (artifacts.some((artifact) => artifact.coverageStatus === "missing")) return "missing"
  if (artifacts.some((artifact) => artifact.coverageStatus === "partial")) return "partial"
  return "current"
}

function recommendedArtifactCommand(artifact: NarrativeMapArtifact, artifacts: NarrativeMapArtifact[]): string {
  if (artifact.coverageStatus === "current") return artifact.type === "html_deck" ? "/revela review --deck" : exportCommand(artifact.type) ?? "/revela review --deck"
  if (artifact.type === "html_deck") return "/revela make --deck"
  if ((artifact.type === "pdf" || artifact.type === "pptx") && activeHtmlIsCurrent(artifact, artifacts)) return exportCommand(artifact.type) ?? "/revela make --deck"
  return "/revela make --deck"
}

function artifactStatusNote(artifact: NarrativeMapArtifact, artifacts: NarrativeMapArtifact[]): string {
  if (artifact.coverageStatus === "current") return artifact.type === "html_deck" ? "Current HTML deck is ready for review or export." : `Current ${artifact.type.toUpperCase()} export is recorded.`
  const command = recommendedArtifactCommand(artifact, artifacts)
  if ((artifact.type === "pdf" || artifact.type === "pptx") && command.startsWith("/revela export")) return `HTML deck is current; refresh the ${artifact.type.toUpperCase()} export.`
  return "Artifact coverage is not current; remake the deck from the approved narrative."
}

function activeHtmlIsCurrent(artifact: NarrativeMapArtifact, artifacts: NarrativeMapArtifact[]): boolean {
  const expectedHtmlPath = artifact.outputPath?.replace(/\.(pdf|pptx)$/i, ".html")
  return artifacts.some((item) => item.type === "html_deck" && item.coverageStatus === "current" && (!expectedHtmlPath || item.outputPath === expectedHtmlPath))
}

function exportCommand(type: RenderTarget["type"]): string | undefined {
  if (type === "pdf") return "/revela export --deck pdf"
  if (type === "pptx") return "/revela export --deck pptx"
  return undefined
}

function dedupeActions(actions: NarrativeMapNextAction[]): NarrativeMapNextAction[] {
  const seen = new Set<string>()
  return actions.filter((action) => {
    const key = `${action.kind}:${action.command}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function claimRecordsInNarrativeOrder(narrative: NarrativeStateV1, claimsByStatus: Record<NarrativeClaim["evidenceStatus"], NarrativeMapClaim[]>): NarrativeMapClaim[] {
  const records = new Map(Object.values(claimsByStatus).flat().map((claim) => [claim.id, claim]))
  return narrative.claims.map((claim) => records.get(claim.id)).filter((claim): claim is NarrativeMapClaim => Boolean(claim))
}

function mapClaimRelations(narrative: NarrativeStateV1): NarrativeMapClaimRelation[] {
  const explicit = (narrative.claimRelations ?? []).map((relation) => withClaimRelationText(narrative, relation, false))
  if (explicit.length > 0) return explicit
  const flowClaims = narrative.claims.filter((claim) => claim.importance === "central" || claim.kind === "recommendation" || claim.kind === "ask" || claim.kind === "problem" || claim.kind === "evidence")
  return flowClaims.slice(0, -1).map((claim, index) => withClaimRelationText(narrative, {
    id: `inferred:${claim.id}:${flowClaims[index + 1].id}`,
    fromClaimId: claim.id,
    toClaimId: flowClaims[index + 1].id,
    relation: inferredRelation(claim.kind, flowClaims[index + 1].kind),
    rationale: "Inferred from claim order and claim kind for display only.",
  }, true))
}

function withClaimRelationText(narrative: NarrativeStateV1, relation: NarrativeClaimRelation, inferred: boolean): NarrativeMapClaimRelation {
  return {
    ...relation,
    fromClaimText: narrative.claims.find((claim) => claim.id === relation.fromClaimId)?.text,
    toClaimText: narrative.claims.find((claim) => claim.id === relation.toClaimId)?.text,
    inferred,
  }
}

function inferredRelation(fromKind: NarrativeClaim["kind"], toKind: NarrativeClaim["kind"]): NarrativeClaimRelation["relation"] {
  if (toKind === "risk") return "constrains"
  if (toKind === "ask" || toKind === "recommendation") return "leads_to"
  if (fromKind === "problem" && toKind === "evidence") return "supports"
  return "leads_to"
}

export function formatNarrativeMap(map: NarrativeMap): string {
  const lines: string[] = []
  lines.push("## Narrative Snapshot")
  lines.push(`- Status: ${map.snapshot.status}`)
  lines.push(`- Approval: ${map.snapshot.approval}`)
  lines.push(`- Narrative hash: ${map.snapshot.narrativeHash}`)
  lines.push(`- Audience: ${valueOrDash(map.snapshot.primaryAudience)}`)
  lines.push(`- Belief before: ${valueOrDash(map.snapshot.beliefBefore)}`)
  lines.push(`- Belief after: ${valueOrDash(map.snapshot.beliefAfter)}`)
  lines.push(`- Decision/action: ${valueOrDash(map.snapshot.decisionAction)}`)
  lines.push(`- Thesis: ${valueOrDash(map.snapshot.thesis)}`)

  lines.push("", "## Claim Evidence Board")
  for (const status of ["supported", "partial", "weak", "missing", "not_required"] as const) {
    const claims = map.claims[status]
    lines.push(`### ${status} (${claims.length})`)
    if (claims.length === 0) {
      lines.push("- None")
      continue
    }
    for (const claim of claims) {
      lines.push(`- ${claim.text} [${claim.importance}/${claim.kind}]`)
      if (claim.supportedScope) lines.push(`  Supported scope: ${claim.supportedScope}`)
      if (claim.unsupportedScope) lines.push(`  Unsupported scope: ${claim.unsupportedScope}`)
      for (const caveat of claim.caveats) lines.push(`  Caveat: ${caveat}`)
      if (claim.evidence.length === 0) lines.push("  Evidence: none")
      for (const evidence of claim.evidence) {
        lines.push(`  Evidence: ${evidenceLine(evidence)}`)
      }
      if (claim.nextActions.length > 0) lines.push(`  Next actions: ${claim.nextActions.map((action) => `${action.label} (${action.command})`).join("; ")}`)
    }
  }

  lines.push("", "## Claim Flow")
  if (map.claimRelations.length === 0) lines.push("- No claim relations recorded")
  for (const relation of map.claimRelations) {
    lines.push(`- ${valueOrDash(relation.fromClaimText ?? relation.fromClaimId)} --${relationLabel(relation)}--> ${valueOrDash(relation.toClaimText ?? relation.toClaimId)}`)
    if (relation.inferred) lines.push("  Rationale: unconfirmed order note only; no causal, support, or dependency relation has been judged")
    else if (relation.rationale) lines.push(`  Rationale: ${relation.rationale}`)
    else if (!relation.inferred) lines.push("  Rationale: causal rationale is not recorded")
  }

  lines.push("", "## Objections & Risks")
  if (map.objections.length === 0 && map.risks.length === 0) lines.push("- None recorded")
  for (const objection of map.objections) {
    lines.push(`- Objection (${objection.priority}): ${objection.text}`)
    if (objection.claimText) lines.push(`  Challenges: ${objection.claimText}`)
    if (objection.response) lines.push(`  Response: ${objection.response}`)
  }
  for (const risk of map.risks) {
    lines.push(`- Risk (${risk.severity}): ${risk.text}`)
    if (risk.claimText) lines.push(`  Constrains: ${risk.claimText}`)
    if (risk.mitigation) lines.push(`  Mitigation: ${risk.mitigation}`)
  }

  lines.push("", "## Research Gaps")
  if (map.researchGaps.length === 0) lines.push("- None recorded")
  for (const gap of map.researchGaps) {
    lines.push(`- ${gap.question} [${gap.status}/${gap.priority}]`)
    lines.push(`  Target: ${gap.targetType}${gap.targetText ? ` - ${gap.targetText}` : ""}`)
    if (gap.findingsFile) lines.push(`  Findings: ${gap.findingsFile}`)
    if (gap.evidenceBindingIds?.length) lines.push(`  Evidence bindings: ${gap.evidenceBindingIds.join(", ")}`)
    if (gap.notes) lines.push(`  Notes: ${gap.notes}`)
  }

  lines.push("", "## Render Target Coverage")
  if (map.artifactCoverage.length === 0) lines.push("- No render targets recorded")
  for (const artifact of map.artifactCoverage) {
    lines.push(`- ${artifact.type}: ${artifact.outputPath ?? artifact.id} [${artifact.contractStatus ?? "unknown"}, coverage: ${artifact.coverageStatus}]`)
    if (artifact.narrativeIds.length > 0) lines.push(`  Narrative refs: ${artifact.narrativeIds.join(", ")}`)
    if (artifact.claimIds.length > 0) lines.push(`  Claim refs: ${artifact.claimIds.join(", ")}`)
    if (artifact.missingClaimIds.length > 0) lines.push(`  Missing claim refs: ${artifact.missingClaimIds.join(", ")}`)
    if (artifact.affectedClaimIds.length > 0) lines.push(`  Affected claim refs: ${artifact.affectedClaimIds.join(", ")}`)
    for (const ref of artifact.slideRefs) lines.push(`  Slide ${ref.slideIndex}: ${ref.claimId} [${ref.role}] (${ref.match}/${ref.location})`)
    for (const reason of artifact.staleReasons) lines.push(`  Coverage note: ${reason}`)
    if (artifact.note) lines.push(`  Note: ${artifact.note}`)
  }

  lines.push("", "## Story Workbench")
  lines.push(`- Summary approval: ${map.workbench.summary.approval}`)
  lines.push(`- Summary evidence blockers: ${map.workbench.summary.evidenceBlockersCount}`)
  lines.push(`- Summary artifact status: ${map.workbench.summary.artifactStatus}`)
  lines.push(`- Summary primary next command: ${map.workbench.summary.primaryNextCommand}`)
  for (const filter of map.workbench.filters) lines.push(`- Filter ${filter.id}: ${filter.count}${filter.claimIds.length ? ` (${filter.claimIds.join(", ")})` : ""}`)
  if (map.workbench.renderTargetAction) lines.push(`- Render target action: ${map.workbench.renderTargetAction.label} (${map.workbench.renderTargetAction.command})`)
  for (const item of map.workbench.artifactCoverage) {
    lines.push(`- Artifact work item: ${item.type}: ${item.outputPath ?? item.artifactId} [${item.coverageStatus}] -> ${item.recommendedNextCommand}`)
    lines.push(`  Status note: ${item.statusNote}`)
    if (item.missingClaimIds.length) lines.push(`  Missing claims: ${item.missingClaimIds.join(", ")}`)
    if (item.affectedClaimIds.length) lines.push(`  Affected claims: ${item.affectedClaimIds.join(", ")}`)
    if (item.affectedSlides.length) lines.push(`  Affected slides: ${item.affectedSlides.map((slide) => `${slide.slideIndex}:${slide.claimId}`).join(", ")}`)
  }

  lines.push("", "## Next Actions")
  if (map.nextActions.length === 0) lines.push("- None")
  else for (const action of map.nextActions) lines.push(`- ${action}`)
  return lines.join("\n")
}

function relationLabel(relation: NarrativeMapClaimRelation): string {
  return relation.inferred ? "unconfirmed_order" : relation.relation
}

function evidenceLine(evidence: NarrativeMapEvidence): string {
  return [
    evidence.source,
    `strength: ${evidence.strength}`,
    evidence.findingsFile ? `findings: ${evidence.findingsFile}` : "",
    evidence.location ? `location: ${evidence.location}` : "",
    evidence.quote ? `quote: ${evidence.quote}` : "",
    evidence.unsupportedScope ? `unsupported scope: ${evidence.unsupportedScope}` : "",
    evidence.caveat ? `caveat: ${evidence.caveat}` : "",
  ].filter(Boolean).join(" | ")
}

function valueOrDash(value: string | undefined): string {
  return value?.trim() || "-"
}

function targetText(narrative: NarrativeStateV1, gap: NarrativeResearchGap): string | undefined {
  if (!gap.targetId) return undefined
  if (gap.targetType === "claim") return narrative.claims.find((claim) => claim.id === gap.targetId)?.text
  if (gap.targetType === "objection") return narrative.objections.find((objection) => objection.id === gap.targetId)?.text
  if (gap.targetType === "risk") return narrative.risks.find((risk) => risk.id === gap.targetId)?.text
  if (gap.targetType === "decision") return narrative.decision.action
  if (gap.targetType === "narrative") return narrative.thesis?.statement
  return undefined
}
