import { deckPlanHash, upsertDeck, upsertSlides, type DecksState, type EvidenceRef, type RequiredInputs, type SlideSpec } from "../decks-state"
import { ensureActiveHtmlDeckRenderTarget } from "../workspace-state/render-targets"
import { getClaimSlideRefs } from "./queries"
import { computeNarrativeHash } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import { narrativeToBrief } from "./project-compat"
import type { NarrativeClaim, NarrativeEvidenceBinding, NarrativeStateV1 } from "./types"

export interface CompileDeckPlanOptions {
  now?: string
}

export interface CompileDeckPlanResult {
  compiled: boolean
  skipped: boolean
  reason?: string
  narrativeHash: string
  slideCount: number
  slides: SlideSpec[]
  qualityChecks?: DeckPlanQualityCheck[]
}

export interface DeckPlanQualityCheck {
  id: string
  status: "pass" | "warning" | "blocker"
  message: string
}

export function compileDeckPlanFromNarrative(state: DecksState, options: CompileDeckPlanOptions = {}): { state: DecksState; result: CompileDeckPlanResult } {
  const narrative = normalizeNarrativeState(state)
  const narrativeHash = computeNarrativeHash(narrative)
  const approval = hasCurrentApprovalOrOverride(narrative, narrativeHash)
  if (!approval) {
    return {
      state: { ...state, narrative },
      result: {
        compiled: false,
        skipped: true,
        reason: "narrative must be approved or explicitly overridden before compiling a deck plan",
        narrativeHash,
        slideCount: 0,
        slides: [],
      },
    }
  }

  const deckKey = state.activeDeck ?? Object.keys(state.decks)[0]
  const deck = deckKey ? state.decks[deckKey] : undefined
  const slug = deck?.slug ?? state.activeDeck ?? "deck"
  const slides = buildSlides(narrative)
  const qualityChecks = checkPlanQuality(narrative, slides)
  const planCoverage = deckPlanCoverage(narrative, slides)
  const requiredInputs: Partial<RequiredInputs> = {
    topicClarified: true,
    audienceClarified: Boolean(narrative.audience.primary),
    languageDecided: Boolean(deck?.language),
    sourceMaterialsIdentified: (state.workspace.sourceMaterials ?? []).length > 0 || narrative.evidenceBindings.length > 0,
    researchNeedAssessed: true,
    researchFindingsRead: narrative.evidenceBindings.some((binding) => Boolean(binding.findingsFile)),
    slidePlanConfirmed: false,
    designLayoutsFetched: false,
  }
  let next = upsertDeck({ ...state, narrative }, {
    ...deck,
    slug,
    goal: deck?.goal || narrative.thesis?.statement || narrative.decision.action,
    audience: narrative.audience.primary || deck?.audience,
    outputPath: deck?.outputPath,
    narrativeBrief: narrativeToBrief(narrative),
    requiredInputs: {
      ...(deck?.requiredInputs ?? {}),
      ...requiredInputs,
    } as RequiredInputs,
    writeReadiness: deck?.writeReadiness ?? { status: "blocked" as const, blockers: [] },
  })
  next = upsertSlides(next, slug, slides)
  const plannedDeck = next.decks[slug]
  plannedDeck.planReview = {
    status: "pending",
    narrativeHash,
    planHash: deckPlanHash(plannedDeck.slides),
    qualityChecks,
  }
  plannedDeck.requiredInputs = { ...plannedDeck.requiredInputs, slidePlanConfirmed: false }
  plannedDeck.writeReadiness = { status: "blocked", blockers: [] }
  next.decks[slug] = plannedDeck
  next.narrative = { ...narrative, updatedAt: options.now ?? narrative.updatedAt }
  const htmlTarget = ensureActiveHtmlDeckRenderTarget(next)
  if (htmlTarget) {
    htmlTarget.data = {
      ...(htmlTarget.data ?? {}),
      narrativeId: narrative.id,
      narrativeHash,
      planQualityChecks: qualityChecks,
      requiredClaimIds: planCoverage.requiredClaimIds,
      coveredClaimIds: planCoverage.coveredClaimIds,
      missingClaimIds: planCoverage.missingClaimIds,
      claimSlideRefs: getClaimSlideRefs(next).map((ref) => ({
        claimId: ref.claimId,
        claimText: ref.claimText,
        slideIndex: ref.slideIndex,
        slideTitle: ref.slideTitle,
        match: ref.match,
        role: ref.role,
        location: ref.location,
      })),
    }
  }

  return {
    state: next,
      result: {
        compiled: true,
        skipped: false,
        narrativeHash,
        slideCount: slides.length,
        slides,
        qualityChecks,
      },
    }
}

