import { createHash } from "crypto"
import type { DeckSpec, DecksState, DeckStateReadinessResult } from "../decks-state"
import { projectWorkspaceGraph } from "./graph"
import { activeHtmlDeckRenderTarget, ensureActiveHtmlDeckRenderTarget } from "./render-targets"
import type { ReviewSnapshot } from "./types"

export const MAX_REVIEW_SNAPSHOTS = 50

export interface ReviewSnapshotInput {
  slug: string
  result: DeckStateReadinessResult
  reviewedAt?: string
}

export function currentReviewInputHash(state: DecksState, slug?: string): string {
  return stableHash(stableStringify(reviewInputProjection(state, slug)))
}

export function activeReviewTargetId(state: DecksState): string | undefined {
  return activeHtmlDeckRenderTarget(state)?.id ?? ensureActiveHtmlDeckRenderTarget(state)?.id
}

export function createReviewSnapshot(state: DecksState, input: ReviewSnapshotInput): ReviewSnapshot {
  const reviewedAt = input.reviewedAt ?? new Date().toISOString()
  const targetId = activeReviewTargetId(state)
  const inputHash = currentReviewInputHash(state, input.slug)
  return {
    id: reviewSnapshotId(targetId, inputHash, reviewedAt),
    ...(targetId ? { targetId } : {}),
    inputHash,
    status: input.result.status ?? (input.result.ready ? "ready" : "blocked"),
    blockers: input.result.blockers,
    warnings: input.result.warnings,
    issues: input.result.issues,
    ...(input.result.evidenceCandidates ? { evidenceCandidates: input.result.evidenceCandidates } : {}),
    reviewedAt,
  }
}

export function appendReviewSnapshot(state: DecksState, snapshot: ReviewSnapshot): DecksState {
  const next = (state.reviews ?? []).filter((item) => item.id !== snapshot.id)
  next.push(snapshot)
  state.reviews = next
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))
    .slice(-MAX_REVIEW_SNAPSHOTS)
  return state
}

export function latestReviewSnapshotForTarget(state: DecksState, targetId?: string): ReviewSnapshot | undefined {
  const reviews = state.reviews ?? []
  const candidates = targetId ? reviews.filter((item) => item.targetId === targetId) : reviews
  return candidates.reduce<ReviewSnapshot | undefined>((latest, item) => {
    if (!latest) return item
    return item.reviewedAt.localeCompare(latest.reviewedAt) >= 0 ? item : latest
  }, undefined)
}

export function isReviewSnapshotCurrent(state: DecksState, snapshot: ReviewSnapshot, slug?: string): boolean {
  return snapshot.inputHash === currentReviewInputHash(state, slug)
}

function reviewInputProjection(state: DecksState, slug?: string): unknown {
  const key = slug || state.activeDeck || singleDeckKey(state.decks)
  const deck = key ? state.decks[key] : undefined
  const stableState = cloneForGraphProjection(state, key)
  return {
    version: state.version,
    activeDeck: key,
    workspace: {
      brief: state.workspace.brief,
      sourceMaterials: state.workspace.sourceMaterials,
      openQuestions: state.workspace.openQuestions,
    },
    deck: deck ? stableDeckProjection(deck) : undefined,
    renderTarget: activeHtmlDeckRenderTarget(state) ?? ensureActiveHtmlDeckRenderTarget(state),
    graph: deck ? projectWorkspaceGraph(stableState, { slug: key }) : undefined,
  }
}

function stableDeckProjection(deck: DeckSpec): unknown {
  return {
    slug: deck.slug,
    goal: deck.goal,
    audience: deck.audience,
    language: deck.language,
    outputPath: deck.outputPath,
    narrativeBrief: deck.narrativeBrief,
    theme: deck.theme,
    requiredInputs: deck.requiredInputs,
    researchPlan: deck.researchPlan,
    slides: deck.slides,
    assets: deck.assets,
  }
}

function cloneForGraphProjection(state: DecksState, slug?: string): DecksState {
  const clone = structuredClone(state) as DecksState
  const key = slug || clone.activeDeck || singleDeckKey(clone.decks)
  const deck = key ? clone.decks[key] : undefined
  if (deck) {
    deck.status = "planning"
    deck.writeReadiness = { status: "blocked", blockers: [] }
  }
  clone.actions = []
  clone.reviews = []
  return clone
}

function reviewSnapshotId(targetId: string | undefined, inputHash: string, reviewedAt: string): string {
  return `review:${targetId ?? "workspace"}:${inputHash.slice(0, 12)}:${stableHash(reviewedAt).slice(0, 8)}`
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`
}

function singleDeckKey(decks: Record<string, DeckSpec>): string | undefined {
  const keys = Object.keys(decks)
  return keys.length === 1 ? keys[0] : undefined
}
