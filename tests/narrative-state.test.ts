import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { narrativeToBrief } from "../lib/narrative-state/project-compat"

describe("narrative state", () => {
  function legacyDecisionDeck() {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "narrative-demo",
      goal: "Recommend whether to approve phased expansion.",
      audience: "Investment committee",
      outputPath: "decks/narrative-demo.html",
      narrativeBrief: {
        audienceBeliefBefore: "The committee is unsure about demand.",
        audienceBeliefAfter: "The committee trusts phased expansion.",
        decisionOrAction: "Approve phased expansion.",
        narrativeArc: "Demand proof supports a phased approval with explicit execution risk.",
        keyClaims: ["Demand supports phased expansion."],
        objections: ["The forecast may be too optimistic."],
        risks: ["Execution risk remains material."],
      },
    })
    state = upsertSlides(state, "narrative-demo", [{
      index: 1,
      title: "Demand Proof",
      purpose: "Show why phased expansion is credible",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      content: {
        headline: "Demand supports phased expansion.",
        bullets: ["Market demand grew 25% since 2024"],
      },
      evidence: [{
        source: "Market report",
        findingsFile: "researches/narrative-demo/market.md",
        location: "page 4",
        quote: "Demand increased 25% from 2024 to 2025.",
      }],
      status: "ready",
    }])
    return state
  }

  it("migrates legacy narrativeBrief and slides into canonical narrative state", () => {
    const narrative = normalizeNarrativeState(legacyDecisionDeck())

    expect(narrative).toMatchObject({
      version: 1,
      status: "draft",
      audience: {
        primary: "Investment committee",
        beliefBefore: "The committee is unsure about demand.",
        beliefAfter: "The committee trusts phased expansion.",
      },
      decision: { action: "Approve phased expansion.", decisionType: "approve" },
      thesis: { statement: "Demand proof supports a phased approval with explicit execution risk." },
    })
    expect(narrative.claims).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^claim:/),
      text: "Demand supports phased expansion.",
      importance: "central",
      evidenceStatus: "partial",
    }))
    expect(narrative.evidenceBindings).toContainEqual(expect.objectContaining({
      claimId: narrative.claims.find((claim) => claim.text === "Demand supports phased expansion.")?.id,
      findingsFile: "researches/narrative-demo/market.md",
      location: "page 4",
      strength: "partial",
    }))
    expect(narrative.objections).toContainEqual(expect.objectContaining({ text: "The forecast may be too optimistic." }))
    expect(narrative.risks).toContainEqual(expect.objectContaining({ text: "Execution risk remains material." }))
  })

  it("preserves canonical narrative when DECKS.json is normalized", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-state-"))
    const state = legacyDecisionDeck()
    const narrative = normalizeNarrativeState(state)
    state.narrative = { ...narrative, status: "ready_for_approval", updatedAt: "2026-05-06T00:00:00.000Z" }

    writeDecksState(workspaceRoot, state)
    const reloaded = readDecksState(workspaceRoot)

    expect(reloaded.narrative).toMatchObject({
      id: narrative.id,
      status: "ready_for_approval",
      updatedAt: "2026-05-06T00:00:00.000Z",
    })
    expect(reloaded.decks["narrative-demo"].narrativeBrief?.decisionOrAction).toBe("Approve phased expansion.")
  })

  it("normalizes old workspaces by adding top-level canonical narrative", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-migrate-"))
    const state = legacyDecisionDeck()

    writeDecksState(workspaceRoot, state)
    const reloaded = readDecksState(workspaceRoot)

    expect(reloaded.narrative).toMatchObject({
      audience: { primary: "Investment committee" },
      decision: { action: "Approve phased expansion." },
    })
    expect(reloaded.narrative?.approvals).toEqual([])
    expect(reloaded.decks["narrative-demo"].writeReadiness.status).toBe("blocked")
  })

  it("keeps narrative hash independent from approvals, timestamps, and deck write readiness", () => {
    const state = legacyDecisionDeck()
    const narrative = normalizeNarrativeState(state)
    const before = computeNarrativeHash(narrative)
    narrative.updatedAt = "2099-01-01T00:00:00.000Z"
    narrative.status = "approved"
    narrative.approvals.push({
      id: "approval:test",
      narrativeHash: before,
      approvedAt: "2099-01-01T00:00:00.000Z",
      approvedBy: "user",
      scope: "narrative",
    })
    state.decks["narrative-demo"].writeReadiness = { status: "ready", blockers: [], lastReviewedAt: "2099-01-01T00:00:00.000Z" }

    expect(computeNarrativeHash(narrative)).toBe(before)
  })

  it("changes narrative hash when a central claim changes", () => {
    const narrative = normalizeNarrativeState(legacyDecisionDeck())
    const before = computeNarrativeHash(narrative)
    narrative.claims[0].text = "Demand does not yet support phased expansion."

    expect(computeNarrativeHash(narrative)).not.toBe(before)
  })

  it("projects canonical narrative back to the legacy narrativeBrief compatibility shape", () => {
    const brief = narrativeToBrief(normalizeNarrativeState(legacyDecisionDeck()))

    expect(brief).toEqual({
      audienceBeliefBefore: "The committee is unsure about demand.",
      audienceBeliefAfter: "The committee trusts phased expansion.",
      decisionOrAction: "Approve phased expansion.",
      narrativeArc: "Demand proof supports a phased approval with explicit execution risk.",
      keyClaims: ["Demand supports phased expansion."],
      objections: ["The forecast may be too optimistic."],
      risks: ["Execution risk remains material."],
    })
  })
})
