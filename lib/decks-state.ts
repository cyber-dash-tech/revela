import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { createHash } from "crypto"
import { basename, join, resolve } from "path"
import {
  hasWorkspaceState,
  readOrCreateWorkspaceState,
  readWorkspaceState,
  workspaceStatePath,
  writeWorkspaceState,
} from "./workspace-state/repository"
import { activeHtmlDeckRenderTarget, ensureActiveHtmlDeckRenderTarget } from "./workspace-state/render-targets"
import {
  activeReviewTargetId,
  appendReviewSnapshot,
  createReviewSnapshot,
  isReviewSnapshotCurrent,
  latestReviewSnapshotForTarget,
} from "./workspace-state/review-snapshots"
import { WORKSPACE_STATE_FILE, type RenderTarget, type ReviewSnapshot, type WorkspaceAction } from "./workspace-state/types"
import { normalizeCanonicalNarrativeState, normalizeNarrativeState } from "./narrative-state/normalize"
import { computeNarrativeHash } from "./narrative-state/hash"
import { getArtifactClaimRefs } from "./narrative-state/queries"
import type { NarrativeApproval, NarrativeStateV1 } from "./narrative-state/types"
import { hasNarrativeVault, loadNarrativeFromPreferredSource } from "./narrative-vault"

export const DECKS_STATE_FILE = WORKSPACE_STATE_FILE

export type DeckProductionStatus = "planning" | "blocked" | "ready" | "written"
export type SlideProductionStatus = "planned" | "ready" | "written" | "qa_passed" | "qa_failed"
export type WriteReadinessStatus = "blocked" | "ready" | "written"
export type NarrativeRole = "context" | "tension" | "evidence" | "recommendation" | "risk" | "ask" | "appendix" | "close"
export type SlideClaimRefRole = "primary" | "supporting" | "evidence" | "risk" | "objection"

export interface DecksState {
  version: 1
  activeDeck?: string
  narrative?: NarrativeStateV1
  narrativeApprovals?: NarrativeApproval[]
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
  actions: WorkspaceAction[]
  renderTargets: RenderTarget[]
  reviews: ReviewSnapshot[]
}

export interface SourceMaterial {
  path: string
  type?: string
  size?: number
  fingerprint?: string
  lastModified?: string
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
  narrativeBrief?: NarrativeBrief
  theme: {
    design?: string
    domain?: string
  }
  requiredInputs: RequiredInputs
  researchPlan: ResearchAxis[]
  slides: SlideSpec[]
  assets: DeckAsset[]
  planReview?: DeckPlanReview
  writeReadiness: {
    status: WriteReadinessStatus
    blockers: string[]
    lastReviewedAt?: string
  }
}

export interface DeckPlanReview {
  status: "pending" | "confirmed"
  narrativeHash: string
  planHash: string
  confirmedAt?: string
  confirmedBy?: "user"
  summary?: string
  qualityChecks?: DeckPlanQualityCheck[]
}

export interface DeckPlanQualityCheck {
  id: string
  status: "pass" | "warning" | "blocker"
  message: string
}

export interface NarrativeBrief {
  audienceBeliefBefore?: string
  audienceBeliefAfter?: string
  decisionOrAction?: string
  narrativeArc?: string
  keyClaims: string[]
  objections: string[]
  risks: string[]
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
  claimIds?: string[]
  claimRefs?: SlideClaimRef[]
  evidenceBindingIds?: string[]
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

export interface SlideClaimRef {
  claimId: string
  role: SlideClaimRefRole
  note?: string
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
  evidenceCandidates?: EvidenceBindingCandidate[]
  diagnostics?: DeckReadinessDiagnostics
}

export interface DeckReadinessDiagnostics {
  planQuality: DeckPlanQualityCheck[]
  artifactCoverage?: ArtifactCoverageDiagnostic
  nextActions: string[]
}

export interface ArtifactCoverageDiagnostic {
  artifactId?: string
  outputPath?: string
  coverageStatus: "current" | "stale" | "partial" | "missing" | "unknown"
  requiredClaimIds: string[]
  coveredClaimIds: string[]
  missingClaimIds: string[]
  affectedClaimIds: string[]
  staleReasons: string[]
}

export type ReadinessSeverity = "blocker" | "warning"

export type ReadinessIssueType =
  | "missing_required_input"
  | "missing_slide_spec"
  | "slide_plan_unconfirmed"
  | "plan_quality"
  | "artifact_coverage"
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
  evidenceCandidates?: EvidenceBindingCandidate[]
  evidenceCandidateSearch?: EvidenceCandidateSearchDiagnostic
}

export interface EvidenceBindingCandidate {
  candidateId: string
  slideIndex: number
  slideTitle?: string
  claimText?: string
  source: string
  findingsFile?: string
  sourcePath?: string
  location?: string
  quote?: string
  caveat?: string
  supportScope: string[]
  supportStrength: "partial" | "strong"
  sourceKind?: "researchPlan" | "researchesFallback"
  evidenceDraft?: EvidenceRef
  unsupportedScope?: string[]
  recommendedRewrite?: string
}

export interface EvidenceCandidateSearchDiagnostic {
  queryTokens: string[]
  researchPlanFindingsSearched: string[]
  fallbackResearchFilesSearched: string[]
  fallbackResearchFilesSkipped: string[]
  nearMisses: EvidenceCandidateNearMiss[]
}

export interface EvidenceCandidateNearMiss {
  findingsFile: string
  sourceKind: "researchPlan" | "researchesFallback"
  bestScore: number
  threshold: number
  supportScope: string[]
  quote?: string
  reason: string
}

export interface ApplyEvidenceCandidatesResult {
  applied: AppliedEvidenceCandidate[]
  skipped: SkippedEvidenceCandidate[]
  nextReviewNeeded: boolean
}

export interface AppliedEvidenceCandidate {
  candidateId: string
  slideIndex: number
  evidence: EvidenceRef
}

export interface SkippedEvidenceCandidate {
  candidateId: string
  reason: string
}

const SOURCE_TRACE_ACTION = "Add slide evidence with source plus source trace such as findingsFile or sourcePath, and quote, location, url, or caveat where available; otherwise reframe the claim as an explicit assumption/opinion."

export interface ReviewDeckStateOptions {
  workspaceRoot?: string
  narrativeHash?: string
}

export interface ConfirmDeckPlanOptions {
  approvedBy?: "user"
  note?: string
  now?: string
  approvedAt?: string
  planHash?: string
}

