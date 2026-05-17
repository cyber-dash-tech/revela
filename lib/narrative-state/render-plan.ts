import { deckPlanHash, upsertDeck, upsertSlides, type DecksState, type EvidenceRef, type RequiredInputs, type SlideSpec, type VisualBrief } from "../decks-state"
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
  chapters?: DeckPlanChapter[]
  qualityChecks?: DeckPlanQualityCheck[]
}

export interface DeckPlanChapter {
  title: string
  role: "context" | "tension" | "evidence" | "recommendation" | "risk" | "ask"
  slideIndexes: number[]
  claimIds: string[]
  evidenceBindingIds: string[]
}

export interface DeckPlanQualityCheck {
  id: string
  status: "pass" | "warning" | "blocker"
  message: string
}

type VisualIntentKind = "hero" | "toc" | "metric-stat" | "evidence-table" | "comparison-grid" | "risk-matrix" | "steps" | "text-only"

interface VisualIntent {
  kind: VisualIntentKind
  component: string
  rationale: string
  dataSignals: string[]
  evidenceBindingIds: string[]
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
  const plan = buildDeckPlan(narrative)
  const { slides, chapters } = plan
  const qualityChecks = checkPlanQuality(narrative, slides, chapters)
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
        planChapters: chapters,
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
        chapters,
        qualityChecks,
      },
    }
}

function buildDeckPlan(narrative: NarrativeStateV1): { slides: SlideSpec[]; chapters: DeckPlanChapter[] } {
  const slides: SlideSpec[] = []
  const evidenceByClaim = evidenceBindingsByClaim(narrative.evidenceBindings)
  const centralClaims = orderedClaims(narrative, (claim) => claim.importance === "central")
  const supportingClaims = orderedClaims(narrative, (claim) => claim.importance !== "central")
  const chapters = deriveChapters(narrative, centralClaims, supportingClaims).map((chapter) => ({ ...chapter }))

  slides.push(coverSlide(slides.length + 1, narrative))
  assignSlideToChapter(chapters, "context", slides[slides.length - 1])
  slides.push(tocSlide(slides.length + 1, chapters))

  for (const claim of centralClaims) {
    const slide = claimSlide(slides.length + 1, claim, evidenceByClaim.get(claim.id) ?? [])
    slides.push(slide)
    assignSlideToChapter(chapters, chapterRoleForClaim(claim), slide)
  }
  if (supportingClaims.length > 0) {
    const slide = supportingLogicSlide(slides.length + 1, supportingClaims, evidenceByClaim)
    slides.push(slide)
    assignSlideToChapter(chapters, "evidence", slide)
  }

  if (narrative.risks.length > 0 || narrative.objections.length > 0) {
    const slide = riskObjectionSlide(slides.length + 1, narrative, evidenceByClaim)
    slides.push(slide)
    assignSlideToChapter(chapters, "risk", slide)
  }

  const decisionSlide = decisionAskSlide(slides.length + 1, narrative)
  slides.push(decisionSlide)
  assignSlideToChapter(chapters, "ask", decisionSlide)

  return { slides, chapters }
}

function coverSlide(index: number, narrative: NarrativeStateV1): SlideSpec {
  const visualIntent = visualIntentForStructuralSlide("hero", "Use a hero frame to anchor the decision context and belief shift before evidence detail.")
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
      data: { visualIntent },
    },
    visuals: visualBriefs(index, visualIntent),
    evidence: [],
    status: "planned",
  }
}

function tocSlide(index: number, chapters: DeckPlanChapter[]): SlideSpec {
  const visualIntent = visualIntentForStructuralSlide("toc", "Render the chapter sequence as a visual table of contents instead of a bullet-only agenda.")
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
      bullets: chapters.map((chapter) => chapter.title),
      data: { chapters: chapters.map((chapter) => ({ title: chapter.title, role: chapter.role })), visualIntent },
    },
    visuals: visualBriefs(index, visualIntent),
    evidence: [],
    status: "planned",
  }
}

