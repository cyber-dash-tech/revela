import { describe, expect, it } from "bun:test"
import { compileInspectionContext } from "../lib/inspection-context/compile"
import { createEmptyDecksState, upsertDeck, upsertSlides } from "../lib/decks-state"

describe("inspection context compiler", () => {
  function stateWithDeck() {
    let state = createEmptyDecksState()
    state.workspace.sourceMaterials = [{
      path: "sources/market.pdf",
      type: "pdf",
      status: "extracted",
      summary: "Market report candidate source.",
    }]
    state = upsertDeck(state, {
      slug: "inspection-demo",
      goal: "Recommend whether to approve expansion.",
      audience: "Investment committee",
      language: "en",
      outputPath: "decks/inspection-demo.html",
      narrativeBrief: {
        audienceBeliefBefore: "The committee is uncertain about expansion risk.",
        audienceBeliefAfter: "The committee believes phased expansion is justified.",
        decisionOrAction: "Approve phased expansion.",
        narrativeArc: "context -> evidence -> recommendation -> risk -> ask",
        keyClaims: ["The market is large enough to justify expansion."],
        objections: ["The forecast may be too optimistic."],
        risks: ["Execution risk remains material."],
      },
    })
    state = upsertSlides(state, "inspection-demo", [
      {
        index: 1,
        title: "Market Context",
        purpose: "Frame the decision",
        narrativeRole: "context",
        layout: "two-col",
        components: ["card"],
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
        title: "Execution Risk",
        purpose: "Expose delivery risk",
        narrativeRole: "risk",
        layout: "two-col",
        components: ["card"],
        content: { headline: "Execution risk remains material", bullets: ["Hiring capacity is the main constraint"] },
        evidence: [{ source: "Operations interview notes" }],
        status: "ready",
      },
    ])
    return state
  }

  it("preserves narrative state, slide text, and source trace", () => {
    const context = compileInspectionContext(stateWithDeck())

    expect(context.slug).toBe("inspection-demo")
    expect(context.goal).toContain("Recommend")
    expect(context.narrativeBrief?.decisionOrAction).toBe("Approve phased expansion.")
    expect(context.slides[0].claims.some((claim) => claim.text === "Market demand has grown 25% since 2024")).toBe(true)
    expect(context.slides[0].evidence[0]).toMatchObject({
      slideIndex: 1,
      slideTitle: "Market Context",
      sourcePath: "sources/market.pdf",
      location: "page 4",
      quote: "Demand increased 25% from 2024 to 2025.",
      caveat: "Forecast excludes downside scenario.",
      hasDetail: true,
    })
  })

  it("marks weak source-only evidence without inventing detail", () => {
    const context = compileInspectionContext(stateWithDeck())
    const riskClaim = context.slides[1].claims.find((claim) => claim.text === "Execution risk remains material")

    expect(riskClaim?.evidenceSensitive).toBe(true)
    expect(riskClaim?.evidenceSupport).toBe("weak")
    expect(riskClaim?.gaps).toContainEqual(expect.objectContaining({
      type: "weak_evidence",
      slideIndex: 2,
      claimText: "Execution risk remains material",
    }))
    expect(context.slides[1].evidence[0]).toMatchObject({ source: "Operations interview notes", hasDetail: false })
  })

  it("treats source materials as candidate context, not proof", () => {
    const state = stateWithDeck()
    state.decks["inspection-demo"].slides[0].evidence = []

    const context = compileInspectionContext(state)
    const marketClaim = context.slides[0].claims.find((claim) => claim.text === "Market demand has grown 25% since 2024")

    expect(context.sourceMaterials[0]).toMatchObject({ path: "sources/market.pdf", linkedEvidenceCount: 0 })
    expect(marketClaim?.evidenceSupport).toBe("unknown")
    expect(marketClaim?.gaps).toContainEqual(expect.objectContaining({ type: "missing_evidence" }))
  })

  it("builds appendix and narrative risk context only from recorded state", () => {
    const context = compileInspectionContext(stateWithDeck())

    expect(context.appendixCandidates).toContainEqual(expect.objectContaining({
      slideIndex: 1,
      reason: expect.stringContaining("caveats"),
    }))
    expect(context.appendixCandidates).toContainEqual(expect.objectContaining({
      slideIndex: 2,
      reason: expect.stringContaining("Risk or assumption"),
    }))
    expect(context.objectionContext).toEqual([{ text: "The forecast may be too optimistic.", source: "narrativeBrief" }])
    expect(context.riskContext).toContainEqual({ text: "Execution risk remains material.", source: "narrativeBrief" })
    expect(context.riskContext).toContainEqual(expect.objectContaining({
      text: "Execution risk remains material",
      source: "slide",
      slideIndex: 2,
    }))
  })
})
