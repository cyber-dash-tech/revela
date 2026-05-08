import type { DeckSpec, DecksState, EvidenceRef, NarrativeBrief, NarrativeRole, SlideSpec, SourceMaterial } from "../decks-state"
import { getArtifactClaimRefs, type ArtifactClaimRef, type ClaimSlideRef } from "../narrative-state/queries"
import type { NarrativeClaim, NarrativeEvidenceBinding, NarrativeStateV1 } from "../narrative-state/types"

export type InspectionClaimOrigin = "narrative" | "title" | "headline" | "body" | "bullet" | "purpose"
export type InspectionGapType = "missing_evidence" | "weak_evidence"
export type InspectionEvidenceSupport = "supported" | "weak" | "unknown"

export interface InspectionContext {
  version: 1
  slug: string
  goal: string
  audience?: string
  language?: string
  outputPath: string
  narrativeBrief?: NarrativeBrief
  sourceMaterials: InspectionSourceMaterial[]
  narrative?: InspectionNarrativeStateContext
  slides: InspectionSlideContext[]
  gaps: InspectionGap[]
  appendixCandidates: InspectionAppendixCandidate[]
  objectionContext: InspectionNarrativeContext[]
  riskContext: InspectionNarrativeContext[]
  artifactCoverage: InspectionArtifactCoverage[]
}

export interface InspectionNarrativeStateContext {
  id: string
  status: string
  claimCount: number
}

export interface InspectionSourceMaterial extends SourceMaterial {
  linkedEvidenceCount: number
}

export interface InspectionSlideContext {
  index: number
  title: string
  purpose?: string
  narrativeRole?: NarrativeRole
  layout: string
  components: string[]
  text: InspectionSlideText
  claims: InspectionClaimCandidate[]
  evidence: InspectionEvidenceTrace[]
  caveats: string[]
}

export interface InspectionSlideText {
  headline?: string
  body: string[]
  bullets: string[]
  speakerNotes?: string
}

export interface InspectionClaimCandidate {
  id: string
  canonicalClaimId?: string
  slideIndex: number
  slideTitle: string
  origin: InspectionClaimOrigin
  text: string
  evidenceSensitive: boolean
  evidenceSupport: InspectionEvidenceSupport
  evidence: InspectionEvidenceTrace[]
  gaps: InspectionGap[]
  evidenceBindingIds: string[]
  supportedScope?: string
  unsupportedScope?: string
  caveats: string[]
}

export interface InspectionEvidenceTrace extends EvidenceRef {
  evidenceBindingId?: string
  claimId?: string
  supportScope?: string
  unsupportedScope?: string
  strength?: NarrativeEvidenceBinding["strength"]
  slideIndex: number
  slideTitle: string
  hasDetail: boolean
}

export interface InspectionGap {
  type: InspectionGapType
  slideIndex: number
  slideTitle: string
  claimId: string
  claimText: string
  message: string
}

export interface InspectionAppendixCandidate {
  slideIndex: number
  slideTitle: string
  reason: string
  evidence: InspectionEvidenceTrace[]
}

export interface InspectionNarrativeContext {
  text: string
  source: "narrative" | "narrativeBrief" | "slide"
  slideIndex?: number
  slideTitle?: string
}

export interface InspectionArtifactCoverage {
  artifactId: string
  type: ArtifactClaimRef["type"]
  outputPath?: string
  coverageStatus: ArtifactClaimRef["coverageStatus"]
  claimIds: string[]
  affectedClaimIds: string[]
  missingClaimIds: string[]
  stale: boolean
  staleReason?: string
  staleReasons: string[]
  note?: string
  slideRefs: InspectionArtifactSlideRef[]
}

export interface InspectionArtifactSlideRef {
  claimId: string
  slideIndex: number
  slideTitle: string
  role: ClaimSlideRef["role"]
  match: ClaimSlideRef["match"]
  location: string
}

