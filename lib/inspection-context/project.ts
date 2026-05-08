import type { NarrativeBrief, NarrativeRole } from "../decks-state"
import type { InspectionContext, InspectionEvidenceTrace, InspectionGap } from "./compile"
import type { InspectionElementMatch, InspectionElementSnapshot, InspectionMatchConfidence } from "./match"

export interface InspectionPromptProjection {
  version: 1
  deck: InspectionProjectionDeck
  selectedElement: InspectionProjectionElement
  match: InspectionProjectionMatch
  cards: {
    source: InspectionSourceProjection
    evidence: InspectionEvidenceProjection
    caveats: InspectionCaveatsProjection
    objective: InspectionObjectiveProjection
    appendix: InspectionAppendixProjection
    artifacts: InspectionArtifactCoverageProjection
  }
}

export interface InspectionProjectionDeck {
  slug: string
  goal: string
  audience?: string
  language?: string
  narrativeBrief?: NarrativeBrief
}

export interface InspectionProjectionElement {
  scope?: "element" | "selection" | "slide"
  slideIndex?: number
  text?: string
  elements?: Array<{
    text?: string
    tagName?: string
    classList: string[]
    role?: string
  }>
  tagName?: string
  classList: string[]
  role?: string
}

export interface InspectionProjectionMatch {
  confidence: InspectionMatchConfidence
  reason: string
  slide?: {
    index: number
    title: string
    purpose?: string
    narrativeRole?: NarrativeRole
  }
  claim?: {
    id: string
    canonicalClaimId?: string
    origin: string
    text: string
    evidenceSensitive: boolean
    evidenceSupport: string
    evidenceBindingIds: string[]
    supportedScope?: string
    unsupportedScope?: string
    caveats: string[]
  }
}

export interface InspectionSourceProjection {
  evidence: InspectionEvidenceProjectionTrace[]
  missingSourceGaps: InspectionGapProjection[]
  weakSourceGaps: InspectionGapProjection[]
}

export interface InspectionEvidenceProjection {
  matchedClaim?: string
  evidenceSupport?: string
  traces: InspectionEvidenceProjectionTrace[]
  gaps: InspectionGapProjection[]
}

export interface InspectionCaveatsProjection {
  caveats: string[]
}

export interface InspectionObjectiveProjection {
  slidePurpose?: string
  narrativeRole?: NarrativeRole
  deckGoal: string
  audience?: string
  decisionOrAction?: string
  audienceBeliefBefore?: string
  audienceBeliefAfter?: string
}

export interface InspectionAppendixProjection {
  candidates: Array<{
    slideIndex: number
    slideTitle: string
    reason: string
    evidence: InspectionEvidenceProjectionTrace[]
  }>
  relatedRisks: string[]
  relatedObjections: string[]
}

export interface InspectionArtifactCoverageProjection {
  selectedClaimId?: string
  artifacts: InspectionArtifactCoverageProjectionItem[]
}

export interface InspectionArtifactCoverageProjectionItem {
  artifactId: string
  type: string
  outputPath?: string
  coverageStatus: "current" | "stale" | "partial" | "missing"
  containsClaim: boolean
  stale: boolean
  staleReason?: string
  staleReasons: string[]
  affectedClaimIds: string[]
  missingClaimIds: string[]
  note?: string
  locations: Array<{
    slideIndex: number
    slideTitle: string
    role: string
    match: string
    location: string
  }>
}

export interface InspectionEvidenceProjectionTrace {
  source: string
  evidenceBindingId?: string
  claimId?: string
  sourcePath?: string
  findingsFile?: string
  location?: string
  page?: string
  url?: string
  quote?: string
  caveat?: string
  supportScope?: string
  unsupportedScope?: string
  strength?: string
  extractedTextPath?: string
  extractedManifestPath?: string
  hasDetail: boolean
}

export interface InspectionGapProjection {
  type: string
  claimText: string
  message: string
}