function claimSlide(index: number, claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): SlideSpec {
  const visualIntent = visualIntentForClaim(claim, bindings)
  return {
    index,
    title: titleFromClaim(claim),
    purpose: `Prove or bound this ${claim.importance} ${claim.kind} claim for the audience.`,
    narrativeRole: claim.kind === "risk" || claim.kind === "assumption" ? "risk" : claim.kind === "ask" ? "ask" : claim.kind === "recommendation" ? "recommendation" : "evidence",
    layout: "two-col",
    qa: true,
    components: claimComponents(claim, bindings, visualIntent),
    claimIds: [claim.id],
    claimRefs: [{ claimId: claim.id, role: "primary", note: claimBoundaryNote(claim) }],
    evidenceBindingIds: bindings.map((binding) => binding.id),
    content: {
      headline: claim.text,
      bullets: claimBullets(claim, bindings),
      data: { visualIntent },
    },
    evidence: bindings.map(evidenceRefFromBinding),
    visuals: visualBriefs(index, visualIntent),
    status: "planned",
  }
}

function supportingLogicSlide(index: number, claims: NarrativeClaim[], evidenceByClaim: Map<string, NarrativeEvidenceBinding[]>): SlideSpec {
  const supportingBindings = claims.flatMap((claim) => evidenceByClaim.get(claim.id) ?? [])
  const visualIntent = visualIntentForSupportingLogic(claims, supportingBindings)
  return {
    index,
    title: "Supporting Logic",
    purpose: "Connect supporting and background claims to the central recommendation without overloading the main proof slides.",
    narrativeRole: "evidence",
    layout: "card-grid",
    qa: true,
    components: componentsForVisualIntent(["box", "text-panel"], visualIntent),
    claimIds: claims.map((claim) => claim.id),
    claimRefs: claims.map((claim) => ({ claimId: claim.id, role: "supporting" as const, note: claimBoundaryNote(claim) })),
    evidenceBindingIds: supportingBindings.map((binding) => binding.id),
    content: {
      headline: "Supporting claims and boundaries",
      bullets: claims.slice(0, 5).flatMap((claim) => [claim.text, ...claimBoundaryBullets(claim), evidenceGapBullet(claim, evidenceByClaim.get(claim.id) ?? [])]).filter((item): item is string => Boolean(item)).slice(0, 8),
      data: { visualIntent },
    },
    evidence: supportingBindings.map(evidenceRefFromBinding),
    visuals: visualBriefs(index, visualIntent),
    status: "planned",
  }
}

function riskObjectionSlide(index: number, narrative: NarrativeStateV1, evidenceByClaim: Map<string, NarrativeEvidenceBinding[]>): SlideSpec {
  const challengedClaimRefs = [
    ...narrative.risks.map((risk) => risk.claimId ? { claimId: risk.claimId, role: "risk" as const } : undefined).filter((ref): ref is { claimId: string; role: "risk" } => Boolean(ref)),
    ...narrative.objections.map((objection) => objection.claimId ? { claimId: objection.claimId, role: "objection" as const } : undefined).filter((ref): ref is { claimId: string; role: "objection" } => Boolean(ref)),
  ]
  const challengedClaimIds = [...new Set(challengedClaimRefs.map((ref) => ref.claimId))]
  const challengedBindings = challengedClaimIds.flatMap((claimId) => evidenceByClaim.get(claimId) ?? [])
  const visualIntent = visualIntentForRiskObjection(narrative, challengedBindings)
  return {
    index,
    title: "Risks And Objections",
    purpose: "Make caveats and stakeholder objections visible before asking for a decision.",
    narrativeRole: "risk",
    layout: "two-col",
    qa: true,
    components: componentsForVisualIntent(["box", "text-panel"], visualIntent),
    claimIds: challengedClaimIds,
    claimRefs: dedupeClaimRefs(challengedClaimRefs),
    evidenceBindingIds: challengedBindings.map((binding) => binding.id),
    content: {
      headline: "What could break the recommendation",
      bullets: [
        ...narrative.risks.slice(0, 3).map((risk) => risk.mitigation ? `${risk.text} Mitigation: ${risk.mitigation}` : risk.text),
        ...narrative.objections.slice(0, 3).map((objection) => objection.response ? `${objection.text} Response: ${objection.response}` : objection.text),
      ],
      data: { visualIntent },
    },
    evidence: challengedBindings.map(evidenceRefFromBinding),
    visuals: visualBriefs(index, visualIntent),
    status: "planned",
  }
}

