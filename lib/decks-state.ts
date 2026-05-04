import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { basename, dirname, join, resolve } from "path"

export const DECKS_STATE_FILE = "DECKS.json"

export type DeckProductionStatus = "planning" | "blocked" | "ready" | "written"
export type SlideProductionStatus = "planned" | "ready" | "written" | "qa_passed" | "qa_failed"
export type WriteReadinessStatus = "blocked" | "ready" | "written"
export type NarrativeRole = "context" | "tension" | "evidence" | "recommendation" | "risk" | "ask" | "appendix" | "close"

export interface DecksState {
  version: 1
  activeDeck?: string
  workspace: {
    brief?: string
    sourceMaterials: SourceMaterial[]
    preferences: {
      user: string[]
      workflow: string[]
    }
    deckMemory: DeckMemoryEntry[]
    openQuestions: string[]
  }
  decks: Record<string, DeckSpec>
}

export interface SourceMaterial {
  path: string
  type?: string
  size?: number
  fingerprint?: string
  status?: "discovered" | "extracted" | "summarized" | "researched"
  extraction?: {
    manifestPath?: string
    textPath?: string
    cacheDir?: string
  }
  summary?: string
  bestUsedFor?: string
  firstSeen?: string
  lastChecked?: string
  lastExtracted?: string
  lastSummarized?: string
}

export interface DeckMemoryEntry {
  slug: string
  topic?: string
  keyDecisions?: string[]
  outputPath?: string
  date?: string
}

export interface DeckSpec {
  slug: string
  status: DeckProductionStatus
  goal: string
  audience?: string
  language?: string
  outputPath: string
  theme: {
    design?: string
    domain?: string
  }
  requiredInputs: RequiredInputs
  researchPlan: ResearchAxis[]
  slides: SlideSpec[]
  assets: DeckAsset[]
  writeReadiness: {
    status: WriteReadinessStatus
    blockers: string[]
    lastReviewedAt?: string
  }
}

export interface RequiredInputs {
  topicClarified: boolean
  audienceClarified: boolean
  languageDecided: boolean
  visualStyleSelected: boolean
  sourceMaterialsIdentified: boolean
  researchNeedAssessed: boolean
  researchFindingsRead: boolean
  slidePlanConfirmed: boolean
  designLayoutsFetched: boolean
}

export interface ResearchAxis {
  axis: string
  needed: boolean
  status: "pending" | "in_progress" | "done" | "read" | "skipped"
  findingsFile?: string
  notes?: string
}

export interface SlideSpec {
  index: number
  title: string
  purpose?: string
  narrativeRole?: NarrativeRole
  layout: string
  qa?: boolean
  components: string[]
  content: {
    headline?: string
    body?: string[]
    bullets?: string[]
    speakerNotes?: string
    data?: unknown
  }
  evidence: EvidenceRef[]
  visuals?: VisualBrief[]
  status: SlideProductionStatus
  notes?: string
}

export interface EvidenceRef {
  source: string
  quote?: string
  page?: string
  url?: string
  sourcePath?: string
  location?: string
  findingsFile?: string
  caveat?: string
  extractedTextPath?: string
  extractedManifestPath?: string
}

export interface VisualBrief {
  id?: string
  purpose?: string
  brief: string
  assetPath?: string
}

export interface DeckAsset {
  id: string
  type: "image" | "chart" | "file"
  path?: string
  purpose?: string
  notes?: string
}

export interface DeckStateReadinessResult {
  ready: boolean
  slug: string
  status?: WriteReadinessStatus
  blocker: string
  blockers: string[]
  warnings: string[]
  issues: ReadinessIssue[]
}

export type ReadinessSeverity = "blocker" | "warning"

export type ReadinessIssueType =
  | "missing_required_input"
  | "missing_slide_spec"
  | "research_not_ready"
  | "missing_evidence"
  | "weak_evidence"
  | "source_not_processed"
  | "narrative_gap"

