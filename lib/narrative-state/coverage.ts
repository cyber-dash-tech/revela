import { type DecksState, type SlideClaimRef, type SlideClaimRefRole } from "../decks-state"
import { recordWorkspaceAction } from "../workspace-state/actions"
import { ensureActiveHtmlDeckRenderTarget } from "../workspace-state/render-targets"
import { computeNarrativeHash } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import { getClaimSlideRefs, type ClaimSlideRef } from "./queries"

export interface BackfillSlideClaimRefsResult {
  updated: boolean
  addedCount: number
  slideCount: number
  narrativeHash: string
  refs: ClaimSlideRef[]
}

export function backfillSlideClaimRefsFromCoverage(state: DecksState): { state: DecksState; result: BackfillSlideClaimRefsResult } {
  const narrative = normalizeNarrativeState(state)
  const narrativeHash = computeNarrativeHash(narrative)
  const deckKey = state.activeDeck || Object.keys(state.decks)[0]
  const deck = deckKey ? state.decks[deckKey] : undefined
  if (!deck) {
    return { state: { ...state, narrative }, result: { updated: false, addedCount: 0, slideCount: 0, narrativeHash, refs: [] } }
  }

  const refs = getClaimSlideRefs({ ...state, narrative }, deck)
  const refsBySlide = new Map<number, ClaimSlideRef[]>()
  for (const ref of refs) refsBySlide.set(ref.slideIndex, [...(refsBySlide.get(ref.slideIndex) ?? []), ref])

  let addedCount = 0
  const slides = deck.slides.map((slide) => {
    const existing = [...(slide.claimRefs ?? [])]
    const seen = new Set(existing.map((ref) => `${ref.claimId}:${ref.role}`))
    const additions: SlideClaimRef[] = []
    for (const ref of refsBySlide.get(slide.index) ?? []) {
      const role = backfilledRole(ref.role)
      const key = `${ref.claimId}:${role}`
      if (seen.has(key)) continue
      seen.add(key)
      additions.push({ claimId: ref.claimId, role, note: backfillNote(ref) })
    }
    if (additions.length === 0) return slide
    addedCount += additions.length
    return { ...slide, claimRefs: [...existing, ...additions] }
  })

  const next: DecksState = {
    ...state,
    narrative,
    decks: {
      ...state.decks,
      [deckKey]: {
        ...deck,
        slides,
      },
    },
  }

  const updatedRefs = getClaimSlideRefs(next, next.decks[deckKey])
  const htmlTarget = ensureActiveHtmlDeckRenderTarget(next)
  if (htmlTarget) {
    htmlTarget.data = {
      ...(htmlTarget.data ?? {}),
      narrativeId: narrative.id,
      narrativeHash,
      claimSlideRefs: updatedRefs.map((ref) => ({
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

  if (addedCount > 0) {
    recordWorkspaceAction(next, {
      type: "artifact.coverage_backfilled",
      actor: "revela-decks",
      inputs: { activeDeck: deckKey, narrativeId: narrative.id },
      outputs: { addedCount, slideCount: slides.length, narrativeHash },
      status: "success",
      summary: `Backfilled ${addedCount} slide claim reference${addedCount === 1 ? "" : "s"} from current artifact coverage.`,
      nodeIds: [narrative.id, `artifact:${deck.outputPath ?? deckKey}`],
    })
  }

  return { state: next, result: { updated: addedCount > 0, addedCount, slideCount: slides.length, narrativeHash, refs: updatedRefs } }
}

function backfilledRole(role: SlideClaimRefRole): SlideClaimRefRole {
  return role
}

function backfillNote(ref: ClaimSlideRef): string {
  if (ref.match === "metadata") return `Backfilled from ${ref.location}.`
  if (ref.match === "content") return `Backfilled from content match at ${ref.location}.`
  return "Backfilled from slide evidence trace."
}