function decisionAskSlide(index: number, narrative: NarrativeStateV1): SlideSpec {
  const askClaims = orderedClaims(narrative, (claim) => claim.kind === "ask" || claim.kind === "recommendation")
  const visualIntent = visualIntentForStructuralSlide("steps", "Show the requested decision, owner, deadline, and consequence as an action sequence rather than a dense closing paragraph.")
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
      data: { visualIntent },
    },
    evidence: [],
    visuals: visualBriefs(index, visualIntent),
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

function deriveChapters(narrative: NarrativeStateV1, centralClaims: NarrativeClaim[], supportingClaims: NarrativeClaim[]): DeckPlanChapter[] {
  const claims = [...centralClaims, ...supportingClaims]
  const chapters: DeckPlanChapter[] = []
  addChapter(chapters, narrative.audience.decisionContext ? "Decision context" : "Context and belief shift", "context")
  if (hasClaimKind(claims, ["problem", "opportunity"])) addChapter(chapters, "Tension and opportunity", "tension")
  if (claims.some((claim) => claim.kind === "evidence") || narrative.evidenceBindings.length > 0) addChapter(chapters, "Evidence and proof", "evidence")
  if (claims.some((claim) => claim.kind === "recommendation" || claim.kind === "ask") || narrative.decision.action) addChapter(chapters, "Recommendation and decision", "recommendation")
  if (narrative.risks.length > 0 || narrative.objections.length > 0 || centralClaims.some((claim) => claim.unsupportedScope || (claim.caveats ?? []).length > 0)) addChapter(chapters, "Risks and boundaries", "risk")
  addChapter(chapters, "Decision ask", "ask")
  if (chapters.length < 3) addChapter(chapters, "Evidence and proof", "evidence")
  while (chapters.length > 5) {
    const tensionIndex = chapters.findIndex((chapter) => chapter.role === "tension")
    if (tensionIndex >= 0) chapters.splice(tensionIndex, 1)
    else chapters.splice(Math.max(1, chapters.length - 2), 1)
  }
  return chapters
}

function addChapter(chapters: DeckPlanChapter[], title: string, role: DeckPlanChapter["role"]): void {
  if (chapters.some((chapter) => chapter.role === role || chapter.title === title)) return
  chapters.push({ title, role, slideIndexes: [], claimIds: [], evidenceBindingIds: [] })
}

function assignSlideToChapter(chapters: DeckPlanChapter[], role: DeckPlanChapter["role"], slide: SlideSpec): void {
  const chapter = chapters.find((item) => item.role === role) ?? chapters.find((item) => item.role === "evidence") ?? chapters[chapters.length - 1]
  if (!chapter) return
  chapter.slideIndexes.push(slide.index)
  for (const claimId of slide.claimIds ?? []) addUnique(chapter.claimIds, claimId)
  for (const ref of slide.claimRefs ?? []) addUnique(chapter.claimIds, ref.claimId)
  for (const bindingId of slide.evidenceBindingIds ?? []) addUnique(chapter.evidenceBindingIds, bindingId)
}

function addUnique(items: string[], item: string): void {
  if (!items.includes(item)) items.push(item)
}

function chapterRoleForClaim(claim: NarrativeClaim): DeckPlanChapter["role"] {
  if (claim.kind === "problem" || claim.kind === "opportunity") return "tension"
  if (claim.kind === "recommendation") return "recommendation"
  if (claim.kind === "ask") return "ask"
  if (claim.kind === "risk" || claim.kind === "assumption") return "risk"
  if (claim.kind === "context") return "context"
  return "evidence"
}

function hasClaimKind(claims: NarrativeClaim[], kinds: NarrativeClaim["kind"][]): boolean {
  return claims.some((claim) => kinds.includes(claim.kind))
}

