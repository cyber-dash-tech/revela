import { describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  applyEvidenceCandidates,
  createDeckSpec,
  createEmptyDecksState,
  evaluateDeckStateWriteReadiness,
  extractDecksStateTargetsFromPatch,
  reviewDeckState,
  upsertDeck,
  upsertSlides,
} from "../lib/decks-state"
import { upsertSourceMaterial } from "../lib/source-materials"
import { currentReviewInputHash, isReviewSnapshotCurrent } from "../lib/workspace-state/review-snapshots"

describe("DECKS.json state readiness", () => {
  function readyState() {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "test-two-page-deck",
      goal: "Create a two-slide test deck.",
      outputPath: "decks/test-two-page-deck.html",
      theme: { design: "aurora", domain: "general" },
      requiredInputs: {
        topicClarified: true,
        audienceClarified: true,
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

  it("records a current review snapshot for the active HTML render target", () => {
    const state = readyState()
    const snapshot = state.reviews.at(-1)

    expect(snapshot).toMatchObject({
      targetId: "target:html_deck:decks/test-two-page-deck.html",
      inputHash: currentReviewInputHash(state, "test-two-page-deck"),
      status: "ready",
      blockers: [],
    })
    expect(snapshot && isReviewSnapshotCurrent(state, snapshot, "test-two-page-deck")).toBe(true)
  })

  it("keeps review input hashes stable across derived readiness status changes", () => {
    const state = readyState()
    const before = currentReviewInputHash(state, "test-two-page-deck")
    state.decks["test-two-page-deck"].status = "written"
    state.decks["test-two-page-deck"].writeReadiness.lastReviewedAt = "2099-01-01T00:00:00.000Z"

    expect(currentReviewInputHash(state, "test-two-page-deck")).toBe(before)
  })

  it("blocks deck writes when the latest review snapshot is stale", () => {
    const state = readyState()
    state.decks["test-two-page-deck"].slides[1].content.bullets = ["Updated post-review bullet"]

    const result = evaluateDeckStateWriteReadiness(state, "decks/test-two-page-deck.html")

    expect(result.ready).toBe(false)
    expect(result.blocker).toContain("Latest review snapshot is stale")
  })

  it("allows legacy ready states without review snapshots", () => {
    const state = readyState()
    state.reviews = []

    const result = evaluateDeckStateWriteReadiness(state, "decks/test-two-page-deck.html")

    expect(result.ready).toBe(true)
  })

  it("re-review refreshes stale review snapshots", () => {
    const state = readyState()
    state.decks["test-two-page-deck"].slides[1].content.bullets = ["Updated post-review bullet"]
    expect(evaluateDeckStateWriteReadiness(state, "decks/test-two-page-deck.html").ready).toBe(false)

    const reviewed = reviewDeckState(state, "test-two-page-deck")
    const result = evaluateDeckStateWriteReadiness(reviewed.state, "decks/test-two-page-deck.html")

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

  it("blocks evidence-sensitive numeric claims without slide evidence", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides[1].content.bullets = ["Market grows 25% annually through 2028"]
    state.decks["test-two-page-deck"].slides[1].evidence = []

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(false)
    expect(reviewed.result.blocker).toContain("evidence-sensitive claim without evidence")
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "missing_evidence",
      severity: "blocker",
      slideIndex: 2,
      claimText: "Market grows 25% annually through 2028",
      suggestedAction: expect.stringContaining("findingsFile or sourcePath"),
    }))
    expect(reviewed.result.issues.find((issue) => issue.type === "missing_evidence")?.suggestedAction).toContain("quote, location, url, or caveat")
  })

  it("surfaces conservative evidence binding candidates from read research findings", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-review-candidates-"))
    mkdirSync(join(workspaceRoot, "researches", "factory"), { recursive: true })
    writeFileSync(join(workspaceRoot, "researches", "factory", "context.md"), `---
topic: factory
---

## Data
- P&G/Plug and Play proposal summarizes the current state as "Automation Islands" caused by heterogeneous systems, heavy middleware, and human bottlenecks.
- Legacy assets lack a unified language; decisions and exceptions still rely on manual intervention.
- Source: Updating V2-Plug and Play Proposal for P&G (English).pdf
`)
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "factory context", needed: true, status: "read", findingsFile: "researches/factory/context.md" }]
    state.decks["test-two-page-deck"].slides[1] = {
      ...state.decks["test-two-page-deck"].slides[1],
      title: "Factory Intelligence Evolution Roadmap",
      purpose: "Show the path from Automation Islands to a future AI Manufacturing OS",
      content: {
        headline: "From Automation Islands to AI Manufacturing OS",
        bullets: ["Factory intelligence must overcome fragmented legacy systems, heavy middleware, and human bottlenecks", "Future AI Brain and Digital Workers enable closed-loop coordination"],
      },
      evidence: [],
    }

    const reviewed = reviewDeckState(state, "test-two-page-deck", { workspaceRoot })
    const missing = reviewed.result.issues.find((issue) => issue.type === "missing_evidence")

    expect(reviewed.result.ready).toBe(false)
    expect(missing?.evidenceCandidates).toEqual([expect.objectContaining({
      findingsFile: "researches/factory/context.md",
      sourcePath: "Updating V2-Plug and Play Proposal for P&G (English).pdf",
      supportStrength: "partial",
      quote: expect.stringContaining("Automation Islands"),
      caveat: expect.stringContaining("partial"),
      supportScope: expect.arrayContaining(["automation", "islands"]),
    })])
    expect(reviewed.result.evidenceCandidates).toHaveLength(1)
    expect(reviewed.result.evidenceCandidates?.[0].candidateId).toMatch(/^s2-[a-f0-9]{8}$/)
    expect(reviewed.state.decks["test-two-page-deck"].slides[1].evidence).toEqual([])
  })

  it("finds partial candidates even when future-state claim text has low overlap", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-review-low-overlap-"))
    mkdirSync(join(workspaceRoot, "researches", "factory"), { recursive: true })
    writeFileSync(join(workspaceRoot, "researches", "factory", "context.md"), `## Data
- P&G/Plug and Play proposal summarizes current operations as "Automation Islands" with fragmented legacy systems and human bottlenecks.
- Source: Updating V2-Plug and Play Proposal for P&G (English).pdf
`)
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "factory context", needed: true, status: "read", findingsFile: "researches/factory/context.md" }]
    state.decks["test-two-page-deck"].slides[1] = {
      ...state.decks["test-two-page-deck"].slides[1],
      title: "Factory Intelligence Evolution Roadmap",
      purpose: "Show the progression from automation islands to 2030 AI manufacturing OS and long-term self-organizing ecosystems.",
      content: {
        headline: "Factory Intelligence Evolution Roadmap",
        bullets: ["Automation Islands", "2030 AI Manufacturing OS", "Self-Organizing Manufacturing Ecosystem"],
      },
      evidence: [],
    }

    const reviewed = reviewDeckState(state, "test-two-page-deck", { workspaceRoot })
    const candidate = reviewed.result.evidenceCandidates?.[0]

    expect(candidate).toMatchObject({
      candidateId: expect.stringMatching(/^s2-[a-f0-9]{8}$/),
      findingsFile: "researches/factory/context.md",
      supportStrength: "partial",
      quote: expect.stringContaining("Automation Islands"),
      supportScope: expect.arrayContaining(["automation", "islands"]),
      caveat: expect.stringContaining("future-state"),
      evidenceDraft: expect.objectContaining({
        source: "Updating V2-Plug and Play Proposal for P&G (English).pdf",
        findingsFile: "researches/factory/context.md",
        quote: expect.stringContaining("Automation Islands"),
        caveat: expect.stringContaining("Unsupported claim scope"),
      }),
      unsupportedScope: expect.arrayContaining(["2030 AI Manufacturing OS", "Self-Organizing Manufacturing Ecosystem"]),
      recommendedRewrite: expect.stringContaining("internal synthesis"),
    })
  })

  it("applies selected evidence candidates explicitly without rewriting slide content", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-review-apply-candidates-"))
    mkdirSync(join(workspaceRoot, "researches", "factory"), { recursive: true })
    writeFileSync(join(workspaceRoot, "researches", "factory", "context.md"), `## Data
- P&G/Plug and Play proposal summarizes current operations as "Automation Islands" with fragmented legacy systems and human bottlenecks.
- Source: Updating V2-Plug and Play Proposal for P&G (English).pdf
`)
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "factory context", needed: true, status: "read", findingsFile: "researches/factory/context.md" }]
    state.decks["test-two-page-deck"].slides[1] = {
      ...state.decks["test-two-page-deck"].slides[1],
      title: "Factory Intelligence Evolution Roadmap",
      purpose: "Show the progression from automation islands to 2030 AI manufacturing OS and long-term self-organizing ecosystems.",
      content: {
        headline: "Factory Intelligence Evolution Roadmap",
        bullets: ["Automation Islands", "2030 AI Manufacturing OS", "Self-Organizing Manufacturing Ecosystem"],
      },
      evidence: [],
    }
    const reviewed = reviewDeckState(state, "test-two-page-deck", { workspaceRoot })
    const candidateId = reviewed.result.evidenceCandidates?.[0]?.candidateId
    expect(typeof candidateId).toBe("string")

    const applied = applyEvidenceCandidates(state, [candidateId!], { workspaceRoot })
    const slide = applied.state.decks["test-two-page-deck"].slides[1]

    expect(applied.result.applied).toEqual([expect.objectContaining({
      candidateId,
      slideIndex: 2,
      evidence: expect.objectContaining({
        source: "Updating V2-Plug and Play Proposal for P&G (English).pdf",
        findingsFile: "researches/factory/context.md",
        quote: expect.stringContaining("Automation Islands"),
        caveat: expect.stringContaining("Unsupported claim scope"),
      }),
    })])
    expect(applied.result.skipped).toEqual([])
    expect(applied.result.nextReviewNeeded).toBe(true)
    expect(slide.content.bullets).toEqual(["Automation Islands", "2030 AI Manufacturing OS", "Self-Organizing Manufacturing Ecosystem"])
    expect(slide.evidence).toHaveLength(1)
    expect(slide.evidence[0].caveat).toContain("partial")
    expect(applied.state.decks["test-two-page-deck"].writeReadiness.status).toBe("blocked")
  })

  it("skips unknown or stale evidence candidate applications", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-review-apply-skip-"))
    mkdirSync(join(workspaceRoot, "researches", "factory"), { recursive: true })
    writeFileSync(join(workspaceRoot, "researches", "factory", "context.md"), `## Data
- P&G/Plug and Play proposal summarizes current operations as "Automation Islands" with fragmented legacy systems and human bottlenecks.
- Source: Updating V2-Plug and Play Proposal for P&G (English).pdf
`)
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "factory context", needed: true, status: "read", findingsFile: "researches/factory/context.md" }]
    state.decks["test-two-page-deck"].slides[1] = {
      ...state.decks["test-two-page-deck"].slides[1],
      title: "Factory Intelligence Evolution Roadmap",
      purpose: "Show the progression from automation islands to 2030 AI manufacturing OS.",
      content: { headline: "Factory Intelligence Evolution Roadmap", bullets: ["Automation Islands", "2030 AI Manufacturing OS"] },
      evidence: [],
    }
    const candidateId = reviewDeckState(state, "test-two-page-deck", { workspaceRoot }).result.evidenceCandidates?.[0]?.candidateId
    expect(typeof candidateId).toBe("string")
    const once = applyEvidenceCandidates(state, [candidateId!, "missing-candidate"], { workspaceRoot })
    const twice = applyEvidenceCandidates(once.state, [candidateId!], { workspaceRoot })

    expect(once.result.applied).toHaveLength(1)
    expect(once.result.skipped).toEqual([{ candidateId: "missing-candidate", reason: "Candidate was not found in the current review result." }])
    expect(twice.result.applied).toEqual([])
    expect(twice.result.skipped).toEqual([{ candidateId: candidateId!, reason: "Candidate was not found in the current review result." }])
    expect(twice.state.decks["test-two-page-deck"].slides[1].evidence).toHaveLength(1)
  })

  it("falls back to workspace research files when researchPlan does not bind the findings file", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-review-researches-fallback-"))
    mkdirSync(join(workspaceRoot, "researches", "pg_future_manufacturing_opening"), { recursive: true })
    writeFileSync(join(workspaceRoot, "researches", "pg_future_manufacturing_opening", "unified-data-context-challenges.md"), `## Data
- P&G/Plug and Play proposal summarizes current operations as "Automation Islands" caused by fragmented legacy systems and human bottlenecks.
- Source: 更新V2-Plug and Play Proposal for P&G (English).pdf
`)
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "unbound", needed: true, status: "read" }]
    state.decks["test-two-page-deck"].slides[1] = {
      ...state.decks["test-two-page-deck"].slides[1],
      title: "Factory Intelligence Evolution Roadmap",
      purpose: "Show the progression from automation islands to 2030 AI manufacturing OS and long-term self-organizing ecosystems.",
      content: {
        headline: "Factory Intelligence Evolution Roadmap",
        bullets: ["Automation Islands", "2030 AI Manufacturing OS", "Self-Organizing Manufacturing Ecosystem"],
      },
      evidence: [],
    }

    const reviewed = reviewDeckState(state, "test-two-page-deck", { workspaceRoot })
    const candidate = reviewed.result.evidenceCandidates?.[0]

    expect(candidate).toMatchObject({
      sourceKind: "researchesFallback",
      findingsFile: "researches/pg_future_manufacturing_opening/unified-data-context-challenges.md",
      sourcePath: "更新V2-Plug and Play Proposal for P&G (English).pdf",
      supportStrength: "partial",
      quote: expect.stringContaining("Automation Islands"),
    })
    expect(candidate?.caveat).toContain("not referenced by researchPlan")
    const search = reviewed.result.issues.find((issue) => issue.type === "missing_evidence")?.evidenceCandidateSearch
    expect(search?.researchPlanFindingsSearched).toEqual([])
    expect(search?.fallbackResearchFilesSearched).toContain("researches/pg_future_manufacturing_opening/unified-data-context-challenges.md")
    expect(reviewed.state.decks["test-two-page-deck"].researchPlan[0].findingsFile).toBeUndefined()
    expect(reviewed.state.decks["test-two-page-deck"].slides[1].evidence).toEqual([])
  })

  it("reports evidence candidate search near misses when no binding candidate is strong enough", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-review-near-miss-"))
    mkdirSync(join(workspaceRoot, "researches", "factory"), { recursive: true })
    writeFileSync(join(workspaceRoot, "researches", "factory", "weak.md"), `## Data
- This note only mentions automation as a broad theme.
`)
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "weak", needed: true, status: "read" }]
    state.decks["test-two-page-deck"].slides[1] = {
      ...state.decks["test-two-page-deck"].slides[1],
      title: "Factory Intelligence Evolution Roadmap",
      purpose: "Show the progression from automation islands to 2030 AI manufacturing OS and long-term self-organizing ecosystems.",
      content: {
        headline: "Factory Intelligence Evolution Roadmap",
        bullets: ["Automation Islands", "2030 AI Manufacturing OS", "Self-Organizing Manufacturing Ecosystem"],
      },
      evidence: [],
    }

    const reviewed = reviewDeckState(state, "test-two-page-deck", { workspaceRoot })
    const missing = reviewed.result.issues.find((issue) => issue.type === "missing_evidence")

    expect(missing?.evidenceCandidates).toBeUndefined()
    expect(missing?.evidenceCandidateSearch).toMatchObject({
      fallbackResearchFilesSearched: ["researches/factory/weak.md"],
      nearMisses: [expect.objectContaining({
        findingsFile: "researches/factory/weak.md",
        sourceKind: "researchesFallback",
        bestScore: 1,
        threshold: 2,
        quote: expect.stringContaining("automation"),
      })],
    })
  })

  it("does not block table-of-contents navigation slides without evidence", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides[1] = {
      ...state.decks["test-two-page-deck"].slides[1],
      title: "Table of Contents",
      purpose: "Frames future manufacturing through target architecture, system decomposition, current-state bottlenecks, technology levers and action pathways.",
      layout: "toc",
      content: { headline: "Table of Contents", bullets: ["Target architecture", "Technology levers", "Action pathways"] },
      evidence: [],
    }

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.issues).not.toContainEqual(expect.objectContaining({
      type: "missing_evidence",
      slideIndex: 2,
    }))
  })

  it("allows simple non-claim slides without evidence", () => {
    let state = readyState()
    for (const slide of state.decks["test-two-page-deck"].slides) slide.evidence = []

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues.some((issue) => issue.type === "missing_evidence")).toBe(false)
  })

  it("keeps source-only evidence as a warning instead of a blocker", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides[1].content.bullets = ["Revenue grows 25% annually through 2028"]
    state.decks["test-two-page-deck"].slides[1].evidence = [{ source: "researches/test/market.md" }]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.warnings).toContain("Slide 2 evidence for a high-risk claim has no source trace detail: Revenue grows 25% annually through 2028")
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "weak_evidence",
      severity: "warning",
      slideIndex: 2,
      suggestedAction: expect.stringContaining("findingsFile or sourcePath"),
    }))
    expect(reviewed.result.issues.find((issue) => issue.type === "weak_evidence")?.suggestedAction).toContain("quote, location, url, or caveat")
  })

  it("treats compact source trace fields as sufficient evidence detail", () => {
    const cases = [
      { findingsFile: "researches/test/market.md", location: "Data section" },
      { sourcePath: "sources/market.pdf", extractedTextPath: ".opencode/revela/doc-materials/hash/text.txt" },
    ]

    for (const evidence of cases) {
      let state = readyState()
      state.decks["test-two-page-deck"].slides[1].content.bullets = ["Revenue grows 25% annually through 2028"]
      state.decks["test-two-page-deck"].slides[1].evidence = [{ source: "market source", ...evidence }]

      const reviewed = reviewDeckState(state, "test-two-page-deck")

      expect(reviewed.result.ready).toBe(true)
      expect(reviewed.result.issues.some((issue) => issue.type === "weak_evidence")).toBe(false)
    }
  })

  it("preserves expanded evidence source-trace fields during slide upsert", () => {
    const evidence = {
      source: "Market research findings",
      quote: "Revenue expanded 25% in the base case.",
      page: "p. 4",
      url: "https://example.com/report",
      sourcePath: "sources/market.pdf",
      location: "page 4, table 2",
      findingsFile: "researches/test/market.md",
      caveat: "Base case excludes one-time revenue.",
      extractedTextPath: ".opencode/revela/doc-materials/hash/text.txt",
      extractedManifestPath: ".opencode/revela/doc-materials/hash/manifest.json",
    }
    const state = upsertSlides(createEmptyDecksState(), "trace", [{
      index: 1,
      title: "Revenue",
      purpose: "Show revenue growth",
      layout: "two-col",
      components: ["card"],
      content: { headline: "Revenue grows 25% annually through 2028" },
      evidence: [evidence],
      status: "ready",
    }])

    expect(state.decks.trace.slides[0].evidence[0]).toEqual(evidence)
  })

  it("preserves narrativeRole during slide upsert", () => {
    const state = upsertSlides(createEmptyDecksState(), "narrative", [{
      index: 1,
      title: "Decision Context",
      purpose: "Frame the decision",
      narrativeRole: "context",
      layout: "two-col",
      components: ["card"],
      content: { headline: "Decision context" },
      evidence: [],
      status: "ready",
    }])

    expect(state.decks.narrative.slides[0].narrativeRole).toBe("context")
  })

  it("preserves narrativeBrief during deck upsert", () => {
    const state = upsertDeck(createEmptyDecksState(), {
      slug: "narrative-compiler",
      goal: "Recommend the launch path",
      outputPath: "decks/narrative-compiler.html",
      narrativeBrief: {
        audienceBeliefBefore: "The team is unsure which launch path is safer.",
        audienceBeliefAfter: "The team agrees the phased launch is safer and faster to approve.",
        decisionOrAction: "Approve the phased launch plan.",
        narrativeArc: "context -> tension -> evidence -> recommendation -> risk -> ask",
        keyClaims: ["Phased launch reduces execution risk."],
        objections: ["A phased launch may look slower."],
        risks: ["Customer migration needs active monitoring."],
      },
    })

    expect(state.decks["narrative-compiler"].narrativeBrief).toMatchObject({
      decisionOrAction: "Approve the phased launch plan.",
      keyClaims: ["Phased launch reduces execution risk."],
    })
  })

  it("warns when a decision-oriented deck has no narrative brief", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].goal = "Recommend whether to approve the investment"
    state.decks["test-two-page-deck"].slides = [
      narrativeSlide(1, "Context", "context"),
      narrativeSlide(2, "Evidence", "evidence"),
      narrativeSlide(3, "Path Forward", "recommendation"),
      narrativeSlide(4, "Decision Ask", "ask"),
    ]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      severity: "warning",
      message: "Narrative brief is missing for a decision-oriented deck",
    }))
  })

  it("warns when narrative brief is missing compiler fields", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].narrativeBrief = {
      audienceBeliefBefore: "Board is uncertain about the recommendation.",
      keyClaims: [],
      objections: [],
      risks: [],
    }
    state.decks["test-two-page-deck"].slides = [
      narrativeSlide(1, "Context", "context"),
      narrativeSlide(2, "Evidence", "evidence"),
      narrativeSlide(3, "Path Forward", "recommendation"),
      narrativeSlide(4, "Decision Ask", "ask"),
    ]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      message: "Narrative brief is missing the intended audience belief after the deck",
    }))
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      message: "Narrative brief is missing the decision or action the deck should drive",
    }))
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      message: "Narrative brief has no key claims for the recommendation to prove",
    }))
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      message: "Narrative brief has no stakeholder objections to handle",
    }))
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      message: "Narrative brief has no risks, assumptions, or tradeoffs for the recommendation",
    }))
  })

  it("warns but stays ready when a recommendation has no risk handling", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides = [
      narrativeSlide(1, "Context", "context"),
      narrativeSlide(2, "Evidence", "evidence"),
      narrativeSlide(3, "Path Forward", "recommendation"),
      narrativeSlide(4, "Decision Ask", "ask"),
    ]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      severity: "warning",
      message: "Recommendation has no visible risk, assumption, caveat, or tradeoff handling",
    }))
  })

  it("warns when a multi-slide deck has no narrative roles", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides = [1, 2, 3, 4].map((index) => narrativeSlide(index, `Slide ${index}`))

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      severity: "warning",
      message: "No slide narrativeRole values are recorded for a multi-slide deck",
    }))
  })

  it("warns when a recommendation appears before support", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides = [
      narrativeSlide(1, "Path Forward", "recommendation"),
      narrativeSlide(2, "Context", "context"),
      narrativeSlide(3, "Risk Handling", "risk"),
      narrativeSlide(4, "Close", "close"),
    ]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      severity: "warning",
      slideIndex: 1,
      message: "Slide 1 presents a recommendation before context, tension, or evidence has been established",
    }))
  })

  it("warns when a deck ends without a so-what or ask", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides = [
      narrativeSlide(1, "Context", "context"),
      narrativeSlide(2, "Tension", "tension"),
      narrativeSlide(3, "Evidence", "evidence"),
      narrativeSlide(4, "Operating Details", "appendix"),
    ]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      severity: "warning",
      message: "Deck may end without a clear so-what, ask, or closing takeaway",
    }))
  })

  it("warns when slide purposes do not frame the audience", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].audience = "Board"
    state.decks["test-two-page-deck"].slides = [
      narrativeSlide(1, "Context", "context"),
      narrativeSlide(2, "Tension", "tension"),
      narrativeSlide(3, "Evidence", "evidence"),
      narrativeSlide(4, "Decision Ask", "ask"),
    ]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      severity: "warning",
      message: "Slide purposes do not clearly frame the story for the audience: Board",
    }))
  })

  it("warns on a jump from context directly to ask", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].slides = [
      narrativeSlide(1, "Context", "context"),
      narrativeSlide(2, "Decision Ask", "ask"),
      narrativeSlide(3, "Evidence", "evidence"),
      narrativeSlide(4, "Close", "close"),
    ]

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "narrative_gap",
      severity: "warning",
      slideIndex: 2,
      message: "Slide 2 jumps from context to ask without evidence, tension, or recommendation in between",
    }))
  })

  it("blocks discovered source materials when evidence-backed research is needed", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "Market", needed: true, status: "read", findingsFile: "researches/test/market.md" }]
    upsertSourceMaterial(state, { path: "source.pdf", type: "pdf", status: "discovered" }, "discovered")

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(false)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "source_not_processed",
      severity: "blocker",
      message: "Source material source.pdf has been identified but not extracted, summarized, or researched",
    }))
  })

  it("warns on discovered source materials when research is explicitly skipped", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "none", needed: false, status: "skipped" }]
    upsertSourceMaterial(state, { path: "optional.pdf", type: "pdf", status: "discovered" }, "discovered")

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.ready).toBe(true)
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "source_not_processed",
      severity: "warning",
      message: "Source material optional.pdf has been identified but not extracted, summarized, or researched",
    }))
  })

  it("ignores workflow, temporary, and generated files in source material readiness warnings", () => {
    let state = readyState()
    state.decks["test-two-page-deck"].researchPlan = [{ axis: "Market", needed: true, status: "read", findingsFile: "researches/test/market.md" }]
    for (const path of [
      "~$W_China Emerging Technology Trends v2.docx",
      "AGENTS.md",
      "README.md",
      "DECKS.json",
      "decks/pg_future_manufacturing_opening.pptx",
      "decks/pg_future_manufacturing_opening.html",
      "更新V2-Plug and Play Proposal for P&G (English).pdf",
    ]) {
      upsertSourceMaterial(state, { path, status: "discovered" }, "discovered")
    }

    const reviewed = reviewDeckState(state, "test-two-page-deck")

    expect(reviewed.result.issues).not.toContainEqual(expect.objectContaining({
      type: "source_not_processed",
      message: expect.stringContaining("~$W_China"),
    }))
    expect(reviewed.result.issues).not.toContainEqual(expect.objectContaining({
      type: "source_not_processed",
      message: expect.stringContaining("AGENTS.md"),
    }))
    expect(reviewed.result.issues).not.toContainEqual(expect.objectContaining({
      type: "source_not_processed",
      message: expect.stringContaining("decks/pg_future_manufacturing_opening.pptx"),
    }))
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "source_not_processed",
      message: "Source material 更新V2-Plug and Play Proposal for P&G (English).pdf has been identified but not extracted, summarized, or researched",
    }))
  })

  it("drops legacy slideCount fields when normalizing state", () => {
    const state = upsertDeck(createEmptyDecksState(), {
      slug: "legacy",
      goal: "Legacy deck",
      slideCount: 21,
      outputPath: "decks/legacy.html",
      requiredInputs: {
        topicClarified: true,
        audienceClarified: true,
        slideCountDecided: true,
      },
    } as any)

    const deck = state.decks.legacy
    expect("slideCount" in deck).toBe(false)
    expect("slideCountDecided" in deck.requiredInputs).toBe(false)
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

function narrativeSlide(index: number, title: string, narrativeRole?: "context" | "tension" | "evidence" | "recommendation" | "risk" | "ask" | "appendix" | "close") {
  return {
    index,
    title,
    purpose: `Clarify ${title.toLowerCase()}`,
    narrativeRole,
    layout: "two-col",
    components: ["card"],
    content: { headline: title, bullets: [`Point ${index}`] },
    evidence: [{ source: "source.md", location: `section ${index}` }],
    status: "ready" as const,
  }
}

describe("source material state", () => {
  it("preserves extracted records during unchanged discovery refresh", () => {
    const state = createEmptyDecksState()
    upsertSourceMaterial(state, {
      path: "deck.pptx",
      type: "pptx",
      fingerprint: "same",
      status: "extracted",
      extraction: {
        manifestPath: ".opencode/revela/doc-materials/same/manifest.json",
        textPath: ".opencode/revela/doc-materials/same/text.txt",
        cacheDir: ".opencode/revela/doc-materials/same",
      },
      lastExtracted: "2026-05-03T00:00:00.000Z",
    }, "extracted")

    upsertSourceMaterial(state, {
      path: "deck.pptx",
      type: "pptx",
      fingerprint: "same",
      status: "discovered",
    }, "discovered")

    expect(state.workspace.sourceMaterials[0]).toMatchObject({
      path: "deck.pptx",
      status: "extracted",
      extraction: {
        manifestPath: ".opencode/revela/doc-materials/same/manifest.json",
      },
      lastExtracted: "2026-05-03T00:00:00.000Z",
    })
  })

  it("downgrades changed fingerprints to discovered during refresh", () => {
    const state = createEmptyDecksState()
    upsertSourceMaterial(state, {
      path: "deck.pptx",
      type: "pptx",
      fingerprint: "old",
      status: "extracted",
      extraction: { manifestPath: "old.json", textPath: "old.txt", cacheDir: "old" },
      lastExtracted: "2026-05-03T00:00:00.000Z",
    }, "extracted")

    upsertSourceMaterial(state, {
      path: "deck.pptx",
      type: "pptx",
      fingerprint: "new",
      status: "discovered",
    }, "discovered")

    expect(state.workspace.sourceMaterials[0]).toMatchObject({
      path: "deck.pptx",
      fingerprint: "new",
      status: "discovered",
    })
    expect(state.workspace.sourceMaterials[0].extraction).toBeUndefined()
    expect(state.workspace.sourceMaterials[0].lastExtracted).toBeUndefined()
  })
})
