import type { InspectionMatchConfidence } from "./match"
import type { InspectionPromptProjection } from "./project"

export type InspectionResultStatus = "success" | "no_match"
export type InspectionPurposeStatus = "clear" | "weak" | "misplaced" | "unknown"
export type InspectionSourceStatus = "supported" | "weak" | "unsupported" | "not_needed" | "unknown"

export interface InspectionResult {
  version: 1
  requestId?: string
  status: InspectionResultStatus
  selectedText?: string
  slide?: {
    index: number
    title: string
  }
  matchConfidence: InspectionMatchConfidence
  cards: {
    purpose: PurposeCard
    source: SourceCard
  }
  stale?: {
    stale: boolean
    reason?: string
  }
}

export interface SupportSourceItem {
  source: string
  sourcePath?: string
  findingsFile?: string
  location?: string
  page?: string
  url?: string
  quote?: string
  caveat?: string
}

export interface PurposeCard {
  status: InspectionPurposeStatus
  role?: string
  rationale: string
  whyItMatters: string
}

export interface SourceCard {
  status: InspectionSourceStatus
  matchedClaim?: string
  sources: SupportSourceItem[]
  warnings: string[]
  gaps: string[]
  caveats: string[]
  rationale: string
}

export function buildDeterministicInspectionResult(
  projection: InspectionPromptProjection,
  options: { requestId?: string; staleReason?: string } = {},
): InspectionResult {
  const slide = projection.match.slide
  const evidence = projection.cards.source.evidence
  const gaps = projection.cards.evidence.gaps
  const missingGaps = projection.cards.source.missingSourceGaps
  const weakGaps = projection.cards.source.weakSourceGaps
  const noMatch = projection.match.confidence === "none" || !slide

  return {
    version: 1,
    requestId: options.requestId,
    status: noMatch ? "no_match" : "success",
    selectedText: projection.selectedElement.text,
    slide: slide ? { index: slide.index, title: slide.title } : undefined,
    matchConfidence: projection.match.confidence,
    cards: {
      purpose: {
        status: purposeStatus(projection, noMatch),
        role: projection.cards.objective.narrativeRole,
        rationale: purposeRationale(projection, noMatch),
        whyItMatters: purposeWhyItMatters(projection, noMatch),
      },
      source: {
        status: sourceStatus(projection, noMatch),
        matchedClaim: projection.cards.evidence.matchedClaim,
        sources: evidence.map((item) => ({
          source: item.source,
          sourcePath: item.sourcePath,
          findingsFile: item.findingsFile,
          location: item.location,
          page: item.page,
          url: item.url,
          quote: item.quote,
          caveat: item.caveat,
        })),
        warnings: sourceWarnings(missingGaps.length, weakGaps.length, noMatch),
        gaps: gaps.map((gap) => gap.message),
        caveats: sourceCaveats(projection),
        rationale: sourceRationale(projection, noMatch),
      },
    },
    stale: options.staleReason ? { stale: true, reason: options.staleReason } : undefined,
  }
}

function purposeStatus(projection: InspectionPromptProjection, noMatch: boolean): InspectionPurposeStatus {
  if (noMatch) return "unknown"
  if (projection.cards.objective.narrativeRole || projection.cards.objective.slidePurpose) return "clear"
  return "unknown"
}

function purposeRationale(projection: InspectionPromptProjection, noMatch: boolean): string {
  if (noMatch) return "No matched slide is available to explain why this selection appears here."
  const role = projection.cards.objective.narrativeRole
  const purpose = projection.cards.objective.slidePurpose
  if (role && purpose) return `The selection appears inside a ${role} slide whose recorded purpose is: ${purpose}`
  if (purpose) return `The selection appears on a slide whose recorded purpose is: ${purpose}`
  if (role) return `The selection appears inside a slide with recorded narrative role: ${role}`
  return "The deterministic fallback cannot explain placement because the slide has no recorded purpose or narrative role."
}

function purposeWhyItMatters(projection: InspectionPromptProjection, noMatch: boolean): string {
  if (noMatch) return "Without a matched slide, the inspector cannot connect this selection to the deck narrative."
  const deckGoal = projection.cards.objective.deckGoal
  const audience = projection.cards.objective.audience
  if (deckGoal && audience) return `It matters because this selection contributes to the deck goal (${deckGoal}) for ${audience}.`
  if (deckGoal) return `It matters because this selection contributes to the deck goal: ${deckGoal}`
  if (audience) return `It matters because this selection is part of the message being shaped for ${audience}.`
  return "It matters as part of this slide's communication job, but the deterministic fallback has limited deck-level intent metadata."
}

function sourceStatus(projection: InspectionPromptProjection, noMatch: boolean): InspectionSourceStatus {
  if (noMatch) return "unknown"
  if (projection.cards.source.missingSourceGaps.length > 0) return "unsupported"
  if (projection.cards.source.weakSourceGaps.length > 0) return "weak"
  if (projection.cards.evidence.traces.some((item) => item.hasDetail)) return "supported"
  return projection.match.claim?.evidenceSensitive ? "unsupported" : "not_needed"
}

function sourceWarnings(missingGapCount: number, weakGapCount: number, noMatch: boolean): string[] {
  if (noMatch) return ["No slide or claim matched the selected element."]
  const warnings: string[] = []
  if (missingGapCount > 0) warnings.push("Matched evidence-sensitive claim has no slide-level evidence trace.")
  if (weakGapCount > 0) warnings.push("Matched evidence is source-only and lacks quote, location, URL, caveat, findings file, or source path detail.")
  return warnings
}

function sourceRationale(projection: InspectionPromptProjection, noMatch: boolean): string {
  if (noMatch) return "No matched claim is available for support assessment."
  if (projection.cards.source.missingSourceGaps.length > 0) return "The selected evidence-sensitive wording is unsupported in the current slide state."
  if (projection.cards.source.weakSourceGaps.length > 0) return "The selected wording has evidence, but the trace is source-only or missing inspection detail."
  if (projection.cards.evidence.traces.some((item) => item.hasDetail)) return "The selected wording has detailed slide-level evidence trace, including source detail where available."
  return "The selection is not clearly evidence-sensitive, so source support is not needed by the deterministic fallback."
}

function sourceCaveats(projection: InspectionPromptProjection): string[] {
  return [
    ...projection.cards.caveats.caveats,
    ...projection.cards.appendix.relatedRisks,
    ...projection.cards.appendix.relatedObjections,
  ].slice(0, 10)
}
