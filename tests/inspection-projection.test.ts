import { describe, expect, it } from "bun:test"
import { compileInspectionContext } from "../lib/inspection-context/compile"
import { matchInspectionElement } from "../lib/inspection-context/match"
import { projectInspectionMatch } from "../lib/inspection-context/project"
import { createEmptyDecksState, upsertDeck, upsertSlides } from "../lib/decks-state"

describe("inspection prompt projection", () => {
  function context() {
    let state = createEmptyDecksState()
    state.workspace.sourceMaterials = [{ path: "sources/market.pdf", type: "pdf", status: "extracted" }]
    state = upsertDeck(state, {
      slug: "projection-demo",
      goal: "Recommend whether to approve phased expansion.",
      audience: "Investment committee",
      language: "en",
      outputPath: "decks/projection-demo.html",
      narrativeBrief: {
        audienceBeliefBefore: "Expansion looks attractive but risky.",
        audienceBeliefAfter: "Phased expansion is justified with controls.",
        decisionOrAction: "Approve phased expansion.",
        narrativeArc: "context -> evidence -> risk -> ask",
        keyClaims: ["The market is large enough."],
        objections: ["Forecast quality may be weak."],
        risks: ["Execution risk remains material."],
      },
    })
    state = upsertSlides(state, "projection-demo", [
      {
        index: 1,
        title: "Market Context",
        purpose: "Frame the investment decision",
        narrativeRole: "context",
        layout: "two-col",
        components: ["card", "stat-card"],
        content: { headline: "Market demand has grown 25% since 2024", bullets: ["Expansion should be phased"] },
        evidence: [{
          source: "Market report",
          sourcePath: "sources/market.pdf",
          location: "page 4",
          quote: "Demand increased 25% from 2024 to 2025.",
          caveat: "Forecast excludes downside scenario.",
        }],
        status: "ready",
      },
      {
        index: 2,
        title: "Risk",
        purpose: "Show remaining execution risk",
        narrativeRole: "risk",
        layout: "two-col",
        components: ["card"],
        content: { headline: "Execution risk remains material", bullets: ["Hiring capacity is the main constraint"] },
        evidence: [{ source: "Operations notes" }],
        status: "ready",
      },
    ])
    return compileInspectionContext(state)
  }

  it("projects matched source trace into fixed inspector card inputs", () => {
    const snapshot = { slideIndex: 1, text: "Market demand has grown 25% since 2024", tagName: "h2", classList: ["headline"] }
    const ctx = context()
    const match = matchInspectionElement(ctx, snapshot)
    const projection = projectInspectionMatch(ctx, match, snapshot)

    expect(projection.deck.slug).toBe("projection-demo")
    expect(projection.selectedElement).toMatchObject({ slideIndex: 1, tagName: "h2", classList: ["headline"] })
    expect(projection.match.claim).toMatchObject({ origin: "headline", evidenceSensitive: true })
    expect(projection.cards.source.evidence[0]).toMatchObject({
      source: "Market report",
      sourcePath: "sources/market.pdf",
      location: "page 4",
      quote: "Demand increased 25% from 2024 to 2025.",
      hasDetail: true,
    })
    expect(projection.cards.caveats.caveats).toEqual(["Forecast excludes downside scenario."])
    expect(projection.cards.objective).toMatchObject({
      slidePurpose: "Frame the investment decision",
      narrativeRole: "context",
      decisionOrAction: "Approve phased expansion.",
    })
  })

  it("projects canonical claim ids, evidence bindings, and support boundaries", () => {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "canonical-projection-demo",
      goal: "Recommend whether to approve phased expansion.",
      audience: "Investment committee",
      outputPath: "decks/canonical-projection-demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:canonical-projection-demo",
      status: "approved",
      audience: { primary: "Investment committee", beliefBefore: "Unsure", beliefAfter: "Ready" },
      decision: { action: "Approve phased expansion." },
      claims: [{
        id: "claim:canonical-market",
        kind: "evidence",
        text: "Market demand has grown 25% since 2024",
        importance: "central",
        evidenceRequired: true,
        evidenceStatus: "partial",
        supportedScope: "Current demand growth.",
        unsupportedScope: "Long-term forecast.",
        caveats: ["Forecast excludes downside scenario."],
      }],
      evidenceBindings: [{
        id: "evidence:canonical-market",
        claimId: "claim:canonical-market",
        source: "Market report",
        sourcePath: "sources/market.pdf",
        quote: "Demand increased 25% from 2024 to 2025.",
        location: "page 4",
        supportScope: "Current demand growth.",
        unsupportedScope: "Long-term forecast.",
        strength: "partial",
      }],
      objections: [],
      risks: [],
      approvals: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    state = upsertSlides(state, "canonical-projection-demo", [{
      index: 1,
      title: "Market Context",
      purpose: "Frame the investment decision",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      claimRefs: [{ claimId: "claim:canonical-market", role: "primary" }],
      evidenceBindingIds: ["evidence:canonical-market"],
      content: { headline: "Market demand has grown 25% since 2024" },
      evidence: [],
      status: "ready",
    }])
    const ctx = compileInspectionContext(state)
    const match = matchInspectionElement(ctx, { slideIndex: 1, text: "Market demand has grown 25% since 2024" })
    const projection = projectInspectionMatch(ctx, match, { slideIndex: 1, text: "Market demand has grown 25% since 2024" })

    expect(projection.match.claim).toMatchObject({
      id: "claim:canonical-market",
      canonicalClaimId: "claim:canonical-market",
      origin: "narrative",
      evidenceSupport: "weak",
      evidenceBindingIds: ["evidence:canonical-market"],
      supportedScope: "Current demand growth.",
      unsupportedScope: "Long-term forecast.",
      caveats: ["Forecast excludes downside scenario."],
    })
    expect(projection.cards.source.evidence[0]).toMatchObject({
      evidenceBindingId: "evidence:canonical-market",
      claimId: "claim:canonical-market",
      supportScope: "Current demand growth.",
      unsupportedScope: "Long-term forecast.",
      strength: "partial",
    })
  })

  it("projects weak evidence gaps without promoting source materials to proof", () => {
    const snapshot = { slideIndex: 2, text: "Execution risk remains material" }
    const ctx = context()
    const match = matchInspectionElement(ctx, snapshot)
    const projection = projectInspectionMatch(ctx, match, snapshot)

    expect(projection.cards.source.evidence).toEqual([expect.objectContaining({ source: "Operations notes", hasDetail: false })])
    expect(projection.cards.source.weakSourceGaps).toEqual([expect.objectContaining({ type: "weak_evidence" })])
    expect(projection.cards.evidence.evidenceSupport).toBe("weak")
    expect(projection.cards.appendix.relatedRisks).toContain("Execution risk remains material.")
    expect(projection.cards.appendix.relatedRisks).toContain("Execution risk remains material")
  })

  it("keeps projection compact by trimming long selected text and quotes", () => {
    const ctx = context()
    const match = matchInspectionElement(ctx, { slideIndex: 1 })
    match.evidence[0].quote = "A".repeat(800)
    const projection = projectInspectionMatch(ctx, match, { slideIndex: 1, text: "B".repeat(800) })

    expect(projection.selectedElement.text?.length).toBeLessThanOrEqual(700)
    expect(projection.cards.source.evidence[0].quote?.length).toBeLessThanOrEqual(500)
  })
})
