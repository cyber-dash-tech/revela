import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
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
  buildDecksStatePromptLayer,
  defaultRequiredInputs,
  evaluateDeckStateWriteReadiness,
  extractDecksStateTargetsFromPatch,
  reviewDeckState,
  upsertDeck,
  upsertSlides,
  writeDecksState,
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

  it("keeps init source trace adoption conservative", () => {
    const prompt = buildInitPrompt({ exists: true })
    expect(prompt).toContain("Record only visible source notes or explicit source information")
    expect(prompt).toContain("do not infer original evidence")
    expect(prompt).toContain("sourcePath")
    expect(prompt).toContain("location")
    expect(prompt).toContain("extractedTextPath")
    expect(prompt).toContain("extractedManifestPath")
    expect(prompt).toContain("A source material record alone is not slide evidence")
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
    expect(prompt).toContain("evidence and Narrative Compiler readiness review")
    expect(prompt).toContain("unsupported numbers")
    expect(prompt).toContain("narrativeBrief")
    expect(prompt).toContain("audience belief change")
    expect(prompt).toContain("decision/action")
    expect(prompt).toContain("subagent_type: \"revela-narrative-reviewer\"")
    expect(prompt).toContain("Do not self-certify semantic narrative quality")
    expect(prompt).toContain("findings as advisory critique only")
    expect(prompt).toContain("narrativeRole")
    expect(prompt).toContain("narrative_gap")
    expect(prompt).toContain("warnings")
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

  it("requires source trace mapping during evidence readiness review", () => {
    const prompt = buildReviewPrompt({ exists: true })
    expect(prompt).toContain("source trace mapping")
    expect(prompt).toContain("researchPlan[].findingsFile")
    expect(prompt).toContain("slides[].evidence[]")
    expect(prompt).toContain("findingsFile")
    expect(prompt).toContain("sourcePath")
    expect(prompt).toContain("extractedTextPath")
    expect(prompt).toContain("Do not invent quotes, page references, locations, URLs, caveats, or extraction paths")
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
      outputPath: "`decks/investor-update.html`",
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

  it("preserves evidence source trace in compact prompt state while truncating long snippets", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-decks-state-"))
    try {
      const longQuote = `${"Important source sentence. ".repeat(40)}end`
      const longCaveat = `${"Scope limitation. ".repeat(30)}end`
      let state = createEmptyDecksState()
      state.workspace.sourceMaterials = [{
        path: "sources/market.pdf",
        type: "pdf",
        status: "extracted",
        summary: "Long summary. ".repeat(80),
        extraction: {
          manifestPath: ".opencode/revela/doc-materials/hash/manifest.json",
          textPath: ".opencode/revela/doc-materials/hash/text.txt",
          cacheDir: ".opencode/revela/doc-materials/hash",
        },
      }]
      state = upsertDeck(state, {
        slug: "investor-update",
        goal: "Board update",
        outputPath: "decks/investor-update.html",
        narrativeBrief: {
          audienceBeliefBefore: "Board needs confidence in the recommendation.",
          audienceBeliefAfter: "Board understands why the recommendation is evidence-backed.",
          decisionOrAction: "Approve the recommended path.",
          narrativeArc: "context -> evidence -> recommendation -> ask",
          keyClaims: ["Revenue growth supports the recommendation."],
          objections: ["Growth may not persist."],
          risks: ["Base case excludes one-time revenue."],
        },
      })
      state = upsertSlides(state, "investor-update", [{
        ...readySlide(),
        narrativeRole: "evidence",
        content: { headline: "Revenue grows 25% annually through 2028" },
        evidence: [{
          source: "Market research",
          findingsFile: "researches/investor-update/market.md",
          sourcePath: "sources/market.pdf",
          location: "page 4, table 2",
          quote: longQuote,
          caveat: longCaveat,
          extractedTextPath: ".opencode/revela/doc-materials/hash/text.txt",
          extractedManifestPath: ".opencode/revela/doc-materials/hash/manifest.json",
        }],
      }])
      writeDecksState(workspaceRoot, state)

      const layer = buildDecksStatePromptLayer(workspaceRoot)

      expect(layer).toContain("findingsFile")
      expect(layer).toContain("narrativeBrief")
      expect(layer).toContain("audienceBeliefAfter")
      expect(layer).toContain("decisionOrAction")
      expect(layer).toContain("keyClaims")
      expect(layer).toContain("narrativeRole")
      expect(layer).toContain("evidence")
      expect(layer).toContain("researches/investor-update/market.md")
      expect(layer).toContain("sourcePath")
      expect(layer).toContain("sources/market.pdf")
      expect(layer).toContain("location")
      expect(layer).toContain("page 4, table 2")
      expect(layer).toContain("extractedTextPath")
      expect(layer).toContain("extractedManifestPath")
      expect(layer).toContain("[truncated]")
      expect(layer).not.toContain(longQuote)
      expect(layer).not.toContain(longCaveat)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
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
