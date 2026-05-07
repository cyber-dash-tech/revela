import type { DecksState } from "../decks-state"
import { projectWorkspaceGraph } from "../workspace-state/graph"
import { artifactNodeIdForRenderTarget } from "../workspace-state/render-targets"
import type { GraphEdge, RenderTarget } from "../workspace-state/types"
import { normalizeNarrativeState } from "./normalize"
import type { NarrativeClaim, NarrativeEvidenceBinding, NarrativeStateV1 } from "./types"

export interface ClaimEvidenceBoard {
  version: 1
  claims: Record<NarrativeClaim["evidenceStatus"], ClaimEvidenceRecord[]>
}

export interface ClaimEvidenceRecord {
  id: string
  text: string
  kind: NarrativeClaim["kind"]
  importance: NarrativeClaim["importance"]
  evidenceRequired: boolean
  evidenceStatus: NarrativeClaim["evidenceStatus"]
  supportedScope?: string
  unsupportedScope?: string
  caveats: string[]
  evidence: ClaimEvidenceBindingRecord[]
}

export interface ClaimEvidenceBindingRecord {
  id: string
  claimId: string
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

export interface SourceClaimIndexRecord {
  sourceKey: string
  source: string
  findingsFile?: string
  sourcePath?: string
  url?: string
  claims: Array<{
    claimId: string
    claimText: string
    evidenceId: string
    strength: NarrativeEvidenceBinding["strength"]
    supportScope?: string
    unsupportedScope?: string
    caveat?: string
  }>
}

export interface ObjectionRiskClaimIndex {
  objections: Array<{
    id: string
    text: string
    claimId?: string
    claimText?: string
    priority: "high" | "medium" | "low"
    response?: string
  }>
  risks: Array<{
    id: string
    text: string
    claimId?: string
    claimText?: string
    severity: "high" | "medium" | "low"
    mitigation?: string
  }>
}

export interface ArtifactClaimRef {
  artifactId: string
  type: RenderTarget["type"]
  outputPath?: string
  contractStatus?: RenderTarget["contractStatus"]
  sourceNodeIds: string[]
  claimIds: string[]
  narrativeIds: string[]
  note?: string
}

export interface NarrativeImpactInput {
  comment: string
  selectedText?: string
  slideTitle?: string
  slideRole?: string
}

export interface NarrativeImpactClassification {
  classification: "narrative-impacting" | "artifact-only" | "ambiguous"
  confidence: "high" | "medium" | "low"
  reasons: string[]
  recommendedPath: "update_narrative_first" | "artifact_edit" | "clarify_or_update_narrative_first"
}

export function getClaimEvidenceBoard(state: DecksState): ClaimEvidenceBoard {
  const narrative = canonicalNarrative(state)
  const evidenceByClaim = groupEvidenceByClaim(narrative.evidenceBindings)
  const claims: ClaimEvidenceBoard["claims"] = {
    supported: [],
    partial: [],
    weak: [],
    missing: [],
    not_required: [],
  }

  for (const claim of narrative.claims) {
    claims[claim.evidenceStatus].push({
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
    })
  }

  for (const group of Object.values(claims)) group.sort((a, b) => claimSortValue(a) - claimSortValue(b) || a.text.localeCompare(b.text))
  return { version: 1, claims }
}

export function getSourceClaimIndex(state: DecksState): SourceClaimIndexRecord[] {
  const narrative = canonicalNarrative(state)
  const claimTextById = new Map(narrative.claims.map((claim) => [claim.id, claim.text]))
  const grouped = new Map<string, SourceClaimIndexRecord>()

  for (const binding of narrative.evidenceBindings) {
    const sourceKey = binding.findingsFile || binding.sourcePath || binding.url || binding.source
    if (!sourceKey) continue
    const existing = grouped.get(sourceKey) ?? {
      sourceKey,
      source: binding.source,
      findingsFile: binding.findingsFile,
      sourcePath: binding.sourcePath,
      url: binding.url,
      claims: [],
    }
    existing.claims.push({
      claimId: binding.claimId,
      claimText: claimTextById.get(binding.claimId) ?? binding.claimId,
      evidenceId: binding.id,
      strength: binding.strength,
      supportScope: binding.supportScope,
      unsupportedScope: binding.unsupportedScope,
      caveat: binding.caveat,
    })
    grouped.set(sourceKey, existing)
  }

  return [...grouped.values()]
    .map((item) => ({ ...item, claims: item.claims.sort((a, b) => a.claimText.localeCompare(b.claimText)) }))
    .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))
}

export function getObjectionRiskClaimIndex(state: DecksState): ObjectionRiskClaimIndex {
  const narrative = canonicalNarrative(state)
  const claimTextById = new Map(narrative.claims.map((claim) => [claim.id, claim.text]))
  return {
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
  }
}