function buildSlides(narrative: NarrativeStateV1): SlideSpec[] {
  const slides: SlideSpec[] = []
  const evidenceByClaim = evidenceBindingsByClaim(narrative.evidenceBindings)
  const centralClaims = orderedClaims(narrative, (claim) => claim.importance === "central")
  const supportingClaims = orderedClaims(narrative, (claim) => claim.importance !== "central")
  const chapters = deriveChapters(narrative, centralClaims, supportingClaims)

  slides.push(coverSlide(slides.length + 1, narrative))
  slides.push(tocSlide(slides.length + 1, chapters))

  for (const claim of centralClaims) {
    slides.push(claimSlide(slides.length + 1, claim, evidenceByClaim.get(claim.id) ?? []))
  }
  if (supportingClaims.length > 0) slides.push(supportingLogicSlide(slides.length + 1, supportingClaims, evidenceByClaim))

  if (narrative.risks.length > 0 || narrative.objections.length > 0) {
    slides.push(riskObjectionSlide(slides.length + 1, narrative))
  }

  slides.push(decisionAskSlide(slides.length + 1, narrative))

  return slides
}

function coverSlide(index: number, narrative: NarrativeStateV1): SlideSpec {
  return {
    index,
    title: "Decision Context",
    purpose: "Frame the audience belief shift and decision required before presenting the recommendation.",
    narrativeRole: "context",
    layout: "cover",
    qa: false,
    components: ["hero", "text-panel"],
    content: {
      headline: narrative.thesis?.statement || narrative.decision.action || "Narrative context",
      body: [
        narrative.audience.beliefBefore ? `Before: ${narrative.audience.beliefBefore}` : "Before belief needs confirmation.",
        narrative.audience.beliefAfter ? `After: ${narrative.audience.beliefAfter}` : "After belief needs confirmation.",
      ],
      bullets: narrative.decision.action ? [`Decision: ${narrative.decision.action}`] : [],
    },
    evidence: [],
    status: "planned",
  }
}

function tocSlide(index: number, chapters: string[]): SlideSpec {
  return {
    index,
    title: "Storyline",
    purpose: "Preview the deterministic chapter structure compiled from the approved narrative state.",
    narrativeRole: "context",
    layout: "toc",
    qa: false,
    components: ["toc", "text-panel"],
    content: {
      headline: "How the decision story is organized",
      bullets: chapters,
    },
    evidence: [],
    status: "planned",
  }
}

function claimSlide(index: number, claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): SlideSpec {
  return {
    index,
    title: titleFromClaim(claim),
    purpose: `Prove or bound this ${claim.importance} ${claim.kind} claim for the audience.`,
    narrativeRole: claim.kind === "risk" || claim.kind === "assumption" ? "risk" : claim.kind === "ask" ? "ask" : claim.kind === "recommendation" ? "recommendation" : "evidence",
    layout: "two-col",
    qa: true,
    components: claimComponents(claim, bindings),
    claimIds: [claim.id],
    claimRefs: [{ claimId: claim.id, role: "primary", note: claimBoundaryNote(claim) }],
    evidenceBindingIds: bindings.map((binding) => binding.id),
    content: {
      headline: claim.text,
      bullets: claimBullets(claim, bindings),
    },
    evidence: bindings.map(evidenceRefFromBinding),
    status: "planned",
  }
}