function claimComponents(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[], visualIntent: VisualIntent): string[] {
  const base = bindings.some((binding) => binding.quote?.trim()) ? ["box", "text-panel", "quote"] : ["box", "text-panel"]
  if ((claim.kind === "recommendation" || claim.kind === "ask") && visualIntent.kind === "text-only") return ["box", "text-panel", "steps"]
  return componentsForVisualIntent(base, visualIntent)
}

function visualIntentForClaim(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): VisualIntent {
  const evidenceBindingIds = bindings.map((binding) => binding.id)
  const dataSignals = dataSignalsFromBindings(bindings)
  if (bindings.length >= 2) {
    return {
      kind: "evidence-table",
      component: "data-table",
      rationale: "Compare multiple evidence bindings with source, support scope, and caveat columns so the slide is not a bullet stack.",
      dataSignals,
      evidenceBindingIds,
    }
  }
  if (dataSignals.length > 0) {
    return {
      kind: "metric-stat",
      component: "stat-card",
      rationale: "Promote the strongest quantitative evidence signal into a metric card, with the source quote retained for traceability.",
      dataSignals,
      evidenceBindingIds,
    }
  }
  if (claim.kind === "recommendation" || claim.kind === "ask") {
    return {
      kind: "steps",
      component: "steps",
      rationale: "Show the recommendation as phased actions or decision gates rather than a paragraph.",
      dataSignals,
      evidenceBindingIds,
    }
  }
  return {
    kind: "text-only",
    component: "box",
    rationale: "No quantified or multi-source visual signal is available; use semantic evidence boxes and keep boundaries explicit.",
    dataSignals,
    evidenceBindingIds,
  }
}

function visualIntentForSupportingLogic(claims: NarrativeClaim[], bindings: NarrativeEvidenceBinding[]): VisualIntent {
  const dataSignals = dataSignalsFromBindings(bindings)
  return {
    kind: claims.length >= 3 || bindings.length >= 2 ? "comparison-grid" : "evidence-table",
    component: "data-table",
    rationale: "Organize supporting claims as a comparison grid with evidence status and boundaries, avoiding a long undifferentiated bullet list.",
    dataSignals,
    evidenceBindingIds: bindings.map((binding) => binding.id),
  }
}

function visualIntentForRiskObjection(narrative: NarrativeStateV1, bindings: NarrativeEvidenceBinding[]): VisualIntent {
  return {
    kind: "risk-matrix",
    component: "data-table",
    rationale: "Pair each risk or objection with mitigation or response in a compact matrix so caveats stay visible without becoming prose-heavy.",
    dataSignals: [...narrative.risks.map((risk) => risk.severity), ...narrative.objections.map((objection) => objection.priority)].filter(Boolean),
    evidenceBindingIds: bindings.map((binding) => binding.id),
  }
}

function visualIntentForStructuralSlide(kind: Extract<VisualIntentKind, "hero" | "toc" | "steps">, rationale: string): VisualIntent {
  return { kind, component: kind === "toc" ? "toc" : kind === "steps" ? "steps" : "hero", rationale, dataSignals: [], evidenceBindingIds: [] }
}

function componentsForVisualIntent(base: string[], visualIntent: VisualIntent): string[] {
  const next = [...base]
  if (visualIntent.component && !next.includes(visualIntent.component)) next.push(visualIntent.component)
  return next
}

function visualBriefs(slideIndex: number, visualIntent: VisualIntent): VisualBrief[] {
  return [{
    id: `visual:${slideIndex}:${visualIntent.kind}`,
    purpose: visualIntent.kind,
    brief: `${visualIntent.rationale} Use ${visualIntent.component} and preserve cited evidence boundaries${visualIntent.dataSignals.length > 0 ? `; visible signals: ${visualIntent.dataSignals.slice(0, 4).join(", ")}.` : "."}`,
  }]
}

function dataSignalsFromBindings(bindings: NarrativeEvidenceBinding[]): string[] {
  const signals = bindings.flatMap((binding) => numericSignals([binding.quote, binding.supportScope, binding.source, binding.location].filter(Boolean).join(" ")))
  return [...new Set(signals)].slice(0, 6)
}

