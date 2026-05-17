import { deckPlanHash, upsertDeck, upsertSlides, type DeckSpec, type DecksState, type EvidenceRef, type RequiredInputs, type SlideSpec, type VisualBrief } from "../decks-state"
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
  planHash?: string
  planArtifactPath?: string
  slideCount: number
  slides: SlideSpec[]
  chapters?: DeckPlanChapter[]
  qualityChecks?: DeckPlanQualityCheck[]
  renderPlan?: RenderPlanContract
  planningPacket?: DeckPlanningPacket
  deckPlanRequirements?: DeckPlanRequirements
}

export interface DeckPlanningPacket {
  narrativeHash: string
  outputPath: string
  audience: NarrativeStateV1["audience"]
  decision: NarrativeStateV1["decision"]
  thesis: NarrativeStateV1["thesis"]
  centralClaims: NarrativeClaim[]
  supportingClaims: NarrativeClaim[]
  evidenceBindings: NarrativeEvidenceBinding[]
  objections: NarrativeStateV1["objections"]
  risks: NarrativeStateV1["risks"]
  researchGaps: NarrativeStateV1["researchGaps"]
}

export interface DeckPlanRequirements {
  planArtifactPath: string
  defaultProfile: string
  userConfirmations: string[]
  authoringRules: string[]
  requiredSections: string[]
  approvalBlockTemplate: string
}

export interface DeckPlanChapter {
  title: string
  role: "context" | "tension" | "evidence" | "recommendation" | "risk" | "ask"
  slideIndexes: number[]
  claimIds: string[]
  evidenceBindingIds: string[]
  sourceClaimId?: string
}

export interface DeckPlanQualityCheck {
  id: string
  status: "pass" | "warning" | "blocker"
  message: string
}

export type RenderPlanSlideKind = "cover" | "toc" | "chapter-divider" | "claim-framing" | "claim-evidence" | "claim-implication" | "supporting-evidence" | "risk" | "ask" | "content"

export interface RenderPlanSlideMetadata {
  index: number
  title: string
  chapterTitle?: string
  chapterRole?: DeckPlanChapter["role"]
  slideKind: RenderPlanSlideKind
  structural: boolean
  countsTowardClaimSubstance: boolean
  requiredComponents: string[]
  evidenceTraceRequired: boolean
  claimChapterRequirement?: "divider" | "framing" | "proof" | "implication" | "supporting-evidence" | "risk" | "ask"
}

export interface RenderPlanChapterRequirement {
  title: string
  role: DeckPlanChapter["role"]
  sourceClaimId?: string
  slideIndexes: number[]
  requiredSubstanceSlides: number
  actualSubstanceSlides: number
  allowedStructuralSlides: string[]
}

export interface RenderPlanWritingBatch {
  label: string
  chapterTitle: string
  slideIndexes: number[]
  instructions: string
}

export interface RenderPlanContract {
  sourceAuthority: {
    meaning: string
    renderPlan: string
    state: string
    htmlIdentity: string
  }
  renderRules: string[]
  htmlIdentityContract: string[]
  chapterRequirements: RenderPlanChapterRequirement[]
  chapterWritingBatches: RenderPlanWritingBatch[]
  slideRenderMetadata: RenderPlanSlideMetadata[]
}

type VisualIntentKind = "hero" | "toc" | "metric-stat" | "evidence-table" | "comparison-grid" | "risk-matrix" | "steps" | "text-only"
type ClaimChapterSlideKind = "framing" | "evidence" | "implication"

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
  const planningPacket = buildDeckPlanningPacket(narrative, narrativeHash, deck?.outputPath ?? `decks/${slug}.html`)
  const deckPlanRequirements = buildDeckPlanRequirements(narrativeHash)
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
  const plannedDeck = next.decks[slug]
  plannedDeck.planReview = {
    status: "pending",
    narrativeHash,
    planHash: "pending-deck-plan-md",
    qualityChecks: [],
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
        planningPacket,
        deckPlanRequirements,
        requiredClaimIds: narrative.claims.filter((claim) => claim.importance === "central").map((claim) => claim.id),
      coveredClaimIds: [],
      missingClaimIds: narrative.claims.filter((claim) => claim.importance === "central").map((claim) => claim.id),
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
        planArtifactPath: "decks/deck-plan.md",
        slideCount: 0,
        slides: [],
        chapters: [],
        qualityChecks: [],
        planningPacket,
        deckPlanRequirements,
      },
    }
}

