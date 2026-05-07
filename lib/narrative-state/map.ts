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
} from "./queries"
import { reviewNarrativeState } from "./readiness"
import type { NarrativeClaim, NarrativeStateV1 } from "./types"

export interface NarrativeMap {
  version: 1
  snapshot: NarrativeMapSnapshot
  claims: Record<NarrativeClaim["evidenceStatus"], NarrativeMapClaim[]>
  objections: NarrativeMapObjection[]
  risks: NarrativeMapRisk[]
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

export interface NarrativeMapArtifact {
  id: string
  type: RenderTarget["type"]
  outputPath?: string
  contractStatus?: RenderTarget["contractStatus"]
  sourceNodeIds: string[]
  claimIds: string[]
  narrativeIds: string[]
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
    objections: objectionRisk.objections,
    risks: objectionRisk.risks,
    artifactCoverage: getArtifactClaimRefs({ ...state, narrative }).map((artifact) => ({
      id: artifact.artifactId,
      type: artifact.type,
      outputPath: artifact.outputPath,
      contractStatus: artifact.contractStatus,
      sourceNodeIds: artifact.sourceNodeIds,
      claimIds: artifact.claimIds,
      narrativeIds: artifact.narrativeIds,
      note: artifact.note,
    })),
    nextActions: readiness.nextActions,
  }
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
        lines.push(`  Evidence: ${evidence.source} (${evidence.strength})`)
        if (evidence.findingsFile) lines.push(`  Findings: ${evidence.findingsFile}`)
        if (evidence.location) lines.push(`  Location: ${evidence.location}`)
        if (evidence.quote) lines.push(`  Quote: ${evidence.quote}`)
        if (evidence.unsupportedScope) lines.push(`  Unsupported scope: ${evidence.unsupportedScope}`)
        if (evidence.caveat) lines.push(`  Caveat: ${evidence.caveat}`)
      }
    }
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

  lines.push("", "## Render Target Coverage")
  if (map.artifactCoverage.length === 0) lines.push("- No render targets recorded")
  for (const artifact of map.artifactCoverage) {
    lines.push(`- ${artifact.type}: ${artifact.outputPath ?? artifact.id} [${artifact.contractStatus ?? "unknown"}]`)
    if (artifact.narrativeIds.length > 0) lines.push(`  Narrative refs: ${artifact.narrativeIds.join(", ")}`)
    if (artifact.claimIds.length > 0) lines.push(`  Claim refs: ${artifact.claimIds.join(", ")}`)
    if (artifact.note) lines.push(`  Note: ${artifact.note}`)
  }

  lines.push("", "## Next Actions")
  if (map.nextActions.length === 0) lines.push("- None")
  else for (const action of map.nextActions) lines.push(`- ${action}`)
  return lines.join("\n")
}

function valueOrDash(value: string | undefined): string {
  return value?.trim() || "-"
}
