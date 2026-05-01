import { describe, expect, it } from "bun:test"
import {
  extractDeckHtmlTargetsFromPatch,
  extractPatchTextArg,
  isDeckHtmlPath,
  setPatchTextArg,
} from "../lib/decks-memory"
import { buildInitPrompt } from "../lib/commands/init"
import { buildRememberPrompt, parseRememberArgs } from "../lib/commands/remember"
import { buildReviewPrompt } from "../lib/commands/review"
import {
  createDeckSpec,
  createEmptyDecksState,
  defaultRequiredInputs,
  evaluateDeckStateWriteReadiness,
  extractDecksStateTargetsFromPatch,
  reviewDeckState,
  upsertDeck,
  upsertSlides,
  type DecksState,
  type SlideSpec,
} from "../lib/decks-state"

describe("buildInitPrompt", () => {
  it("instructs the agent to scan workspace and update DECKS.json", () => {
    const prompt = buildInitPrompt({ exists: false, workspaceRoot: "/workspace/project" })
    expect(prompt).toContain("revela-workspace-scan")
    expect(prompt).toContain("revela-extract-document-materials")
    expect(prompt).toContain("DECKS.json")
    expect(prompt).toContain("Do not infer personal preferences")
    expect(prompt).toContain("Current workspace root: `/workspace/project`")
    expect(prompt).toContain("Stay strictly inside the current workspace root")
    expect(prompt).toContain("Start with no `path` and `max_depth: 2`")
  })

  it("keeps init search bounded to the current workspace", () => {
    const prompt = buildInitPrompt({ exists: false, workspaceRoot: "/workspace/project" })
    expect(prompt).toContain("For Glob/file searches, use the current workspace as the search root")
    expect(prompt).toContain("Do not set the search root to a parent directory or home directory")
    expect(prompt).toContain("Do not use `~`, `..`, or parent-directory traversal")
    expect(prompt).toContain("workspace-relative path only")
  })

  it("instructs the agent to scan generated deck history separately", () => {
    const prompt = buildInitPrompt({ exists: false })
    expect(prompt).toContain("deck outputs and deck history")
    expect(prompt).toContain("decks/**/*.html")
    expect(prompt).toContain("slides/**/*.html")
    expect(prompt).toContain("presentations/**/*.html")
    expect(prompt).toContain("generated/output decks")
    expect(prompt).toContain("not necessarily source materials")
    expect(prompt).toContain("Run these searches only inside the current workspace root")
  })

  it("updates existing DECKS.json conservatively", () => {
    const prompt = buildInitPrompt({ exists: true })
    expect(prompt).toContain("already exists")
    expect(prompt).toContain("already exists")
    expect(prompt).toContain("revela-decks")
  })
})

describe("remember command", () => {
  it("requires memory text", () => {
    expect(parseRememberArgs(" ").ok).toBe(false)
  })

  it("parses memory text without modifying it", () => {
    expect(parseRememberArgs("我偏好中文、咨询风格")).toEqual({ ok: true, memory: "我偏好中文、咨询风格" })
  })

  it("builds a prompt that updates only preference sections", () => {
    const prompt = buildRememberPrompt({ memory: "Prefer Chinese consulting style", exists: true })
    expect(prompt).toContain("Prefer Chinese consulting style")
    expect(prompt).toContain("DECKS.json")
    expect(prompt).toContain("revela-decks")
    expect(prompt).toContain("preferenceType `user`")
    expect(prompt).toContain("preferenceType `workflow`")
    expect(prompt).toContain("Do not add inferred preferences")
  })
})

describe("review command", () => {
  it("builds a prompt that reviews write readiness", () => {
    const prompt = buildReviewPrompt({ exists: true })
    expect(prompt).toContain("Review Revela deck write readiness")
    expect(prompt).toContain("current workspace deck")
    expect(prompt).toContain("writeReadiness")
    expect(prompt).toContain("requiredInputs")
    expect(prompt).toContain("DECKS.json")
    expect(prompt).toContain("revela-decks")
    expect(prompt).toContain("Do not write or overwrite `decks/*.html`")
  })

  it("initializes DECKS.json through the tool when missing", () => {
    const prompt = buildReviewPrompt({ exists: false })
    expect(prompt).toContain("DECKS.json does not exist yet")
    expect(prompt).toContain("Create it through the revela-decks tool")
    expect(prompt).toContain("action `review`")
  })
})

