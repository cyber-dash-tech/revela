import { describe, expect, it } from "bun:test"
import {
  createDeckSpec,
  createEmptyDecksState,
  evaluateDeckStateWriteReadiness,
  extractDecksStateTargetsFromPatch,
  reviewDeckState,
  upsertDeck,
  upsertSlides,
} from "../lib/decks-state"

describe("DECKS.json state readiness", () => {
  function readyState() {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "test-two-page-deck",
      goal: "Create a two-slide test deck.",
      slideCount: 2,
      outputPath: "decks/test-two-page-deck.html",
      theme: { design: "aurora", domain: "general" },
      requiredInputs: {
        topicClarified: true,
        audienceClarified: true,
        slideCountDecided: true,
        languageDecided: true,
        visualStyleSelected: true,
        sourceMaterialsIdentified: true,
        researchNeedAssessed: true,
        researchFindingsRead: true,
        slidePlanConfirmed: true,
        designLayoutsFetched: true,
      },
      researchPlan: [{ axis: "none", needed: false, status: "skipped" }],
    })
    state = upsertSlides(state, "test-two-page-deck", [
      {
        index: 1,
        title: "封面",
        purpose: "Introduce the test deck",
        layout: "cover",
        components: ["hero-title"],
        content: { headline: "测试演示文稿", body: ["验证生成流程"] },
        evidence: [{ source: "user request" }],
        status: "ready",
      },
      {
        index: 2,
        title: "要点",
        purpose: "Show validation targets",
        layout: "card-grid",
        components: ["card"],
        content: { headline: "验证目标", bullets: ["页面生成", "布局检查"] },
        evidence: [{ source: "user request" }],
        status: "ready",
      },
    ])
    return reviewDeckState(state, "test-two-page-deck").state
  }

  it("marks a complete deck ready through review", () => {
    const reviewed = reviewDeckState(readyState(), "test-two-page-deck")
    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.state.decks["test-two-page-deck"].writeReadiness.status).toBe("ready")
  })

  it("allows writing only when DECKS.json readiness is complete", () => {
    const result = evaluateDeckStateWriteReadiness(readyState(), "decks/test-two-page-deck.html")
    expect(result.ready).toBe(true)
  })

  it("blocks when slide specs are incomplete", () => {
    const state = upsertDeck(createEmptyDecksState(), createDeckSpec({
      slug: "incomplete",
      goal: "Incomplete deck",
      outputPath: "decks/incomplete.html",
    }))
    const reviewed = reviewDeckState(state, "incomplete")
    expect(reviewed.result.ready).toBe(false)
    expect(reviewed.result.blocker).toContain("slides are missing")
  })

  it("blocks target path mismatch", () => {
    const result = evaluateDeckStateWriteReadiness(readyState(), "decks/other.html")
    expect(result.ready).toBe(false)
    expect(result.blocker).toContain("Deck outputPath is decks/test-two-page-deck.html")
  })

  it("rejects adding a second current deck", () => {
    const state = upsertDeck(createEmptyDecksState(), {
      slug: "first",
      outputPath: "decks/first.html",
    })

    expect(() => upsertDeck(state, {
      slug: "second",
      outputPath: "decks/second.html",
    })).toThrow("Use a separate workspace")
  })
})

describe("DECKS.json direct patch targets", () => {
  it("extracts state file targets from patches", () => {
    const targets = extractDecksStateTargetsFromPatch(`*** Begin Patch
*** Update File: DECKS.json
@@
-{}
+{}
*** Update File: notes.md
*** Move to: subdir/DECKS.json
*** End Patch`)

    expect(targets).toEqual(["DECKS.json", "subdir/DECKS.json"])
  })
})
