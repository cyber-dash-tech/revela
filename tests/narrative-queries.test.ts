import { describe, expect, it } from "bun:test"
import { createEmptyDecksState, upsertDeck, upsertSlides, type DecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import {
  getArtifactClaimRefs,
  getClaimEvidenceBoard,
  getObjectionRiskClaimIndex,
  getSourceClaimIndex,
} from "../lib/narrative-state/queries"
import { recordArtifactRenderTarget } from "../lib/workspace-state/render-targets"
import { backfillSlideClaimRefsFromCoverage } from "../lib/narrative-state/coverage"

describe("narrative query services", () => {
  function queryState(): DecksState {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "query-demo",
      goal: "Approve a phased AI manufacturing pilot.",
      audience: "Board",
      outputPath: "decks/query-demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:query-demo",
      status: "ready_for_approval",
      audience: {
        primary: "Board",
        beliefBefore: "The board sees AI manufacturing as speculative.",
        beliefAfter: "The board sees a phased pilot as bounded and evidence-backed.",
      },
      decision: { action: "Approve the phased pilot.", decisionType: "approve" },
      thesis: { id: "thesis:pilot", statement: "A phased pilot captures upside while bounding risk.", confidence: "medium" },
      claims: [
        {
          id: "claim:supported",
          kind: "recommendation",
          text: "Phased pilot approval is the safer path.",
          importance: "central",
          evidenceRequired: true,
          evidenceStatus: "supported",
          supportedScope: "Pilot scope only.",
        },
        {
          id: "claim:partial",
          kind: "evidence",
          text: "Current line data supports initial automation gains.",
          importance: "supporting",
          evidenceRequired: true,
          evidenceStatus: "partial",
          unsupportedScope: "Does not prove lights-out manufacturing.",
        },
        {
          id: "claim:missing",
          kind: "opportunity",
          text: "Supplier ecosystem readiness is proven.",
          importance: "supporting",
          evidenceRequired: true,
          evidenceStatus: "missing",
        },
        {
          id: "claim:not-required",
          kind: "context",
          text: "The decision is about sequencing.",
          importance: "background",
          evidenceRequired: false,
          evidenceStatus: "not_required",
        },
      ],
      evidenceBindings: [
        {
          id: "evidence:supported:ops",
          claimId: "claim:supported",
          source: "Operations study",
          findingsFile: "researches/query-demo/ops.md",
          quote: "Pilot scope fits current operating constraints.",
          location: "section 2",
          strength: "strong",
          supportScope: "Pilot scope only.",
        },
        {
          id: "evidence:partial:line",
          claimId: "claim:partial",
          source: "Line data",
          sourcePath: "sources/line-data.xlsx",
          quote: "Automation reduced manual interventions by 18%.",
          location: "Sheet1!B2",
          strength: "partial",
          unsupportedScope: "No supplier readiness proof.",
        },
      ],
      objections: [{ id: "objection:roi", text: "ROI may be too uncertain.", claimId: "claim:supported", priority: "high", response: "Stage gates cap exposure." }],
      risks: [{ id: "risk:supplier", text: "Supplier readiness may lag.", claimId: "claim:partial", severity: "medium", mitigation: "Gate supplier integration separately." }],
      approvals: [],
      updatedAt: "2026-05-07T00:00:00.000Z",
    }
    state.narrative = normalizeNarrativeState(state)
    state.narrative.approvals.push({
      id: "approval:query-demo",
      narrativeHash: computeNarrativeHash(state.narrative),
      approvedAt: "2026-05-07T00:00:00.000Z",
      approvedBy: "user",
      scope: "narrative",
    })
    state = upsertSlides(state, "query-demo", [
      {
        index: 1,
        title: "Pilot Recommendation",
        purpose: "Show why the phased pilot is safer.",
        narrativeRole: "recommendation",
        layout: "two-col",
        components: ["card"],
        claimIds: ["claim:supported"],
        claimRefs: [{ claimId: "claim:supported", role: "primary" }],
        evidenceBindingIds: ["evidence:supported:ops"],
        content: { headline: "Phased pilot approval is the safer path.", bullets: ["Pilot scope only."] },
        evidence: [{ source: "Operations study", findingsFile: "researches/query-demo/ops.md", quote: "Pilot scope fits current operating constraints." }],
        status: "planned",
      },
      {
        index: 2,
        title: "Supporting Evidence",
        purpose: "Show supporting claims.",
        narrativeRole: "evidence",
        layout: "card-grid",
        components: ["card"],
        claimIds: ["claim:partial"],
        claimRefs: [{ claimId: "claim:partial", role: "supporting" }],
        evidenceBindingIds: ["evidence:partial:line"],
        content: { bullets: ["Current line data supports initial automation gains."] },
        evidence: [{ source: "Line data", sourcePath: "sources/line-data.xlsx", quote: "Automation reduced manual interventions by 18%." }],
        status: "planned",
      },
    ])
    recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/query-demo.html", type: "pdf", outputPath: "decks/query-demo.pdf" })
    return state
  }

  it("groups canonical claims by evidence status with source trace", () => {
    const board = getClaimEvidenceBoard(queryState())

    expect(board.claims.supported).toContainEqual(expect.objectContaining({
      id: "claim:supported",
      evidence: [expect.objectContaining({ findingsFile: "researches/query-demo/ops.md", quote: "Pilot scope fits current operating constraints." })],
    }))
    expect(board.claims.partial).toContainEqual(expect.objectContaining({ id: "claim:partial", unsupportedScope: "Does not prove lights-out manufacturing." }))
    expect(board.claims.missing).toContainEqual(expect.objectContaining({ id: "claim:missing" }))
    expect(board.claims.not_required).toContainEqual(expect.objectContaining({ id: "claim:not-required", evidenceRequired: false }))
  })

  it("indexes sources back to canonical claims", () => {
    const index = getSourceClaimIndex(queryState())

    expect(index).toContainEqual(expect.objectContaining({
      sourceKey: "researches/query-demo/ops.md",
      claims: [expect.objectContaining({ claimId: "claim:supported", claimText: "Phased pilot approval is the safer path.", strength: "strong" })],
    }))
    expect(index).toContainEqual(expect.objectContaining({
      sourceKey: "sources/line-data.xlsx",
      claims: [expect.objectContaining({ claimId: "claim:partial", unsupportedScope: "No supplier readiness proof." })],
    }))
  })

  it("maps objections and risks back to target claim text", () => {
    const index = getObjectionRiskClaimIndex(queryState())

    expect(index.objections).toContainEqual(expect.objectContaining({ text: "ROI may be too uncertain.", claimText: "Phased pilot approval is the safer path." }))
    expect(index.risks).toContainEqual(expect.objectContaining({ text: "Supplier readiness may lag.", claimText: "Current line data supports initial automation gains." }))
  })

  it("returns artifact-to-claim refs with page-level slide coverage", () => {
    const refs = getArtifactClaimRefs(queryState())

    expect(refs).toContainEqual(expect.objectContaining({
      type: "html_deck",
      claimIds: expect.arrayContaining(["claim:supported", "claim:partial"]),
      slideRefs: expect.arrayContaining([expect.objectContaining({ claimId: "claim:supported", slideIndex: 1, match: "metadata", role: "primary", location: "claimRefs:primary" })],),
    }))
    expect(refs).toContainEqual(expect.objectContaining({
      type: "pdf",
      claimIds: expect.arrayContaining(["claim:supported", "claim:partial"]),
      note: undefined,
    }))
  })

  it("marks artifact coverage stale when stored narrative hash differs", () => {
    const state = queryState()
    const html = state.renderTargets.find((target) => target.type === "html_deck")!
    html.data = { ...(html.data ?? {}), narrativeHash: "old-hash" }

    expect(getArtifactClaimRefs(state)).toContainEqual(expect.objectContaining({
      type: "html_deck",
      stale: true,
      staleReason: "Narrative hash changed after this artifact coverage was recorded.",
    }))
  })

  it("prefers explicit slide claim metadata over text inference", () => {
    const state = queryState()
    state.decks["query-demo"].slides[0].content = { headline: "A renamed artifact headline." }

    expect(getArtifactClaimRefs(state)).toContainEqual(expect.objectContaining({
      type: "html_deck",
      slideRefs: expect.arrayContaining([expect.objectContaining({ claimId: "claim:supported", slideIndex: 1, match: "metadata", role: "primary", location: "claimRefs:primary" })]),
    }))
  })

  it("falls back to flat claimIds and evidenceBindingIds with inferred roles", () => {
    const state = queryState()
    state.decks["query-demo"].slides[0].claimRefs = []
    state.decks["query-demo"].slides[1].claimRefs = []
    state.decks["query-demo"].slides[1].claimIds = []

    expect(getArtifactClaimRefs(state)).toContainEqual(expect.objectContaining({
      type: "html_deck",
      slideRefs: expect.arrayContaining([
        expect.objectContaining({ claimId: "claim:supported", slideIndex: 1, role: "primary", location: "claimIds" }),
        expect.objectContaining({ claimId: "claim:partial", slideIndex: 2, role: "evidence", location: "evidenceBindingIds" }),
      ]),
    }))
  })

  it("backfills fallback coverage into explicit slide claimRefs without changing narrative hash", () => {
    const state = queryState()
    const beforeHash = computeNarrativeHash(state.narrative!)
    state.decks["query-demo"].slides[0].claimRefs = []
    state.decks["query-demo"].slides[1].claimRefs = []
    state.decks["query-demo"].slides[1].claimIds = []

    const backfilled = backfillSlideClaimRefsFromCoverage(state)
    const deck = backfilled.state.decks["query-demo"]

    expect(backfilled.result).toMatchObject({ updated: true, addedCount: 2 })
    expect(computeNarrativeHash(backfilled.state.narrative!)).toBe(beforeHash)
    expect(deck.slides[0].claimRefs).toContainEqual(expect.objectContaining({ claimId: "claim:supported", role: "primary" }))
    expect(deck.slides[1].claimRefs).toContainEqual(expect.objectContaining({ claimId: "claim:partial", role: "evidence" }))
    expect(backfilled.state.renderTargets.find((target) => target.type === "html_deck")?.data).toMatchObject({
      narrativeHash: beforeHash,
      claimSlideRefs: expect.arrayContaining([
        expect.objectContaining({ claimId: "claim:supported", role: "primary", location: "claimRefs:primary" }),
        expect.objectContaining({ claimId: "claim:partial", role: "evidence", location: "claimRefs:evidence" }),
      ]),
    })
    expect(backfilled.state.actions).toContainEqual(expect.objectContaining({ type: "artifact.coverage_backfilled" }))
  })

})