export interface ConfirmDeckPlanResult {
  confirmed: boolean
  skipped: boolean
  reason?: string
  slug?: string
  narrativeHash?: string
  planHash?: string
}

export function decksStatePath(workspaceRoot: string): string {
  return workspaceStatePath(workspaceRoot, DECKS_STATE_FILE)
}

export function hasDecksState(workspaceRoot: string): boolean {
  return hasWorkspaceState(workspaceRoot, DECKS_STATE_FILE)
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
    actions: [],
    renderTargets: [],
    reviews: [],
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
  ensureActiveHtmlDeckRenderTarget(normalized)
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
    narrativeBrief: normalizeNarrativeBrief(input.narrativeBrief),
    theme: input.theme ?? {},
    requiredInputs: defaultRequiredInputs(input.requiredInputs),
    researchPlan: input.researchPlan ?? [],
    slides: normalizeSlides(input.slides ?? []),
    assets: input.assets ?? [],
    planReview: normalizeDeckPlanReview(input.planReview),
    writeReadiness: input.writeReadiness ?? { status: "blocked", blockers: [] },
  }
}

export function deckPlanHash(slides: SlideSpec[]): string {
  return createHash("sha1")
    .update(JSON.stringify(normalizeSlides(slides).map((slide) => ({
      index: slide.index,
      title: slide.title,
      purpose: slide.purpose,
      narrativeRole: slide.narrativeRole,
      layout: slide.layout,
      components: slide.components,
      claimIds: slide.claimIds ?? [],
      claimRefs: slide.claimRefs ?? [],
      evidenceBindingIds: slide.evidenceBindingIds ?? [],
      content: slide.content,
      evidence: slide.evidence,
      visuals: slide.visuals ?? [],
    }))))
    .digest("hex")
}

export function currentDeckPlanReviewStatus(deck: DeckSpec, narrativeHash?: string): { current: boolean; stale: boolean; reason?: string; planHash: string } {
  const review = deck.planReview
  const planHash = deck.slides.length > 0 ? deckPlanHash(deck.slides) : review?.planHash ?? deckPlanHash(deck.slides)
  if (!review) return { current: false, stale: false, reason: "deck plan has not been shown and confirmed", planHash }
  if (review.status !== "confirmed") return { current: false, stale: false, reason: "deck plan is pending user confirmation", planHash }
  if (narrativeHash && review.narrativeHash !== narrativeHash) return { current: false, stale: true, reason: "deck plan confirmation is stale because the narrative hash changed", planHash }
  if (deck.slides.length > 0 && review.planHash !== planHash) return { current: false, stale: true, reason: "deck plan confirmation is stale because the cached slide projection changed", planHash }
  return { current: true, stale: false, planHash }
}

export function confirmDeckPlan(state: DecksState, options: ConfirmDeckPlanOptions = {}): { state: DecksState; result: ConfirmDeckPlanResult } {
  const normalized = normalizeDecksStateWithNarrative(state)
  const key = currentDeckKey(normalized)
  const deck = key ? normalized.decks[key] : undefined
  if (!deck) {
    return { state: normalized, result: { confirmed: false, skipped: true, reason: `No active deck exists in ${DECKS_STATE_FILE}.` } }
  }
  const narrative = normalizeNarrativeState(normalized)
  const narrativeHash = computeNarrativeHash(narrative)
  const planHash = options.planHash ?? deckPlanHash(deck.slides)
  const pending = deck.planReview
  if (pending && pending.status === "pending" && pending.narrativeHash !== narrativeHash) {
    return { state: normalized, result: { confirmed: false, skipped: true, slug: deck.slug, narrativeHash, planHash, reason: "Cannot confirm because the pending deck plan is stale. Re-run compileDeckPlan first." } }
  }
  if (!options.planHash && pending && pending.status === "pending" && pending.planHash !== planHash) {
    return { state: normalized, result: { confirmed: false, skipped: true, slug: deck.slug, narrativeHash, planHash, reason: "Cannot confirm because the pending deck plan is stale. Re-run compileDeckPlan first." } }
  }

  deck.planReview = {
    status: "confirmed",
    narrativeHash,
    planHash,
    confirmedAt: options.approvedAt ?? options.now ?? new Date().toISOString(),
    confirmedBy: options.approvedBy ?? "user",
    summary: cleanOptionalText(options.note),
    qualityChecks: pending?.qualityChecks,
  }
  deck.requiredInputs = { ...deck.requiredInputs, slidePlanConfirmed: true }
  deck.writeReadiness = { status: "blocked", blockers: [] }
  normalized.decks[deck.slug] = deck
  normalized.activeDeck = deck.slug
  normalized.narrative = narrative
  return { state: normalized, result: { confirmed: true, skipped: false, slug: deck.slug, narrativeHash, planHash } }
}

export function readDecksState(workspaceRoot: string): DecksState {
  return applyPreferredNarrativeSource(workspaceRoot, readWorkspaceState(workspaceRoot, { fileName: DECKS_STATE_FILE, normalize: normalizeDecksStateWithNarrative }))
}

export function writeDecksState(workspaceRoot: string, state: DecksState): void {
  const vault = hasNarrativeVault(workspaceRoot)
  writeWorkspaceState(workspaceRoot, prepareStateForWrite(workspaceRoot, state), { fileName: DECKS_STATE_FILE, normalize: vault ? normalizeDecksState : normalizeDecksStateWithNarrative })
}

export function readOrCreateDecksState(workspaceRoot: string): DecksState {
  return applyPreferredNarrativeSource(workspaceRoot, readOrCreateWorkspaceState(workspaceRoot, createEmptyDecksState, { fileName: DECKS_STATE_FILE, normalize: normalizeDecksStateWithNarrative }))
}

function applyPreferredNarrativeSource(workspaceRoot: string, state: DecksState): DecksState {
  const normalized = normalizeDecksStateWithNarrative(state)
  const loaded = loadNarrativeFromPreferredSource(workspaceRoot, normalized.narrative, narrativeApprovalsForHydration(normalized))
  if (loaded.source !== "vault" || !loaded.narrative) return normalized
  return normalizeDecksStateWithNarrative({ ...normalized, narrative: loaded.narrative, narrativeApprovals: loaded.narrative.approvals })
}