export interface ReadinessIssue {
  type: ReadinessIssueType
  severity: ReadinessSeverity
  message: string
  suggestedAction: string
  slideIndex?: number
  slideTitle?: string
  claimText?: string
}

const SOURCE_TRACE_ACTION = "Add slide evidence with source plus source trace such as findingsFile or sourcePath, and quote, location, url, or caveat where available; otherwise reframe the claim as an explicit assumption/opinion."

export function decksStatePath(workspaceRoot: string): string {
  return join(workspaceRoot, DECKS_STATE_FILE)
}

export function hasDecksState(workspaceRoot: string): boolean {
  return existsSync(decksStatePath(workspaceRoot))
}

export function createEmptyDecksState(): DecksState {
  return {
    version: 1,
    workspace: {
      sourceMaterials: [],
      preferences: { user: [], workflow: [] },
      deckMemory: [],
      openQuestions: [],
    },
    decks: {},
  }
}

export function workspaceDeckSlug(workspaceRoot: string): string {
  return normalizeSlug(basename(resolve(workspaceRoot)) || "deck") || "deck"
}

export function normalizeWorkspaceDeckState(state: DecksState, workspaceRoot: string): DecksState {
  const normalized = normalizeDecksState(state)
  const keys = Object.keys(normalized.decks)
  if (keys.length !== 1) return normalized

  const slug = workspaceDeckSlug(workspaceRoot)
  const existingKey = keys[0]
  if (existingKey === slug) {
    normalized.activeDeck = slug
    return normalized
  }

  const deck = createDeckSpec({ ...normalized.decks[existingKey], slug })
  delete normalized.decks[existingKey]
  normalized.decks[slug] = deck
  normalized.activeDeck = slug
  return normalized
}

export function defaultRequiredInputs(overrides?: Partial<RequiredInputs>): RequiredInputs {
  return {
    topicClarified: overrides?.topicClarified ?? false,
    audienceClarified: overrides?.audienceClarified ?? false,
    languageDecided: overrides?.languageDecided ?? false,
    visualStyleSelected: overrides?.visualStyleSelected ?? false,
    sourceMaterialsIdentified: overrides?.sourceMaterialsIdentified ?? false,
    researchNeedAssessed: overrides?.researchNeedAssessed ?? false,
    researchFindingsRead: overrides?.researchFindingsRead ?? false,
    slidePlanConfirmed: overrides?.slidePlanConfirmed ?? false,
    designLayoutsFetched: overrides?.designLayoutsFetched ?? false,
  }
}

export function createDeckSpec(input: Partial<DeckSpec> & { slug: string }): DeckSpec {
  const slug = normalizeSlug(input.slug)
  return {
    slug,
    status: input.status ?? "planning",
    goal: input.goal ?? "",
    audience: input.audience,
    language: input.language,
    outputPath: normalizeDeckPath(input.outputPath || `decks/${slug}.html`),
    theme: input.theme ?? {},
    requiredInputs: defaultRequiredInputs(input.requiredInputs),
    researchPlan: input.researchPlan ?? [],
    slides: normalizeSlides(input.slides ?? []),
    assets: input.assets ?? [],
    writeReadiness: input.writeReadiness ?? { status: "blocked", blockers: [] },
  }
}

export function readDecksState(workspaceRoot: string): DecksState {
  const parsed = JSON.parse(readFileSync(decksStatePath(workspaceRoot), "utf-8")) as DecksState
  return normalizeDecksState(parsed)
}

export function writeDecksState(workspaceRoot: string, state: DecksState): void {
  const filePath = decksStatePath(workspaceRoot)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(normalizeDecksState(state), null, 2) + "\n", "utf-8")
}

export function readOrCreateDecksState(workspaceRoot: string): DecksState {
  if (hasDecksState(workspaceRoot)) return readDecksState(workspaceRoot)
  const state = createEmptyDecksState()
  writeDecksState(workspaceRoot, state)
  return state
}

