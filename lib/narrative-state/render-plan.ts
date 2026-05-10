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
    },
  }
}

function buildSlides(narrative: NarrativeStateV1): SlideSpec[] {
  const slides: SlideSpec[] = []
  const centralClaims = narrative.claims.filter((claim) => claim.importance === "central")
  const supportingClaims = narrative.claims.filter((claim) => claim.importance !== "central")
  const evidenceByClaim = new Map<string, NarrativeEvidenceBinding[]>()
  for (const binding of narrative.evidenceBindings) {
    const list = evidenceByClaim.get(binding.claimId) ?? []
    list.push(binding)
    evidenceByClaim.set(binding.claimId, list)
  }

  slides.push({
    index: slides.length + 1,
    title: "Decision Context",
    purpose: "Frame the audience belief shift and decision required before presenting the recommendation.",
    narrativeRole: "context",
    layout: "cover",
    qa: false,
    components: [],
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
  })

  for (const claim of centralClaims) slides.push(claimSlide(slides.length + 1, claim, evidenceByClaim.get(claim.id) ?? []))
  if (supportingClaims.length > 0) {
    const supportingBindings = supportingClaims.flatMap((claim) => evidenceByClaim.get(claim.id) ?? [])
    slides.push({
      index: slides.length + 1,
      title: "Supporting Logic",
      purpose: "Connect supporting claims to the central recommendation without overloading the main proof slides.",
      narrativeRole: "evidence",
      layout: "card-grid",
      qa: true,
      components: ["card"],
      claimIds: supportingClaims.map((claim) => claim.id),
      claimRefs: supportingClaims.map((claim) => ({ claimId: claim.id, role: "supporting" as const })),
      evidenceBindingIds: supportingBindings.map((binding) => binding.id),
      content: {
        headline: "Supporting claims and boundaries",
        bullets: supportingClaims.slice(0, 5).map((claim) => claim.text),
      },
      evidence: supportingBindings.map(evidenceRefFromBinding),
      status: "planned",
    })
  }

  if (narrative.risks.length > 0 || narrative.objections.length > 0) {
    const challengedClaimRefs = [
      ...narrative.risks.map((risk) => risk.claimId ? { claimId: risk.claimId, role: "risk" as const } : undefined).filter((ref): ref is { claimId: string; role: "risk" } => Boolean(ref)),
      ...narrative.objections.map((objection) => objection.claimId ? { claimId: objection.claimId, role: "objection" as const } : undefined).filter((ref): ref is { claimId: string; role: "objection" } => Boolean(ref)),
    ]
    const challengedClaimIds = [...new Set(challengedClaimRefs.map((ref) => ref.claimId))]
    slides.push({
      index: slides.length + 1,
      title: "Risks And Objections",
      purpose: "Make caveats and stakeholder objections visible before asking for a decision.",
      narrativeRole: "risk",
      layout: "two-col",
      qa: true,
      components: ["card"],
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
    })
  }

  slides.push({
    index: slides.length + 1,
    title: "Decision Ask",
    purpose: "Close with the explicit decision or action requested from the audience.",
    narrativeRole: "ask",
    layout: "closing",
    qa: false,
    components: [],
    content: {
      headline: narrative.decision.action || "Confirm the decision",
      bullets: narrative.decision.consequenceOfNoDecision ? [`If no decision: ${narrative.decision.consequenceOfNoDecision}`] : [],
    },
    evidence: [],
    status: "planned",
  })

  return slides
}

function claimSlide(index: number, claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): SlideSpec {
  return {
    index,
    title: titleFromClaim(claim),
    purpose: `Prove or bound this ${claim.importance} ${claim.kind} claim for the audience.`,
    narrativeRole: claim.kind === "risk" || claim.kind === "assumption" ? "risk" : claim.kind === "ask" ? "ask" : claim.kind === "recommendation" ? "recommendation" : "evidence",
    layout: "two-col",
    qa: true,
    components: ["card"],
    claimIds: [claim.id],
    claimRefs: [{ claimId: claim.id, role: "primary" }],
    evidenceBindingIds: bindings.map((binding) => binding.id),
    content: {
      headline: claim.text,
      bullets: [claim.supportedScope, claim.unsupportedScope ? `Unsupported scope: ${claim.unsupportedScope}` : undefined, ...(claim.caveats ?? [])].filter((item): item is string => Boolean(item)),
    },
    evidence: bindings.map(evidenceRefFromBinding),
    status: "planned",
  }
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

function titleFromClaim(claim: NarrativeClaim): string {
  const words = claim.text.split(/\s+/).filter(Boolean).slice(0, 6).join(" ")
  return words || claim.kind
}

function hasCurrentApprovalOrOverride(narrative: NarrativeStateV1, narrativeHash: string): boolean {
  return narrative.approvals.some((approval) => approval.narrativeHash === narrativeHash && (approval.scope === "narrative" && approval.approvedBy === "user" || approval.scope === "render_override" || approval.approvedBy === "override"))
}