export function getArtifactClaimRefs(state: DecksState): ArtifactClaimRef[] {
  const narrative = canonicalNarrative(state)
  const graph = projectWorkspaceGraph({ ...state, narrative })
  const rendersFromByArtifact = rendersFromIndex(graph.edges)
  const claimIds = new Set(narrative.claims.map((claim) => claim.id))
  const narrativeIds = new Set([narrative.id])

  return (state.renderTargets ?? [])
    .map((target) => {
      const artifactId = artifactNodeIdForRenderTarget(target)
      const rendersFrom = rendersFromByArtifact.get(artifactId) ?? []
      const artifactClaimIds = [...new Set([...target.sourceNodeIds, ...rendersFrom].filter((id) => claimIds.has(id)))].sort()
      const artifactNarrativeIds = [...new Set([...target.sourceNodeIds, ...rendersFrom].filter((id) => narrativeIds.has(id)))].sort()
      return {
        artifactId,
        type: target.type,
        outputPath: target.outputPath,
        contractStatus: target.contractStatus,
        sourceNodeIds: target.sourceNodeIds ?? [],
        claimIds: artifactClaimIds,
        narrativeIds: artifactNarrativeIds,
        note: artifactClaimIds.length === 0 ? "Claim-to-slide/page coverage is not computed yet; page-level artifact coverage belongs to Phase 4." : undefined,
      }
    })
    .sort((a, b) => artifactSortValue(a.type) - artifactSortValue(b.type) || (a.outputPath ?? a.artifactId).localeCompare(b.outputPath ?? b.artifactId))
}

export function classifyNarrativeImpact(input: NarrativeImpactInput): NarrativeImpactClassification {
  const text = normalizeText([input.comment, input.selectedText, input.slideTitle, input.slideRole].filter(Boolean).join(" "))
  const reasons: string[] = []
  const narrativeMatches = matchKeywords(text, NARRATIVE_KEYWORDS)
  const artifactMatches = matchKeywords(text, ARTIFACT_ONLY_KEYWORDS)

  if (narrativeMatches.length > 0) {
    reasons.push(`Mentions narrative-impacting content: ${narrativeMatches.join(", ")}.`)
    if (artifactMatches.length > 0) reasons.push(`Also mentions artifact polish: ${artifactMatches.join(", ")}.`)
    return {
      classification: "narrative-impacting",
      confidence: artifactMatches.length > 0 ? "medium" : "high",
      reasons,
      recommendedPath: "update_narrative_first",
    }
  }

  if (artifactMatches.length > 0) {
    reasons.push(`Mentions artifact-only polish: ${artifactMatches.join(", ")}.`)
    return {
      classification: "artifact-only",
      confidence: "high",
      reasons,
      recommendedPath: "artifact_edit",
    }
  }

  return {
    classification: "ambiguous",
    confidence: "low",
    reasons: ["No clear artifact-only polish cue was found; default ambiguous content edits to narrative-first handling."],
    recommendedPath: "clarify_or_update_narrative_first",
  }
}

function canonicalNarrative(state: DecksState): NarrativeStateV1 {
  return state.narrative ?? normalizeNarrativeState(state)
}

function groupEvidenceByClaim(bindings: NarrativeEvidenceBinding[]): Map<string, ClaimEvidenceBindingRecord[]> {
  const grouped = new Map<string, ClaimEvidenceBindingRecord[]>()
  for (const binding of bindings) {
    grouped.set(binding.claimId, [...(grouped.get(binding.claimId) ?? []), {
      id: binding.id,
      claimId: binding.claimId,
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
    }])
  }
  return grouped
}

function rendersFromIndex(edges: GraphEdge[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.type !== "renders_from" || !edge.from.startsWith("artifact:")) continue
    grouped.set(edge.from, [...(grouped.get(edge.from) ?? []), edge.to])
  }
  return grouped
}

function claimSortValue(claim: Pick<ClaimEvidenceRecord, "importance">): number {
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

function matchKeywords(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword))
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

const NARRATIVE_KEYWORDS = [
  "claim",
  "thesis",
  "recommendation",
  "recommend",
  "evidence",
  "source",
  "caveat",
  "risk",
  "objection",
  "decision",
  "ask",
  "audience",
  "belief",
  "scope",
  "unsupported",
  "rewrite the bullet",
  "change the message",
  "make the argument",
  "结论",
  "观点",
  "证据",
  "风险",
  "建议",
  "决策",
  "受众",
]

const ARTIFACT_ONLY_KEYWORDS = [
  "spacing",
  "align",
  "alignment",
  "font",
  "color",
  "colour",
  "margin",
  "padding",
  "overflow",
  "crop",
  "image crop",
  "layout",
  "visual",
  "hierarchy",
  "animation",
  "export",
  "pdf",
  "pptx",
  "typo",
  "间距",
  "对齐",
  "字体",
  "颜色",
  "排版",
  "裁切",
  "导出",
]