export function upsertDeck(state: DecksState, input: Partial<DeckSpec> & { slug: string }): DecksState {
  const normalized = normalizeDecksState(state)
  const slug = normalizeSlug(input.slug)
  const existingKey = currentDeckKey(normalized)
  if (existingKey && slug !== existingKey && !normalized.decks[slug]) {
    throw new Error(`${DECKS_STATE_FILE} already has a current deck (${existingKey}). Use a separate workspace for another deck.`)
  }
  const existing = normalized.decks[slug]
  const next = createDeckSpec({ ...existing, ...input, slug })
  normalized.decks[slug] = next
  normalized.activeDeck = slug
  return normalized
}

export function upsertSlides(state: DecksState, slug: string, slides: SlideSpec[]): DecksState {
  const normalized = normalizeDecksState(state)
  const key = normalizeSlug(slug)
  const existingKey = currentDeckKey(normalized)
  if (existingKey && key !== existingKey && !normalized.decks[key]) {
    throw new Error(`${DECKS_STATE_FILE} already has a current deck (${existingKey}). Use a separate workspace for another deck.`)
  }
  const deck = normalized.decks[key] ?? createDeckSpec({ slug: key })
  const byIndex = new Map(deck.slides.map((slide) => [slide.index, slide]))
  for (const slide of normalizeSlides(slides)) byIndex.set(slide.index, slide)
  deck.slides = [...byIndex.values()].sort((a, b) => a.index - b.index)
  normalized.decks[key] = deck
  normalized.activeDeck = key
  return normalized
}

export function reviewDeckState(state: DecksState, slug?: string): { state: DecksState; result: DeckStateReadinessResult } {
  const normalized = normalizeDecksState(state)
  const key = normalizeSlug(slug || currentDeckKey(normalized) || "")
  const deck = key ? normalized.decks[key] : undefined
  if (!deck) {
    const missing = key || "active deck"
    return {
      state: normalized,
      result: {
        ready: false,
        slug: missing,
        blocker: `Deck ${missing} does not exist in ${DECKS_STATE_FILE}.`,
        blockers: [`Deck ${missing} does not exist in ${DECKS_STATE_FILE}.`],
        warnings: [],
        issues: [{
          type: "missing_slide_spec",
          severity: "blocker",
          message: `Deck ${missing} does not exist in ${DECKS_STATE_FILE}.`,
          suggestedAction: "Create the current workspace deck spec with revela-decks upsertDeck before reviewing readiness.",
        }],
      },
    }
  }

  const issues = computeDeckReadinessIssues(deck, normalized.workspace)
  const blockers = issues.filter((issue) => issue.severity === "blocker").map((issue) => issue.message)
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  deck.writeReadiness = {
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    lastReviewedAt: new Date().toISOString(),
  }
  deck.status = blockers.length === 0 ? "ready" : "blocked"
  normalized.decks[deck.slug] = deck
  normalized.activeDeck = deck.slug
  return {
    state: normalized,
    result: {
      ready: blockers.length === 0,
      slug: deck.slug,
      status: deck.writeReadiness.status,
      blocker: blockers.join("; "),
      blockers,
      warnings,
      issues,
    },
  }
}

export function checkDeckStateWriteReadiness(workspaceRoot: string, filePath: string): DeckStateReadinessResult | undefined {
  if (!hasDecksState(workspaceRoot)) return undefined
  return evaluateDeckStateWriteReadiness(readDecksState(workspaceRoot), filePath)
}