describe("DECKS.json state readiness", () => {
  function readySlide(index = 1): SlideSpec {
    return {
      index,
      title: `Slide ${index}`,
      purpose: "Explain the point",
      layout: "two-col",
      qa: true,
      components: ["card"],
      content: { headline: `Headline ${index}`, bullets: ["One concrete point"] },
      evidence: [{ source: "source.md" }],
      status: "ready",
    }
  }

  function readyState(): DecksState {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "investor-update",
      goal: "Board update",
      audience: "Board",
      language: "English",
      slideCount: 1,
      outputPath: "`decks/investor-update.html`",
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
      researchPlan: [{ axis: "Market", needed: true, status: "read", findingsFile: "researches/investor-update/market.md" }],
    })
    state = upsertSlides(state, "investor-update", [readySlide()])
    return reviewDeckState(state, "investor-update").state
  }

  it("computes ready only after structured deck review", () => {
    const state = readyState()
    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(true)
    expect(result.status).toBe("ready")
  })

  it("normalizes markdown-wrapped output paths", () => {
    const state = readyState()
    expect(state.decks["investor-update"].outputPath).toBe("decks/investor-update.html")
    expect(evaluateDeckStateWriteReadiness(state, "./decks/investor-update.html").ready).toBe(true)
  })

  it("blocks when required inputs are incomplete", () => {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "investor-update",
      goal: "Board update",
      slideCount: 1,
      outputPath: "decks/investor-update.html",
      requiredInputs: defaultRequiredInputs({ topicClarified: true }),
    })
    state = upsertSlides(state, "investor-update", [readySlide()])
    state = reviewDeckState(state, "investor-update").state

    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(false)
    expect(result.blocker).toContain("requiredInputs.audienceClarified")
  })

  it("blocks when slide specs are missing content", () => {
    let state = readyState()
    state.decks["investor-update"].slides[0].content = {}
    state = reviewDeckState(state, "investor-update").state

    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(false)
    expect(result.blocker).toContain("Slide 1 content is missing")
  })

  it("blocks when a needed research axis has not been read", () => {
    let state = readyState()
    state.decks["investor-update"].researchPlan = [{ axis: "Market", needed: true, status: "pending" }]
    state = reviewDeckState(state, "investor-update").state

    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(false)
    expect(result.blocker).toContain("Research axis Market")
  })

  it("extracts DECKS.json patch targets", () => {
    const targets = extractDecksStateTargetsFromPatch(`*** Begin Patch
*** Update File: DECKS.json
@@
-{}
+{}
*** Update File: decks/a.html
*** End Patch`)
    expect(targets).toEqual(["DECKS.json"])
  })

  it("creates default deck specs with blocked readiness", () => {
    const deck = createDeckSpec({ slug: "Board Update" })
    expect(deck.slug).toBe("board-update")
    expect(deck.outputPath).toBe("decks/board-update.html")
    expect(deck.writeReadiness.status).toBe("blocked")
  })
})

describe("deck path helpers", () => {
  it("recognizes deck html paths", () => {
    expect(isDeckHtmlPath("decks/investor-update.html")).toBe(true)
    expect(isDeckHtmlPath("/tmp/workspace/decks/investor-update.html")).toBe(true)
    expect(isDeckHtmlPath("slides/investor-update.html")).toBe(false)
    expect(isDeckHtmlPath("decks/investor-update.md")).toBe(false)
  })
})

describe("apply_patch deck targets", () => {
  it("extracts deck html targets from supported patch headers", () => {
    const targets = extractDeckHtmlTargetsFromPatch(`*** Begin Patch
*** Add File: decks/a.html
+<html></html>
*** Update File: decks/b.html
@@
-old
+new
*** Delete File: decks/c.html
*** Update File: notes.md
@@
-x
+y
*** Update File: src/source.ts
*** Move to: decks/d.html
*** End Patch`)

    expect(targets).toEqual(["decks/a.html", "decks/b.html", "decks/c.html", "decks/d.html"])
  })

  it("ignores non-deck html patch targets", () => {
    const targets = extractDeckHtmlTargetsFromPatch(`*** Begin Patch
*** Add File: slides/a.html
*** Update File: decks/a.md
*** Update File: src/a.html
*** End Patch`)

    expect(targets).toEqual([])
  })

  it("reads and writes the first available patch text field", () => {
    const args: Record<string, unknown> = { patch: "*** Begin Patch\n*** End Patch" }
    expect(extractPatchTextArg(args)).toBe("*** Begin Patch\n*** End Patch")
    setPatchTextArg(args, "replacement")
    expect(args.patch).toBe("replacement")
  })
})
