import type { DecksState } from "../decks-state"
import { projectWorkspaceGraph } from "../workspace-state/graph"
import { artifactNodeIdForRenderTarget } from "../workspace-state/render-targets"
import type { RenderTarget } from "../workspace-state/types"
import { computeNarrativeHash } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import { reviewNarrativeState } from "./readiness"
import type { NarrativeClaim, NarrativeEvidenceBinding, NarrativeStateV1 } from "./types"

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

export interface NarrativeMapClaim {
  id: string
  text: string
  kind: NarrativeClaim["kind"]
  importance: NarrativeClaim["importance"]
  evidenceRequired: boolean
  evidenceStatus: NarrativeClaim["evidenceStatus"]
  supportedScope?: string
  unsupportedScope?: string
  caveats: string[]
  evidence: NarrativeMapEvidence[]
  appearsIn: string[]
}

export interface NarrativeMapEvidence {
  id: string
  source: string
  findingsFile?: string
  sourcePath?: string
  quote?: string
  location?: string
  url?: string
  caveat?: string
  supportScope?: string
  unsupportedScope?: string
  strength: NarrativeEvidenceBinding["strength"]
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

export interface NarrativeMapArtifact {
  id: string
  type: RenderTarget["type"]
  outputPath?: string
  contractStatus?: RenderTarget["contractStatus"]
  sourceNodeIds: string[]
  rendersFrom: string[]
}

export function buildNarrativeMap(state: DecksState): NarrativeMap {
  const narrative = state.narrative ?? normalizeNarrativeState(state)
  const reviewed = reviewNarrativeState({ ...state, narrative })
  const readiness = reviewed.result
  const graph = projectWorkspaceGraph({ ...state, narrative })
  const narrativeHash = computeNarrativeHash(narrative)
  const claimTextById = new Map(narrative.claims.map((claim) => [claim.id, claim.text]))
  const evidenceByClaim = groupEvidenceByClaim(narrative.evidenceBindings)
  const appearancesByClaim = claimAppearances(graph.edges)

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
    claims: groupClaims(narrative.claims, evidenceByClaim, appearancesByClaim),
    objections: narrative.objections.map((objection) => ({
      id: objection.id,
      text: objection.text,
      claimId: objection.claimId,
      claimText: objection.claimId ? claimTextById.get(objection.claimId) : undefined,
      priority: objection.priority,
      response: objection.response,
    })),
    risks: narrative.risks.map((risk) => ({
      id: risk.id,
      text: risk.text,
      claimId: risk.claimId,
      claimText: risk.claimId ? claimTextById.get(risk.claimId) : undefined,
      severity: risk.severity,
      mitigation: risk.mitigation,
    })),
    artifactCoverage: artifactCoverage(state.renderTargets ?? [], graph.edges),
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
      if (claim.appearsIn.length > 0) lines.push(`  Appears in: ${claim.appearsIn.join(", ")}`)
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

  lines.push("", "## Artifact Coverage")
  if (map.artifactCoverage.length === 0) lines.push("- No render targets recorded")
  for (const artifact of map.artifactCoverage) {
    lines.push(`- ${artifact.type}: ${artifact.outputPath ?? artifact.id} [${artifact.contractStatus ?? "unknown"}]`)
    if (artifact.rendersFrom.length > 0) lines.push(`  Renders from: ${artifact.rendersFrom.join(", ")}`)
  }

  lines.push("", "## Next Actions")
  if (map.nextActions.length === 0) lines.push("- None")
  else for (const action of map.nextActions) lines.push(`- ${action}`)
  return lines.join("\n")
}

function groupClaims(
  claims: NarrativeClaim[],
  evidenceByClaim: Map<string, NarrativeMapEvidence[]>,
  appearancesByClaim: Map<string, string[]>,
): NarrativeMap["claims"] {
  const groups: NarrativeMap["claims"] = {
    supported: [],
    partial: [],
    weak: [],
    missing: [],
    not_required: [],
  }
  for (const claim of claims) {
    groups[claim.evidenceStatus].push({
      id: claim.id,
      text: claim.text,
      kind: claim.kind,
      importance: claim.importance,
      evidenceRequired: claim.evidenceRequired,
      evidenceStatus: claim.evidenceStatus,
      supportedScope: claim.supportedScope,
      unsupportedScope: claim.unsupportedScope,
      caveats: claim.caveats ?? [],
      evidence: evidenceByClaim.get(claim.id) ?? [],
      appearsIn: appearancesByClaim.get(claim.id) ?? [],
    })
  }
  for (const group of Object.values(groups)) group.sort((a, b) => claimSortValue(a) - claimSortValue(b) || a.text.localeCompare(b.text))
  return groups
}

function groupEvidenceByClaim(bindings: NarrativeEvidenceBinding[]): Map<string, NarrativeMapEvidence[]> {
  const grouped = new Map<string, NarrativeMapEvidence[]>()
  for (const binding of bindings) {
    const evidence: NarrativeMapEvidence = {
      id: binding.id,
      source: binding.source,
      findingsFile: binding.findingsFile,
      sourcePath: binding.sourcePath,
      quote: binding.quote,
      location: binding.location,
      url: binding.url,
      caveat: binding.caveat,
      supportScope: binding.supportScope,
      unsupportedScope: binding.unsupportedScope,
      strength: binding.strength,
    }
    grouped.set(binding.claimId, [...(grouped.get(binding.claimId) ?? []), evidence])
  }
  return grouped
}

function claimAppearances(edges: ReturnType<typeof projectWorkspaceGraph>["edges"]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.type !== "appears_in") continue
    if (!edge.from.startsWith("claim:")) continue
    grouped.set(edge.from, [...(grouped.get(edge.from) ?? []), edge.to])
  }
  return grouped
}

function artifactCoverage(targets: RenderTarget[], edges: ReturnType<typeof projectWorkspaceGraph>["edges"]): NarrativeMapArtifact[] {
  const rendersFromByArtifact = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.type !== "renders_from" || !edge.from.startsWith("artifact:")) continue
    rendersFromByArtifact.set(edge.from, [...(rendersFromByArtifact.get(edge.from) ?? []), edge.to])
  }
  return targets
    .map((target) => {
      const artifactId = artifactNodeIdForRenderTarget(target)
      return {
        id: target.id,
        type: target.type,
        outputPath: target.outputPath,
        contractStatus: target.contractStatus,
        sourceNodeIds: target.sourceNodeIds ?? [],
        rendersFrom: rendersFromByArtifact.get(artifactId) ?? [],
      }
    })
    .sort((a, b) => artifactSortValue(a.type) - artifactSortValue(b.type) || (a.outputPath ?? a.id).localeCompare(b.outputPath ?? b.id))
}

function claimSortValue(claim: Pick<NarrativeMapClaim, "importance">): number {
  if (claim.importance === "central") return 0
  if (claim.importance === "supporting") return 1
  return 2
}

function artifactSortValue(type: RenderTarget["type"]): number {
  if (type === "html_deck") return 0
  if (type === "pdf") return 1
  if (type === "pptx") return 2
  return 3
}

function valueOrDash(value: string | undefined): string {
  return value?.trim() || "-"
}