export function compileInspectionContext(state: DecksState, slug?: string): InspectionContext {
  const deck = activeDeck(state, slug)
  const narrative = state.narrative
  const evidence = collectEvidence(deck)
  const sourceMaterials = compileSourceMaterials(state.workspace.sourceMaterials ?? [], evidence)
  const slides = deck.slides
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((slide) => compileSlide(slide, narrative))
  const gaps = slides.flatMap((slide) => slide.claims.flatMap((claim) => claim.gaps))

  return {
    version: 1,
    slug: deck.slug,
    goal: deck.goal,
    audience: deck.audience,
    language: deck.language,
    outputPath: deck.outputPath,
    narrativeBrief: deck.narrativeBrief,
    narrative: narrative ? { id: narrative.id, status: narrative.status, claimCount: narrative.claims.length } : undefined,
    sourceMaterials,
    slides,
    gaps,
    appendixCandidates: compileAppendixCandidates(slides),
    objectionContext: compileNarrativeList(deck, "objections", narrative),
    riskContext: compileNarrativeList(deck, "risks", narrative),
    artifactCoverage: compileArtifactCoverage(state),
  }
}

function compileArtifactCoverage(state: DecksState): InspectionArtifactCoverage[] {
  return getArtifactClaimRefs(state).map((artifact) => ({
    artifactId: artifact.artifactId,
    type: artifact.type,
    outputPath: artifact.outputPath,
    coverageStatus: artifact.coverageStatus,
    claimIds: artifact.claimIds,
    affectedClaimIds: artifact.affectedClaimIds,
    missingClaimIds: artifact.missingClaimIds,
    stale: artifact.stale,
    staleReason: artifact.staleReason,
    staleReasons: artifact.staleReasons,
    note: artifact.note,
    slideRefs: artifact.slideRefs.map((ref) => ({
      claimId: ref.claimId,
      slideIndex: ref.slideIndex,
      slideTitle: ref.slideTitle,
      role: ref.role,
      match: ref.match,
      location: ref.location,
    })),
  }))
}

function activeDeck(state: DecksState, slug?: string): DeckSpec {
  const key = slug || state.activeDeck || (Object.keys(state.decks).length === 1 ? Object.keys(state.decks)[0] : undefined)
  if (!key || !state.decks[key]) throw new Error("No active deck is available for inspection context compilation.")
  return state.decks[key]
}

function compileSlide(slide: SlideSpec, narrative: NarrativeStateV1 | undefined): InspectionSlideContext {
  const evidence = slide.evidence.map((item) => compileEvidence(slide, item))
  const canonicalClaims = narrative ? canonicalClaimCandidates(slide, narrative, evidence) : []
  const canonicalText = new Set(canonicalClaims.map((claim) => normalizeText(claim.text)))
  const heuristicClaims = claimCandidates(slide)
    .filter((claim) => !canonicalText.has(normalizeText(claim.text)))
    .map((claim, position) => compileClaim(slide, claim, position, evidence))
  const claims = [...canonicalClaims, ...heuristicClaims]
  const claimCaveats = canonicalClaims.flatMap((claim) => claim.caveats)
  return {
    index: slide.index,
    title: slide.title,
    purpose: slide.purpose,
    narrativeRole: slide.narrativeRole,
    layout: slide.layout,
    components: slide.components,
    text: {
      headline: cleanOptionalText(slide.content.headline),
      body: cleanTextList(slide.content.body),
      bullets: cleanTextList(slide.content.bullets),
      speakerNotes: cleanOptionalText(slide.content.speakerNotes),
    },
    claims,
    evidence,
    caveats: dedupeText([
      ...evidence.map((item) => item.caveat).filter((item): item is string => Boolean(item?.trim())),
      ...claimCaveats,
    ]),
  }
}

function canonicalClaimCandidates(slide: SlideSpec, narrative: NarrativeStateV1, slideEvidence: InspectionEvidenceTrace[]): InspectionClaimCandidate[] {
  const claimRefs = slide.claimRefs ?? []
  const metadataClaimIds = new Set([
    ...claimRefs.map((ref) => ref.claimId),
    ...(slide.claimIds ?? []),
  ].filter(Boolean))
  const evidenceBindingIds = new Set(slide.evidenceBindingIds ?? [])
  for (const binding of narrative.evidenceBindings) {
    if (evidenceBindingIds.has(binding.id)) metadataClaimIds.add(binding.claimId)
  }

  return narrative.claims
    .filter((claim) => metadataClaimIds.has(claim.id))
    .map((claim) => compileCanonicalClaim(slide, claim, narrative.evidenceBindings, slideEvidence, evidenceBindingIds))
}

