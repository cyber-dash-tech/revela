import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { DECKS_STATE_FILE, confirmDeckPlan, createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState } from "../lib/decks-state"
import { currentReviewInputHash } from "../lib/workspace-state/review-snapshots"
import researchSaveTool from "../tools/research-save"
import workspaceScanTool from "../tools/workspace-scan"
import { narrativeMapState } from "./helpers/narrative-fixtures"
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
    expect(result.files[0].sourceMaterial.lastModified).toEqual(expect.any(String))
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
    mkdirSync(join(root, "revela-narrative"), { recursive: true })
    writeFileSync(join(root, "revela-narrative", "index.md"), "vault", "utf-8")

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

  it("returns binding eval when saving findings in an initialized workspace", async () => {
    const root = tempRoot()
    writeDecksState(root, narrativeMapState())

    const result = await executeTool(researchSaveTool, {
      topic: "Map Demo",
      filename: "Supplier Extra",
      content: `## Recommended evidence bindings
- claimId: claim:missing
- Quote: "Pilot suppliers can cover 80% of requested launch volume in the first two quarters."
- Support scope: supplier launch capacity for the pilot.
- Unsupported scope: full national rollout capacity remains unverified.
- Caveat: supplier lead times were measured before the latest demand spike.
- Strength: partial
`,
      sources: ["https://example.com/supplier-report"],
    }, root)

    expect(result).toMatchObject({
      ok: true,
      path: "researches/map-demo/supplier-extra.md",
      bindingEval: {
        status: "bindable",
        claimId: "claim:missing",
        recommendedEvidenceDraft: expect.objectContaining({ findingsFile: "researches/map-demo/supplier-extra.md" }),
      },
    })
    expect(readDecksState(root).actions).toContainEqual(expect.objectContaining({
      type: "research.findings_saved",
      outputs: expect.objectContaining({ path: "researches/map-demo/supplier-extra.md" }),
    }))
  })

  it("records source discovery through revela-decks init", async () => {
    const root = tempRoot()

    const result = await executeDecksTool({
      action: "init",
      sourceMaterials: [{ path: "sources/a.pdf", type: "pdf", status: "discovered" }],
    }, root)

    expect(result.ok).toBe(true)
    expect(result.persisted).toBe(false)
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    expect(result.state.actions).toContainEqual(expect.objectContaining({
      type: "source.discovered",
      actor: "revela-decks",
      outputs: expect.objectContaining({ paths: ["sources/a.pdf"] }),
      nodeIds: ["source:sources/a.pdf"],
    }))
  })

  it("classifies all source files as ingest candidates before a vault exists", async () => {
    const root = tempRoot()

    const result = await executeDecksTool({
      action: "init",
      sourceMaterials: [
        { path: "sources/a.pdf", type: "pdf", fingerprint: "a", lastModified: "2026-01-01T00:00:00.000Z", status: "discovered" },
        { path: "notes/b.md", type: "md", fingerprint: "b", lastModified: "2026-01-02T00:00:00.000Z", status: "discovered" },
      ],
    }, root)

    expect(result.ingest.vaultTimestamp).toBeNull()
    expect(result.ingest.addedSourceMaterials.map((item: { path: string }) => item.path)).toEqual(["sources/a.pdf", "notes/b.md"])
    expect(result.ingest.newerThanVaultSourceMaterials.map((item: { path: string }) => item.path)).toEqual(["sources/a.pdf", "notes/b.md"])
    expect(result.ingest.ingestCandidates.map((item: { path: string }) => item.path)).toEqual(["notes/b.md", "sources/a.pdf"])
    expect(result.ingest.suggestedTasks).toEqual([
      expect.objectContaining({
        path: "notes/b.md",
        reason: ["added", "newer_than_vault"],
        materialType: "md",
        needsExtraction: false,
        suggestedAction: "read_directly",
      }),
      expect.objectContaining({
        path: "sources/a.pdf",
        reason: ["added", "newer_than_vault"],
        materialType: "pdf",
        needsExtraction: true,
        suggestedAction: "extract_then_read",
      }),
    ])
    expect(result.ingest.unchangedSourceMaterials).toEqual([])
  })

  it("classifies added, changed, newer-than-vault, and unchanged sources during refresh", async () => {
    const root = tempRoot()
    await executeDecksTool({ action: "initNarrativeVault" }, root)
    const state = createEmptyDecksState()
    state.workspace.sourceMaterials = [
      { path: "same.pdf", type: "pdf", fingerprint: "same", lastModified: "2000-01-01T00:00:00.000Z", status: "discovered" },
      { path: "changed.pdf", type: "pdf", fingerprint: "old", lastModified: "2000-01-01T00:00:00.000Z", status: "extracted", extraction: { manifestPath: "old.json", textPath: "old.txt", cacheDir: "old" } },
      { path: "newer.pdf", type: "pdf", fingerprint: "newer", lastModified: "2000-01-01T00:00:00.000Z", status: "discovered" },
    ]
    writeDecksState(root, state)

    const future = new Date(Date.now() + 60_000).toISOString()
    const result = await executeDecksTool({
      action: "init",
      sourceMaterials: [
        { path: "same.pdf", type: "pdf", fingerprint: "same", lastModified: "2000-01-01T00:00:00.000Z", status: "discovered" },
        { path: "changed.pdf", type: "pdf", fingerprint: "new", lastModified: "2000-01-01T00:00:00.000Z", status: "discovered" },
        { path: "newer.pdf", type: "pdf", fingerprint: "newer", lastModified: future, status: "discovered" },
        { path: "added.pdf", type: "pdf", fingerprint: "added", lastModified: "2000-01-01T00:00:00.000Z", status: "discovered" },
      ],
    }, root)
    const next = readDecksState(root)

    expect(result.ingest.vaultTimestamp).toEqual(expect.any(String))
    expect(result.ingest.addedSourceMaterials.map((item: { path: string }) => item.path)).toEqual(["added.pdf"])
    expect(result.ingest.changedSourceMaterials.map((item: { path: string }) => item.path)).toEqual(["changed.pdf"])
    expect(result.ingest.newerThanVaultSourceMaterials.map((item: { path: string }) => item.path)).toEqual(["newer.pdf"])
    expect(result.ingest.unchangedSourceMaterials.map((item: { path: string }) => item.path)).toEqual(["same.pdf"])
    expect(result.ingest.ingestCandidates.map((item: { path: string }) => item.path)).toEqual(["added.pdf", "changed.pdf", "newer.pdf"])
    expect(result.ingest.suggestedTasks).toEqual([
      expect.objectContaining({ path: "added.pdf", reason: ["added"], needsExtraction: true, suggestedAction: "extract_then_read" }),
      expect.objectContaining({ path: "changed.pdf", reason: ["changed"], needsExtraction: true, suggestedAction: "extract_then_read" }),
      expect.objectContaining({ path: "newer.pdf", reason: ["newer_than_vault"], needsExtraction: true, suggestedAction: "extract_then_read" }),
    ])
    expect(next.workspace.sourceMaterials.find((item) => item.path === "changed.pdf")?.extraction).toBeUndefined()
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

  it("evaluates research findings through revela-decks without mutating narrative evidence", async () => {
    const root = tempRoot()
    const state = narrativeMapState()
    mkdirSync(join(root, "researches", "map-demo"), { recursive: true })
    writeFileSync(join(root, "researches", "map-demo", "supplier-extra.md"), `## Recommended evidence bindings
- claimId: claim:missing
- Source: https://example.com/supplier-report
- Quote: "Pilot suppliers can cover 80% of requested launch volume in the first two quarters."
- Support scope: supplier launch capacity for the pilot.
- Unsupported scope: full national rollout capacity remains unverified.
- Caveat: supplier lead times were measured before the latest demand spike.
- Strength: partial
`, "utf-8")
    const beforeBindings = state.narrative?.evidenceBindings.length ?? 0
    writeDecksState(root, state)

    const result = await executeDecksTool({
      action: "evaluateResearchFindings",
      findingsFile: "researches/map-demo/supplier-extra.md",
    }, root)
    const next = readDecksState(root)

    expect(result.ok).toBe(true)
    expect(result.result.bindingEval).toMatchObject({ status: "bindable", claimId: "claim:missing" })
    expect(result.result.selected).toMatchObject({ kind: "research_gap", targetId: "claim:missing" })
    expect(next.narrative?.evidenceBindings.length ?? 0).toBe(beforeBindings)
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
