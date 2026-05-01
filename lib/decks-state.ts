import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { basename, dirname, join, resolve } from "path"

export const DECKS_STATE_FILE = "DECKS.json"

export type DeckProductionStatus = "planning" | "blocked" | "ready" | "written"
export type SlideProductionStatus = "planned" | "ready" | "written" | "qa_passed" | "qa_failed"
export type WriteReadinessStatus = "blocked" | "ready" | "written"

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
  summary?: string
  bestUsedFor?: string
  lastChecked?: string
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
  slideCount?: number
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
  slideCountDecided: boolean
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
}

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
    topicClarified: false,
    audienceClarified: false,
    slideCountDecided: false,
    languageDecided: false,
    visualStyleSelected: false,
    sourceMaterialsIdentified: false,
    researchNeedAssessed: false,
    researchFindingsRead: false,
    slidePlanConfirmed: false,
    designLayoutsFetched: false,
    ...overrides,
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
    slideCount: input.slideCount,
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
      },
    }
  }

  const blockers = computeDeckBlockers(deck)
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
    }
  }

  const blockers = computeDeckBlockers(deck)
  if (normalizeDeckPath(deck.outputPath) !== targetPath) {
    blockers.unshift(`Deck outputPath is ${deck.outputPath || "missing"}, not ${targetPath}`)
  }
  if (deck.writeReadiness.status !== "ready") {
    blockers.unshift(`Deck writeReadiness is ${deck.writeReadiness.status || "missing"}, not ready`)
  }
  if (deck.writeReadiness.blockers.length > 0) {
    blockers.unshift(`Deck still has readiness blockers: ${deck.writeReadiness.blockers.join("; ")}`)
  }

  return {
    ready: blockers.length === 0,
    slug: deck.slug,
    status: deck.writeReadiness.status,
    blocker: blockers.join("; "),
    blockers,
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
    workspace: state.workspace,
    deck: active,
  }
  let text = JSON.stringify(compact, null, 2)
  if (text.length > maxChars) text = text.slice(0, maxChars).trimEnd() + "\n[DECKS.json state truncated for prompt size.]"
  return `---\n\n# Revela Workspace State From ${DECKS_STATE_FILE}\n\n\`\`\`json\n${text}\n\`\`\`\n\nRules for this state layer:\n- Treat ${DECKS_STATE_FILE} as the source of truth for the single current deck's specs, slide plan, and write readiness.\n- The decks map is compatibility storage; operate only on the current workspace deck.\n- Do not edit ${DECKS_STATE_FILE} directly; use the revela-decks tool.\n- Before writing decks/*.html, the current deck must have writeReadiness.status=ready and a complete slide spec, and its outputPath must match the target file.`
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

function computeDeckBlockers(deck: DeckSpec): string[] {
  const blockers: string[] = []
  if (!deck.goal.trim()) blockers.push("Deck goal is missing")
  if (!isDeckHtmlPath(deck.outputPath)) blockers.push(`outputPath must be decks/*.html, got ${deck.outputPath || "missing"}`)

  for (const [key, value] of Object.entries(deck.requiredInputs) as Array<[keyof RequiredInputs, boolean]>) {
    if (value !== true) blockers.push(`requiredInputs.${key} is not true`)
  }

  if (typeof deck.slideCount === "number" && deck.slideCount > 0 && deck.slides.length !== deck.slideCount) {
    blockers.push(`slides length ${deck.slides.length} does not match slideCount ${deck.slideCount}`)
  }
  if (deck.slides.length === 0) blockers.push("slides are missing")
  for (const slide of deck.slides) {
    if (!slide.title.trim()) blockers.push(`Slide ${slide.index} title is missing`)
    if (!slide.layout.trim()) blockers.push(`Slide ${slide.index} layout is missing`)
    if (slide.components.length === 0) blockers.push(`Slide ${slide.index} components are missing`)
    if (!hasSlideContent(slide)) blockers.push(`Slide ${slide.index} content is missing`)
  }

  for (const axis of deck.researchPlan) {
    if (axis.needed && axis.status !== "done" && axis.status !== "read" && axis.status !== "skipped") {
      blockers.push(`Research axis ${axis.axis || "unnamed"} is needed but ${axis.status}`)
    }
  }
  return blockers
}

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