function supportingLogicSlide(index: number, claims: NarrativeClaim[], evidenceByClaim: Map<string, NarrativeEvidenceBinding[]>): SlideSpec {
  const supportingBindings = claims.flatMap((claim) => evidenceByClaim.get(claim.id) ?? [])
  return {
    index,
    title: "Supporting Logic",
    purpose: "Connect supporting and background claims to the central recommendation without overloading the main proof slides.",
    narrativeRole: "evidence",
    layout: "card-grid",
    qa: true,
    components: ["box", "text-panel"],
    claimIds: claims.map((claim) => claim.id),
    claimRefs: claims.map((claim) => ({ claimId: claim.id, role: "supporting" as const, note: claimBoundaryNote(claim) })),
    evidenceBindingIds: supportingBindings.map((binding) => binding.id),
    content: {
      headline: "Supporting claims and boundaries",
      bullets: claims.slice(0, 5).flatMap((claim) => [claim.text, ...claimBoundaryBullets(claim)]).slice(0, 8),
    },
    evidence: supportingBindings.map(evidenceRefFromBinding),
    status: "planned",
  }
}

function riskObjectionSlide(index: number, narrative: NarrativeStateV1): SlideSpec {
  const challengedClaimRefs = [
    ...narrative.risks.map((risk) => risk.claimId ? { claimId: risk.claimId, role: "risk" as const } : undefined).filter((ref): ref is { claimId: string; role: "risk" } => Boolean(ref)),
    ...narrative.objections.map((objection) => objection.claimId ? { claimId: objection.claimId, role: "objection" as const } : undefined).filter((ref): ref is { claimId: string; role: "objection" } => Boolean(ref)),
  ]
  const challengedClaimIds = [...new Set(challengedClaimRefs.map((ref) => ref.claimId))]
  return {
    index,
    title: "Risks And Objections",
    purpose: "Make caveats and stakeholder objections visible before asking for a decision.",
    narrativeRole: "risk",
    layout: "two-col",
    qa: true,
    components: ["box", "text-panel"],
    claimIds: challengedClaimIds,
    claimRefs: dedupeClaimRefs(challengedClaimRefs),
    content: {
      headline: "What could break the recommendation",
      bullets: [
        ...narrative.risks.slice(0, 3).map((risk) => risk.mitigation ? `${risk.text} Mitigation: ${risk.mitigation}` : risk.text),
        ...narrative.objections.slice(0, 3).map((objection) => objection.response ? `${objection.text} Response: ${objection.response}` : objection.text),
      ],
    },
    evidence: [],
    status: "planned",
  }
}

function decisionAskSlide(index: number, narrative: NarrativeStateV1): SlideSpec {
  const askClaims = orderedClaims(narrative, (claim) => claim.kind === "ask" || claim.kind === "recommendation")
  return {
    index,
    title: "Decision Ask",
    purpose: "Close with the explicit decision or action requested from the audience.",
    narrativeRole: "ask",
    layout: "closing",
    qa: false,
    components: ["hero", "text-panel"],
    claimIds: askClaims.map((claim) => claim.id),
    claimRefs: askClaims.map((claim) => ({ claimId: claim.id, role: "primary" as const, note: claimBoundaryNote(claim) })),
    content: {
      headline: narrative.decision.action || "Confirm the decision",
      bullets: [
        narrative.decision.owner ? `Owner: ${narrative.decision.owner}` : undefined,
        narrative.decision.deadline ? `Deadline: ${narrative.decision.deadline}` : undefined,
        narrative.decision.consequenceOfNoDecision ? `If no decision: ${narrative.decision.consequenceOfNoDecision}` : undefined,
      ].filter((item): item is string => Boolean(item)),
    },
    evidence: [],
    status: "planned",
  }
}