function compileCanonicalClaim(
  slide: SlideSpec,
  claim: NarrativeClaim,
  bindings: NarrativeEvidenceBinding[],
  slideEvidence: InspectionEvidenceTrace[],
  slideEvidenceBindingIds: Set<string>,
): InspectionClaimCandidate {
  const allClaimBindings = bindings.filter((binding) => binding.claimId === claim.id)
  const selectedBindings = allClaimBindings.filter((binding) => slideEvidenceBindingIds.size === 0 || slideEvidenceBindingIds.has(binding.id))
  const evidenceBindings = selectedBindings.length > 0 ? selectedBindings : allClaimBindings
  const evidence = evidenceBindings.length > 0
    ? evidenceBindings.map((binding) => compileEvidenceBinding(slide, binding))
    : slideEvidence
  const gaps = canonicalClaimGaps(slide, claim, evidence)
  return {
    id: claim.id,
    canonicalClaimId: claim.id,
    slideIndex: slide.index,
    slideTitle: slide.title,
    origin: "narrative",
    text: claim.text,
    evidenceSensitive: claim.evidenceRequired || isEvidenceSensitiveClaim(claim.text),
    evidenceSupport: narrativeEvidenceSupport(claim, evidence),
    evidence,
    gaps,
    evidenceBindingIds: evidenceBindings.map((binding) => binding.id),
    supportedScope: claim.supportedScope,
    unsupportedScope: claim.unsupportedScope,
    caveats: dedupeText([
      ...(claim.caveats ?? []),
      ...evidenceBindings.map((binding) => binding.caveat).filter((item): item is string => Boolean(item?.trim())),
    ]),
  }
}

function compileClaim(
  slide: SlideSpec,
  claim: { origin: InspectionClaimOrigin; text: string },
  position: number,
  evidence: InspectionEvidenceTrace[],
): InspectionClaimCandidate {
  const id = `slide-${slide.index}-claim-${position + 1}`
  const evidenceSensitive = isEvidenceSensitiveClaim(claim.text)
  const gaps = evidenceSensitive ? claimGaps(slide, id, claim.text, evidence) : []
  return {
    id,
    slideIndex: slide.index,
    slideTitle: slide.title,
    origin: claim.origin,
    text: claim.text,
    evidenceSensitive,
    evidenceSupport: evidenceSupport(evidence),
    evidence,
    gaps,
    evidenceBindingIds: [],
    caveats: [],
  }
}

function canonicalClaimGaps(slide: SlideSpec, claim: NarrativeClaim, evidence: InspectionEvidenceTrace[]): InspectionGap[] {
  if (!claim.evidenceRequired) return []
  if (claim.evidenceStatus === "missing" || evidence.length === 0) {
    return [{
      type: "missing_evidence",
      slideIndex: slide.index,
      slideTitle: slide.title,
      claimId: claim.id,
      claimText: claim.text,
      message: "Canonical narrative claim requires evidence but has no bound evidence trace.",
    }]
  }
  if (claim.evidenceStatus === "weak" || evidence.some((item) => !item.hasDetail)) {
    return [{
      type: "weak_evidence",
      slideIndex: slide.index,
      slideTitle: slide.title,
      claimId: claim.id,
      claimText: claim.text,
      message: "Canonical narrative claim has weak or source-only evidence trace.",
    }]
  }
  return []
}

function claimGaps(slide: SlideSpec, claimId: string, claimText: string, evidence: InspectionEvidenceTrace[]): InspectionGap[] {
  if (evidence.length === 0) {
    return [{
      type: "missing_evidence",
      slideIndex: slide.index,
      slideTitle: slide.title,
      claimId,
      claimText,
      message: "Evidence-sensitive claim has no slide-level evidence trace.",
    }]
  }
  if (evidence.some((item) => !item.hasDetail)) {
    return [{
      type: "weak_evidence",
      slideIndex: slide.index,
      slideTitle: slide.title,
      claimId,
      claimText,
      message: "Evidence-sensitive claim has source-only evidence without quote, location, URL, caveat, findings file, or source path detail.",
    }]
  }
  return []
}

