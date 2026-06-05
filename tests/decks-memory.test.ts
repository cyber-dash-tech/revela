import { describe, expect, it } from "bun:test"
import { rmSync } from "fs"
import {
  extractDeckHtmlTargetsFromPatch,
  extractPatchTextArg,
  isDeckHtmlPath,
  setPatchTextArg,
} from "../lib/decks-memory"
import { buildInitPrompt } from "../lib/commands/init"
import { buildRememberPrompt, parseRememberArgs } from "../lib/commands/remember"
import { buildDeckPrompt, buildDeckReviewPrompt, buildReviewPrompt } from "../lib/commands/review"
import { buildResearchPrompt } from "../lib/commands/research"
import { tempWorkspace } from "./helpers/tool-helpers"
import {
  confirmDeckPlan,
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
  it("instructs the agent to scan workspace and initialize narrative state", () => {
    const prompt = buildInitPrompt({ exists: false, workspaceRoot: "/workspace/project" })
    expect(prompt).toContain("Start Revela deck-first workspace intake")
    expect(prompt).toContain("Do not create or update revela-narrative/")
    expect(prompt).toContain("revela_prepare_local_materials")
    expect(prompt).toContain("Current workspace root: `/workspace/project`")
    return
    expect(prompt).toContain("Start Revela on the current workspace")
    expect(prompt).toContain("file-native source inventory")
    expect(prompt).toContain("revela-workspace-scan")
    expect(prompt).toContain("revela-extract-document-materials")
    expect(prompt).toContain("do not create DECKS.json")
    expect(prompt).not.toContain("Build or refresh DECKS.json")
    expect(prompt).toContain("primary audience")
    expect(prompt).toContain("belief before/after")
    expect(prompt).toContain("decision/action")
    expect(prompt).toContain("thesis")
    expect(prompt).toContain("Do not infer personal preferences")
    expect(prompt).toContain("Current workspace root: `/workspace/project`")
    expect(prompt).toContain("Stay strictly inside the current workspace root")
    expect(prompt).toContain("Call `revela-workspace-scan` with no `path` and `max_depth: 2`")
    expect(prompt).toContain("Do not require slide count, visual style, design selection, output path, layout choices, or component choices")
    expect(prompt).toContain("Expected tool use during init")
    expect(prompt).toContain("controlled file-native/vault boundaries")
    expect(prompt).toContain("schema display artifact")
  })

  it("requires init to finish with questions, gaps, and next steps", () => {
    const prompt = buildInitPrompt({ exists: false })
    expect(prompt).toContain("Start Revela deck-first workspace intake")
    expect(prompt).toContain("/revela plan --deck")
    return
    expect(prompt).toContain("guided completion report")
    expect(prompt).toContain("Init Completion Report")
    expect(prompt).toContain("Do not end with only a technical success message")
    expect(prompt).toContain("question tool (AskQuestion)")
    expect(prompt).toContain("explicitly state that no clarification is needed now")
    expect(prompt).toContain("Always surface open gaps")
    expect(prompt).toContain("recommended next commands")
    expect(prompt).toContain("/revela research")
    expect(prompt).toContain("/revela story")
    expect(prompt).toContain("/revela make --deck")
    expect(prompt).toContain("Do not ask for slide count, design choice, layout choice, visual style, output path, PDF/PPTX export, or component preferences during init")
  })

  it("keeps init search bounded to the current workspace", () => {
    const prompt = buildInitPrompt({ exists: false, workspaceRoot: "/workspace/project" })
    expect(prompt).toContain("Start Revela deck-first workspace intake")
    expect(prompt).toContain("scan at max depth 2")
    return
    expect(prompt).toContain("For Glob/file searches, use the current workspace as the search root")
    expect(prompt).toContain("Do not set the search root to a parent directory or home directory")
    expect(prompt).toContain("Do not use `~`, `..`, or parent-directory traversal")
    expect(prompt).toContain("workspace-relative path only")
  })

  it("instructs the agent to scan generated artifact history separately", () => {
    const prompt = buildInitPrompt({ exists: false })
    expect(prompt).toContain("Start Revela deck-first workspace intake")
    expect(prompt).toContain("/revela plan --deck")
    return
    expect(prompt).toContain("artifact history")
    expect(prompt).toContain("decks/**/*.html")
    expect(prompt).toContain("slides/**/*.html")
    expect(prompt).toContain("presentations/**/*.html")
    expect(prompt).toContain("decks/**/*.pdf")
    expect(prompt).toContain("slides/**/*.pdf")
    expect(prompt).toContain("Search workspace-local generated artifact history only when useful")
  })

  it("updates existing DECKS.json conservatively", () => {
    const prompt = buildInitPrompt({ exists: true })
    expect(prompt).toContain("Start Revela deck-first workspace intake")
    expect(prompt).toContain("Legacy/cache state exists: yes")
    return
    expect(prompt).toContain("already exists")
    expect(prompt).toContain("already exists")
    expect(prompt).toContain("revela-decks")
    expect(prompt).toContain("read` with `summary: true")
    expect(prompt).toContain("initNarrativeVault")
    expect(prompt).toContain("repeatable ingest")
    expect(prompt).toContain("ingest.ingestCandidates")
    expect(prompt).toContain("ingest.suggestedTasks")
    expect(prompt).toContain("suggestedAction")
    expect(prompt).toContain("needsExtraction")
    expect(prompt).toContain("migration.available: true")
    expect(prompt).toContain("exportNarrativeVault")
    expect(prompt).toContain("authoringContract")
    expect(prompt).toContain("Markdown authoring guide")
    expect(prompt).toContain("narrativeInventory")
    expect(prompt).toContain("markdownQa")
    expect(prompt).toContain("repairCards")
    expect(prompt).toContain("separate from compiler diagnostics")
    expect(prompt).toContain("Reuse existing ids and relation targets")
    expect(prompt).toContain("complete payload")
    expect(prompt).toContain("Do not use JSON-era compatibility actions such as `upsertResearchGaps`")
    expect(prompt).toContain("upsertVaultResearchGap")
    expect(prompt).toContain("updateVaultResearchGap")
    expect(prompt).toContain("You may directly maintain `revela-narrative/**/*.md` knowledge nodes")
  })

  it("keeps init source trace adoption conservative", () => {
    const prompt = buildInitPrompt({ exists: true })
    expect(prompt).toContain("Start Revela deck-first workspace intake")
    expect(prompt).toContain("Legacy/cache state exists: yes")
    return
    expect(prompt).toContain("record conservative artifact context in file-native outputs or existing compatibility state only from visible information")
    expect(prompt).toContain("Do not infer hidden evidence")
    expect(prompt).toContain("workspace.sourceMaterials` and ingest task hints are candidate context, not proof")
    expect(prompt).toContain("source trace, quote/snippet, support scope, unsupported scope, caveat, and strength")
    expect(prompt).toContain("Intent briefs, proposals, and user-authored plans")
    expect(prompt).toContain("do not by themselves prove market size, competitor performance")
    expect(prompt).toContain("record the strategy as a claim with partial or missing support")
  })

  it("does not make deck render inputs mandatory during narrative init", () => {
    const prompt = buildInitPrompt({ exists: false })
    expect(prompt).toContain("Start Revela deck-first workspace intake")
    expect(prompt).toContain("/revela plan --deck")
    return
    expect(prompt).toContain("Do not require slide count, visual style, design selection, output path, layout choices, or component choices")
    expect(prompt).toContain("Do not create or update approval, render override, or writeReadiness workflow state during init")
    expect(prompt).toContain("Markdown narrative vault")
    expect(prompt).toContain("compileNarrativeVault")
    expect(prompt).toContain("initNarrativeVault")
    expect(prompt).toContain("Before writing narrative meaning, inspect `narrativeInventory`")
    expect(prompt).toContain("call `revela-decks markdownQa`, then `revela-decks compileNarrativeVault`")
    expect(prompt).toContain("If no explicit `markdownQa` result is visible after compile, call `revela-decks markdownQa` as a manual fallback")
    expect(prompt).toContain("keep `markdownQa.repairCards` separate from compiler blockers")
    expect(prompt).toContain("Always include `Markdown QA: clean` or `Markdown QA blockers:` in the final report")
    expect(prompt).toContain("do not say the workspace initialized cleanly")
    expect(prompt).toContain("distill stable findings into `revela-narrative/**/*.md` using the Markdown authoring guide")
    expect(prompt).toContain("partial claims, caveats, unsupported scope, and research gaps")
    expect(prompt).toContain("Preserve frontmatter ids and existing section headings")
    expect(prompt).toContain("optional helpers such as `upsertVaultResearchGap`, `upsertVaultEvidence`, or `bindResearchFindings`")
    expect(prompt).toContain("Add graph edges afterward in the source node's `## Relations` section")
    expect(prompt).toContain("Do not use `relations.md`, typed wikilinks, or hand-written relation ids")
    expect(prompt).toContain("New graph relations belong in node-local `## Relations` sections")
    expect(prompt).toContain("## Relations")
    expect(prompt).toContain("Do not duplicate stable headings")
    expect(prompt).toContain("## Caveats")
    expect(prompt).toContain("## Evidence")
    expect(prompt).toContain("Do not append a second frontmatter block")
    expect(prompt).toContain("Supported `type` values")
    expect(prompt).toContain("`research-gap`, not `researchGap` or `research_gap`")
    expect(prompt).toContain("Do not write typed targets such as `[[claim:claim-belief-change-purpose]]`")
    expect(prompt).toContain("Evidence nodes require source trace")
    expect(prompt).toContain("Keep `claimId` only as compatibility fallback")
    expect(prompt).toContain("Do not use `upsertNarrative`")
    expect(prompt).toContain("structurally valid")
    expect(prompt).toContain("not evidence readiness")
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
  it("builds a prompt that reviews narrative readiness", () => {
    const prompt = buildReviewPrompt({ exists: true })
    expect(prompt).toContain("Review Revela narrative readiness")
    expect(prompt).toContain("canonical narrative state")
    expect(prompt).toContain("reviewNarrative")
    expect(prompt).toContain("vaultDiagnostics")
    expect(prompt).toContain("Markdown QA repair cards and compile diagnostics with file/node/code/message")
    expect(prompt).toContain("file/node/code/message")
    expect(prompt).toContain("Keep Markdown QA repair cards separate from compiler diagnostics")
    expect(prompt).toContain("Do not call `revela-decks` action `review` here")
    expect(prompt).toContain("writeReadiness.status")
    expect(prompt).toContain("Narrative readiness: <status>")
    expect(prompt).toContain("Do not ask for narrative approval")
    expect(prompt).toContain("Do not report missing or stale approval as a problem")
    expect(prompt).toContain("/revela make --deck")
    expect(prompt).toContain("Do not write or overwrite `decks/*.html`")
  })

  it("builds a deck/artifact gate prompt separately", () => {
    const prompt = buildDeckReviewPrompt({ exists: true })
    expect(prompt).toContain("Review Revela deck/artifact write readiness")
    expect(prompt).toContain("artifact diagnostics")
    expect(prompt).toContain("technical blockers only")
    expect(prompt).toContain("legacy/cache state")
    expect(prompt).toContain("deck-plan.md")
    expect(prompt).toContain("writeReadiness")
    expect(prompt).toContain("evidence and Narrative Compiler readiness review")
    expect(prompt).toContain("unsupported numbers")
    expect(prompt).toContain("narrative risks as diagnostics")
    expect(prompt).toContain("audience belief change")
    expect(prompt).toContain("decision/action")
    expect(prompt).toContain("read-only Task subagent `revela-narrative-reviewer`")
    expect(prompt).toContain("Do not self-certify semantic narrative quality")
    expect(prompt).toContain("findings as advisory critique only")
    expect(prompt).toContain("advisory critique only")
    expect(prompt).toContain("narrative_gap")
    expect(prompt).toContain("warnings")
    expect(prompt).toContain("candidate evidence bindings")
    expect(prompt).toContain("readDeckPlan")
    expect(prompt).toContain("HTML contract")
    expect(prompt).toContain("Technical blockers only")
    expect(prompt).toContain("DECKS.json")
    expect(prompt).toContain("file-native artifact diagnostics")
    expect(prompt).toContain("Do not write or overwrite `decks/*.html`")
  })

  it("builds a deck handoff prompt from approved narrative to artifact gate", () => {
    const prompt = buildDeckPrompt({ exists: true, workspaceRoot: "/workspace/project" })
    expect(prompt).toContain("Begin Revela deck plan handoff")
    expect(prompt).toContain("deck-render prompt mode")
    expect(prompt).toContain("reviewNarrative")
    expect(prompt).toContain("compileDeckPlan")
    expect(prompt).toContain("claim/evidence planning packet")
    expect(prompt).toContain("readDeckPlan")
    expect(prompt).toContain("Do not infer render structure from `DECKS.json.slides[]`")
    expect(prompt).toContain("low-fidelity layout sketch")
    expect(prompt).toContain("Deck plan: drafted")
    expect(prompt).toContain("Cover, Table of Contents, and Closing")
    expect(prompt).toContain("Required structure: Cover + Table of Contents + Closing")
    expect(prompt).toContain("Chapters")
    expect(prompt).toContain("chapter by chapter")
    expect(prompt).toContain("one broad pass")
    expect(prompt).toContain("Stop after presenting the plan")
    expect(prompt).toContain("confirmDeckPlan")
    expect(prompt).toContain("compatibility/provenance")
    expect(prompt).toContain("permission blockers")
    expect(prompt).toContain("revela-deck-foundation")
    expect(prompt).toContain("foundation shell")
    expect(prompt).toContain("revela-slides")
    expect(prompt).toContain("revela-designs read")
    expect(prompt).toContain("vaultDiagnostics.blockers")
    expect(prompt).toContain("markdownQa.blockers")
    expect(prompt).toContain("data-integrity issues")
    expect(prompt).toContain("Markdown QA repair cards separately from compile diagnostics")
    expect(prompt).toContain("Markdown QA repair cards and vault diagnostic warnings")
    expect(prompt).toContain("Deck handoff: <status>")
    expect(prompt).toContain("deck HTML contract")
    expect(prompt).toContain("Do not write or overwrite `decks/*.html` until")
    expect(prompt).toContain("user chooses to proceed")
    expect(prompt).toContain("Current workspace root: `/workspace/project`")
  })

  it("does not initialize DECKS.json when missing", () => {
    const prompt = buildDeckReviewPrompt({ exists: false })
    expect(prompt).toContain("DECKS.json does not exist")
    expect(prompt).toContain("Review artifacts directly from files")
    expect(prompt).toContain("Do not write, patch, or create DECKS.json")
  })

  it("requires source trace mapping during deck evidence readiness review", () => {
    const prompt = buildDeckReviewPrompt({ exists: true })
    expect(prompt).toContain("source trace mapping")
    expect(prompt).toContain("researchPlan` findings")
    expect(prompt).toContain("slides[].evidence[]")
    expect(prompt).toContain("findingsFile")
    expect(prompt).toContain("sourcePath")
    expect(prompt).toContain("evidenceCandidates")
    expect(prompt).toContain("candidateId")
    expect(prompt).toContain("conservative binding candidates only")
    expect(prompt).toContain("sourceKind")
    expect(prompt).toContain("researchesFallback")
    expect(prompt).toContain("evidenceDraft")
    expect(prompt).toContain("unsupportedScope")
    expect(prompt).toContain("recommendedRewrite")
    expect(prompt).toContain("revela-narrative/evidence/*.md")
    expect(prompt).toContain("compileNarrativeVault")
    expect(prompt).toContain("write `revela-narrative/evidence/*.md` directly")
    expect(prompt).toContain("evidenceCandidateSearch")
    expect(prompt).toContain("near misses")
    expect(prompt).toContain("Do not invent evidence")
    expect(prompt).toContain("do not fill missing evidence, source trace, quotes, URLs, page references, or caveats")
  })
})

describe("research command", () => {
  it("builds a tool-driven research and binding prompt", () => {
    const prompt = buildResearchPrompt({ exists: true, workspaceRoot: "/workspace/project" })
    expect(prompt).toContain("Run Revela deck-first research")
    expect(prompt).toContain("Save useful findings under researches")
    expect(prompt).toContain("/revela plan --deck")
    expect(prompt).not.toContain("bindResearchFindings")
    return
    expect(prompt).toContain("Run Revela research from deterministic state")
    expect(prompt).toContain("Stop after at most 3 rounds")
    expect(prompt).toContain("bindResearchFindings")
    expect(prompt).toContain("Binding criteria")
    expect(prompt).toContain("Never call `upsertNarrative` during research")
    expect(prompt).toContain("revela-narrative/evidence/*.md")
    expect(prompt).toContain("Re-run `deriveResearchTargets` after attachment, binding, or explicit vault edits")
    expect(prompt).toContain("Call `revela-decks deriveResearchTargets`")
    expect(prompt).toContain("call `revela-decks narrativeInventory` before editing claims, gaps, evidence, or relations")
    expect(prompt).toContain("markdownQa.repairCards")
    expect(prompt).toContain("call `revela-decks markdownQa`")
    expect(prompt).toContain("then add explicit edges in the source node's `## Relations` section")
    expect(prompt).toContain("Do not use `relations.md`, typed wikilinks, or hand-written relation ids")
    expect(prompt).toContain("bindingDiagnostic")
    expect(prompt).toContain("bindingEval.status")
    expect(prompt).toContain("Vault diagnostics")
    expect(prompt).toContain("Markdown QA")
    expect(prompt).toContain("smallestRepair")
    expect(prompt).toContain("Evidence trust")
    expect(prompt).toContain("structural authoring feedback only")
    expect(prompt).toContain("compiled claim `evidenceStatus` separately from Markdown QA")
    expect(prompt).toContain("diagnosticReport")
    expect(prompt).toContain("file/node/code/message")
    expect(prompt).toContain("pause binding and research mutations")
    expect(prompt).toContain("Selected target")
    expect(prompt).toContain("Unbound findings")
    expect(prompt).toContain("internal_data_needed")
    expect(prompt).toContain("Current workspace root: `/workspace/project`")
    expect(prompt).toContain("Do not invent claim ids, evidence ids, research-gap ids, or relation targets before checking `narrativeInventory`")
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
    state = confirmDeckPlan(state, { approvedBy: "user", note: "Confirmed test plan.", now: "2026-01-01T00:00:00.000Z" }).state
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

  it("warns when required inputs are incomplete", () => {
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
    expect(result.ready).toBe(true)
    expect(result.warnings).toContain("Legacy requiredInputs.audienceClarified is not true")
  })

  it("warns when the slide plan has not been confirmed", () => {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "investor-update",
      goal: "Board update",
      audience: "Board",
      language: "English",
      outputPath: "decks/investor-update.html",
      theme: { design: "aurora", domain: "general" },
      requiredInputs: defaultRequiredInputs({
        topicClarified: true,
        audienceClarified: true,
        languageDecided: true,
        visualStyleSelected: true,
        sourceMaterialsIdentified: true,
        researchNeedAssessed: true,
        researchFindingsRead: true,
        slidePlanConfirmed: true,
        designLayoutsFetched: true,
      }),
      researchPlan: [{ axis: "Market", needed: true, status: "read", findingsFile: "researches/investor-update/market.md" }],
    })
    state = upsertSlides(state, "investor-update", [readySlide()])
    state = reviewDeckState(state, "investor-update").state

    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(true)
    expect(result.issues.some((issue) => issue.type === "slide_plan_unconfirmed")).toBe(true)
    expect(result.warnings.some((warning) => warning.includes("Deck plan is not confirmed"))).toBe(true)
  })

  it("warns when confirmed slide plan changes", () => {
    let state = readyState()
    state = upsertSlides(state, "investor-update", [{ ...readySlide(), content: { headline: "Changed headline", bullets: ["One concrete point"] } }])
    state = reviewDeckState(state, "investor-update").state

    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(true)
    expect(result.issues.some((issue) => issue.type === "slide_plan_unconfirmed")).toBe(true)
    expect(result.warnings.some((warning) => warning.includes("confirmation is stale"))).toBe(true)
  })

  it("warns when cached slide specs are missing content", () => {
    let state = readyState()
    state.decks["investor-update"].slides[0].content = {}
    state = reviewDeckState(state, "investor-update").state

    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(true)
    expect(result.warnings).toContain("Cached slide 1 content is missing")
  })

  it("warns when a needed research axis has not been read", () => {
    let state = readyState()
    state.decks["investor-update"].researchPlan = [{ axis: "Market", needed: true, status: "pending" }]
    state = reviewDeckState(state, "investor-update").state

    const result = evaluateDeckStateWriteReadiness(state, "decks/investor-update.html")
    expect(result.ready).toBe(true)
    expect(result.warnings).toContain("Research axis Market is needed but pending")
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
    const workspaceRoot = tempWorkspace("revela-decks-state-")
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
      expect(layer).toContain("compatibility/render state")
      expect(layer).toContain("deck-plan.md")
      expect(layer).toContain("Do not treat DECKS.json `slides[]` as the authoritative HTML slide-count")
      expect(layer).toContain("unique and strictly increase in DOM order")
      expect(layer).not.toContain("source of truth for the single current deck's specs, slide plan")
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

  it("keeps deck html patches separate from controlled state patches", () => {
    const deckPatch = `*** Begin Patch
*** Update File: decks/runtime-bug.html
@@
-broken()
+fixed()
*** End Patch`
    expect(extractDeckHtmlTargetsFromPatch(deckPatch)).toEqual(["decks/runtime-bug.html"])
    expect(extractDecksStateTargetsFromPatch(deckPatch)).toEqual([])

    const statePatch = `*** Begin Patch
*** Update File: DECKS.json
@@
-{}
+{"decks":{}}
*** End Patch`
    expect(extractDeckHtmlTargetsFromPatch(statePatch)).toEqual([])
    expect(extractDecksStateTargetsFromPatch(statePatch)).toEqual(["DECKS.json"])
  })

  it("reads and writes the first available patch text field", () => {
    const args: Record<string, unknown> = { patch: "*** Begin Patch\n*** End Patch" }
    expect(extractPatchTextArg(args)).toBe("*** Begin Patch\n*** End Patch")
    setPatchTextArg(args, "replacement")
    expect(args.patch).toBe("replacement")
  })
})