function evidenceBindingsByClaim(bindings: NarrativeEvidenceBinding[]): Map<string, NarrativeEvidenceBinding[]> {
  const evidenceByClaim = new Map<string, NarrativeEvidenceBinding[]>()
  for (const binding of bindings) {
    const list = evidenceByClaim.get(binding.claimId) ?? []
    list.push(binding)
    evidenceByClaim.set(binding.claimId, list)
  }
  return evidenceByClaim
}

function orderedClaims(narrative: NarrativeStateV1, predicate: (claim: NarrativeClaim) => boolean): NarrativeClaim[] {
  const sourceOrder = new Map(narrative.claims.map((claim, index) => [claim.id, index]))
  const relationScore = new Map<string, number>()
  for (const relation of narrative.claimRelations ?? []) {
    const delta = relation.relation === "leads_to" ? 3 : relation.relation === "supports" ? 2 : relation.relation === "depends_on" || relation.relation === "constrains" ? 1 : 0
    relationScore.set(relation.toClaimId, (relationScore.get(relation.toClaimId) ?? 0) + delta)
  }
  return narrative.claims
    .filter(predicate)
    .sort((a, b) => (relationScore.get(b.id) ?? 0) - (relationScore.get(a.id) ?? 0) || (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0))
}

function deriveChapters(narrative: NarrativeStateV1, centralClaims: NarrativeClaim[], supportingClaims: NarrativeClaim[]): string[] {
  const chapters: string[] = []
  addUnique(chapters, narrative.audience.decisionContext ? "Decision context" : "Context and belief shift")
  if (hasClaimKind([...centralClaims, ...supportingClaims], ["problem", "opportunity"])) addUnique(chapters, "Tension and opportunity")
  if (centralClaims.some((claim) => claim.kind === "evidence") || supportingClaims.some((claim) => claim.kind === "evidence")) addUnique(chapters, "Evidence and proof")
  if (centralClaims.some((claim) => claim.kind === "recommendation" || claim.kind === "ask") || narrative.decision.action) addUnique(chapters, "Recommendation and decision")
  if (narrative.risks.length > 0 || narrative.objections.length > 0 || centralClaims.some((claim) => claim.unsupportedScope || (claim.caveats ?? []).length > 0)) addUnique(chapters, "Risks and boundaries")
  addUnique(chapters, "Decision ask")
  if (chapters.length < 3) addUnique(chapters, "Evidence and proof")
  return chapters.slice(0, 5)
}

function addUnique(items: string[], item: string): void {
  if (!items.includes(item)) items.push(item)
}

function hasClaimKind(claims: NarrativeClaim[], kinds: NarrativeClaim["kind"][]): boolean {
  return claims.some((claim) => kinds.includes(claim.kind))
}

function claimComponents(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): string[] {
  if (bindings.some((binding) => binding.quote?.trim())) return ["box", "text-panel", "quote"]
  if (claim.kind === "recommendation" || claim.kind === "ask") return ["box", "text-panel", "steps"]
  return ["box", "text-panel"]
}

function claimBullets(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): string[] {
  return [
    ...claimBoundaryBullets(claim),
    ...bindings.slice(0, 2).map((binding) => binding.supportScope ? `Evidence supports: ${binding.supportScope}` : undefined),
  ].filter((item): item is string => Boolean(item))
}

function claimBoundaryBullets(claim: NarrativeClaim): string[] {
  return [
    claim.supportedScope ? `Supported scope: ${claim.supportedScope}` : undefined,
    claim.unsupportedScope ? `Unsupported scope: ${claim.unsupportedScope}` : undefined,
    ...(claim.caveats ?? []).map((caveat) => `Caveat: ${caveat}`),
  ].filter((item): item is string => Boolean(item))
}

function claimBoundaryNote(claim: NarrativeClaim): string | undefined {
  const notes = claimBoundaryBullets(claim)
  return notes.length > 0 ? notes.join(" ") : undefined
}