function numericSignals(text: string): string[] {
  return [...text.matchAll(/(?:[$€£¥]\s*)?\d+(?:\.\d+)?\s*(?:%|bps|x|k|m|bn|billion|million|year|years|yr|yrs)?/gi)]
    .map((match) => match[0].trim())
    .filter(Boolean)
}

function claimBullets(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): string[] {
  return [
    ...claimBoundaryBullets(claim),
    ...bindings.slice(0, 2).map((binding) => binding.supportScope ? `Evidence supports: ${binding.supportScope}` : undefined),
    evidenceGapBullet(claim, bindings),
  ].filter((item): item is string => Boolean(item))
}

function evidenceGapBullet(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): string | undefined {
  if (!claim.evidenceRequired || bindings.length > 0) return undefined
  return `Evidence gap: ${claim.evidenceStatus === "missing" ? "no binding yet" : "support remains incomplete"}.`
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

function checkPlanQuality(narrative: NarrativeStateV1, slides: SlideSpec[], chapters: DeckPlanChapter[]): DeckPlanQualityCheck[] {
  const coverage = deckPlanCoverage(narrative, slides)
  const centralClaimIds = narrative.claims.filter((claim) => claim.importance === "central").map((claim) => claim.id)
  const missingCentralClaims = centralClaimIds.filter((claimId) => coverage.missingClaimIds.includes(claimId))
  const incompatibleComponents = [...new Set(slides.flatMap((slide) => slide.components).filter((component) => component === "card"))]
  const toc = slides.find((slide) => slide.components.includes("toc"))
  const tocBullets = toc?.content.bullets ?? []
  const chapterTitles = chapters.map((chapter) => chapter.title)
  const evidenceRequiredWithoutBindings = narrative.claims.filter((claim) => claim.evidenceRequired && !narrative.evidenceBindings.some((binding) => binding.claimId === claim.id))
  const invisibleEvidenceGaps = evidenceRequiredWithoutBindings.filter((claim) => coverage.missingClaimIds.includes(claim.id))
  const risksOrObjectionsVisible = narrative.risks.length === 0 && narrative.objections.length === 0 || slides.some((slide) => slide.narrativeRole === "risk")

  return [
    {
      id: "chapter_structure_present",
      status: chapters.length >= 3 && chapters.length <= 5 && chapters.every((chapter) => chapter.slideIndexes.length > 0) ? "pass" : "blocker",
      message: chapters.length >= 3 && chapters.length <= 5 && chapters.every((chapter) => chapter.slideIndexes.length > 0) ? `Deck plan includes ${chapters.length} deterministic chapters with slide ranges.` : "Deck plan must include 3-5 deterministic chapters, each mapped to at least one slide.",
    },
    {
      id: "toc_matches_chapters",
      status: chapterTitles.length > 0 && chapterTitles.every((title) => tocBullets.includes(title)) ? "pass" : "blocker",
      message: chapterTitles.length > 0 && chapterTitles.every((title) => tocBullets.includes(title)) ? "TOC headings match the deterministic chapter plan." : "TOC headings do not match the deterministic chapter plan.",
    },
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
      id: "evidence_required_claims_have_evidence_or_visible_gap",
      status: invisibleEvidenceGaps.length === 0 ? evidenceRequiredWithoutBindings.length > 0 ? "warning" : "pass" : "blocker",
      message: invisibleEvidenceGaps.length > 0 ? `Evidence-required claims missing from planned slides: ${invisibleEvidenceGaps.map((claim) => claim.id).join(", ")}` : evidenceRequiredWithoutBindings.length > 0 ? `Evidence gaps remain visible for claims: ${evidenceRequiredWithoutBindings.map((claim) => claim.id).join(", ")}` : "Every evidence-required claim has at least one evidence binding.",
    },
    {
      id: "risk_or_objection_visible",
      status: risksOrObjectionsVisible ? "pass" : "warning",
      message: risksOrObjectionsVisible ? "Risks and objections are visible when present." : "Narrative risks or objections exist but no risk/objection slide is planned.",
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
