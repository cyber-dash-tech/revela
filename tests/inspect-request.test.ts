import { describe, expect, it } from "bun:test"
import { createEmptyDecksState, upsertDeck, upsertSlides } from "../lib/decks-state"
import { inspectElementInState } from "../lib/inspect/request"

describe("inspect request handling", () => {
  function state() {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "inspect-request-demo",
      goal: "Approve the launch plan.",
      audience: "Executive team",
      outputPath: "decks/inspect-request-demo.html",
      narrativeBrief: {
        audienceBeliefBefore: "Executives are unsure the launch is ready.",
        audienceBeliefAfter: "Executives see a grounded launch recommendation.",
        decisionOrAction: "Approve launch.",
        narrativeArc: "context -> evidence -> ask",
        keyClaims: [],
        objections: [],
        risks: [],
      },
    })
    return upsertSlides(state, "inspect-request-demo", [{
      index: 1,
      title: "Launch Readiness",
      purpose: "Show evidence for the launch decision",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      content: { headline: "Pilot conversion improved 18% in 2026" },
      evidence: [{ source: "Pilot dashboard", sourcePath: "sources/pilot.csv", location: "conversion sheet", quote: "Conversion +18%" }],
      status: "ready",
    }])
  }

  it("returns structured inspection JSON for a matched element", () => {
    const inspected = inspectElementInState(state(), {
      slideIndex: 1,
      text: "Pilot conversion improved 18% in 2026",
      tagName: "H2",
      classList: ["headline"],
    }, { requestId: "request-1" })

    expect(inspected.requestId).toBe("request-1")
    expect(inspected.result).toMatchObject({
      version: 1,
      requestId: "request-1",
      status: "success",
      slide: { index: 1, title: "Launch Readiness" },
      cards: {
        purpose: { status: "clear", role: "evidence" },
        source: { status: "supported", matchedClaim: "Pilot conversion improved 18% in 2026" },
      },
    })
  })

  it("attaches stale result metadata without changing card structure", () => {
    const inspected = inspectElementInState(state(), { slideIndex: 99, text: "Missing" }, {
      requestId: "request-2",
      staleReason: "Deck changed after selection.",
    })

    expect(inspected.result.status).toBe("no_match")
    expect(inspected.result.stale).toEqual({ stale: true, reason: "Deck changed after selection." })
    expect(inspected.result.cards.source.status).toBe("unknown")
  })
})
