import { describe, expect, it } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState } from "../lib/decks-state"
import decksTool from "../tools/decks"
import researchSaveTool from "../tools/research-save"
import workspaceScanTool from "../tools/workspace-scan"

describe("workspace tool action provenance", () => {
  function tempRoot() {
    return mkdtempSync(join(tmpdir(), "revela-tool-actions-"))
  }

  it("records workspace scan actions when DECKS.json exists", async () => {
    const root = tempRoot()
    writeDecksState(root, createEmptyDecksState())
    writeFileSync(join(root, "brief.md"), "brief", "utf-8")

    const result = JSON.parse(await (workspaceScanTool as any).execute({ max_depth: 1 }, { directory: root }))
    const state = readDecksState(root)

    expect(result.found).toBe(1)
    expect(state.actions).toContainEqual(expect.objectContaining({
      type: "workspace.scanned",
      actor: "revela-workspace-scan",
      outputs: expect.objectContaining({ found: 1, paths: ["brief.md"] }),
      nodeIds: ["source:brief.md"],
    }))
  })

  it("records research findings save actions without storing full markdown content", async () => {
    const root = tempRoot()
    writeDecksState(root, createEmptyDecksState())

    const result = JSON.parse(await (researchSaveTool as any).execute({
      topic: "Market Study",
      filename: "Demand Data",
      content: `${"large finding ".repeat(100)}`,
      sources: ["https://example.com/report"],
    }, { directory: root }))
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

    const result = JSON.parse(await (decksTool as any).execute({
      action: "init",
      sourceMaterials: [{ path: "sources/a.pdf", type: "pdf", status: "discovered" }],
    }, { directory: root }))
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
    writeDecksState(root, state)

    const review = JSON.parse(await (decksTool as any).execute({ action: "review" }, { directory: root }))
    const apply = JSON.parse(await (decksTool as any).execute({ action: "applyEvidenceCandidates", candidateIds: ["missing-candidate"] }, { directory: root }))
    const next = readDecksState(root)

    expect(review.ok).toBe(true)
    expect(apply.ok).toBe(true)
    expect(next.actions).toContainEqual(expect.objectContaining({
      type: "review.performed",
      actor: "revela-decks",
      outputs: expect.objectContaining({ ready: true, blockerCount: 0 }),
    }))
    expect(next.actions).toContainEqual(expect.objectContaining({
      type: "evidence.binding_applied",
      actor: "revela-decks",
      status: "skipped",
      inputs: { candidateIds: ["missing-candidate"] },
      outputs: expect.objectContaining({ nextReviewNeeded: false }),
    }))
  })
})