function prepareStateForWrite(workspaceRoot: string, state: DecksState): DecksState {
  const normalized = normalizeDecksStateWithNarrative(state)
  if (!hasNarrativeVault(workspaceRoot)) return normalized
  const loaded = loadNarrativeFromPreferredSource(workspaceRoot, normalized.narrative, narrativeApprovalsForHydration(normalized))
  const narrativeApprovals = loaded.narrative?.approvals ?? narrativeApprovalsForHydration(normalized)
  const prepared = normalizeDecksStateWithNarrative({ ...normalized, narrative: loaded.narrative ?? normalized.narrative, narrativeApprovals })
  const { narrative: _narrative, ...withoutNarrative } = prepared
  return withoutNarrative as DecksState
}

function narrativeApprovalsForHydration(state: DecksState): NarrativeApproval[] {
  return state.narrativeApprovals ?? state.narrative?.approvals ?? []
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
  ensureActiveHtmlDeckRenderTarget(normalized)
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
  ensureActiveHtmlDeckRenderTarget(normalized)
  return normalized
}

export function applyEvidenceCandidates(state: DecksState, candidateIds: string[], options: ReviewDeckStateOptions = {}): { state: DecksState; result: ApplyEvidenceCandidatesResult } {
  const normalized = normalizeDecksState(state)
  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))]
  const applied: AppliedEvidenceCandidate[] = []
  const skipped: SkippedEvidenceCandidate[] = []
  const key = currentDeckKey(normalized)
  const deck = key ? normalized.decks[key] : undefined

  if (!deck) {
    return {
      state: normalized,
      result: {
        applied,
        skipped: ids.map((candidateId) => ({ candidateId, reason: `No active deck exists in ${DECKS_STATE_FILE}.` })),
        nextReviewNeeded: false,
      },
    }
  }

  const review = reviewDeckState(normalized, deck.slug, options)
  const byId = new Map((review.result.evidenceCandidates ?? []).map((candidate) => [candidate.candidateId, candidate]))
  const next = normalizeDecksState(review.state)
  const nextDeck = next.decks[deck.slug]

  for (const candidateId of ids) {
    const candidate = byId.get(candidateId)
    if (!candidate) {
      skipped.push({ candidateId, reason: "Candidate was not found in the current review result." })
      continue
    }
    if (!candidate.evidenceDraft) {
      skipped.push({ candidateId, reason: "Candidate has no evidenceDraft to apply." })
      continue
    }
    const slide = nextDeck.slides.find((item) => item.index === candidate.slideIndex)
    if (!slide) {
      skipped.push({ candidateId, reason: `Slide ${candidate.slideIndex} no longer exists.` })
      continue
    }
    const evidence = cleanEvidenceRef(candidate.evidenceDraft)
    if (slide.evidence.some((item) => sameEvidenceRef(item, evidence))) {
      skipped.push({ candidateId, reason: `Slide ${candidate.slideIndex} already has this evidence record.` })
      continue
    }
    slide.evidence.push(evidence)
    applied.push({ candidateId, slideIndex: candidate.slideIndex, evidence })
  }

  return {
    state: next,
    result: {
      applied,
      skipped,
      nextReviewNeeded: applied.length > 0,
    },
  }
}

export function reviewDeckState(state: DecksState, slug?: string, options: ReviewDeckStateOptions = {}): { state: DecksState; result: DeckStateReadinessResult } {
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

  const issues = computeDeckReadinessIssues(normalized, deck, {
    ...options,
    narrativeHash: options.narrativeHash ?? computeNarrativeHash(normalizeNarrativeState(normalized)),
  })
  const blockers = issues.filter((issue) => issue.severity === "blocker").map((issue) => issue.message)
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  const evidenceCandidates = issues.flatMap((issue) => issue.evidenceCandidates ?? [])
  const reviewedAt = new Date().toISOString()
  deck.writeReadiness = {
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    lastReviewedAt: reviewedAt,
  }
  deck.status = blockers.length === 0 ? "ready" : "blocked"
  normalized.decks[deck.slug] = deck
  normalized.activeDeck = deck.slug
  const result: DeckStateReadinessResult = {
    ready: blockers.length === 0,
    slug: deck.slug,
    status: deck.writeReadiness.status,
    blocker: blockers.join("; "),
    blockers,
    warnings,
    issues,
    evidenceCandidates,
    diagnostics: deckReadinessDiagnostics(normalized, deck, issues),
  }
  appendReviewSnapshot(normalized, createReviewSnapshot(normalized, { slug: deck.slug, result, reviewedAt }))
  return {
    state: normalized,
    result,
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

  const issues = computeDeckReadinessIssues(normalized, deck, {
    narrativeHash: computeNarrativeHash(normalizeNarrativeState(normalized)),
  })
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
      suggestedAction: "Run /revela make --deck and resolve all readiness blockers before writing deck HTML.",
    })
  }
  if (deck.writeReadiness.blockers.length > 0) {
    const message = `Deck still has readiness blockers: ${deck.writeReadiness.blockers.join("; ")}`
    blockers.unshift(message)
    issues.unshift({
      type: "missing_slide_spec",
      severity: "blocker",
      message,
      suggestedAction: "Resolve the stored writeReadiness blockers and rerun /revela make --deck.",
    })
  }
  if (normalized.reviews.length > 0) {
    const targetId = activeReviewTargetId(normalized)
    const snapshot = latestReviewSnapshotForTarget(normalized, targetId)
    if (!snapshot) {
      const message = "No review snapshot exists for the active HTML render target"
      blockers.unshift(message)
      issues.unshift({
        type: "missing_slide_spec",
        severity: "blocker",
        message,
        suggestedAction: "Run /revela make --deck so readiness is recorded against the current active render target.",
      })
    } else if (!isReviewSnapshotCurrent(normalized, snapshot, deck.slug)) {
      const message = "Latest review snapshot is stale for the current deck, sources, evidence, narrative state, or render target"
      blockers.unshift(message)
      issues.unshift({
        type: "missing_slide_spec",
        severity: "blocker",
        message,
        suggestedAction: "Run /revela make --deck again after the latest state changes before writing deck HTML.",
      })
    } else if (snapshot.status !== "ready") {
      const message = `Latest review snapshot is ${snapshot.status}, not ready`
      blockers.unshift(message)
      issues.unshift({
        type: "missing_slide_spec",
        severity: "blocker",
        message,
        suggestedAction: "Resolve review blockers and rerun /revela make --deck before writing deck HTML.",
      })
    }
  }

  return {
    ready: blockers.length === 0,
    slug: deck.slug,
    status: deck.writeReadiness.status,
    blocker: blockers.join("; "),
    blockers,
    warnings,
    issues,
    diagnostics: deckReadinessDiagnostics(normalized, deck, issues),
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
    renderTargets: state.renderTargets,
    reviews: compactReviewsForPrompt(state.reviews),
  }
  let text = JSON.stringify(compact, null, 2)
  if (text.length > maxChars) text = text.slice(0, maxChars).trimEnd() + "\n[DECKS.json state truncated for prompt size.]"
  return `---\n\n# Revela Workspace State From ${DECKS_STATE_FILE}\n\n\`\`\`json\n${text}\n\`\`\`\n\nRules for this state layer:\n- Treat ${DECKS_STATE_FILE} as compatibility/render state: workspace context, active output path, render targets, reviews, readiness, provenance, artifact coverage, and cached projections.\n- Do not treat ${DECKS_STATE_FILE} \`slides[]\` as the authoritative HTML slide-count, slide-order, or slide-content contract. When \`deck-plan/\` exists, use \`deck-plan/index.md\` and \`deck-plan/slides/*.md\` as the deck execution blueprint for HTML generation/remake.\n- The decks map is compatibility storage; operate only on the current workspace deck.\n- HTML slide identity is artifact self-consistency: each \`<section class="slide">\` needs a positive 1-based \`data-slide-index\`, indexes must be unique and strictly increase in DOM order, and 0-based \`data-index\` is never canonical identity. Cached ${DECKS_STATE_FILE} \`slides[].index\` values are diagnostic context only.\n- The active HTML deck is represented as a \`renderTarget\` of type \`html_deck\`; PDF/PPTX exports should be recorded as derived render targets, not as separate deck specs.\n- \`writeReadiness\` and \`planReview\` are compatibility projections for the /revela make --deck generation workflow, not hard blockers for targeted artifact-level HTML fixes.\n- Do not edit ${DECKS_STATE_FILE} directly; use the revela-decks tool.\n- For /revela make --deck generated HTML, use the current deck's outputPath, read \`deck-plan/\` when present, and satisfy the deck HTML contract without padding missing chapters just to match cached ${DECKS_STATE_FILE} \`slides[]\`. Deck-plan diagnostics are advisory; for targeted artifact-level edits, patch the requested deck HTML directly without treating \`writeReadiness\` or \`planReview\` as a precondition.`
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
    narrativeBrief: compactNarrativeBriefForPrompt(deck.narrativeBrief),
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