function dedupeClaimRefs<T extends { claimId: string; role: "risk" | "objection" }>(refs: T[]): T[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = `${ref.claimId}:${ref.role}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function evidenceRefFromBinding(binding: NarrativeEvidenceBinding): EvidenceRef {
  return {
    source: binding.source,
    quote: binding.quote,
    url: binding.url,
    sourcePath: binding.sourcePath,
    location: binding.location,
    findingsFile: binding.findingsFile,
    caveat: binding.caveat || binding.unsupportedScope,
  }
}

function checkPlanQuality(narrative: NarrativeStateV1, slides: SlideSpec[]): DeckPlanQualityCheck[] {
  const coverage = deckPlanCoverage(narrative, slides)
  const centralClaimIds = narrative.claims.filter((claim) => claim.importance === "central").map((claim) => claim.id)
  const missingCentralClaims = centralClaimIds.filter((claimId) => coverage.missingClaimIds.includes(claimId))
  const incompatibleComponents = [...new Set(slides.flatMap((slide) => slide.components).filter((component) => component === "card"))]

  return [
    {
      id: "toc_present",
      status: slides.some((slide) => slide.components.includes("toc")) ? "pass" : "blocker",
      message: slides.some((slide) => slide.components.includes("toc")) ? "Deck plan includes a deterministic TOC slide." : "Deck plan is missing a TOC slide.",
    },
    {
      id: "closing_ask_present",
      status: slides.some((slide) => slide.narrativeRole === "ask" && slide.title === "Decision Ask") ? "pass" : "blocker",
      message: slides.some((slide) => slide.narrativeRole === "ask" && slide.title === "Decision Ask") ? "Deck plan includes a closing Decision Ask slide." : "Deck plan is missing a closing Decision Ask slide.",
    },
    {
      id: "central_claims_covered",
      status: missingCentralClaims.length === 0 ? "pass" : "blocker",
      message: missingCentralClaims.length === 0 ? "All central claims are covered by planned slides." : `Central claims missing from planned slides: ${missingCentralClaims.join(", ")}`,
    },
    {
      id: "unsupported_central_claims_visible",
      status: narrative.claims.some((claim) => claim.importance === "central" && (claim.unsupportedScope || (claim.caveats ?? []).length > 0)) ? "warning" : "pass",
      message: narrative.claims.some((claim) => claim.importance === "central" && (claim.unsupportedScope || (claim.caveats ?? []).length > 0)) ? "Central claim boundaries are visible and should remain explicit in the rendered artifact." : "No unsupported central claim boundaries were found.",
    },
    {
      id: "simplified_design_grammar",
      status: incompatibleComponents.length === 0 ? "pass" : "blocker",
      message: incompatibleComponents.length === 0 ? "Planned slides use the simplified design grammar." : `Deck plan uses incompatible primary components: ${incompatibleComponents.join(", ")}`,
    },
  ]
}

function deckPlanCoverage(narrative: NarrativeStateV1, slides: SlideSpec[]): { requiredClaimIds: string[]; coveredClaimIds: string[]; missingClaimIds: string[] } {
  const requiredClaimIds = narrative.claims
    .filter((claim) => claim.importance === "central" || claim.evidenceRequired)
    .map((claim) => claim.id)
    .sort()
  const required = new Set(requiredClaimIds)
  const coveredClaimIds = [...new Set(slides.flatMap((slide) => [
    ...(slide.claimIds ?? []),
    ...(slide.claimRefs ?? []).map((ref) => ref.claimId),
  ]).filter((claimId) => required.has(claimId)))].sort()
  const missingClaimIds = requiredClaimIds.filter((claimId) => !coveredClaimIds.includes(claimId))
  return { requiredClaimIds, coveredClaimIds, missingClaimIds }
}

function titleFromClaim(claim: NarrativeClaim): string {
  const words = claim.text.split(/\s+/).filter(Boolean).slice(0, 6).join(" ")
  return words || claim.kind
}

function hasCurrentApprovalOrOverride(narrative: NarrativeStateV1, narrativeHash: string): boolean {
  return narrative.approvals.some((approval) => approval.narrativeHash === narrativeHash && (approval.scope === "narrative" && approval.approvedBy === "user" || approval.scope === "render_override" || approval.approvedBy === "override"))
}