export function projectInspectionMatch(
  context: InspectionContext,
  match: InspectionElementMatch,
  snapshot: InspectionElementSnapshot = {},
): InspectionPromptProjection {
  const slide = match.slide
  const claim = match.claim
  const traces = match.evidence.map(projectEvidenceTrace)
  const gaps = match.gaps.map(projectGap)
  const narrativeBrief = context.narrativeBrief

  return {
    version: 1,
    deck: {
      slug: context.slug,
      goal: truncate(context.goal, 320),
      audience: truncateOptional(context.audience, 160),
      language: truncateOptional(context.language, 80),
      narrativeBrief: narrativeBrief ? projectNarrativeBrief(narrativeBrief) : undefined,
    },
    selectedElement: {
      slideIndex: snapshot.slideIndex,
      scope: snapshot.scope,
      text: truncateOptional(snapshot.selectedText || snapshot.text, 700),
      elements: snapshot.elements?.slice(0, 12).map((item) => ({
        text: truncateOptional(item.text, 320),
        tagName: truncateOptional(item.tagName, 40),
        classList: (item.classList ?? []).slice(0, 8).map((className) => truncate(className, 80)),
        role: truncateOptional(item.role, 80),
      })),
      tagName: truncateOptional(snapshot.tagName, 40),
      classList: (snapshot.classList ?? []).slice(0, 12).map((item) => truncate(item, 80)),
      role: truncateOptional(snapshot.role, 80),
    },
    match: {
      confidence: match.confidence,
      reason: match.reason,
      slide: slide
        ? {
            index: slide.index,
            title: truncate(slide.title, 180),
            purpose: truncateOptional(slide.purpose, 240),
            narrativeRole: slide.narrativeRole,
          }
        : undefined,
      claim: claim
        ? {
            id: claim.id,
            canonicalClaimId: claim.canonicalClaimId,
            origin: claim.origin,
            text: truncate(claim.text, 500),
            evidenceSensitive: claim.evidenceSensitive,
            evidenceSupport: claim.evidenceSupport,
            evidenceBindingIds: claim.evidenceBindingIds,
            supportedScope: truncateOptional(claim.supportedScope, 280),
            unsupportedScope: truncateOptional(claim.unsupportedScope, 280),
            caveats: claim.caveats.map((item) => truncate(item, 280)).slice(0, 8),
          }
        : undefined,
    },
    cards: {
      source: {
        evidence: traces,
        missingSourceGaps: gaps.filter((gap) => gap.type === "missing_evidence"),
        weakSourceGaps: gaps.filter((gap) => gap.type === "weak_evidence"),
      },
      evidence: {
        matchedClaim: claim ? truncate(claim.text, 500) : undefined,
        evidenceSupport: claim?.evidenceSupport,
        traces,
        gaps,
      },
      caveats: {
        caveats: match.caveats.map((item) => truncate(item, 280)).slice(0, 8),
      },
      objective: {
        slidePurpose: truncateOptional(slide?.purpose, 240),
        narrativeRole: slide?.narrativeRole,
        deckGoal: truncate(context.goal, 320),
        audience: truncateOptional(context.audience, 160),
        decisionOrAction: truncateOptional(narrativeBrief?.decisionOrAction, 240),
        audienceBeliefBefore: truncateOptional(narrativeBrief?.audienceBeliefBefore, 240),
        audienceBeliefAfter: truncateOptional(narrativeBrief?.audienceBeliefAfter, 240),
      },
      appendix: {
        candidates: match.appendixCandidates.slice(0, 5).map((candidate) => ({
          slideIndex: candidate.slideIndex,
          slideTitle: truncate(candidate.slideTitle, 180),
          reason: truncate(candidate.reason, 240),
          evidence: candidate.evidence.map(projectEvidenceTrace),
        })),
        relatedRisks: relatedNarrativeText(context.riskContext, slide?.index),
        relatedObjections: relatedNarrativeText(context.objectionContext, slide?.index),
      },
      artifacts: projectArtifactCoverage(context, claim?.canonicalClaimId ?? claim?.id),
    },
  }
}

