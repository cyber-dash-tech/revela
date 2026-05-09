import type {
  InspectionAppendixCandidate,
  InspectionClaimCandidate,
  InspectionContext,
  InspectionEvidenceTrace,
  InspectionGap,
  InspectionSlideContext,
} from "./compile"

export type InspectionMatchConfidence = "none" | "low" | "medium" | "high"

export interface InspectionElementSnapshot {
  scope?: "element" | "selection" | "slide"
  slideIndex?: number
  text?: string
  selectedText?: string
  tagName?: string
  slideTitle?: string
  selector?: string
  domPath?: string
  id?: string
  classList?: string[]
  role?: string
  outerHTMLExcerpt?: string
  nearbyText?: string
  elements?: Array<{
    text?: string
    tagName?: string
    slideIndex?: number
    slideTitle?: string
    selector?: string
    domPath?: string
    id?: string
    classList?: string[]
    role?: string
    outerHTMLExcerpt?: string
    nearbyText?: string
    boundingBox?: Record<string, unknown>
    viewport?: Record<string, unknown>
  }>
  boundingBox?: Record<string, unknown>
  viewport?: Record<string, unknown>
}

export interface InspectionElementMatch {
  slide?: InspectionSlideContext
  claim?: InspectionClaimCandidate
  candidateClaims?: InspectionClaimCandidate[]
  evidence: InspectionEvidenceTrace[]
  gaps: InspectionGap[]
  caveats: string[]
  appendixCandidates: InspectionAppendixCandidate[]
  confidence: InspectionMatchConfidence
  reason: string
}

export function matchInspectionElement(context: InspectionContext, snapshot: InspectionElementSnapshot): InspectionElementMatch {
  const selectedText = normalizeText(snapshot.text)
  const surroundingText = normalizeText(snapshot.nearbyText || snapshot.outerHTMLExcerpt)
  const candidateSlides = candidateSlidesForSnapshot(context, snapshot)

  const anchoredClaim = findAnchoredClaimMatch(candidateSlides, snapshot)
  if (anchoredClaim) return claimMatch(context, anchoredClaim.slide, anchoredClaim.claim, "high", "Matched explicit claim anchor from selection snapshot.")

  if (selectedText) {
    const exactClaim = findClaimMatch(candidateSlides, selectedText, "exact")
    if (exactClaim) return claimMatch(context, exactClaim.slide, exactClaim.claim, "high", "Exact normalized text match.")

    const containsClaim = findClaimMatch(candidateSlides, selectedText, "contains")
    if (containsClaim) return claimMatch(context, containsClaim.slide, containsClaim.claim, "medium", "Conservative normalized contains match.")

    if (typeof snapshot.slideIndex === "number") {
      const exactFallback = findClaimMatch(context.slides, selectedText, "exact")
      if (exactFallback) {
        return claimMatch(context, exactFallback.slide, exactFallback.claim, "high", "Exact normalized text match after slideIndex fallback.")
      }

      const containsFallback = findClaimMatch(context.slides, selectedText, "contains")
      if (containsFallback) {
        return claimMatch(context, containsFallback.slide, containsFallback.claim, "medium", "Conservative normalized contains match after slideIndex fallback.")
      }
    }
  }

  if (surroundingText && surroundingText !== selectedText) {
    const contextualClaim = findClaimMatch(candidateSlides, surroundingText, "contains")
    if (contextualClaim) return claimMatch(context, contextualClaim.slide, contextualClaim.claim, "medium", "Matched claim using surrounding slide context.")
  }

  const slide = candidateSlides[0]
  if (slide) {
    const canonicalClaims = slide.claims.filter((claim) => claim.canonicalClaimId || claim.origin === "narrative")
    if (canonicalClaims.length === 1) {
      return claimMatch(context, slide, canonicalClaims[0], "medium", "Selected element matched the slide; the slide has one canonical narrative claim candidate.", canonicalClaims)
    }
    return slideMatch(
      context,
      slide,
      snapshot.slideIndex ? "medium" : "low",
      canonicalClaims.length > 1
        ? "Matched slide only; multiple canonical claim candidates are available, so no claim id was chosen by semantic guess."
        : snapshot.slideIndex ? "Matched by slideIndex only." : "No claim text matched; returning first candidate slide.",
      canonicalClaims,
    )
  }

  return {
    evidence: [],
    gaps: [],
    caveats: [],
    appendixCandidates: [],
    confidence: "none",
    reason: "No slide or claim matched the selection snapshot.",
  }
}

