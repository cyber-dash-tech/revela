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

export type NarrativeMapClaim = ClaimEvidenceRecord

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
  stale: boolean
  staleReason?: string
  note?: string
}

export function buildNarrativeMap(state: DecksState): NarrativeMap {
  const narrative = state.narrative ?? normalizeNarrativeState(state)
  const reviewed = reviewNarrativeState({ ...state, narrative })
  const readiness = reviewed.result
  const narrativeHash = computeNarrativeHash(narrative)
  const board = getClaimEvidenceBoard({ ...state, narrative })
  const objectionRisk = getObjectionRiskClaimIndex({ ...state, narrative })

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
    claims: board.claims,
    claimFlow: claimRecordsInNarrativeOrder(narrative, board.claims),
    claimRelations: mapClaimRelations(narrative),
    objections: objectionRisk.objections,
    risks: objectionRisk.risks,
    researchGaps: (narrative.researchGaps ?? []).map((gap) => ({ ...gap, targetText: targetText(narrative, gap) })),
    artifactCoverage: getArtifactClaimRefs({ ...state, narrative }).map((artifact) => ({
      id: artifact.artifactId,
      type: artifact.type,
      outputPath: artifact.outputPath,
      contractStatus: artifact.contractStatus,
      sourceNodeIds: artifact.sourceNodeIds,
      claimIds: artifact.claimIds,
      narrativeIds: artifact.narrativeIds,
      slideRefs: artifact.slideRefs,
      stale: artifact.stale,
      staleReason: artifact.staleReason,
      note: artifact.note,
    })),
    nextActions: readiness.nextActions,
  }
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
    lines.push(`- ${artifact.type}: ${artifact.outputPath ?? artifact.id} [${artifact.contractStatus ?? "unknown"}${artifact.stale ? ", stale" : ""}]`)
    if (artifact.narrativeIds.length > 0) lines.push(`  Narrative refs: ${artifact.narrativeIds.join(", ")}`)
    if (artifact.claimIds.length > 0) lines.push(`  Claim refs: ${artifact.claimIds.join(", ")}`)
    for (const ref of artifact.slideRefs) lines.push(`  Slide ${ref.slideIndex}: ${ref.claimId} [${ref.role}] (${ref.match}/${ref.location})`)
    if (artifact.staleReason) lines.push(`  Stale reason: ${artifact.staleReason}`)
    if (artifact.note) lines.push(`  Note: ${artifact.note}`)
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