function evidenceSupport(evidence: InspectionEvidenceTrace[]): InspectionEvidenceSupport {
  if (evidence.length === 0) return "unknown"
  if (evidence.some((item) => !item.hasDetail)) return "weak"
  return "supported"
}

function narrativeEvidenceSupport(claim: NarrativeClaim, evidence: InspectionEvidenceTrace[]): InspectionEvidenceSupport {
  if (claim.evidenceStatus === "supported" || claim.evidenceStatus === "not_required") return "supported"
  if (claim.evidenceStatus === "partial" || claim.evidenceStatus === "weak") return "weak"
  return evidenceSupport(evidence)
}

function claimCandidates(slide: SlideSpec): Array<{ origin: InspectionClaimOrigin; text: string }> {
  const claims: Array<{ origin: InspectionClaimOrigin; text: string }> = []
  pushClaim(claims, "title", slide.title)
  pushClaim(claims, "purpose", slide.purpose)
  pushClaim(claims, "headline", slide.content.headline)
  for (const item of slide.content.body ?? []) pushClaim(claims, "body", item)
  for (const item of slide.content.bullets ?? []) pushClaim(claims, "bullet", item)
  return claims
}

function pushClaim(claims: Array<{ origin: InspectionClaimOrigin; text: string }>, origin: InspectionClaimOrigin, text: string | undefined): void {
  const value = cleanOptionalText(text)
  if (!value) return
  if (claims.some((claim) => claim.text === value)) return
  claims.push({ origin, text: value })
}

function compileEvidence(slide: SlideSpec, evidence: EvidenceRef): InspectionEvidenceTrace {
  return {
    ...evidence,
    slideIndex: slide.index,
    slideTitle: slide.title,
    hasDetail: hasEvidenceDetail(evidence),
  }
}

function compileEvidenceBinding(slide: SlideSpec, binding: NarrativeEvidenceBinding): InspectionEvidenceTrace {
  const evidence: EvidenceRef = {
    source: binding.source,
    sourcePath: binding.sourcePath,
    findingsFile: binding.findingsFile,
    quote: binding.quote,
    location: binding.location,
    url: binding.url,
    caveat: binding.caveat,
  }
  return {
    ...evidence,
    evidenceBindingId: binding.id,
    claimId: binding.claimId,
    supportScope: binding.supportScope,
    unsupportedScope: binding.unsupportedScope,
    strength: binding.strength,
    slideIndex: slide.index,
    slideTitle: slide.title,
    hasDetail: hasEvidenceDetail(evidence),
  }
}

function collectEvidence(deck: DeckSpec): InspectionEvidenceTrace[] {
  return deck.slides.flatMap((slide) => slide.evidence.map((item) => compileEvidence(slide, item)))
}

function compileSourceMaterials(sourceMaterials: SourceMaterial[], evidence: InspectionEvidenceTrace[]): InspectionSourceMaterial[] {
  return sourceMaterials.map((material) => ({
    ...material,
    linkedEvidenceCount: evidence.filter((item) => evidenceLinksSourceMaterial(item, material)).length,
  }))
}

function evidenceLinksSourceMaterial(evidence: EvidenceRef, material: SourceMaterial): boolean {
  const path = material.path.trim()
  if (!path) return false
  return evidence.sourcePath === path || evidence.source === path || evidence.source.includes(path)
}

function compileAppendixCandidates(slides: InspectionSlideContext[]): InspectionAppendixCandidate[] {
  return slides
    .filter((slide) => slide.narrativeRole === "appendix" || slide.narrativeRole === "risk" || slide.evidence.length > 0 || slide.caveats.length > 0)
    .map((slide) => ({
      slideIndex: slide.index,
      slideTitle: slide.title,
      reason: appendixReason(slide),
      evidence: slide.evidence,
    }))
}

function appendixReason(slide: InspectionSlideContext): string {
  if (slide.narrativeRole === "appendix") return "Slide is explicitly marked as appendix material."
  if (slide.narrativeRole === "risk") return "Risk or assumption handling may need backup detail."
  if (slide.caveats.length > 0) return "Evidence caveats may need supporting appendix detail."
  return "Slide has recorded evidence that may be useful for source excerpts or backup detail."
}

