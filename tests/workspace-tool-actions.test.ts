import { describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { confirmDeckPlan, createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState } from "../lib/decks-state"
import { currentReviewInputHash } from "../lib/workspace-state/review-snapshots"
import researchSaveTool from "../tools/research-save"
import workspaceScanTool from "../tools/workspace-scan"
import { executeDecksTool, executeTool, tempWorkspace } from "./helpers/tool-helpers"

describe("workspace tool action provenance", () => {
  function tempRoot() {
    return tempWorkspace("revela-tool-actions-")
  }

  it("records workspace scan actions when DECKS.json exists", async () => {
    const root = tempRoot()
    writeDecksState(root, createEmptyDecksState())
    writeFileSync(join(root, "brief.md"), "brief", "utf-8")

    const result = await executeTool(workspaceScanTool, { max_depth: 1 }, root)
    const state = readDecksState(root)

    expect(result.found).toBe(1)
    expect(state.actions).toContainEqual(expect.objectContaining({
      type: "workspace.scanned",
      actor: "revela-workspace-scan",
      outputs: expect.objectContaining({ found: 1, paths: ["brief.md"] }),
      nodeIds: ["source:brief.md"],
    }))
  })

  it("excludes project docs and Office lock files from workspace scans", async () => {
    const root = tempRoot()
    writeDecksState(root, createEmptyDecksState())
    writeFileSync(join(root, "AGENTS.md"), "agent notes", "utf-8")
    writeFileSync(join(root, "README.md"), "readme", "utf-8")
    writeFileSync(join(root, "~$proposal.docx"), "lock", "utf-8")
    writeFileSync(join(root, "proposal.docx"), "proposal", "utf-8")

    const result = await executeTool(workspaceScanTool, { max_depth: 1 }, root)
    const state = readDecksState(root)

    expect(result.found).toBe(1)
    expect(result.files.map((file: { path: string }) => file.path)).toEqual(["proposal.docx"])
    expect(state.actions).toContainEqual(expect.objectContaining({
      type: "workspace.scanned",
      outputs: expect.objectContaining({ found: 1, paths: ["proposal.docx"] }),
      nodeIds: ["source:proposal.docx"],
    }))
  })

  it("records research findings save actions without storing full markdown content", async () => {
    const root = tempRoot()
    writeDecksState(root, createEmptyDecksState())

    const result = await executeTool(researchSaveTool, {
      topic: "Market Study",
      filename: "Demand Data",
      content: `${"large finding ".repeat(100)}`,
      sources: ["https://example.com/report"],
    }, root)
    const state = readDecksState(root)

    expect(result.path).toBe("researches/market-study/demand-data.md")
    expect(state.actions).toContainEqual(expect.objectContaining({
      type: "research.findings_saved",
      actor: "revela-research-save",
      inputs: { topic: "market-study", axis: "demand-data", sourceCount: 1 },
      outputs: { path: "researches/market-study/demand-data.md", sources: ["https://example.com/report"] },
      nodeIds: ["finding:researches/market-study/demand-data.md"],
    }))
    expect(JSON.stringify(state.actions)).not.toContain("large finding")
  })

  it("records source discovery through revela-decks init", async () => {
    const root = tempRoot()

    const result = await executeDecksTool({
      action: "init",
      sourceMaterials: [{ path: "sources/a.pdf", type: "pdf", status: "discovered" }],
    }, root)
    const state = readDecksState(root)

    expect(result.ok).toBe(true)
    expect(state.actions).toContainEqual(expect.objectContaining({
      type: "source.discovered",
      actor: "revela-decks",
      outputs: expect.objectContaining({ paths: ["sources/a.pdf"] }),
      nodeIds: ["source:sources/a.pdf"],
    }))
  })

  it("records review and explicit evidence apply actions through revela-decks", async () => {
    const root = tempRoot()
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "tool-actions",
      goal: "Create a traceable deck.",
      outputPath: "decks/tool-actions.html",
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
    state = upsertSlides(state, "tool-actions", [{
      index: 1,
      title: "Cover",
      purpose: "Introduce the deck",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "Traceable Deck" },
      evidence: [{ source: "user request" }],
      status: "ready",
    }])
    state = confirmDeckPlan(state, { approvedBy: "user", note: "Confirmed test plan.", now: "2026-01-01T00:00:00.000Z" }).state
    writeDecksState(root, state)

    const review = await executeDecksTool({ action: "review" }, root)
    const apply = await executeDecksTool({ action: "applyEvidenceCandidates", candidateIds: ["missing-candidate"] }, root)
    const next = readDecksState(root)

    expect(review.ok).toBe(true)
    expect(apply.ok).toBe(true)
    expect(next.actions).toContainEqual(expect.objectContaining({
      type: "review.performed",
      actor: "revela-decks",
      outputs: expect.objectContaining({
        ready: true,
        blockerCount: 0,
        snapshotId: expect.stringMatching(/^review:/),
        inputHash: expect.stringMatching(/^[a-f0-9]{40}$/),
        targetId: "target:html_deck:decks/tool-actions.html",
      }),
    }))
    expect(next.reviews).toContainEqual(expect.objectContaining({
      targetId: "target:html_deck:decks/tool-actions.html",
      status: "ready",
    }))
    expect(next.actions).toContainEqual(expect.objectContaining({
      type: "evidence.binding_applied",
      actor: "revela-decks",
      status: "skipped",
      inputs: { candidateIds: ["missing-candidate"] },
      outputs: expect.objectContaining({ nextReviewNeeded: false }),
    }))
  })

  it("explicitly attaches research findings to a matching researchPlan axis", async () => {
    const root = tempRoot()
    mkdirSync(join(root, "researches", "market"), { recursive: true })
    writeFileSync(join(root, "researches", "market", "demand-data.md"), "## Data\n- Demand is growing", "utf-8")
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "tool-actions",
      goal: "Create a traceable deck.",
      outputPath: "decks/tool-actions.html",
      researchPlan: [{ axis: "Demand Data", needed: true, status: "pending" }],
    })
    state = upsertSlides(state, "tool-actions", [{
      index: 1,
      title: "Market Demand",
      purpose: "Show demand",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "Demand is growing" },
      evidence: [],
      status: "planned",
    }])
    const beforeHash = currentReviewInputHash(state, "tool-actions")
    writeDecksState(root, state)

    const result = await executeDecksTool({
      action: "attachResearchFindings",
      findingsFile: "researches/market/demand-data.md",
      researchStatus: "done",
    }, root)
    const next = readDecksState(root)

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({
      attached: true,
      skipped: false,
      axis: "Demand Data",
      findingsFile: "researches/market/demand-data.md",
      status: "done",
    })
    expect(next.decks["tool-actions"].researchPlan[0]).toMatchObject({
      axis: "Demand Data",
      status: "done",
      findingsFile: "researches/market/demand-data.md",
    })
    expect(next.decks["tool-actions"].slides[0].evidence).toEqual([])
    expect(currentReviewInputHash(next, "tool-actions")).not.toBe(beforeHash)
    expect(next.actions).toContainEqual(expect.objectContaining({
      type: "research.findings_attached",
      actor: "revela-decks",
      outputs: expect.objectContaining({ axis: "Demand Data", findingsFile: "researches/market/demand-data.md", status: "done" }),
      nodeIds: ["finding:researches/market/demand-data.md"],
    }))
  })

  it("refuses ambiguous or unsafe research findings attachment", async () => {
    const root = tempRoot()
    mkdirSync(join(root, "researches", "market"), { recursive: true })
    writeFileSync(join(root, "researches", "market", "market.md"), "## Data\n- Finding", "utf-8")
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "tool-actions",
      goal: "Create a traceable deck.",
      outputPath: "decks/tool-actions.html",
      researchPlan: [
        { axis: "Market", needed: true, status: "pending" },
        { axis: "Market", needed: true, status: "pending" },
      ],
    })
    writeDecksState(root, state)

    const ambiguous = await executeDecksTool({
      action: "attachResearchFindings",
      findingsFile: "researches/market/market.md",
    }, root)
    const unsafe = await executeDecksTool({
      action: "attachResearchFindings",
      findingsFile: "../outside.md",
      researchAxis: "Market",
    }, root)
    const next = readDecksState(root)

    expect(ambiguous.result).toMatchObject({ attached: false, skipped: true, reason: "researchPlan axis match is ambiguous" })
    expect(unsafe.result).toMatchObject({ attached: false, skipped: true, reason: "findingsFile must be a workspace-relative researches/*.md path" })
    expect(next.decks["tool-actions"].researchPlan.every((axis) => axis.findingsFile === undefined)).toBe(true)
    expect(next.actions.filter((action) => action.type === "research.findings_attached" && action.status === "skipped")).toHaveLength(2)
  })
})