function compactReviewsForPrompt(reviews: ReviewSnapshot[]): ReviewSnapshot[] {
  return reviews.slice(-5).map((review) => ({
    id: review.id,
    targetId: review.targetId,
    inputHash: review.inputHash,
    status: review.status,
    blockers: review.blockers.slice(0, 5),
    warnings: review.warnings.slice(0, 5),
    issues: review.issues.slice(0, 10),
    evidenceCandidates: review.evidenceCandidates?.slice(0, 10),
    reviewedAt: review.reviewedAt,
  }))
}

function compactNarrativeBriefForPrompt(brief: NarrativeBrief | undefined): NarrativeBrief | undefined {
  if (!brief) return undefined
  return {
    audienceBeliefBefore: truncatePromptText(brief.audienceBeliefBefore),
    audienceBeliefAfter: truncatePromptText(brief.audienceBeliefAfter),
    decisionOrAction: truncatePromptText(brief.decisionOrAction),
    narrativeArc: truncatePromptText(brief.narrativeArc),
    keyClaims: brief.keyClaims.map((claim) => truncatePromptText(claim)).filter(Boolean) as string[],
    objections: brief.objections.map((objection) => truncatePromptText(objection)).filter(Boolean) as string[],
    risks: brief.risks.map((risk) => truncatePromptText(risk)).filter(Boolean) as string[],
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
    narrative: normalizeCanonicalNarrativeState(input.narrative, input.activeDeck || "workspace"),
    narrativeApprovals: normalizeNarrativeApprovals([...(input.narrativeApprovals ?? []), ...(input.narrative?.approvals ?? [])]),
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
    actions: input.actions ?? [],
    renderTargets: input.renderTargets ?? [],
    reviews: input.reviews ?? [],
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
  ensureActiveHtmlDeckRenderTarget(state)
  return state
}

function normalizeDecksStateWithNarrative(input: DecksState): DecksState {
  const state = normalizeDecksState(input)
  if (!state.narrative && currentDeckKey(state)) state.narrative = normalizeNarrativeState(state)
  if (state.narrative && state.narrativeApprovals && state.narrativeApprovals.length > 0) {
    state.narrative = { ...state.narrative, approvals: normalizeNarrativeApprovals([...state.narrative.approvals, ...state.narrativeApprovals]) ?? [] }
  }
  return state
}

function normalizeNarrativeApprovals(approvals: NarrativeApproval[]): NarrativeApproval[] | undefined {
  const normalized = [...new Map(approvals.filter((approval) => approval?.id).map((approval) => [approval.id, approval])).values()]
  return normalized.length > 0 ? normalized : undefined
}

function normalizeDeckPlanReview(input: DeckPlanReview | undefined): DeckPlanReview | undefined {
  if (!input || !input.narrativeHash || !input.planHash) return undefined
  return {
    status: input.status === "confirmed" ? "confirmed" : "pending",
    narrativeHash: input.narrativeHash,
    planHash: input.planHash,
    confirmedAt: cleanOptionalText(input.confirmedAt),
    confirmedBy: input.confirmedBy === "user" ? "user" : undefined,
    summary: cleanOptionalText(input.summary),
    qualityChecks: normalizeDeckPlanQualityChecks(input.qualityChecks),
  }
}

function normalizeDeckPlanQualityChecks(input: DeckPlanQualityCheck[] | undefined): DeckPlanQualityCheck[] | undefined {
  if (!Array.isArray(input)) return undefined
  const checks = input.flatMap((item): DeckPlanQualityCheck[] => {
    if (!item || typeof item !== "object") return []
    const id = cleanOptionalText(item.id)
    const message = cleanOptionalText(item.message)
    if (!id || !message) return []
    const status = item.status === "blocker" || item.status === "warning" ? item.status : "pass"
    return [{ id, status, message }]
  })
  return checks.length > 0 ? checks : undefined
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

function computeDeckReadinessIssues(state: DecksState, deck: DeckSpec, options: ReviewDeckStateOptions = {}): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  const workspace = state.workspace
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

  const planReview = currentDeckPlanReviewStatus(deck, options.narrativeHash)
  if (!planReview.current) {
    issues.push(warningIssue(
      "slide_plan_unconfirmed",
      planReview.stale ? `Deck plan confirmation is stale: ${planReview.reason}` : `Deck plan is not confirmed: ${planReview.reason}`,
      "Write or read deck-plan/ projection Markdown if useful, then decide whether to continue. This is advisory and does not block artifact work.",
    ))
  }
  issues.push(...deckPlanQualityIssues(deck))
  issues.push(...artifactCoverageIssues(state, deck))
  for (const slide of deck.slides) {
    const slideRef = { slideIndex: slide.index, slideTitle: slide.title }
    if (!slide.title.trim()) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} title is missing`, "Add a slide title to the slide spec.", slideRef))
    if (!slide.layout.trim()) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} layout is missing`, "Fetch and record the intended design layout for this slide.", slideRef))
    if (slide.components.length === 0) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} components are missing`, "Record the design components needed for this slide.", slideRef))
    if (!hasSlideContent(slide)) issues.push(blockerIssue("missing_slide_spec", `Slide ${slide.index} content is missing`, "Add structured headline/body/bullets/data content to the slide spec.", slideRef))

    const claim = findEvidenceSensitiveClaim(slide)
    if (claim && slide.evidence.length === 0 && !isNavigationSlide(slide)) {
      const { candidates: evidenceCandidates, search: evidenceCandidateSearch } = findEvidenceBindingCandidates(deck, slide, claim, options)
      issues.push(blockerIssue(
        "missing_evidence",
        `Slide ${slide.index} has an evidence-sensitive claim without evidence: ${claim}`,
        SOURCE_TRACE_ACTION,
        {
          ...slideRef,
          claimText: claim,
          evidenceCandidates: evidenceCandidates.length > 0 ? evidenceCandidates : undefined,
          evidenceCandidateSearch,
        },
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
    if (isIgnorableSourceMaterial(material.path)) continue
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

function deckPlanQualityIssues(deck: DeckSpec): ReadinessIssue[] {
  const checks = deck.planReview?.qualityChecks ?? []
  return checks.flatMap((check): ReadinessIssue[] => {
    if (check.status === "pass") return []
    const suggestedAction = check.status === "blocker"
      ? "Re-run compileDeckPlan or revise the deck projection so each central claim has a claim-led chapter with framing, evidence/proof, and implication/boundary slides. If a claim cannot support that chapter, merge it, run research, narrow it, or explicitly accept a shorter chapter before writing the deck."
      : "Keep the stated claim boundaries visible in the plan and rendered artifact; do not stretch partial evidence beyond the supported scope."
    return [{
      type: "plan_quality",
      severity: check.status,
      message: check.message,
      suggestedAction,
    }]
  })
}

function artifactCoverageIssues(state: DecksState, deck: DeckSpec): ReadinessIssue[] {
  const coverage = artifactCoverageDiagnostic(state, deck)
  if (!coverage) return []
  const issues: ReadinessIssue[] = []
  if (coverage.missingClaimIds.length > 0) {
    issues.push(blockerIssue(
      "artifact_coverage",
      `Active deck plan is missing required narrative claims: ${coverage.missingClaimIds.join(", ")}`,
      "Re-run compileDeckPlan or revise the deck projection so every central or evidence-required claim appears in the planned slides before writing the deck.",
    ))
  }
  if (coverage.coverageStatus === "stale") {
    issues.push(blockerIssue(
      "artifact_coverage",
      `Active deck artifact coverage is stale: ${coverage.staleReasons.join("; ") || "narrative or render target changed"}`,
      "Re-run /revela make --deck so the deck plan and artifact coverage are regenerated from the current approved narrative state.",
    ))
  } else if (coverage.coverageStatus === "partial") {
    issues.push(warningIssue(
      "artifact_coverage",
      `Active deck artifact coverage is partial: ${coverage.affectedClaimIds.join(", ") || "some claims are not fully mapped"}`,
      "Keep the partial coverage visible in the make report and review the affected claims before exporting or presenting the deck.",
    ))
  }
  return issues
}

function deckReadinessDiagnostics(state: DecksState, deck: DeckSpec, issues: ReadinessIssue[]): DeckReadinessDiagnostics {
  const planQuality = deck.planReview?.qualityChecks ?? []
  const artifactCoverage = artifactCoverageDiagnostic(state, deck)
  return {
    planQuality,
    ...(artifactCoverage ? { artifactCoverage } : {}),
    nextActions: readinessNextActions(issues, artifactCoverage),
  }
}

function artifactCoverageDiagnostic(state: DecksState, deck: DeckSpec): ArtifactCoverageDiagnostic | undefined {
  const target = activeHtmlDeckRenderTarget(state)
  const artifact = getArtifactClaimRefs(state).find((item) => item.type === "html_deck" && normalizeDeckPath(item.outputPath ?? "") === normalizeDeckPath(deck.outputPath))
  const data = target?.data ?? {}
  const requiredClaimIds = stringArray(data.requiredClaimIds)
  const coveredClaimIds = stringArray(data.coveredClaimIds)
  const missingClaimIds = [...new Set([...(artifact?.missingClaimIds ?? []), ...stringArray(data.missingClaimIds)])].sort()
  const affectedClaimIds = [...new Set([...(artifact?.affectedClaimIds ?? []), ...missingClaimIds])].sort()
  const staleReasons = artifact?.staleReasons ?? []
  const coverageStatus = artifact?.coverageStatus ?? (target ? (missingClaimIds.length > 0 ? "missing" : "current") : "unknown")
  if (!target && !artifact && requiredClaimIds.length === 0 && coveredClaimIds.length === 0 && missingClaimIds.length === 0) return undefined
  return {
    artifactId: artifact?.artifactId ?? target?.id,
    outputPath: artifact?.outputPath ?? target?.outputPath ?? deck.outputPath,
    coverageStatus,
    requiredClaimIds: [...new Set([...(artifact?.claimIds ?? []), ...requiredClaimIds, ...missingClaimIds])].filter((id) => requiredClaimIds.length === 0 || requiredClaimIds.includes(id) || missingClaimIds.includes(id)).sort(),
    coveredClaimIds: [...new Set([...(artifact?.claimIds ?? []), ...coveredClaimIds])].filter((id) => missingClaimIds.length === 0 || !missingClaimIds.includes(id)).sort(),
    missingClaimIds,
    affectedClaimIds,
    staleReasons,
  }
}

function readinessNextActions(issues: ReadinessIssue[], coverage?: ArtifactCoverageDiagnostic): string[] {
  const actions = issues
    .filter((issue) => issue.severity === "blocker" || issue.type === "plan_quality" || issue.type === "artifact_coverage")
    .map((issue) => issue.suggestedAction)
  if (coverage?.missingClaimIds.length) actions.unshift("Review missingClaimIds in artifactCoverage and recompile the deterministic deck plan before writing HTML.")
  if (coverage?.coverageStatus === "stale") actions.unshift("Regenerate the deck plan from the current narrative before writing or exporting artifacts.")
  return [...new Set(actions)].slice(0, 5)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))].sort()
}

function findEvidenceBindingCandidates(deck: DeckSpec, slide: SlideSpec, claimText: string, options: ReviewDeckStateOptions): { candidates: EvidenceBindingCandidate[]; search?: EvidenceCandidateSearchDiagnostic } {
  if (!options.workspaceRoot) return { candidates: [] }
  const queryText = slideSearchText(slide)
  const queryTokens = meaningfulTokens(queryText)
  if (queryTokens.length === 0) return { candidates: [] }

  const candidates: EvidenceBindingCandidate[] = []
  const search: EvidenceCandidateSearchDiagnostic = {
    queryTokens,
    researchPlanFindingsSearched: [],
    fallbackResearchFilesSearched: [],
    fallbackResearchFilesSkipped: [],
    nearMisses: [],
  }
  const planFindings = new Set<string>()
  for (const axis of deck.researchPlan) {
    if (!axis.needed || (axis.status !== "done" && axis.status !== "read") || !axis.findingsFile?.trim()) continue
    const normalizedFindingsFile = normalizePath(axis.findingsFile)
    planFindings.add(normalizedFindingsFile)
    search.researchPlanFindingsSearched.push(normalizedFindingsFile)
    const findingsPath = safeWorkspacePath(options.workspaceRoot, axis.findingsFile)
    if (!findingsPath || !existsSync(findingsPath)) continue
    const text = readTextPrefix(findingsPath, 100_000)
    if (!text.trim()) continue
    const result = candidateFromFindingsFile({
      slide,
      claimText,
      queryTokens,
      findingsFile: normalizedFindingsFile,
      text,
      sourceKind: "researchPlan",
    })
    if (result.candidate) candidates.push(result.candidate)
    else if (result.nearMiss) search.nearMisses.push(result.nearMiss)
  }

  if (candidates.length === 0) {
    for (const findingsFile of listWorkspaceResearchFindings(options.workspaceRoot, planFindings)) {
      search.fallbackResearchFilesSearched.push(findingsFile)
      const findingsPath = safeWorkspacePath(options.workspaceRoot, findingsFile)
      if (!findingsPath || !existsSync(findingsPath)) {
        search.fallbackResearchFilesSkipped.push(findingsFile)
        continue
      }
      const text = readTextPrefix(findingsPath, 100_000)
      if (!text.trim()) {
        search.fallbackResearchFilesSkipped.push(findingsFile)
        continue
      }
      const result = candidateFromFindingsFile({
        slide,
        claimText,
        queryTokens,
        findingsFile,
        text,
        sourceKind: "researchesFallback",
      })
      if (result.candidate) candidates.push(result.candidate)
      else if (result.nearMiss) search.nearMisses.push(result.nearMiss)
    }
  }

  search.nearMisses = search.nearMisses
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, 5)
  return {
    candidates: candidates
      .sort((a, b) => b.supportScope.length - a.supportScope.length)
      .slice(0, 3),
    search,
  }
}

function candidateFromFindingsFile({
  slide,
  claimText,
  queryTokens,
  findingsFile,
  text,
  sourceKind,
}: {
  slide: SlideSpec
  claimText: string
  queryTokens: string[]
  findingsFile: string
  text: string
  sourceKind: "researchPlan" | "researchesFallback"
}): { candidate?: EvidenceBindingCandidate; nearMiss?: EvidenceCandidateNearMiss } {
  const lines = extractFindingsLines(text)
  let best: { line: string; scope: string[]; score: number } | undefined
  for (const line of lines) {
    const normalizedLine = line.toLowerCase()
    const scope = queryTokens.filter((token) => normalizedLine.includes(token))
    const phraseScore = importantPhrases(slide).filter((phrase) => normalizedLine.includes(phrase)).length * 2
    const score = scope.length + phraseScore
    if (!best || score > best.score) best = { line, scope, score }
  }
  if (!best || best.score <= 0) return {}

  const threshold = 2
  const supportScope = [...new Set(best.scope)].slice(0, 8)
  if (best.score < threshold) {
    return {
      nearMiss: {
        findingsFile,
        sourceKind,
        bestScore: best.score,
        threshold,
        supportScope,
        quote: best.line,
        reason: `Best matching line scored ${best.score}, below binding threshold ${threshold}.`,
      },
    }
  }

  const sourcePath = extractSourcePath(text)
  const coverage = supportScope.length / Math.max(1, queryTokens.length)
  const supportStrength = best.score >= Math.min(5, Math.max(3, queryTokens.length)) && coverage >= 0.5 ? "strong" : "partial"
  const unsupportedScope = unsupportedClaimScope(slide, best.line).slice(0, 5)
  const caveats = []
  if (supportStrength === "partial") {
    caveats.push("Candidate support is partial. Bind only the matched claim scope; do not use it to support unrelated future-state or recommendation claims on the same slide.")
  }
  if (sourceKind === "researchesFallback") {
    caveats.push("Candidate was discovered from researches/ fallback and is not referenced by researchPlan; confirm relevance before binding it into slide evidence.")
  }
  if (unsupportedScope.length > 0) {
    caveats.push(`Unsupported claim scope: ${unsupportedScope.join("; ")}.`)
  }
  const caveat = caveats.length > 0 ? caveats.join(" ") : undefined
  const evidenceDraft: EvidenceRef = {
    source: sourcePath || findingsFile,
    findingsFile,
    sourcePath,
    location: "research findings excerpt",
    quote: best.line,
    caveat,
  }
  return {
    candidate: {
      candidateId: evidenceCandidateId(slide.index, findingsFile, best.line, supportScope),
      slideIndex: slide.index,
      slideTitle: slide.title,
      claimText,
      source: sourcePath || findingsFile,
      findingsFile,
      sourcePath,
      location: "research findings excerpt",
      quote: best.line,
      caveat,
      supportScope,
      supportStrength,
      sourceKind,
      evidenceDraft,
      unsupportedScope,
      recommendedRewrite: recommendedEvidenceRewrite(supportScope, unsupportedScope),
    },
  }
}

function unsupportedClaimScope(slide: SlideSpec, supportedLine: string): string[] {
  const normalizedLine = supportedLine.toLowerCase()
  const phrases = [slide.purpose, slide.content?.headline, ...(slide.content?.bullets ?? [])]
    .map((item) => cleanMarkdownText(item ?? ""))
    .filter((item) => item.length >= 8)

  return [...new Set(phrases.filter((phrase) => {
    const normalizedPhrase = phrase.toLowerCase()
    return FUTURE_STATE_SCOPE_PATTERN.test(normalizedPhrase) && !normalizedLine.includes(normalizedPhrase)
  }))]
}

function recommendedEvidenceRewrite(supportScope: string[], unsupportedScope: string[]): string | undefined {
  if (unsupportedScope.length === 0) return undefined
  const supported = supportScope.length > 0 ? supportScope.join(", ") : "the quoted current-state support"
  return `Bind this evidence only to the supported scope (${supported}). Reframe unsupported scope as internal synthesis, target-state hypothesis, or a separately sourced claim: ${unsupportedScope.join("; ")}.`
}

function evidenceCandidateId(slideIndex: number, findingsFile: string, quote: string, supportScope: string[]): string {
  const hash = createHash("sha1")
    .update(JSON.stringify({ slideIndex, findingsFile, quote, supportScope }))
    .digest("hex")
    .slice(0, 8)
  return `s${slideIndex}-${hash}`
}

function cleanEvidenceRef(evidence: EvidenceRef): EvidenceRef {
  const cleaned: EvidenceRef = { source: cleanMarkdownText(evidence.source) }
  for (const key of ["quote", "page", "url", "sourcePath", "location", "findingsFile", "caveat", "extractedTextPath", "extractedManifestPath"] as const) {
    const value = cleanOptionalText(evidence[key])
    if (value) cleaned[key] = value
  }
  return cleaned
}

function sameEvidenceRef(a: EvidenceRef, b: EvidenceRef): boolean {
  return normalizeEvidenceComparable(a) === normalizeEvidenceComparable(b)
}

function normalizeEvidenceComparable(evidence: EvidenceRef): string {
  const cleaned = cleanEvidenceRef(evidence)
  return JSON.stringify({
    source: cleaned.source,
    findingsFile: cleaned.findingsFile,
    sourcePath: cleaned.sourcePath,
    quote: cleaned.quote,
    location: cleaned.location,
    caveat: cleaned.caveat,
  })
}

function listWorkspaceResearchFindings(workspaceRoot: string, exclude: Set<string>): string[] {
  const researchRoot = safeWorkspacePath(workspaceRoot, "researches")
  if (!researchRoot || !existsSync(researchRoot)) return []
  const files: string[] = []
  collectMarkdownFiles(researchRoot, files, 0)
  return files
    .map((file) => normalizePath(file.slice(resolve(workspaceRoot).length + 1)))
    .filter((file) => file.startsWith("researches/") && !exclude.has(file))
    .slice(0, 50)
}

function collectMarkdownFiles(dir: string, output: string[], depth: number): void {
  if (depth > 4) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      collectMarkdownFiles(fullPath, output, depth + 1)
    } else if (stat.isFile() && entry.endsWith(".md")) {
      output.push(fullPath)
    }
  }
}

function safeWorkspacePath(workspaceRoot: string, relativePath: string): string | undefined {
  const root = resolve(workspaceRoot)
  const target = resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + "/")) return undefined
  return target
}

function readTextPrefix(filePath: string, maxChars: number): string {
  try {
    return readFileSync(filePath, "utf-8").slice(0, maxChars)
  } catch {
    return ""
  }
}

function extractFindingsLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+|>\s*)/, "").trim())
    .filter((line) => line.length >= 24 && !/^---$/.test(line) && !/^#/.test(line))
    .slice(0, 300)
}

function extractSourcePath(text: string): string | undefined {
  const sourceLine = text.split(/\r?\n/).find((line) => /^\s*(?:[-*+]\s*)?(?:source|来源)\s*:/i.test(line))
  if (!sourceLine) return undefined
  return cleanMarkdownText(sourceLine.replace(/^\s*(?:[-*+]\s*)?(?:source|来源)\s*:\s*/i, "")) || undefined
}

function meaningfulTokens(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
  const latin = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !EVIDENCE_BINDING_STOPWORDS.has(token))
  const chinese = Array.from(normalized.matchAll(/[\u4e00-\u9fa5]{2,}/g), (match) => match[0])
  return [...new Set([...latin, ...chinese])].slice(0, 40)
}

function importantPhrases(slide: SlideSpec): string[] {
  return [slide.title, slide.content?.headline, ...(slide.content?.bullets ?? [])]
    .map((item) => item?.trim().toLowerCase())
    .filter((item): item is string => Boolean(item && item.length >= 8 && item.length <= 80))
}

function computeNarrativeReadinessIssues(deck: DeckSpec): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  const slides = deck.slides.filter((slide) => slide.index > 0).sort((a, b) => a.index - b.index)
  if (slides.length === 0) return issues
  const decisionOriented = isDecisionOrientedDeck(deck, slides)

  if (decisionOriented && !hasNarrativeBriefContent(deck.narrativeBrief)) {
    issues.push(warningIssue(
      "narrative_gap",
      "Narrative brief is missing for a decision-oriented deck",
      "Add a 0.9 narrativeBrief with audience belief before/after, decisionOrAction, narrativeArc, keyClaims, objections, and risks so review can compile the deck against explicit story intent.",
    ))
  }

  if (decisionOriented && deck.narrativeBrief) {
    if (!deck.narrativeBrief.audienceBeliefAfter?.trim()) {
      issues.push(warningIssue(
        "narrative_gap",
        "Narrative brief is missing the intended audience belief after the deck",
        "Set narrativeBrief.audienceBeliefAfter so the deck can be reviewed against the belief change it is meant to create.",
      ))
    }
    if (!deck.narrativeBrief.decisionOrAction?.trim() && slides.some((slide) => isAskSlide(slide) || isRecommendationSlide(slide))) {
      issues.push(warningIssue(
        "narrative_gap",
        "Narrative brief is missing the decision or action the deck should drive",
        "Set narrativeBrief.decisionOrAction so recommendation and ask slides have an explicit communication target.",
      ))
    }
    if (deck.narrativeBrief.keyClaims.length === 0 && slides.some(isRecommendationSlide)) {
      issues.push(warningIssue(
        "narrative_gap",
        "Narrative brief has no key claims for the recommendation to prove",
        "Add narrativeBrief.keyClaims that capture the main claims the deck must support with slide evidence.",
      ))
    }
    if (deck.narrativeBrief.objections.length === 0 && slides.some((slide) => isAskSlide(slide) || isRecommendationSlide(slide))) {
      issues.push(warningIssue(
        "narrative_gap",
        "Narrative brief has no stakeholder objections to handle",
        "Add likely objections or questions to narrativeBrief.objections so the story can anticipate resistance before the ask.",
      ))
    }
    if (deck.narrativeBrief.risks.length === 0 && slides.some(isRecommendationSlide)) {
      issues.push(warningIssue(
        "narrative_gap",
        "Narrative brief has no risks, assumptions, or tradeoffs for the recommendation",
        "Add risks, assumptions, caveats, or tradeoffs to narrativeBrief.risks so the recommendation does not overclaim certainty.",
      ))
    }
  }

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

function isDecisionOrientedDeck(deck: DeckSpec, slides: SlideSpec[]): boolean {
  return Boolean(
    deck.narrativeBrief?.decisionOrAction?.trim() ||
      slides.some((slide) => isAskSlide(slide) || isRecommendationSlide(slide)) ||
      /\b(decision|approve|approval|recommend(?:ation)?|go\/?no-go|action)\b|决策|批准|建议|行动/.test(deck.goal.toLowerCase()),
  )
}

function hasNarrativeBriefContent(brief: NarrativeBrief | undefined): boolean {
  return Boolean(
    brief?.audienceBeliefBefore?.trim() ||
      brief?.audienceBeliefAfter?.trim() ||
      brief?.decisionOrAction?.trim() ||
      brief?.narrativeArc?.trim() ||
      brief?.keyClaims.length ||
      brief?.objections.length ||
      brief?.risks.length,
  )
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

function isNavigationSlide(slide: SlideSpec): boolean {
  const text = slideSearchText(slide)
  return slide.layout === "toc" || /\b(table of contents|agenda|contents|outline|section guide)\b|目录|议程|大纲/.test(text)
}

function isIgnorableSourceMaterial(path: string): boolean {
  const normalized = normalizePath(path).replace(/^\.\//, "")
  const name = basename(normalized)
  return Boolean(
    name.startsWith("~$") ||
      /^(AGENTS|README(?:\.zh-CN)?|DECKS)\.md$/.test(name) ||
      name === DECKS_STATE_FILE ||
      normalized.startsWith("decks/") ||
      normalized.startsWith("researches/") ||
      normalized.startsWith("assets/") ||
      normalized.startsWith(".opencode/"),
  )
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

const FUTURE_STATE_SCOPE_PATTERN = /\b(20\d{2}|future|target-state|end state|roadmap|pathway|architecture|capabilit(?:y|ies)|autonomy|autonomous|self-organizing|ecosystem|ai manufacturing os|ai brain|digital workers|closed-loop|orchestration)\b|未来|目标态|路线图|架构|能力|自治|自组织|生态|智能体|闭环/

const EVIDENCE_BINDING_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "before",
  "between",
  "could",
  "deck",
  "from",
  "have",
  "into",
  "must",
  "only",
  "over",
  "page",
  "roadmap",
  "show",
  "slide",
  "that",
  "their",
  "there",
  "this",
  "through",
  "with",
  "would",
])

function normalizeSlides(slides: SlideSpec[]): SlideSpec[] {
  return slides
    .map((slide) => ({
      ...slide,
      title: slide.title ?? "",
      layout: slide.layout ?? "",
      components: slide.components ?? [],
      claimIds: normalizeTextList(slide.claimIds),
      claimRefs: normalizeSlideClaimRefs(slide.claimRefs),
      evidenceBindingIds: normalizeTextList(slide.evidenceBindingIds),
      content: slide.content ?? {},
      evidence: slide.evidence ?? [],
      status: slide.status ?? "planned",
    }))
    .sort((a, b) => a.index - b.index)
}

function normalizeSlideClaimRefs(refs: SlideClaimRef[] | undefined): SlideClaimRef[] {
  const seen = new Set<string>()
  const out: SlideClaimRef[] = []
  for (const ref of refs ?? []) {
    const claimId = cleanOptionalText(ref.claimId)
    if (!claimId) continue
    const role = isSlideClaimRefRole(ref.role) ? ref.role : "supporting"
    const key = `${claimId}:${role}`
    if (seen.has(key)) continue
    seen.add(key)
    const note = cleanOptionalText(ref.note)
    out.push({ claimId, role, ...(note ? { note } : {}) })
  }
  return out
}

function isSlideClaimRefRole(value: string | undefined): value is SlideClaimRefRole {
  return value === "primary" || value === "supporting" || value === "evidence" || value === "risk" || value === "objection"
}

function normalizeNarrativeBrief(brief: NarrativeBrief | undefined): NarrativeBrief | undefined {
  if (!brief) return undefined
  const normalized: NarrativeBrief = {
    audienceBeliefBefore: cleanOptionalText(brief.audienceBeliefBefore),
    audienceBeliefAfter: cleanOptionalText(brief.audienceBeliefAfter),
    decisionOrAction: cleanOptionalText(brief.decisionOrAction),
    narrativeArc: cleanOptionalText(brief.narrativeArc),
    keyClaims: normalizeTextList(brief.keyClaims),
    objections: normalizeTextList(brief.objections),
    risks: normalizeTextList(brief.risks),
  }
  if (
    !normalized.audienceBeliefBefore &&
    !normalized.audienceBeliefAfter &&
    !normalized.decisionOrAction &&
    !normalized.narrativeArc &&
    normalized.keyClaims.length === 0 &&
    normalized.objections.length === 0 &&
    normalized.risks.length === 0
  ) return undefined
  return normalized
}

function normalizeTextList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(cleanOptionalText).filter(Boolean) as string[])]
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const text = String(value ?? "").trim()
  return text || undefined
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