export function evaluateDeckStateWriteReadiness(state: DecksState, filePath: string): DeckStateReadinessResult {
  const targetPath = normalizeDeckPath(filePath)
  const targetSlug = deckSlugFromPath(targetPath)
  const normalized = normalizeDecksState(state)
  const key = currentDeckKey(normalized)
  const deck = key ? normalized.decks[key] : undefined
  if (!deck) {
    return {
      ready: false,
      slug: targetSlug,
      blocker: currentDeckBlocker(normalized),
      blockers: [currentDeckBlocker(normalized)],
      warnings: [],
      issues: [{
        type: "missing_slide_spec",
        severity: "blocker",
        message: currentDeckBlocker(normalized),
        suggestedAction: "Create or select the current workspace deck through revela-decks before writing deck HTML.",
      }],
    }
  }

  const issues = computeDeckReadinessIssues(deck, normalized.workspace)
  const blockers = issues.filter((issue) => issue.severity === "blocker").map((issue) => issue.message)
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  if (normalizeDeckPath(deck.outputPath) !== targetPath) {
    const message = `Deck outputPath is ${deck.outputPath || "missing"}, not ${targetPath}`
    blockers.unshift(message)
    issues.unshift({
      type: "missing_slide_spec",
      severity: "blocker",
      message,
      suggestedAction: "Update deck.outputPath through revela-decks or write to the reviewed outputPath.",
    })
  }
  if (deck.writeReadiness.status !== "ready") {
    const message = `Deck writeReadiness is ${deck.writeReadiness.status || "missing"}, not ready`
    blockers.unshift(message)
    issues.unshift({
      type: "missing_slide_spec",
      severity: "blocker",
      message,
      suggestedAction: "Run /revela review and resolve all readiness blockers before writing deck HTML.",
    })
  }
  if (deck.writeReadiness.blockers.length > 0) {
    const message = `Deck still has readiness blockers: ${deck.writeReadiness.blockers.join("; ")}`
    blockers.unshift(message)
    issues.unshift({
      type: "missing_slide_spec",
      severity: "blocker",
      message,
      suggestedAction: "Resolve the stored writeReadiness blockers and rerun /revela review.",
    })
  }

  return {
    ready: blockers.length === 0,
    slug: deck.slug,
    status: deck.writeReadiness.status,
    blocker: blockers.join("; "),
    blockers,
    warnings,
    issues,
  }
}

export function isDecksStatePath(filePath: string): boolean {
  return normalizePath(filePath).split("/").pop() === DECKS_STATE_FILE
}

export function extractDecksStateTargetsFromPatch(patchText: string): string[] {
  const targets = new Set<string>()
  for (const line of patchText.replace(/\r\n/g, "\n").split("\n")) {
    const match = /^\*\*\*\s+(?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const target = cleanMarkdownText(match[1])
    if (isDecksStatePath(target)) targets.add(target)
  }
  return [...targets]
}

export function buildDecksStatePromptLayer(workspaceRoot: string, maxChars = 14000): string {
  if (!hasDecksState(workspaceRoot)) return ""
  const state = readDecksState(workspaceRoot)
  const activeKey = currentDeckKey(state)
  const active = activeKey ? state.decks[activeKey] : undefined
  const compact = {
    sourceOfTruth: DECKS_STATE_FILE,
    activeDeck: activeKey,
    workspace: compactWorkspaceForPrompt(state.workspace),
    deck: active ? compactDeckForPrompt(active) : undefined,
  }
  let text = JSON.stringify(compact, null, 2)
  if (text.length > maxChars) text = text.slice(0, maxChars).trimEnd() + "\n[DECKS.json state truncated for prompt size.]"
  return `---\n\n# Revela Workspace State From ${DECKS_STATE_FILE}\n\n\`\`\`json\n${text}\n\`\`\`\n\nRules for this state layer:\n- Treat ${DECKS_STATE_FILE} as the source of truth for the single current deck's specs, slide plan, and write readiness.\n- The decks map is compatibility storage; operate only on the current workspace deck.\n- Do not edit ${DECKS_STATE_FILE} directly; use the revela-decks tool.\n- Before writing decks/*.html, the current deck must have writeReadiness.status=ready and a complete slide spec, and its outputPath must match the target file.`
}

function compactWorkspaceForPrompt(workspace: DecksState["workspace"]): DecksState["workspace"] {
  return {
    brief: truncatePromptText(workspace.brief),
    sourceMaterials: workspace.sourceMaterials.map((source) => ({
      ...source,
      summary: truncatePromptText(source.summary),
      bestUsedFor: truncatePromptText(source.bestUsedFor),
    })),
    preferences: workspace.preferences,
    deckMemory: workspace.deckMemory,
    openQuestions: workspace.openQuestions.map((question) => truncatePromptText(question)).filter(Boolean) as string[],
  }
}

function compactDeckForPrompt(deck: DeckSpec): DeckSpec {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      content: {
        ...slide.content,
        speakerNotes: truncatePromptText(slide.content.speakerNotes),
      },
      evidence: slide.evidence.map(compactEvidenceForPrompt),
      notes: truncatePromptText(slide.notes),
    })),
  }
}