function candidateSlidesForSnapshot(context: InspectionContext, snapshot: InspectionElementSnapshot): InspectionSlideContext[] {
  if (typeof snapshot.slideIndex === "number") {
    const slide = context.slides.find((item) => item.index === snapshot.slideIndex)
    return slide ? [slide] : []
  }
  return context.slides
}

function findClaimMatch(
  slides: InspectionSlideContext[],
  selectedText: string,
  mode: "exact" | "contains",
): { slide: InspectionSlideContext; claim: InspectionClaimCandidate } | undefined {
  for (const slide of slides) {
    for (const claim of slide.claims) {
      const claimText = normalizeText(claim.text)
      if (!claimText) continue
      if (mode === "exact" && claimText === selectedText) return { slide, claim }
      if (mode === "contains" && conservativeContains(claimText, selectedText)) return { slide, claim }
    }
  }
  return undefined
}

function findAnchoredClaimMatch(
  slides: InspectionSlideContext[],
  snapshot: InspectionElementSnapshot,
): { slide: InspectionSlideContext; claim: InspectionClaimCandidate } | undefined {
  const claimIds = explicitClaimIds(snapshot)
  if (claimIds.length === 0) return undefined
  for (const slide of slides) {
    for (const claim of slide.claims) {
      const ids = [claim.id, claim.canonicalClaimId].filter((item): item is string => Boolean(item))
      if (ids.some((id) => claimIds.includes(id))) return { slide, claim }
    }
  }
  return undefined
}

function explicitClaimIds(snapshot: InspectionElementSnapshot): string[] {
  const values = [
    snapshot.selector,
    snapshot.domPath,
    snapshot.outerHTMLExcerpt,
    ...(snapshot.elements ?? []).flatMap((item) => [item.selector, item.domPath, item.outerHTMLExcerpt]),
  ]
  const ids: string[] = []
  for (const value of values) {
    if (!value) continue
    for (const match of value.matchAll(/data-claim-id\s*=\s*["']([^"']+)["']/gi)) ids.push(match[1])
    for (const match of value.matchAll(/data-claim-id=([^\]\s>"']+)/gi)) ids.push(match[1])
  }
  return dedupe(ids.map((item) => item.trim()).filter(Boolean))
}

function conservativeContains(claimText: string, selectedText: string): boolean {
  if (selectedText.length < 12 && claimText.length < 12) return false
  return claimText.includes(selectedText) || selectedText.includes(claimText)
}

function claimMatch(
  context: InspectionContext,
  slide: InspectionSlideContext,
  claim: InspectionClaimCandidate,
  confidence: InspectionMatchConfidence,
  reason: string,
  candidateClaims: InspectionClaimCandidate[] = [],
): InspectionElementMatch {
  return {
    slide,
    claim,
    candidateClaims: candidateClaims.length ? candidateClaims : [claim],
    evidence: claim.evidence,
    gaps: claim.gaps,
    caveats: slide.caveats,
    appendixCandidates: appendixCandidatesForSlide(context, slide.index),
    confidence,
    reason,
  }
}

function slideMatch(
  context: InspectionContext,
  slide: InspectionSlideContext,
  confidence: InspectionMatchConfidence,
  reason: string,
  candidateClaims: InspectionClaimCandidate[] = [],
): InspectionElementMatch {
  return {
    slide,
    candidateClaims,
    evidence: slide.evidence,
    gaps: slide.claims.flatMap((claim) => claim.gaps),
    caveats: slide.caveats,
    appendixCandidates: appendixCandidatesForSlide(context, slide.index),
    confidence,
    reason,
  }
}

function appendixCandidatesForSlide(context: InspectionContext, slideIndex: number): InspectionAppendixCandidate[] {
  return context.appendixCandidates.filter((candidate) => candidate.slideIndex === slideIndex)
}

function normalizeText(text: string | undefined): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase()
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}