function buildDeckPlanningPacket(narrative: NarrativeStateV1, narrativeHash: string, outputPath: string): DeckPlanningPacket {
  return {
    narrativeHash,
    outputPath,
    audience: narrative.audience,
    decision: narrative.decision,
    thesis: narrative.thesis,
    centralClaims: orderedClaims(narrative, (claim) => claim.importance === "central"),
    supportingClaims: orderedClaims(narrative, (claim) => claim.importance !== "central"),
    evidenceBindings: narrative.evidenceBindings,
    objections: narrative.objections,
    risks: narrative.risks,
    researchGaps: narrative.researchGaps,
  }
}

function buildDeckPlanRequirements(narrativeHash: string): DeckPlanRequirements {
  return {
    planArtifactPath: "decks/deck-plan.md",
    defaultProfile: "executive decision deck, usually 12-18 slides unless the user confirms otherwise",
    userConfirmations: [
      "Confirm target slide count or acceptable range when it is unclear.",
      "Confirm audience and decision context when the narrative does not make them explicit.",
      "Confirm language, emphasis, or visual style only when needed before writing the plan.",
    ],
    authoringRules: [
      "LLM writes decks/deck-plan.md from the planning packet; compileDeckPlan does not generate the final slide list.",
      "Use 3-5 chapters for normal executive decks.",
      "Cover every central claim, but group related central claims into chapters instead of giving each claim its own chapter.",
      "Each substantive chapter should have framing, proof, and implication/boundary coverage.",
      "Chapter divider or chapter TOC slides may use the toc component as structural wayfinding.",
      "Do not create filler slides, repeated thesis pages, or generic bridge slides.",
      "Preserve evidence ids, source trace, supported scope, unsupported scope, caveats, and strength where available.",
      "Do not render internal labels such as Evidence gap:, Unsupported scope:, Caveat:, Missing Data, or Evidence Boundary in executive body copy.",
      "Do not infer plan structure from DECKS.json slides[]; it is compatibility cache only.",
    ],
    requiredSections: [
      "Source Authority",
      "Audience / Goal / Decision",
      "Deck Parameters",
      "Chapter Map",
      "Slide Plan",
      "Evidence Trace",
      "Boundary / Risk Treatment",
      "Chapter Writing Batches",
      "HTML Identity Contract",
      "Approval",
    ],
    approvalBlockTemplate: `## Approval\n\n\`\`\`yaml\nstatus: pending\napprovedBy:\napprovedAt:\napprovalNote:\nplanHash:\nnarrativeHash: ${narrativeHash}\n\`\`\``,
  }
}