function compactEvidenceForPrompt(evidence: EvidenceRef): EvidenceRef {
  return {
    ...evidence,
    source: truncatePromptText(evidence.source, 180) ?? evidence.source,
    quote: truncatePromptText(evidence.quote, 320),
    caveat: truncatePromptText(evidence.caveat, 220),
  }
}

function truncatePromptText(text: string | undefined, maxLength = 400): string | undefined {
  if (!text) return undefined
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}... [truncated]`
}

function normalizeDecksState(input: DecksState): DecksState {
  const state: DecksState = {
    version: 1,
    activeDeck: input.activeDeck ? normalizeSlug(input.activeDeck) : undefined,
    workspace: {
      brief: input.workspace?.brief,
      sourceMaterials: input.workspace?.sourceMaterials ?? [],
      preferences: {
        user: input.workspace?.preferences?.user ?? [],
        workflow: input.workspace?.preferences?.workflow ?? [],
      },
      deckMemory: input.workspace?.deckMemory ?? [],
      openQuestions: input.workspace?.openQuestions ?? [],
    },
    decks: {},
  }
  for (const [slug, deck] of Object.entries(input.decks ?? {})) {
    const normalizedSlug = normalizeSlug(deck.slug || slug)
    state.decks[normalizedSlug] = createDeckSpec({ ...deck, slug: normalizedSlug })
  }
  if (state.activeDeck && !state.decks[state.activeDeck]) state.activeDeck = undefined
  if (!state.activeDeck) {
    const keys = Object.keys(state.decks)
    if (keys.length === 1) state.activeDeck = keys[0]
  }
  return state
}

function currentDeckKey(state: DecksState): string | undefined {
  if (state.activeDeck && state.decks[state.activeDeck]) return state.activeDeck
  const keys = Object.keys(state.decks)
  if (keys.length === 1) return keys[0]
  return undefined
}

function currentDeckBlocker(state: DecksState): string {
  const count = Object.keys(state.decks).length
  if (count === 0) return `No current deck exists in ${DECKS_STATE_FILE}. Use revela-decks upsertDeck/upsertSlides/review before writing deck HTML.`
  return `${DECKS_STATE_FILE} contains multiple deck records and no activeDeck. Select one current deck explicitly or move extra decks to separate workspaces.`
}

function computeDeckReadinessIssues(deck: DeckSpec, workspace: DecksState["workspace"]): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  if (!deck.goal.trim()) issues.push(blockerIssue("missing_slide_spec", "Deck goal is missing", "Set the deck goal through revela-decks upsertDeck."))
  if (!isDeckHtmlPath(deck.outputPath)) {
    issues.push(blockerIssue(
      "missing_slide_spec",
      `outputPath must be decks/*.html, got ${deck.outputPath || "missing"}`,
      "Set outputPath to the target decks/*.html file through revela-decks upsertDeck.",
    ))
  }

  for (const [key, value] of Object.entries(deck.requiredInputs) as Array<[keyof RequiredInputs, boolean]>) {
    if (value !== true) {
      issues.push(blockerIssue(
        "missing_required_input",
        `requiredInputs.${key} is not true`,
        `Complete and explicitly record requiredInputs.${key} before writing the deck.`,
      ))
    }
  }

  if (deck.slides.length === 0) issues.push(blockerIssue("missing_slide_spec", "slides are missing", "Add the confirmed slide plan through revela-decks upsertSlides."))
  for (const slide of deck.slides) {
    const slideRef = { slideIndex: slide.index, slideTitle: slide.title }
    if (!slide.title.trim()) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} title is missing`, "Add a slide title to the slide spec.", slideRef))
    if (!slide.layout.trim()) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} layout is missing`, "Fetch and record the intended design layout for this slide.", slideRef))
    if (slide.components.length === 0) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} components are missing`, "Record the design components needed for this slide.", slideRef))
    if (!hasSlideContent(slide)) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} content is missing`, "Add structured headline/body/bullets/data content to the slide spec.", slideRef))

    const claim = findEvidenceSensitiveClaim(slide)
    if (claim && slide.evidence.length === 0) {
      issues.push(blockerIssue(
        "missing_evidence",
        `Slide ${slide.index} has an evidence-sensitive claim without evidence: ${claim}`,
        SOURCE_TRACE_ACTION,
        { ...slideRef, claimText: claim },
      ))
    } else if (claim && slide.evidence.some((item) => !hasEvidenceDetail(item))) {
      issues.push(warningIssue(
        "weak_evidence",
        `Slide ${slide.index} evidence for a high-risk claim has no source trace detail: ${claim}`,
        "Add source trace detail to this evidence record: findingsFile or sourcePath plus quote, location, url, or caveat where available so the writing agent can ground the slide reliably.",
        { ...slideRef, claimText: claim },
      ))
    }
  }

  issues.push(...computeNarrativeReadinessIssues(deck))

  for (const axis of deck.researchPlan) {
    if (axis.needed && axis.status !== "done" && axis.status !== "read" && axis.status !== "skipped") {
      issues.push(blockerIssue(
        "research_not_ready",
        `Research axis ${axis.axis || "unnamed"} is needed but ${axis.status}`,
        "Complete, read, or explicitly skip this research axis before writing the deck.",
      ))
    }
  }

  const hasNeededResearch = deck.researchPlan.some((axis) => axis.needed && axis.status !== "skipped")
  for (const material of workspace.sourceMaterials ?? []) {
    if (material.status !== "discovered") continue
    const message = `Source material ${material.path} has been identified but not extracted, summarized, or researched`
    if (hasNeededResearch) {
      issues.push(blockerIssue(
        "source_not_processed",
        message,
        "Extract, summarize, research, or explicitly exclude this source before writing evidence-backed slides.",
      ))
    } else {
      issues.push(warningIssue(
        "source_not_processed",
        message,
        "Consider extracting or excluding this source if it may support the deck narrative.",
      ))
    }
  }

  return issues
}

function computeNarrativeReadinessIssues(deck: DeckSpec): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  const slides = deck.slides.filter((slide) => slide.index > 0).sort((a, b) => a.index - b.index)
  if (slides.length === 0) return issues

  if (slides.length >= 4 && slides.every((slide) => !slide.narrativeRole)) {
    issues.push(warningIssue(
      "narrative_gap",
      "No slide narrativeRole values are recorded for a multi-slide deck",
      "Add lightweight narrativeRole values such as context, tension, evidence, recommendation, risk, ask, appendix, or close to improve story-structure review.",
    ))
  }

  if (slides.length >= 4 && deck.audience?.trim() && slides.every(hasWeakNarrativePurpose)) {
    issues.push(warningIssue(
      "narrative_gap",
      `Slide purposes do not clearly frame the story for the audience: ${deck.audience}`,
      "Rewrite slide purpose fields to explain what this audience should understand, believe, decide, or do after each slide.",
    ))
  }

  const firstRecommendationIndex = slides.findIndex(isRecommendationSlide)
  if (firstRecommendationIndex >= 0) {
    const recommendation = slides[firstRecommendationIndex]
    const priorSlides = slides.slice(0, firstRecommendationIndex)
    const earlyBoundary = Math.max(1, Math.ceil(slides.length * 0.3))
    if (firstRecommendationIndex < earlyBoundary && !priorSlides.some(hasEvidenceOrTensionRole)) {
      issues.push(warningIssue(
        "narrative_gap",
        `Slide ${recommendation.index} presents a recommendation before context, tension, or evidence has been established`,
        "Consider moving the recommendation later or adding preceding context, tension, or evidence slides so the conclusion does not arrive before support.",
        { slideIndex: recommendation.index, slideTitle: recommendation.title },
      ))
    }

    if (!slides.some(hasRiskOrAssumptionHandling)) {
      issues.push(warningIssue(
        "narrative_gap",
        "Recommendation has no visible risk, assumption, caveat, or tradeoff handling",
        "Add a risk/assumption/tradeoff slide or make the relevant caveats explicit before writing a decision-oriented recommendation deck.",
        { slideIndex: recommendation.index, slideTitle: recommendation.title },
      ))
    }
  }

  if (slides.length >= 4 && !hasClearEnding(slides)) {
    const last = slides[slides.length - 1]
    issues.push(warningIssue(
      "narrative_gap",
      "Deck may end without a clear so-what, ask, or closing takeaway",
      "Use the final slide or final section to state the decision, action request, recommendation, or closing takeaway explicitly.",
      { slideIndex: last.index, slideTitle: last.title },
    ))
  }

  const firstAskIndex = slides.findIndex(isAskSlide)
  if (firstAskIndex === 0 && slides.length > 2) {
    const ask = slides[firstAskIndex]
    issues.push(warningIssue(
      "narrative_gap",
      `Slide ${ask.index} asks for action before the deck has established the case`,
      "Consider moving the ask later or opening with context before requesting a decision or action.",
      { slideIndex: ask.index, slideTitle: ask.title },
    ))
  } else if (firstAskIndex > 0) {
    const contextIndex = slides.findIndex((slide) => slide.narrativeRole === "context")
    if (contextIndex >= 0 && contextIndex < firstAskIndex) {
      const bridgeSlides = slides.slice(contextIndex + 1, firstAskIndex)
      if (!bridgeSlides.some((slide) => hasEvidenceOrTensionRole(slide) || isRecommendationSlide(slide))) {
        const ask = slides[firstAskIndex]
        issues.push(warningIssue(
          "narrative_gap",
          `Slide ${ask.index} jumps from context to ask without evidence, tension, or recommendation in between`,
          "Add an evidence, tension, or recommendation bridge before the ask so the narrative transition is easier to follow.",
          { slideIndex: ask.index, slideTitle: ask.title },
        ))
      }
    }
  }

  return issues
}

function blockerIssue(type: ReadinessIssueType, message: string, suggestedAction: string, extra: Partial<ReadinessIssue> = {}): ReadinessIssue {
  return { type, severity: "blocker", message, suggestedAction, ...extra }
}

function warningIssue(type: ReadinessIssueType, message: string, suggestedAction: string, extra: Partial<ReadinessIssue> = {}): ReadinessIssue {
  return { type, severity: "warning", message, suggestedAction, ...extra }
}

function findEvidenceSensitiveClaim(slide: SlideSpec): string | undefined {
  const candidates = [
    slide.title,
    slide.purpose,
    slide.content?.headline,
    ...(slide.content?.body ?? []),
    ...(slide.content?.bullets ?? []),
  ]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))

  return candidates.find(isEvidenceSensitiveClaim)
}

function isRecommendationSlide(slide: SlideSpec): boolean {
  return slide.narrativeRole === "recommendation" || /\b(recommend(?:ation|ed)?|should|must|go\/?no-go)\b|建议|必须/.test(slideSearchText(slide))
}

function isAskSlide(slide: SlideSpec): boolean {
  return slide.narrativeRole === "ask" || /\b(ask|decision|approve|approval|next step|action required|call to action)\b|请求|决策|批准|下一步|行动/.test(slideSearchText(slide))
}

function hasEvidenceOrTensionRole(slide: SlideSpec): boolean {
  return slide.narrativeRole === "evidence" || slide.narrativeRole === "tension"
}

function hasRiskOrAssumptionHandling(slide: SlideSpec): boolean {
  return slide.narrativeRole === "risk" || /\b(risk|assumption|caveat|trade-?off|constraint|limitation|uncertainty)\b|风险|假设|取舍|限制|不确定|前提/.test(slideSearchText(slide))
}

function hasWeakNarrativePurpose(slide: SlideSpec): boolean {
  const purpose = slide.purpose?.trim().toLowerCase()
  if (!purpose) return true
  return /^(explain|show|introduce|present|describe|overview|clarify)\b/.test(purpose) || /^(说明|展示|介绍|呈现|概述)/.test(purpose)
}

function hasClearEnding(slides: SlideSpec[]): boolean {
  const finalSlides = slides.slice(-2)
  return finalSlides.some((slide) => slide.narrativeRole === "recommendation" || slide.narrativeRole === "ask" || slide.narrativeRole === "close" || /\b(so what|takeaway|recommend(?:ation)?|decision|ask|next step|conclusion|close)\b|结论|建议|决策|请求|下一步|收尾|总结/.test(slideSearchText(slide)))
}

function slideSearchText(slide: SlideSpec): string {
  return [
    slide.title,
    slide.purpose,
    slide.content?.headline,
    ...(slide.content?.body ?? []),
    ...(slide.content?.bullets ?? []),
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n")
    .toLowerCase()
}

function isEvidenceSensitiveClaim(text: string): boolean {
  const normalized = text.toLowerCase()
  return hasNumericClaim(normalized) || EVIDENCE_SENSITIVE_TERMS.some((pattern) => pattern.test(normalized))
}

function hasNumericClaim(text: string): boolean {
  return /(?:[$¥€£]\s?\d|\d+(?:\.\d+)?\s?(?:%|x|倍|万|亿|m|mn|million|b|bn|billion|k|千|年|months?|days?|users?|customers?|revenue|margin|cagr|tam|sam|som)\b|\b20\d{2}\b)/i.test(text)
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

function normalizeSlides(slides: SlideSpec[]): SlideSpec[] {
  return slides
    .map((slide) => ({
      ...slide,
      title: slide.title ?? "",
      layout: slide.layout ?? "",
      components: slide.components ?? [],
      content: slide.content ?? {},
      evidence: slide.evidence ?? [],
      status: slide.status ?? "planned",
    }))
    .sort((a, b) => a.index - b.index)
}

function hasSlideContent(slide: SlideSpec): boolean {
  const content = slide.content ?? {}
  return Boolean(
    content.headline?.trim() ||
    (content.body && content.body.length > 0) ||
    (content.bullets && content.bullets.length > 0) ||
    content.data !== undefined,
  )
}

export function isDeckHtmlPath(filePath: string): boolean {
  return normalizePath(filePath).match(/(^|\/)decks\/[^/]+\.html$/) !== null
}

function deckSlugFromPath(filePath: string): string {
  return normalizeSlug(basename(normalizePath(filePath), ".html"))
}

function normalizeDeckPath(filePath: string): string {
  const normalized = normalizePath(cleanMarkdownText(filePath)).replace(/^\.\//, "")
  const match = /(?:^|\/)(decks\/[^/]+\.html)$/.exec(normalized)
  return match?.[1] ?? normalized
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}

function normalizeSlug(value: string): string {
  return cleanMarkdownText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function cleanMarkdownText(value: string): string {
  let text = String(value ?? "").trim()
  const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(text)
  if (link) text = link[1] || link[2]
  return text
    .replace(/^`+|`+$/g, "")
    .replace(/^\*+|\*+$/g, "")
    .trim()
}
