import { describe, expect, it } from "bun:test"
import { compileInspectionContext } from "../lib/inspection-context/compile"
import { matchInspectionElement } from "../lib/inspection-context/match"
import { projectInspectionMatch } from "../lib/inspection-context/project"
import { buildDeterministicInspectionResult } from "../lib/inspection-context/result"
import { createEmptyDecksState, upsertDeck, upsertSlides } from "../lib/decks-state"

describe("inspection result contract", () => {
  function context(kind: "supported" | "weak" | "missing") {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: `${kind}-result-demo`,
      goal: "Recommend whether to approve expansion.",
      audience: "Investment committee",
      outputPath: `decks/${kind}-result-demo.html`,
      narrativeBrief: {
        audienceBeliefBefore: "The committee is uncertain.",
        audienceBeliefAfter: "The committee trusts the recommendation.",
        decisionOrAction: "Approve expansion.",
        narrativeArc: "context -> evidence -> ask",
        keyClaims: [],
        objections: [],
        risks: [],
      },
    })
    const evidence = kind === "supported"
      ? [{ source: "Market report", sourcePath: "sources/market.pdf", location: "page 4", quote: "Demand increased 25%.", caveat: "Base case only." }]
      : kind === "weak"
        ? [{ source: "Market report" }]
        : []
    state = upsertSlides(state, `${kind}-result-demo`, [{
      index: 1,
      title: "Market Context",
      purpose: "Frame the decision",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      content: { headline: "Market demand has grown 25% since 2024" },
      evidence,
      status: "ready",
    }])
    return compileInspectionContext(state)
  }

  function result(kind: "supported" | "weak" | "missing") {
    const ctx = context(kind)
    const snapshot = { slideIndex: 1, text: "Market demand has grown 25% since 2024" }
    const match = matchInspectionElement(ctx, snapshot)
    const projection = projectInspectionMatch(ctx, match, snapshot)
    return buildDeterministicInspectionResult(projection, { requestId: `${kind}-request` })
  }

  it("builds stable success cards for detailed evidence", () => {
    const inspection = result("supported")

    expect(inspection).toMatchObject({
      version: 1,
      requestId: "supported-request",
      status: "success",
      matchConfidence: "high",
      slide: { index: 1, title: "Market Context" },
      cards: {
        purpose: { status: "clear", role: "evidence" },
        source: { status: "supported", matchedClaim: "Market demand has grown 25% since 2024" },
      },
    })
    expect(inspection.cards.source.sources[0]).toMatchObject({ sourcePath: "sources/market.pdf", location: "page 4" })
    expect(inspection.cards.source.caveats).toContain("Base case only.")
  })

  it("labels source-only evidence as weak", () => {
    const inspection = result("weak")

    expect(inspection.cards.source.status).toBe("weak")
    expect(inspection.cards.source.warnings).toContain("Matched evidence is source-only and lacks quote, location, URL, caveat, findings file, or source path detail.")
    expect(inspection.cards.source.gaps[0]).toContain("source-only evidence")
  })

  it("labels missing evidence-sensitive claims as unsupported", () => {
    const inspection = result("missing")

    expect(inspection.cards.source.status).toBe("unsupported")
    expect(inspection.cards.source.warnings).toContain("Matched evidence-sensitive claim has no slide-level evidence trace.")
    expect(inspection.cards.source.gaps[0]).toContain("no slide-level evidence trace")
  })

  it("does not force support or fixes for non-evidence content", () => {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "nonclaim-result-demo",
      goal: "Explain the meeting flow.",
      audience: "Leadership team",
      outputPath: "decks/nonclaim-result-demo.html",
    })
    state = upsertSlides(state, "nonclaim-result-demo", [{
      index: 1,
      title: "Agenda",
      purpose: "Orient the audience to the decision flow",
      narrativeRole: "context",
      layout: "summary",
      components: ["card"],
      content: { headline: "Today we align on priorities and next steps" },
      evidence: [],
      status: "ready",
    }])

    const ctx = compileInspectionContext(state)
    const snapshot = { slideIndex: 1, text: "Today we align on priorities and next steps" }
    const match = matchInspectionElement(ctx, snapshot)
    const projection = projectInspectionMatch(ctx, match, snapshot)
    const inspection = buildDeterministicInspectionResult(projection, { requestId: "nonclaim-request" })

    expect(inspection.cards.purpose.status).toBe("clear")
    expect(inspection.cards.source.status).toBe("not_needed")
  })

  it("returns no_match cards for unmatched selections", () => {
    const ctx = context("supported")
    const match = matchInspectionElement(ctx, { slideIndex: 99, text: "unmatched selected text" })
    const projection = projectInspectionMatch(ctx, match, { slideIndex: 99, text: "unmatched selected text" })
    const inspection = buildDeterministicInspectionResult(projection, { requestId: "missing-slide", staleReason: "Deck changed after request." })

    expect(inspection.status).toBe("no_match")
    expect(inspection.cards.purpose.status).toBe("unknown")
    expect(inspection.cards.source.status).toBe("unknown")
    expect(inspection.stale).toEqual({ stale: true, reason: "Deck changed after request." })
  })
})
