import { describe, expect, it } from "bun:test"
import { createEmptyDecksState, upsertDeck, type DecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import {
  classifyNarrativeImpact,
  getArtifactClaimRefs,
  getClaimEvidenceBoard,
  getObjectionRiskClaimIndex,
  getSourceClaimIndex,
} from "../lib/narrative-state/queries"
import { recordArtifactRenderTarget } from "../lib/workspace-state/render-targets"

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
    recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/query-demo.html", type: "pdf", outputPath: "decks/query-demo.pdf" })
    state.renderTargets[0].sourceNodeIds.push("claim:supported")
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

  it("returns primitive artifact-to-claim refs without page-level coverage", () => {
    const refs = getArtifactClaimRefs(queryState())

    expect(refs).toContainEqual(expect.objectContaining({ type: "html_deck", claimIds: ["claim:supported"] }))
    expect(refs).toContainEqual(expect.objectContaining({ type: "pdf", note: "Claim-to-slide/page coverage is not computed yet; page-level artifact coverage belongs to Phase 4." }))
  })

  it("classifies narrative-impacting, artifact-only, and ambiguous edits", () => {
    expect(classifyNarrativeImpact({ comment: "Change the recommendation and caveat on this slide" })).toMatchObject({
      classification: "narrative-impacting",
      recommendedPath: "update_narrative_first",
    })
    expect(classifyNarrativeImpact({ comment: "Fix spacing and align the cards" })).toMatchObject({
      classification: "artifact-only",
      recommendedPath: "artifact_edit",
    })
    expect(classifyNarrativeImpact({ comment: "Make this better" })).toMatchObject({
      classification: "ambiguous",
      recommendedPath: "clarify_or_update_narrative_first",
    })
  })
})
