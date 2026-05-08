import type { DeckSpec, DecksState, EvidenceRef, SlideClaimRefRole, SlideSpec } from "../decks-state"
import { projectWorkspaceGraph } from "../workspace-state/graph"
import { artifactNodeIdForRenderTarget } from "../workspace-state/render-targets"
import type { GraphEdge, RenderTarget } from "../workspace-state/types"
import { computeNarrativeHash } from "./hash"
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
  slideRefs: ClaimSlideRef[]
  stale: boolean
  staleReason?: string
  note?: string
}

export interface ClaimSlideRef {
  claimId: string
  claimText: string
  slideIndex: number
  slideTitle: string
  match: "content" | "evidence" | "metadata"
  role: SlideClaimRefRole
  location: string
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
  const narrativeHash = computeNarrativeHash(narrative)
  const deck = maybeActiveDeck(state)
  const slideRefs = deck ? getClaimSlideRefs({ ...state, narrative }, deck) : []
  const slideClaimIds = [...new Set(slideRefs.map((ref) => ref.claimId))].sort()
  const rendersFromByArtifact = deck ? rendersFromIndex(projectWorkspaceGraph({ ...state, narrative }).edges) : new Map<string, string[]>()
  const claimIds = new Set(narrative.claims.map((claim) => claim.id))
  const narrativeIds = new Set([narrative.id])
  const htmlCoverageByPath = new Map<string, ClaimSlideRef[]>()

  return (state.renderTargets ?? [])
    .map((target) => {
      const artifactId = artifactNodeIdForRenderTarget(target)
      const rendersFrom = rendersFromByArtifact.get(artifactId) ?? []
      const targetSlideRefs = claimSlideRefsForTarget(target, slideRefs, htmlCoverageByPath)
      const artifactClaimIds = [...new Set([...target.sourceNodeIds, ...rendersFrom, ...targetSlideRefs.map((ref) => ref.claimId), ...slideClaimIds].filter((id) => claimIds.has(id)))].sort()
      const artifactNarrativeIds = [...new Set([...target.sourceNodeIds, ...rendersFrom].filter((id) => narrativeIds.has(id)))].sort()
      const stale = staleState(target, narrativeHash)
      if (target.type === "html_deck" && target.outputPath) htmlCoverageByPath.set(target.outputPath, targetSlideRefs)
      return {
        artifactId,
        type: target.type,
        outputPath: target.outputPath,
        contractStatus: target.contractStatus,
        sourceNodeIds: target.sourceNodeIds ?? [],
        claimIds: artifactClaimIds,
        narrativeIds: artifactNarrativeIds,
        slideRefs: targetSlideRefs,
        stale: stale.stale,
        staleReason: stale.reason,
        note: artifactClaimIds.length === 0 ? "No claim-to-slide coverage is recorded or inferred for this artifact." : undefined,
      }
    })
    .sort((a, b) => artifactSortValue(a.type) - artifactSortValue(b.type) || (a.outputPath ?? a.artifactId).localeCompare(b.outputPath ?? b.artifactId))
}

export function getClaimSlideRefs(state: DecksState, deck: DeckSpec = activeDeck(state)): ClaimSlideRef[] {
  const narrative = canonicalNarrative(state)
  const bindingsByClaim = groupRawEvidenceByClaim(narrative.evidenceBindings)
  const refs: ClaimSlideRef[] = []
  const seen = new Set<string>()
  for (const claim of narrative.claims) {
    for (const slide of deck.slides ?? []) {
      const explicitRef = slide.claimRefs?.find((ref) => ref.claimId === claim.id)
      if (explicitRef) {
        pushSlideRef(refs, seen, claim, slide, "metadata", `claimRefs:${explicitRef.role}`, explicitRef.role)
        continue
      }
      if (slide.claimIds?.includes(claim.id)) {
        pushSlideRef(refs, seen, claim, slide, "metadata", "claimIds", "primary")
        continue
      }
      if (slideEvidenceBindingIdsMatch(slide.evidenceBindingIds ?? [], bindingsByClaim.get(claim.id) ?? [])) {
        pushSlideRef(refs, seen, claim, slide, "metadata", "evidenceBindingIds", "evidence")
        continue
      }
      const contentMatch = slideContentMatch(slide, claim.text)
      if (contentMatch) pushSlideRef(refs, seen, claim, slide, "content", contentMatch, "primary")
      else if (slideEvidenceMatches(slide.evidence ?? [], bindingsByClaim.get(claim.id) ?? [])) pushSlideRef(refs, seen, claim, slide, "evidence", "evidence", "evidence")
    }
  }
  return refs.sort((a, b) => a.slideIndex - b.slideIndex || a.claimText.localeCompare(b.claimText) || a.location.localeCompare(b.location))
}

function canonicalNarrative(state: DecksState): NarrativeStateV1 {
  return state.narrative ?? normalizeNarrativeState(state)
}