export function buildRenderPlanContract(deck: DeckSpec, chapters: DeckPlanChapter[]): RenderPlanContract {
  return {
    sourceAuthority: {
      meaning: "revela-narrative/ canonical narrative state",
      renderPlan: "decks/deck-plan.md execution blueprint and compileDeckPlan result",
      state: "DECKS.json compatibility/render state only; slides[] is cached projection data",
      htmlIdentity: "positive 1-based data-slide-index values, unique and strictly increasing in DOM order",
    },
    renderRules: [
      "Do not infer deck structure, slide count, or chapter substance from DECKS.json slides[].",
      "Use the compileDeckPlan result and approved decks/deck-plan.md as the render-plan contract.",
      "Render chapter divider slides with the toc component when slideKind is chapter-divider.",
      "Chapter divider and global TOC slides are structural wayfinding and do not count toward central-claim substance.",
      "Each central claim chapter needs non-structural framing, proof, and implication/boundary slides unless the approved plan explicitly says otherwise.",
      "Generate HTML chapter by chapter, preserving valid HTML and already-written slides after every batch.",
    ],
    htmlIdentityContract: [
      "Every written slide section uses class slide and a positive 1-based data-slide-index.",
      "data-slide-index values are unique and strictly increase in DOM order.",
      "Partial chapter-by-chapter artifacts are allowed when written slide identities are self-consistent.",
      "Do not pad missing planned chapters just to match cached DECKS.json slides[].",
    ],
    chapterRequirements: chapters.map((chapter) => {
      const substanceSlides = chapter.slideIndexes
        .map((index) => deck.slides.find((slide) => slide.index === index))
        .filter((slide): slide is SlideSpec => Boolean(slide))
        .filter((slide) => slideCountsTowardClaimSubstance(slide))
      return {
        title: chapter.title,
        role: chapter.role,
        sourceClaimId: chapter.sourceClaimId,
        slideIndexes: chapter.slideIndexes,
        requiredSubstanceSlides: chapter.sourceClaimId ? 3 : 0,
        actualSubstanceSlides: substanceSlides.length,
        allowedStructuralSlides: chapter.sourceClaimId ? ["chapter-divider", "toc"] : ["cover", "toc", "ask"],
      }
    }),
    chapterWritingBatches: chapters.map((chapter, index) => ({
      label: index === 0 ? "Initial shell and first chapter" : `Chapter batch ${index + 1}`,
      chapterTitle: chapter.title,
      slideIndexes: chapter.slideIndexes,
      instructions: index === 0
        ? "Create the stable HTML shell, required structural slides, and this first chapter range only."
        : "Patch exactly this chapter range, preserve previously written slides, and keep the file valid after the patch.",
    })),
    slideRenderMetadata: deck.slides.map((slide) => slideRenderMetadata(slide, chapters)),
  }
}

function slideRenderMetadata(slide: SlideSpec, chapters: DeckPlanChapter[]): RenderPlanSlideMetadata {
  const chapter = chapters.find((item) => item.slideIndexes.includes(slide.index))
  const slideKind = renderPlanSlideKind(slide, chapter)
  return {
    index: slide.index,
    title: slide.title,
    chapterTitle: chapter?.title,
    chapterRole: chapter?.role,
    slideKind,
    structural: isStructuralRenderPlanSlide(slideKind),
    countsTowardClaimSubstance: slideCountsTowardClaimSubstance(slide),
    requiredComponents: slide.components ?? [],
    evidenceTraceRequired: (slide.evidenceBindingIds?.length ?? 0) > 0 || (slide.evidence?.length ?? 0) > 0,
    claimChapterRequirement: claimChapterRequirementForSlideKind(slideKind),
  }
}

function renderPlanSlideKind(slide: SlideSpec, chapter: DeckPlanChapter | undefined): RenderPlanSlideKind {
  const chapterSlide = (slide.content?.data as { chapterSlide?: string } | undefined)?.chapterSlide
  if (slide.index === 1 && slide.components.includes("hero")) return "cover"
  if (slide.layout === "toc" && chapter?.sourceClaimId) return "chapter-divider"
  if (slide.layout === "toc") return "toc"
  if (chapterSlide === "framing") return "claim-framing"
  if (chapterSlide === "evidence") return "claim-evidence"
  if (chapterSlide === "implication") return "claim-implication"
  if (slide.narrativeRole === "risk") return "risk"
  if (slide.narrativeRole === "ask" || slide.narrativeRole === "close") return "ask"
  if (slide.narrativeRole === "evidence") return "supporting-evidence"
  return "content"
}

function isStructuralRenderPlanSlide(kind: RenderPlanSlideKind): boolean {
  return kind === "cover" || kind === "toc" || kind === "chapter-divider" || kind === "ask"
}

function slideCountsTowardClaimSubstance(slide: SlideSpec): boolean {
  const kind = (slide.content?.data as { chapterSlide?: string } | undefined)?.chapterSlide
  return kind === "framing" || kind === "evidence" || kind === "implication"
}