function compileNarrativeList(deck: DeckSpec, key: "objections" | "risks", narrative: NarrativeStateV1 | undefined): InspectionNarrativeContext[] {
  const fromNarrative = key === "objections"
    ? (narrative?.objections ?? []).map((item) => ({ text: item.text, source: "narrative" as const }))
    : (narrative?.risks ?? []).map((item) => ({ text: item.text, source: "narrative" as const }))
  const fromBrief = (deck.narrativeBrief?.[key] ?? []).map((text) => ({ text, source: "narrativeBrief" as const }))
  const role = key === "risks" ? "risk" : undefined
  const fromSlides = deck.slides
    .filter((slide) => role && slide.narrativeRole === role)
    .flatMap((slide) => slideTextList(slide).map((text) => ({
      text,
      source: "slide" as const,
      slideIndex: slide.index,
      slideTitle: slide.title,
    })))
  return dedupeNarrativeContext([...fromNarrative, ...fromBrief, ...fromSlides])
}

function dedupeNarrativeContext(values: InspectionNarrativeContext[]): InspectionNarrativeContext[] {
  const seen = new Set<string>()
  const result: InspectionNarrativeContext[] = []
  for (const value of values) {
    const key = `${normalizeText(value.text)}:${value.slideIndex ?? "global"}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function slideTextList(slide: SlideSpec): string[] {
  return [slide.content.headline, ...(slide.content.body ?? []), ...(slide.content.bullets ?? [])]
    .map(cleanOptionalText)
    .filter((item): item is string => Boolean(item))
}

function hasEvidenceDetail(evidence: EvidenceRef): boolean {
  return Boolean(
    evidence.quote?.trim() ||
      evidence.page?.trim() ||
      evidence.location?.trim() ||
      evidence.url?.trim() ||
      evidence.findingsFile?.trim() ||
      evidence.sourcePath?.trim() ||
      evidence.extractedTextPath?.trim()
  )
}

function isEvidenceSensitiveClaim(text: string): boolean {
  const normalized = text.toLowerCase()
  return hasNumericClaim(normalized) || EVIDENCE_SENSITIVE_TERMS.some((pattern) => pattern.test(normalized))
}

function hasNumericClaim(text: string): boolean {
  return /(?:[$¥€£]\s?\d|\d+(?:\.\d+)?\s?(?:%|x|倍|万|亿|m|mn|million|b|bn|billion|k|千|年|months?|days?|users?|customers?|revenue|margin|cagr|tam|sam|som)\b|\b20\d{2}\b)/i.test(text)
}

function cleanTextList(values: string[] | undefined): string[] {
  return (values ?? []).map(cleanOptionalText).filter((item): item is string => Boolean(item))
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const text = String(value ?? "").trim()
  return text || undefined
}

function dedupeText(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const cleaned = cleanOptionalText(value)
    if (!cleaned) continue
    const key = normalizeText(cleaned)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }
  return result
}

function normalizeText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? ""
}

const EVIDENCE_SENSITIVE_TERMS = [
  /\bmarket size\b/,
  /\bcagr\b/,
  /\btam\b/,
  /\bsam\b/,
  /\bsom\b/,
  /\brecommend(?:ation|ed)?\b/,
  /\bshould\b/,
  /\bmust\b/,
  /\bgo\/?no-go\b/,
  /\bvs\.?\b/,
  /\bbetter than\b/,
  /\boutperform\b/,
  /\bleading\b/,
  /\bcompetitor\b/,
  /\bmarket leader\b/,
  /\binvest(?:ment)?\b/,
  /\brevenue\b/,
  /\bmargin\b/,
  /\bcost\b/,
  /\brisk\b/,
  /\blatency\b/,
  /\baccuracy\b/,
  /\bscalable\b/,
  /\barchitecture\b/,
  /市场规模/,
  /增长/,
  /领先/,
  /超过/,
  /竞品/,
  /建议/,
  /必须/,
  /投资/,
  /收入/,
  /利润/,
  /成本/,
  /风险/,
  /性能/,
  /架构/,
  /可扩展/,
]