function activeDeck(state: DecksState): DeckSpec {
  const key = state.activeDeck || (Object.keys(state.decks).length === 1 ? Object.keys(state.decks)[0] : undefined)
  if (!key || !state.decks[key]) throw new Error("No active deck is available for narrative artifact coverage.")
  return state.decks[key]
}

function maybeActiveDeck(state: DecksState): DeckSpec | undefined {
  const key = state.activeDeck || (Object.keys(state.decks).length === 1 ? Object.keys(state.decks)[0] : undefined)
  return key ? state.decks[key] : undefined
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

function groupRawEvidenceByClaim(bindings: NarrativeEvidenceBinding[]): Map<string, NarrativeEvidenceBinding[]> {
  const grouped = new Map<string, NarrativeEvidenceBinding[]>()
  for (const binding of bindings) grouped.set(binding.claimId, [...(grouped.get(binding.claimId) ?? []), binding])
  return grouped
}

function slideContentMatch(slide: SlideSpec, claimText: string): string | undefined {
  const claim = normalizeText(claimText)
  if (!claim) return undefined
  const candidates: Array<[string, string | undefined]> = [
    ["title", slide.title],
    ["purpose", slide.purpose],
    ["headline", slide.content?.headline],
    ["speakerNotes", slide.content?.speakerNotes],
    ...((slide.content?.body ?? []).map((item, index) => [`body:${index + 1}`, item] as [string, string])),
    ...((slide.content?.bullets ?? []).map((item, index) => [`bullet:${index + 1}`, item] as [string, string])),
  ]
  for (const [location, value] of candidates) {
    const normalized = normalizeText(value)
    if (!normalized) continue
    if (normalized === claim || normalized.includes(claim) || claim.includes(normalized)) return location
  }
  return undefined
}

function slideEvidenceMatches(evidence: EvidenceRef[], bindings: NarrativeEvidenceBinding[]): boolean {
  return evidence.some((item) => bindings.some((binding) => evidenceMatchesBinding(item, binding)))
}

function slideEvidenceBindingIdsMatch(ids: string[], bindings: NarrativeEvidenceBinding[]): boolean {
  const slideIds = new Set(ids)
  return bindings.some((binding) => slideIds.has(binding.id))
}

function evidenceMatchesBinding(evidence: EvidenceRef, binding: NarrativeEvidenceBinding): boolean {
  return Boolean(
    evidence.findingsFile && evidence.findingsFile === binding.findingsFile ||
      evidence.sourcePath && evidence.sourcePath === binding.sourcePath ||
      evidence.url && evidence.url === binding.url ||
      evidence.quote && binding.quote && normalizeText(evidence.quote) === normalizeText(binding.quote) ||
      evidence.source && normalizeText(evidence.source) === normalizeText(binding.source),
  )
}

function pushSlideRef(refs: ClaimSlideRef[], seen: Set<string>, claim: NarrativeClaim, slide: SlideSpec, match: ClaimSlideRef["match"], location: string, role: SlideClaimRefRole): void {
  const key = `${claim.id}:${slide.index}:${match}:${location}:${role}`
  if (seen.has(key)) return
  seen.add(key)
  refs.push({ claimId: claim.id, claimText: claim.text, slideIndex: slide.index, slideTitle: slide.title, match, role, location })
}

function claimSlideRefsForTarget(target: RenderTarget, currentHtmlRefs: ClaimSlideRef[], htmlCoverageByPath: Map<string, ClaimSlideRef[]>): ClaimSlideRef[] {
  const stored = parseStoredClaimSlideRefs(target)
  if (stored.length > 0) return stored
  if (target.type === "html_deck") return currentHtmlRefs
  const sourceOutputPath = typeof target.data?.sourceOutputPath === "string" ? target.data.sourceOutputPath : undefined
  if (sourceOutputPath) return htmlCoverageByPath.get(sourceOutputPath) ?? currentHtmlRefs
  return currentHtmlRefs
}

function parseStoredClaimSlideRefs(target: RenderTarget): ClaimSlideRef[] {
  const value = target.data?.claimSlideRefs
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ClaimSlideRef[] => {
    if (!item || typeof item !== "object") return []
    const record = item as Partial<ClaimSlideRef>
    if (!record.claimId || !record.claimText || typeof record.slideIndex !== "number" || !record.slideTitle) return []
    return [{
      claimId: record.claimId,
      claimText: record.claimText,
      slideIndex: record.slideIndex,
      slideTitle: record.slideTitle,
      match: record.match ?? "metadata",
      role: record.role ?? "supporting",
      location: record.location ?? "metadata",
    }]
  }).sort((a, b) => a.slideIndex - b.slideIndex || a.claimText.localeCompare(b.claimText))
}

function staleState(target: RenderTarget, narrativeHash: string): { stale: boolean; reason?: string } {
  const targetHash = typeof target.data?.narrativeHash === "string" ? target.data.narrativeHash : undefined
  if (targetHash && targetHash !== narrativeHash) return { stale: true, reason: "Narrative hash changed after this artifact coverage was recorded." }
  return { stale: false }
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

function normalizeText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? ""
}