function claimChapterRequirementForSlideKind(kind: RenderPlanSlideKind): RenderPlanSlideMetadata["claimChapterRequirement"] {
  if (kind === "chapter-divider") return "divider"
  if (kind === "claim-framing") return "framing"
  if (kind === "claim-evidence") return "proof"
  if (kind === "claim-implication") return "implication"
  if (kind === "supporting-evidence") return "supporting-evidence"
  if (kind === "risk") return "risk"
  if (kind === "ask") return "ask"
  return undefined
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
    const bindings = evidenceByClaim.get(claim.id) ?? []
    const chapter = chapters.find((item) => item.sourceClaimId === claim.id)
    const divider = chapterDividerSlide(slides.length + 1, chapters, chapter ?? chapterForClaimFallback(claim))
    slides.push(divider)
    if (chapter) assignSlideToSpecificChapter(chapter, divider)
    else assignSlideToChapter(chapters, chapterRoleForClaim(claim), divider)
    for (const kind of ["framing", "evidence", "implication"] as const) {
      const slide = claimChapterSlide(slides.length + 1, claim, bindings, kind, narrative)
      slides.push(slide)
      if (chapter) assignSlideToSpecificChapter(chapter, slide)
      else assignSlideToChapter(chapters, chapterRoleForClaim(claim), slide)
    }
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

function chapterDividerSlide(index: number, chapters: DeckPlanChapter[], chapter: DeckPlanChapter): SlideSpec {
  const visualIntent = visualIntentForStructuralSlide("toc", "Use a chapter divider as wayfinding before the claim-led chapter; it is structural and does not replace framing, proof, or implication slides.")
  return {
    index,
    title: chapter.title,
    purpose: `Open the ${chapter.title} chapter with a TOC-style divider before claim substance slides.`,
    narrativeRole: "context",
    layout: "toc",
    qa: false,
    components: ["toc", "text-panel"],
    claimIds: chapter.sourceClaimId ? [chapter.sourceClaimId] : [],
    claimRefs: chapter.sourceClaimId ? [{ claimId: chapter.sourceClaimId, role: "supporting", note: "Structural chapter divider; not counted as claim proof." }] : [],
    evidenceBindingIds: [],
    content: {
      headline: chapter.title,
      bullets: chapters.map((item) => item.title),
      data: {
        activeChapter: chapter.title,
        chapters: chapters.map((item) => ({ title: item.title, role: item.role, active: item.title === chapter.title })),
        visualIntent,
      },
    },
    visuals: visualBriefs(index, visualIntent),
    evidence: [],
    status: "planned",
  }
}

function chapterForClaimFallback(claim: NarrativeClaim): DeckPlanChapter {
  return {
    title: claimChapterTitle(claim),
    role: chapterRoleForClaim(claim),
    slideIndexes: [],
    claimIds: [claim.id],
    evidenceBindingIds: [],
    sourceClaimId: claim.id,
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

function claimChapterSlide(index: number, claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[], kind: ClaimChapterSlideKind, narrative: NarrativeStateV1): SlideSpec {
  if (kind === "framing") return claimFramingSlide(index, claim, bindings)
  if (kind === "evidence") return claimEvidenceSlide(index, claim, bindings)
  return claimImplicationSlide(index, claim, bindings, narrative)
}

function claimFramingSlide(index: number, claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): SlideSpec {
  const visualIntent = visualIntentForStructuralSlide("text-only", "Frame why this central claim deserves a chapter before proof detail; keep evidence boundaries visible.")
  const notes = internalEvidenceDiagnostics(claim, bindings)
  return {
    index,
    title: `${titleFromClaim(claim)} - framing`,
    purpose: `Frame the audience context, decision relevance, and evidence boundary for central claim ${claim.id}.`,
    narrativeRole: claim.kind === "problem" || claim.kind === "opportunity" ? "tension" : claim.kind === "context" ? "context" : "evidence",
    layout: "two-col",
    qa: true,
    components: componentsForVisualIntent(["box", "text-panel"], visualIntent),
    claimIds: [claim.id],
    claimRefs: [{ claimId: claim.id, role: "primary", note: claimBoundaryNote(claim) }],
    evidenceBindingIds: bindings.map((binding) => binding.id),
    content: {
      headline: claim.text,
      bullets: [
        `Chapter claim: ${claim.text}`,
        claim.supportedScope ? `What the available evidence supports: ${claim.supportedScope}` : undefined,
        claim.evidenceRequired ? audienceEvidenceGapBullet(claim, bindings) ?? `Proof base: ${bindings.length} bound evidence item${bindings.length === 1 ? "" : "s"} supports this claim.` : "This framing claim does not require separate proof in the deck plan.",
      ].filter((item): item is string => Boolean(item)),
      speakerNotes: notes,
      data: { visualIntent, chapterSlide: "framing" },
    },
    evidence: bindings.map(evidenceRefFromBinding),
    visuals: visualBriefs(index, visualIntent),
    status: "planned",
  }
}

function claimEvidenceSlide(index: number, claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): SlideSpec {
  const visualIntent = visualIntentForClaim(claim, bindings)
  const notes = internalEvidenceDiagnostics(claim, bindings)
  return {
    index,
    title: `${titleFromClaim(claim)} - proof`,
    purpose: `Show the specific evidence, source trace, support scope, unsupported scope, caveat, and strength for central claim ${claim.id}.`,
    narrativeRole: "evidence",
    layout: "two-col",
    qa: true,
    components: claimComponents(claim, bindings, visualIntent),
    claimIds: [claim.id],
    claimRefs: [{ claimId: claim.id, role: "evidence", note: claimBoundaryNote(claim) }],
    evidenceBindingIds: bindings.map((binding) => binding.id),
    content: {
      headline: claim.text,
      bullets: claimBullets(claim, bindings),
      speakerNotes: notes,
      data: { visualIntent, chapterSlide: "evidence" },
    },
    evidence: bindings.map(evidenceRefFromBinding),
    visuals: visualBriefs(index, visualIntent),
    status: "planned",
  }
}

function claimImplicationSlide(index: number, claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[], narrative: NarrativeStateV1): SlideSpec {
  const relatedRisks = narrative.risks.filter((risk) => risk.claimId === claim.id)
  const relatedObjections = narrative.objections.filter((objection) => objection.claimId === claim.id)
  const visualIntent = visualIntentForClaimImplication(claim, relatedRisks.length + relatedObjections.length)
  const notes = internalEvidenceDiagnostics(claim, bindings)
  return {
    index,
    title: `${titleFromClaim(claim)} - implication`,
    purpose: `Translate central claim ${claim.id} into decision implication while keeping boundaries and risks explicit.`,
    narrativeRole: claim.kind === "recommendation" || claim.kind === "ask" ? "recommendation" : relatedRisks.length > 0 || relatedObjections.length > 0 ? "risk" : "evidence",
    layout: "two-col",
    qa: true,
    components: componentsForVisualIntent(["box", "text-panel"], visualIntent),
    claimIds: [claim.id],
    claimRefs: [{ claimId: claim.id, role: relatedRisks.length > 0 || relatedObjections.length > 0 ? "risk" : "supporting", note: claimBoundaryNote(claim) }],
    evidenceBindingIds: bindings.map((binding) => binding.id),
    content: {
      headline: `Decision implication: ${claim.text}`,
      bullets: [
        ...claimBoundaryBullets(claim),
        ...relatedRisks.slice(0, 2).map((risk) => risk.mitigation ? `Risk: ${risk.text} Mitigation: ${risk.mitigation}` : `Risk: ${risk.text}`),
        ...relatedObjections.slice(0, 2).map((objection) => objection.response ? `Objection: ${objection.text} Response: ${objection.response}` : `Objection: ${objection.text}`),
        relatedRisks.length === 0 && relatedObjections.length === 0 && !claim.unsupportedScope && (claim.caveats ?? []).length === 0 ? "Decision use: no specific limiting condition is recorded for this central claim." : undefined,
      ].filter((item): item is string => Boolean(item)),
      speakerNotes: notes,
      data: { visualIntent, chapterSlide: "implication" },
    },
    evidence: bindings.map(evidenceRefFromBinding),
    visuals: visualBriefs(index, visualIntent),
    status: "planned",
  }
}

function supportingLogicSlide(index: number, claims: NarrativeClaim[], evidenceByClaim: Map<string, NarrativeEvidenceBinding[]>): SlideSpec {
  const supportingBindings = claims.flatMap((claim) => evidenceByClaim.get(claim.id) ?? [])
  const visualIntent = visualIntentForSupportingLogic(claims, supportingBindings)
  const notes = claims.map((claim) => internalEvidenceDiagnostics(claim, evidenceByClaim.get(claim.id) ?? [])).filter(Boolean).join("\n\n") || undefined
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
      bullets: claims.slice(0, 5).flatMap((claim) => [claim.text, ...claimBoundaryBullets(claim), audienceEvidenceGapBullet(claim, evidenceByClaim.get(claim.id) ?? [])]).filter((item): item is string => Boolean(item)).slice(0, 8),
      speakerNotes: notes,
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
  for (const claim of centralClaims) addClaimChapter(chapters, claim)
  if (supportingClaims.length > 0 || centralClaims.length === 0 && (claims.some((claim) => claim.kind === "evidence") || narrative.evidenceBindings.length > 0)) addChapter(chapters, "Evidence and proof", "evidence")
  if (centralClaims.length === 0 && claims.some((claim) => claim.kind === "recommendation" || claim.kind === "ask")) addChapter(chapters, "Recommendation and decision", "recommendation")
  if (narrative.risks.length > 0 || narrative.objections.length > 0 || centralClaims.some((claim) => claim.unsupportedScope || (claim.caveats ?? []).length > 0)) addChapter(chapters, "Risks and boundaries", "risk")
  addChapter(chapters, "Decision ask", "ask")
  if (chapters.length < 3) addChapter(chapters, "Evidence and proof", "evidence")
  while (chapters.length > 5) {
    const removableIndex = chapters.findIndex((chapter) => !chapter.sourceClaimId && chapter.role !== "context" && chapter.role !== "ask")
    if (removableIndex >= 0) chapters.splice(removableIndex, 1)
    else break
  }
  return chapters
}

function addClaimChapter(chapters: DeckPlanChapter[], claim: NarrativeClaim): void {
  const role = chapterRoleForClaim(claim)
  const title = claimChapterTitle(claim)
  if (chapters.some((chapter) => chapter.sourceClaimId === claim.id)) return
  chapters.push({ title, role, slideIndexes: [], claimIds: [], evidenceBindingIds: [], sourceClaimId: claim.id })
}

function addChapter(chapters: DeckPlanChapter[], title: string, role: DeckPlanChapter["role"]): void {
  if (chapters.some((chapter) => chapter.role === role || chapter.title === title)) return
  chapters.push({ title, role, slideIndexes: [], claimIds: [], evidenceBindingIds: [] })
}

function assignSlideToChapter(chapters: DeckPlanChapter[], role: DeckPlanChapter["role"], slide: SlideSpec): void {
  const chapter = chapters.find((item) => item.role === role) ?? chapters.find((item) => item.role === "evidence") ?? chapters[chapters.length - 1]
  if (!chapter) return
  assignSlideToSpecificChapter(chapter, slide)
}

function assignSlideToSpecificChapter(chapter: DeckPlanChapter, slide: SlideSpec): void {
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

function visualIntentForStructuralSlide(kind: Extract<VisualIntentKind, "hero" | "toc" | "steps" | "text-only">, rationale: string): VisualIntent {
  return { kind, component: kind === "toc" ? "toc" : kind === "steps" ? "steps" : kind === "text-only" ? "box" : "hero", rationale, dataSignals: [], evidenceBindingIds: [] }
}

function visualIntentForClaimImplication(claim: NarrativeClaim, relatedBoundaryCount: number): VisualIntent {
  if (claim.kind === "recommendation" || claim.kind === "ask") {
    return {
      kind: "steps",
      component: "steps",
      rationale: "Translate the chapter proof into concrete decision gates or actions while preserving evidence boundaries.",
      dataSignals: [],
      evidenceBindingIds: [],
    }
  }
  if (relatedBoundaryCount > 0 || claim.unsupportedScope || (claim.caveats ?? []).length > 0) {
    return {
      kind: "risk-matrix",
      component: "data-table",
      rationale: "Show the decision implication alongside risks, objections, unsupported scope, and caveats so boundaries shape the recommendation.",
      dataSignals: [],
      evidenceBindingIds: [],
    }
  }
  return {
    kind: "text-only",
    component: "box",
    rationale: "State the decision implication without inventing risk or ROI detail that is not present in the canonical narrative.",
    dataSignals: [],
    evidenceBindingIds: [],
  }
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
    ...bindings.slice(0, 2).map((binding) => binding.supportScope ? `Evidence points to: ${binding.supportScope}` : undefined),
    audienceEvidenceGapBullet(claim, bindings),
  ].filter((item): item is string => Boolean(item))
}

function audienceEvidenceGapBullet(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): string | undefined {
  if (!claim.evidenceRequired || bindings.length > 0) return undefined
  return claim.evidenceStatus === "missing"
    ? "Decision boundary: this point needs supporting proof before it can carry the recommendation."
    : "Decision boundary: current support is incomplete, so use this point as a qualified signal rather than a proven conclusion."
}

function isAudienceEvidenceGapBullet(text: string): boolean {
  return text.startsWith("Decision boundary:") && (text.includes("supporting proof") || text.includes("qualified signal"))
}

function claimBoundaryBullets(claim: NarrativeClaim): string[] {
  return [
    claim.supportedScope ? `What the available evidence supports: ${claim.supportedScope}` : undefined,
    claim.unsupportedScope ? `What this does not yet prove: ${claim.unsupportedScope}` : undefined,
    ...(claim.caveats ?? []).map((caveat) => `Use with caution: ${caveat}`),
  ].filter((item): item is string => Boolean(item))
}

function claimBoundaryNote(claim: NarrativeClaim): string | undefined {
  const notes = claimBoundaryBullets(claim)
  return notes.length > 0 ? notes.join(" ") : undefined
}

function internalEvidenceDiagnostics(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): string | undefined {
  const lines = [
    claim.supportedScope ? `Supported scope: ${claim.supportedScope}` : undefined,
    claim.unsupportedScope ? `Unsupported scope: ${claim.unsupportedScope}` : undefined,
    ...(claim.caveats ?? []).map((caveat) => `Caveat: ${caveat}`),
    !claim.evidenceRequired ? undefined : bindings.length === 0 ? `Evidence gap: ${claim.evidenceStatus === "missing" ? "no binding yet" : "support remains incomplete"}.` : undefined,
    ...bindings.map((binding) => binding.caveat ? `Evidence ${binding.id} caveat: ${binding.caveat}` : undefined),
    ...bindings.map((binding) => binding.unsupportedScope ? `Evidence ${binding.id} unsupported scope: ${binding.unsupportedScope}` : undefined),
  ].filter((item): item is string => Boolean(item))
  return lines.length > 0 ? `Internal evidence diagnostics for author/reviewer use only. Do not render these labels as executive-facing body copy.\n${lines.map((line) => `- ${line}`).join("\n")}` : undefined
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
  const claimChapters = chapters.filter((chapter) => chapter.sourceClaimId)
  const centralClaimsWithoutChapter = centralClaimIds.filter((claimId) => !claimChapters.some((chapter) => chapter.sourceClaimId === claimId))
  const thinClaimChapters = claimChapters.filter((chapter) => nonStructuralClaimSlides(chapter, slides).length < 3)
  const evidenceInvisibleChapters = claimChapters.filter((chapter) => {
    const claim = narrative.claims.find((item) => item.id === chapter.sourceClaimId)
    if (!claim?.evidenceRequired) return false
    return chapter.evidenceBindingIds.length === 0 && !nonStructuralClaimSlides(chapter, slides).some((slide) => (slide.content.bullets ?? []).some((bullet) => isAudienceEvidenceGapBullet(bullet)))
  })
  const paddedClaimChapters = claimChapters.filter((chapter) => nonStructuralClaimSlides(chapter, slides).some((slide) => isFillerSlide(slide)))
  const boundaryMissingChapters = claimChapters.filter((chapter) => {
    const claim = narrative.claims.find((item) => item.id === chapter.sourceClaimId)
    if (!claim) return false
    const hasBoundary = Boolean(claim.unsupportedScope || (claim.caveats ?? []).length > 0 || narrative.risks.some((risk) => risk.claimId === claim.id) || narrative.objections.some((objection) => objection.claimId === claim.id))
    if (!hasBoundary) return false
    const text = nonStructuralClaimSlides(chapter, slides).flatMap((slide) => [slide.content.headline, ...(slide.content.bullets ?? [])]).join("\n")
    const claimBoundaryVisible = [claim.unsupportedScope, ...(claim.caveats ?? [])].filter(Boolean).some((boundary) => text.includes(boundary!))
    return !(claimBoundaryVisible || text.includes("Risk:") || text.includes("Objection:"))
  })
  const incompatibleComponents = [...new Set(slides.flatMap((slide) => slide.components).filter((component) => component === "card"))]
  const toc = slides.find((slide) => slide.components.includes("toc"))
  const tocBullets = toc?.content.bullets ?? []
  const chapterTitles = chapters.map((chapter) => chapter.title)
  const evidenceRequiredWithoutBindings = narrative.claims.filter((claim) => claim.evidenceRequired && !narrative.evidenceBindings.some((binding) => binding.claimId === claim.id))
  const invisibleEvidenceGaps = evidenceRequiredWithoutBindings.filter((claim) => coverage.missingClaimIds.includes(claim.id))
  const risksOrObjectionsVisible = narrative.risks.length === 0 && narrative.objections.length === 0 || slides.some((slide) => slide.narrativeRole === "risk")

  return [
    {
      id: "claim_chapters_present",
      status: centralClaimsWithoutChapter.length === 0 ? "pass" : "blocker",
      message: centralClaimsWithoutChapter.length === 0 ? "Every central claim has a deterministic claim-led chapter." : `Central claims missing claim-led chapters: ${centralClaimsWithoutChapter.join(", ")}`,
    },
    {
      id: "claim_chapters_min_three_slides",
      status: thinClaimChapters.length === 0 ? "pass" : "blocker",
      message: thinClaimChapters.length === 0 ? "Every central claim chapter has at least three non-structural slides: framing, proof, and implication/boundary." : `Central claim chapters need at least three non-structural slides: ${thinClaimChapters.map((chapter) => chapter.sourceClaimId).join(", ")}`,
    },
    {
      id: "claim_chapter_evidence_visible",
      status: evidenceInvisibleChapters.length === 0 ? "pass" : "blocker",
      message: evidenceInvisibleChapters.length === 0 ? "Evidence-required claim chapters show bound evidence or an explicit evidence gap." : `Evidence-required claim chapters hide evidence gaps: ${evidenceInvisibleChapters.map((chapter) => chapter.sourceClaimId).join(", ")}`,
    },
    {
      id: "claim_chapter_not_padded_by_filler",
      status: paddedClaimChapters.length === 0 ? "pass" : "blocker",
      message: paddedClaimChapters.length === 0 ? "Claim chapters may use structural TOC dividers, but are not padded by placeholder, repeated thesis, or generic bridge slides." : `Claim chapters contain filler slides: ${paddedClaimChapters.map((chapter) => chapter.sourceClaimId).join(", ")}`,
    },
    {
      id: "claim_chapter_boundary_visible",
      status: boundaryMissingChapters.length === 0 ? "pass" : "blocker",
      message: boundaryMissingChapters.length === 0 ? "Central claim chapter boundaries, risks, objections, and caveats remain visible when recorded." : `Central claim chapters hide recorded boundaries: ${boundaryMissingChapters.map((chapter) => chapter.sourceClaimId).join(", ")}`,
    },
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

function nonStructuralClaimSlides(chapter: DeckPlanChapter, slides: SlideSpec[]): SlideSpec[] {
  const indexes = new Set(chapter.slideIndexes)
  return slides.filter((slide) => indexes.has(slide.index) && slide.qa && slide.title !== "Decision Ask" && !slide.components.includes("toc"))
}

function isFillerSlide(slide: SlideSpec): boolean {
  const text = `${slide.title}\n${slide.purpose}\n${slide.content.headline}\n${(slide.content.bullets ?? []).join("\n")}`.toLowerCase()
  if (slide.components.includes("hero") && slide.qa) return true
  return ["section divider", "bridge slide", "repeat thesis", "repeated thesis", "generic overview"].some((marker) => text.includes(marker))
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

function claimChapterTitle(claim: NarrativeClaim): string {
  const title = titleFromClaim(claim)
  return title.endsWith(".") ? title.slice(0, -1) : title
}

function hasCurrentApprovalOrOverride(narrative: NarrativeStateV1, narrativeHash: string): boolean {
  return narrative.approvals.some((approval) => approval.narrativeHash === narrativeHash && (approval.scope === "narrative" && approval.approvedBy === "user" || approval.scope === "render_override" || approval.approvedBy === "override"))
}
