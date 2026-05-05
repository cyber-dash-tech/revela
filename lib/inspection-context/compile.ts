import type { DeckSpec, DecksState, EvidenceRef, NarrativeBrief, NarrativeRole, SlideSpec, SourceMaterial } from "../decks-state"

export type InspectionClaimOrigin = "title" | "headline" | "body" | "bullet" | "purpose"
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
  slides: InspectionSlideContext[]
  gaps: InspectionGap[]
  appendixCandidates: InspectionAppendixCandidate[]
  objectionContext: InspectionNarrativeContext[]
  riskContext: InspectionNarrativeContext[]
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
  slideIndex: number
  slideTitle: string
  origin: InspectionClaimOrigin
  text: string
  evidenceSensitive: boolean
  evidenceSupport: InspectionEvidenceSupport
  evidence: InspectionEvidenceTrace[]
  gaps: InspectionGap[]
}

export interface InspectionEvidenceTrace extends EvidenceRef {
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
  source: "narrativeBrief" | "slide"
  slideIndex?: number
  slideTitle?: string
}

export function compileInspectionContext(state: DecksState, slug?: string): InspectionContext {
  const deck = activeDeck(state, slug)
  const evidence = collectEvidence(deck)
  const sourceMaterials = compileSourceMaterials(state.workspace.sourceMaterials ?? [], evidence)
  const slides = deck.slides
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((slide) => compileSlide(slide))
  const gaps = slides.flatMap((slide) => slide.claims.flatMap((claim) => claim.gaps))

  return {
    version: 1,
    slug: deck.slug,
    goal: deck.goal,
    audience: deck.audience,
    language: deck.language,
    outputPath: deck.outputPath,
    narrativeBrief: deck.narrativeBrief,
    sourceMaterials,
    slides,
    gaps,
    appendixCandidates: compileAppendixCandidates(slides),
    objectionContext: compileNarrativeList(deck, "objections"),
    riskContext: compileNarrativeList(deck, "risks"),
  }
}

function activeDeck(state: DecksState, slug?: string): DeckSpec {
  const key = slug || state.activeDeck || (Object.keys(state.decks).length === 1 ? Object.keys(state.decks)[0] : undefined)
  if (!key || !state.decks[key]) throw new Error("No active deck is available for inspection context compilation.")
  return state.decks[key]
}

function compileSlide(slide: SlideSpec): InspectionSlideContext {
  const evidence = slide.evidence.map((item) => compileEvidence(slide, item))
  const claims = claimCandidates(slide).map((claim, position) => compileClaim(slide, claim, position, evidence))
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
    caveats: evidence.map((item) => item.caveat).filter((item): item is string => Boolean(item?.trim())),
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
  }
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

function compileNarrativeList(deck: DeckSpec, key: "objections" | "risks"): InspectionNarrativeContext[] {
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
  return [...fromBrief, ...fromSlides]
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
