import { describe, expect, it } from "bun:test"
import { compileInspectionContext } from "../lib/inspection-context/compile"
import { matchInspectionElement } from "../lib/inspection-context/match"
import { projectInspectionMatch } from "../lib/inspection-context/project"
import { buildDeterministicInspectionResult } from "../lib/inspection-context/result"
import { createEmptyDecksState, upsertDeck, upsertSlides } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"

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
    expect(inspection.cards.reading).toMatchObject({
      status: "matched",
      claimText: "Market demand has grown 25% since 2024",
      evidenceStatus: "supported",
    })
    expect(inspection.cards.exploratory).toMatchObject({
      status: "available",
      official: false,
      claimFocus: "Market demand has grown 25% since 2024",
    })
    expect(inspection.cards.exploratory?.appendixLeads).toContain("Market report: page 4")
    expect(inspection.cards.exploratory?.boundaries[0]).toContain("non-official")
  })

  it("preserves canonical narrative reading context", () => {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "canonical-reading-demo",
      goal: "Approve phased expansion.",
      audience: "Investment committee",
      outputPath: "decks/canonical-reading-demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:canonical-reading-demo",
      status: "approved",
      audience: { primary: "Investment committee", beliefBefore: "Unsure", beliefAfter: "Ready" },
      decision: { action: "Approve phased expansion." },
      claims: [{
        id: "claim:market-growth",
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
        id: "evidence:market-growth",
        claimId: "claim:market-growth",
        source: "Market report",
        sourcePath: "sources/market.pdf",
        quote: "Demand increased 25% from 2024 to 2025.",
        location: "page 4",
        supportScope: "Current demand growth.",
        unsupportedScope: "Long-term forecast.",
        strength: "partial",
      }],
      objections: [{ id: "objection:forecast", text: "Forecast quality may be weak.", claimId: "claim:market-growth", priority: "high" }],
      risks: [{ id: "risk:execution", text: "Execution risk remains material.", claimId: "claim:market-growth", severity: "medium" }],
      approvals: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    state = upsertSlides(state, "canonical-reading-demo", [{
      index: 1,
      title: "Market Context",
      purpose: "Frame the investment decision",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      claimRefs: [{ claimId: "claim:market-growth", role: "primary" }],
      evidenceBindingIds: ["evidence:market-growth"],
      content: { headline: "Market demand has grown 25% since 2024" },
      evidence: [],
      status: "ready",
    }])
    state.renderTargets = [
      {
        id: "target:html_deck:decks/canonical-reading-demo.html",
        type: "html_deck",
        outputPath: "decks/canonical-reading-demo.html",
        sourceNodeIds: ["narrative:canonical-reading-demo", "claim:market-growth"],
        artifactVersion: computeNarrativeHash(state.narrative!),
        contractStatus: "valid",
        data: { narrativeHash: computeNarrativeHash(state.narrative!) },
      },
      {
        id: "target:executive_brief:briefs/canonical-reading-demo.md",
        type: "executive_brief",
        outputPath: "briefs/canonical-reading-demo.md",
        sourceNodeIds: ["narrative:canonical-reading-demo", "claim:market-growth"],
        artifactVersion: computeNarrativeHash(state.narrative!),
        contractStatus: "unknown",
        data: { narrativeHash: computeNarrativeHash(state.narrative!) },
      },
    ]

    const ctx = compileInspectionContext(state)
    const snapshot = { slideIndex: 1, text: "Market demand has grown 25% since 2024" }
    const match = matchInspectionElement(ctx, snapshot)
    const projection = projectInspectionMatch(ctx, match, snapshot)
    const inspection = buildDeterministicInspectionResult(projection)

    expect(inspection.cards.reading).toMatchObject({
      status: "matched",
      claimId: "claim:market-growth",
      canonicalClaimId: "claim:market-growth",
      claimText: "Market demand has grown 25% since 2024",
      evidenceStatus: "weak",
      evidenceBindingIds: ["evidence:market-growth"],
      supportedScope: "Current demand growth.",
      unsupportedScope: "Long-term forecast.",
      caveats: expect.arrayContaining(["Forecast excludes downside scenario."]),
      relatedObjections: ["Forecast quality may be weak."],
      relatedRisks: ["Execution risk remains material."],
    })
    expect(inspection.cards.reading?.artifactCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "html_deck",
        outputPath: "decks/canonical-reading-demo.html",
        coverageStatus: "current",
        containsClaim: true,
        stale: false,
        locations: ["Slide 1: Market Context (primary, metadata:claimRefs:primary)"],
      }),
      expect.objectContaining({
        type: "executive_brief",
        outputPath: "briefs/canonical-reading-demo.md",
        coverageStatus: "current",
        containsClaim: true,
        stale: false,
        locations: [],
      }),
    ]))
    expect(inspection.cards.exploratory).toMatchObject({
      status: "available",
      official: false,
      audience: "Investment committee",
      claimFocus: "Market demand has grown 25% since 2024",
    })
    expect(inspection.cards.exploratory?.objectionPrompts).toEqual(expect.arrayContaining([
      "Prepare for this objection using recorded support only: Forecast quality may be weak.",
      "Expect questions about unsupported scope: Long-term forecast.",
    ]))
    expect(inspection.cards.exploratory?.meetingPrep).toEqual(expect.arrayContaining([
      "Risk to be ready for: Execution risk remains material.",
      "Caveat to say plainly: Forecast excludes downside scenario.",
      "Do not overstate beyond: Long-term forecast.",
    ]))
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
    expect(inspection.cards.exploratory?.status).toBe("available")
  })

  it("returns no_match cards for unmatched selections", () => {
    const ctx = context("supported")
    const match = matchInspectionElement(ctx, { slideIndex: 99, text: "unmatched selected text" })
    const projection = projectInspectionMatch(ctx, match, { slideIndex: 99, text: "unmatched selected text" })
    const inspection = buildDeterministicInspectionResult(projection, { requestId: "missing-slide", staleReason: "Deck changed after request." })

    expect(inspection.status).toBe("no_match")
    expect(inspection.cards.purpose.status).toBe("unknown")
    expect(inspection.cards.source.status).toBe("unknown")
    expect(inspection.cards.exploratory?.status).toBe("unavailable")
    expect(inspection.stale).toEqual({ stale: true, reason: "Deck changed after request." })
  })
})
