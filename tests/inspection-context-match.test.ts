import { describe, expect, it } from "bun:test"
import { compileInspectionContext } from "../lib/inspection-context/compile"
import { matchInspectionElement } from "../lib/inspection-context/match"
import { createEmptyDecksState, upsertDeck, upsertSlides } from "../lib/decks-state"

describe("inspection element matching", () => {
  function context() {
    let state = createEmptyDecksState()
    state.workspace.sourceMaterials = [{ path: "sources/market.pdf", type: "pdf", status: "extracted" }]
    state = upsertDeck(state, {
      slug: "match-demo",
      goal: "Recommend whether to approve expansion.",
      outputPath: "decks/match-demo.html",
    })
    state = upsertSlides(state, "match-demo", [
      {
        index: 1,
        title: "Market Context",
        purpose: "Frame the decision",
        narrativeRole: "context",
        layout: "two-col",
        components: ["card"],
        content: {
          headline: "Market demand has grown 25% since 2024",
          bullets: ["Expansion should be phased", "Customer demand leads capacity"],
        },
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
        purpose: "Show risk",
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

  function canonicalContext() {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "canonical-match-demo",
      goal: "Recommend whether to approve expansion.",
      outputPath: "decks/canonical-match-demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:canonical-match-demo",
      status: "approved",
      audience: { primary: "Investment committee", beliefBefore: "Unsure", beliefAfter: "Ready" },
      decision: { action: "Approve phased expansion." },
      claims: [{
        id: "claim:canonical-market",
        kind: "evidence",
        text: "Market demand has grown 25% since 2024",
        importance: "central",
        evidenceRequired: true,
        evidenceStatus: "supported",
      }],
      evidenceBindings: [{
        id: "evidence:canonical-market",
        claimId: "claim:canonical-market",
        source: "Market report",
        sourcePath: "sources/market.pdf",
        quote: "Demand increased 25% from 2024 to 2025.",
        location: "page 4",
        strength: "strong",
      }],
      objections: [],
      risks: [],
      approvals: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    state = upsertSlides(state, "canonical-match-demo", [{
      index: 1,
      title: "Market Context",
      purpose: "Frame the decision",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      claimRefs: [{ claimId: "claim:canonical-market", role: "primary" }],
      evidenceBindingIds: ["evidence:canonical-market"],
      content: { headline: "Market demand has grown 25% since 2024", bullets: ["Expansion should be phased"] },
      evidence: [],
      status: "ready",
    }])
    return compileInspectionContext(state)
  }

  it("matches selected headline text to a claim with high confidence", () => {
    const result = matchInspectionElement(context(), {
      slideIndex: 1,
      text: "Market demand has grown 25% since 2024",
      tagName: "h2",
    })

    expect(result.confidence).toBe("high")
    expect(result.slide?.index).toBe(1)
    expect(result.claim?.origin).toBe("headline")
    expect(result.evidence[0]).toMatchObject({ sourcePath: "sources/market.pdf", hasDetail: true })
    expect(result.caveats).toEqual(["Forecast excludes downside scenario."])
  })

  it("prefers canonical narrative claims over slide-text heuristic claims", () => {
    const result = matchInspectionElement(canonicalContext(), {
      slideIndex: 1,
      text: "Market demand has grown 25% since 2024",
      tagName: "h2",
    })

    expect(result.confidence).toBe("high")
    expect(result.claim).toMatchObject({
      id: "claim:canonical-market",
      canonicalClaimId: "claim:canonical-market",
      origin: "narrative",
      evidenceBindingIds: ["evidence:canonical-market"],
    })
    expect(result.evidence[0]).toMatchObject({ evidenceBindingId: "evidence:canonical-market", claimId: "claim:canonical-market" })
  })

  it("matches selected bullet text to a claim", () => {
    const result = matchInspectionElement(context(), {
      slideIndex: 1,
      text: "Expansion should be phased",
      tagName: "li",
    })

    expect(result.confidence).toBe("high")
    expect(result.claim?.origin).toBe("bullet")
    expect(result.claim?.text).toBe("Expansion should be phased")
  })

  it("uses conservative contains matching for partial selected text", () => {
    const result = matchInspectionElement(context(), {
      slideIndex: 1,
      text: "demand has grown 25%",
    })

    expect(result.confidence).toBe("medium")
    expect(result.claim?.text).toBe("Market demand has grown 25% since 2024")
  })

  it("returns whole-slide context when only slideIndex is available", () => {
    const result = matchInspectionElement(context(), { slideIndex: 2 })

    expect(result.confidence).toBe("medium")
    expect(result.slide?.index).toBe(2)
    expect(result.claim).toBeUndefined()
    expect(result.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ source: "Operations notes" })]))
    expect(result.gaps).toContainEqual(expect.objectContaining({ type: "weak_evidence" }))
  })

  it("does not treat source materials as evidence when no claim matches", () => {
    const result = matchInspectionElement(context(), { text: "unmatched selected text" })

    expect(result.confidence).toBe("low")
    expect(result.claim).toBeUndefined()
    expect(result.slide?.index).toBe(1)
    expect(result.evidence[0]).toMatchObject({ source: "Market report" })
    expect(result.evidence.some((item) => item.source === "sources/market.pdf")).toBe(false)
  })

  it("falls back to whole-deck text matching when slideIndex points at the wrong slide", () => {
    const result = matchInspectionElement(context(), {
      slideIndex: 2,
      text: "Market demand has grown 25% since 2024",
    })

    expect(result.confidence).toBe("high")
    expect(result.reason).toBe("Exact normalized text match after slideIndex fallback.")
    expect(result.slide?.index).toBe(1)
    expect(result.evidence[0]).toMatchObject({ source: "Market report", sourcePath: "sources/market.pdf" })
  })

  it("returns no match for an invalid slide index", () => {
    const result = matchInspectionElement(context(), { slideIndex: 99, text: "unmatched selected text" })

    expect(result.confidence).toBe("none")
    expect(result.slide).toBeUndefined()
    expect(result.evidence).toEqual([])
  })
})
