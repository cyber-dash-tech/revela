import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, readDecksState, upsertDeck, writeDecksState, type DecksState } from "../lib/decks-state"
import { handleNarrative } from "../lib/commands/narrative"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { buildNarrativeMap, formatNarrativeMap } from "../lib/narrative-state/map"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { recordArtifactRenderTarget } from "../lib/workspace-state/render-targets"

describe("narrative map", () => {
  function narrativeMapState(): DecksState {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "map-demo",
      goal: "Approve a phased AI manufacturing pilot.",
      audience: "Board",
      outputPath: "decks/map-demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:map-demo",
      status: "ready_for_approval",
      audience: {
        primary: "Board",
        beliefBefore: "The board sees AI manufacturing as speculative.",
        beliefAfter: "The board sees a phased pilot as bounded and evidence-backed.",
      },
      decision: { action: "Approve the phased pilot.", decisionType: "approve" },
      thesis: { id: "thesis:pilot", statement: "A phased pilot captures upside while bounding execution risk.", confidence: "medium" },
      claims: [
        {
          id: "claim:supported",
          kind: "recommendation",
          text: "Phased pilot approval is the safer path.",
          importance: "central",
          evidenceRequired: true,
          evidenceStatus: "supported",
          supportedScope: "Pilot scope only.",
        },
        {
          id: "claim:partial",
          kind: "evidence",
          text: "Current line data supports initial automation gains.",
          importance: "supporting",
          evidenceRequired: true,
          evidenceStatus: "partial",
          unsupportedScope: "Does not prove lights-out manufacturing.",
        },
        {
          id: "claim:missing",
          kind: "opportunity",
          text: "Supplier ecosystem readiness is proven.",
          importance: "supporting",
          evidenceRequired: true,
          evidenceStatus: "missing",
        },
        {
          id: "claim:not-required",
          kind: "context",
          text: "The decision is about sequencing.",
          importance: "background",
          evidenceRequired: false,
          evidenceStatus: "not_required",
        },
      ],
      evidenceBindings: [
        {
          id: "evidence:supported:ops",
          claimId: "claim:supported",
          source: "Operations study",
          findingsFile: "researches/map-demo/ops.md",
          quote: "Pilot scope fits current operating constraints.",
          location: "section 2",
          strength: "strong",
          supportScope: "Pilot scope only.",
        },
        {
          id: "evidence:partial:line",
          claimId: "claim:partial",
          source: "Line data",
          sourcePath: "sources/line-data.xlsx",
          quote: "Automation reduced manual interventions by 18%.",
          location: "Sheet1!B2",
          strength: "partial",
          unsupportedScope: "No supplier readiness proof.",
        },
      ],
      objections: [{ id: "objection:roi", text: "ROI may be too uncertain.", claimId: "claim:supported", priority: "high", response: "Stage gates cap exposure." }],
      risks: [{ id: "risk:supplier", text: "Supplier readiness may lag.", claimId: "claim:partial", severity: "medium", mitigation: "Gate supplier integration separately." }],
      approvals: [],
      updatedAt: "2026-05-07T00:00:00.000Z",
    }
    state.narrative = normalizeNarrativeState(state)
    const hash = computeNarrativeHash(state.narrative)
    state.narrative.approvals.push({
      id: "approval:map-demo",
      narrativeHash: hash,
      approvedAt: "2026-05-07T00:00:00.000Z",
      approvedBy: "user",
      scope: "narrative",
    })
    recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/map-demo.html", type: "pdf", outputPath: "decks/map-demo.pdf" })
    recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/map-demo.html", type: "pptx", outputPath: "decks/map-demo.pptx" })
    return state
  }

  it("builds a read-only narrative map with snapshot, claim evidence, risks, and artifacts", () => {
    const map = buildNarrativeMap(narrativeMapState())

    expect(map.snapshot).toMatchObject({
      status: "approved",
      approval: "current",
      primaryAudience: "Board",
      decisionAction: "Approve the phased pilot.",
      thesis: "A phased pilot captures upside while bounding execution risk.",
    })
    expect(map.claims.supported).toContainEqual(expect.objectContaining({
      id: "claim:supported",
      evidence: [expect.objectContaining({ findingsFile: "researches/map-demo/ops.md", strength: "strong" })],
    }))
    expect(map.claims.partial).toContainEqual(expect.objectContaining({ id: "claim:partial", unsupportedScope: "Does not prove lights-out manufacturing." }))
    expect(map.claims.missing).toContainEqual(expect.objectContaining({ id: "claim:missing" }))
    expect(map.claims.not_required).toContainEqual(expect.objectContaining({ id: "claim:not-required" }))
    expect(map.objections).toContainEqual(expect.objectContaining({ text: "ROI may be too uncertain.", claimText: "Phased pilot approval is the safer path." }))
    expect(map.risks).toContainEqual(expect.objectContaining({ text: "Supplier readiness may lag.", claimText: "Current line data supports initial automation gains." }))
    expect(map.artifactCoverage).toContainEqual(expect.objectContaining({ type: "html_deck", outputPath: "decks/map-demo.html" }))
    expect(map.artifactCoverage).toContainEqual(expect.objectContaining({ type: "pdf", outputPath: "decks/map-demo.pdf" }))
    expect(map.artifactCoverage).toContainEqual(expect.objectContaining({ type: "pptx", outputPath: "decks/map-demo.pptx" }))
  })

  it("formats the narrative map as a stable markdown workspace view", () => {
    const text = formatNarrativeMap(buildNarrativeMap(narrativeMapState()))

    expect(text).toContain("## Narrative Snapshot")
    expect(text).toContain("- Approval: current")
    expect(text).toContain("## Claim Evidence Board")
    expect(text).toContain("### supported (1)")
    expect(text).toContain("### partial (1)")
    expect(text).toContain("### missing (1)")
    expect(text).toContain("Evidence: Operations study (strong)")
    expect(text).toContain("## Objections & Risks")
    expect(text).toContain("## Artifact Coverage")
    expect(text).toContain("html_deck: decks/map-demo.html")
  })

  it("reports stale approval when canonical narrative changes", () => {
    const state = narrativeMapState()
    state.narrative!.claims[0].text = "Pilot approval now requires a narrower scope."

    expect(buildNarrativeMap(state).snapshot.approval).toBe("stale")
  })

  it("shows /revela init guidance when DECKS.json is missing", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-map-missing-"))
    const messages: string[] = []
    try {
      await handleNarrative({ workspaceRoot }, async (text) => { messages.push(text) })
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }

    expect(messages.join("\n")).toContain("/revela init")
  })

  it("does not mutate DECKS.json while rendering the command", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-map-readonly-"))
    const messages: string[] = []
    try {
      writeDecksState(workspaceRoot, narrativeMapState())
      const before = JSON.stringify(readDecksState(workspaceRoot))

      await handleNarrative({ workspaceRoot }, async (text) => { messages.push(text) })

      expect(messages.join("\n")).toContain("Narrative Snapshot")
      expect(JSON.stringify(readDecksState(workspaceRoot))).toBe(before)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })
})