function projectArtifactCoverage(context: InspectionContext, selectedClaimId: string | undefined): InspectionArtifactCoverageProjection {
  return {
    selectedClaimId,
    artifacts: context.artifactCoverage.map((artifact) => {
      const locations = selectedClaimId
        ? artifact.slideRefs
          .filter((ref) => ref.claimId === selectedClaimId)
          .slice(0, 8)
          .map((ref) => ({
            slideIndex: ref.slideIndex,
            slideTitle: truncate(ref.slideTitle, 180),
            role: ref.role,
            match: ref.match,
            location: truncate(ref.location, 120),
          }))
        : []
      const containsClaim = Boolean(selectedClaimId && (artifact.claimIds.includes(selectedClaimId) || locations.length > 0))
      return {
        artifactId: truncate(artifact.artifactId, 180),
        type: artifact.type,
        outputPath: truncateOptional(artifact.outputPath, 220),
        coverageStatus: artifact.coverageStatus,
        containsClaim,
        stale: artifact.stale,
        staleReason: truncateOptional(artifact.staleReason, 240),
        staleReasons: artifact.staleReasons.map((item) => truncate(item, 240)).slice(0, 5),
        affectedClaimIds: artifact.affectedClaimIds.map((item) => truncate(item, 160)).slice(0, 8),
        missingClaimIds: artifact.missingClaimIds.map((item) => truncate(item, 160)).slice(0, 8),
        note: truncateOptional(artifact.note, 240),
        locations,
      }
    }).slice(0, 8),
  }
}

function projectEvidenceTrace(trace: InspectionEvidenceTrace): InspectionEvidenceProjectionTrace {
  return {
    source: truncate(trace.source, 180),
    evidenceBindingId: truncateOptional(trace.evidenceBindingId, 160),
    claimId: truncateOptional(trace.claimId, 160),
    sourcePath: truncateOptional(trace.sourcePath, 220),
    findingsFile: truncateOptional(trace.findingsFile, 220),
    location: truncateOptional(trace.location, 120),
    page: truncateOptional(trace.page, 80),
    url: truncateOptional(trace.url, 240),
    quote: truncateOptional(trace.quote, 500),
    caveat: truncateOptional(trace.caveat, 280),
    supportScope: truncateOptional(trace.supportScope, 280),
    unsupportedScope: truncateOptional(trace.unsupportedScope, 280),
    strength: trace.strength,
    extractedTextPath: truncateOptional(trace.extractedTextPath, 220),
    extractedManifestPath: truncateOptional(trace.extractedManifestPath, 220),
    hasDetail: trace.hasDetail,
  }
}

function projectGap(gap: InspectionGap): InspectionGapProjection {
  return {
    type: gap.type,
    claimText: truncate(gap.claimText, 500),
    message: truncate(gap.message, 280),
  }
}

function projectNarrativeBrief(brief: NarrativeBrief): NarrativeBrief {
  return {
    audienceBeliefBefore: truncateOptional(brief.audienceBeliefBefore, 240),
    audienceBeliefAfter: truncateOptional(brief.audienceBeliefAfter, 240),
    decisionOrAction: truncateOptional(brief.decisionOrAction, 240),
    narrativeArc: truncateOptional(brief.narrativeArc, 240),
    keyClaims: brief.keyClaims.map((item) => truncate(item, 240)).slice(0, 8),
    objections: brief.objections.map((item) => truncate(item, 240)).slice(0, 8),
    risks: brief.risks.map((item) => truncate(item, 240)).slice(0, 8),
  }
}

function relatedNarrativeText(items: InspectionContext["riskContext"], slideIndex: number | undefined): string[] {
  return items
    .filter((item) => item.slideIndex === undefined || item.slideIndex === slideIndex)
    .map((item) => truncate(item.text, 240))
    .slice(0, 6)
}

function truncateOptional(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined
  return truncate(value, max)
}

function truncate(value: string, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 3)).trimEnd() + "..."
}
