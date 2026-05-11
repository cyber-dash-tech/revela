import { describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, readDecksState, writeDecksState, type DecksState } from "../lib/decks-state"
import { handleBrief, parseBriefArgs } from "../lib/commands/brief"
import { compileExecutiveBrief } from "../lib/narrative-state/executive-brief"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import type { NarrativeStateV1 } from "../lib/narrative-state/types"

describe("executive brief render target", () => {
  it("refuses to render without current narrative approval or override", () => {
    const state = executiveBriefState({ approved: false })

    const result = compileExecutiveBrief(state, { now: "2026-05-08T00:00:00.000Z" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain("requires current narrative approval")
    expect(result.state.renderTargets).toEqual([])
  })

  it("renders markdown from approved canonical narrative and records artifact target", () => {
    const state = executiveBriefState({ approved: true })

    const result = compileExecutiveBrief(state, {
      outputPath: "briefs/market-brief.md",
      now: "2026-05-08T00:00:00.000Z",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.outputPath).toBe("briefs/market-brief.md")
    expect(result.content).toContain("# Executive Brief")
    expect(result.content).toContain("Claim ID: claim:market")
    expect(result.content).toContain("evidence:market (strong)")
    expect(result.content).toContain("Quote: Market demand grew 25% in 2025.")
    expect(result.content).toContain("Support scope: 2025 demand growth")
    expect(result.content).toContain("Unsupported scope: 2026 forecast")
    expect(result.content).toContain("This brief is compiled from canonical narrative state, not from a deck summary.")

    const target = result.state.renderTargets.find((item) => item.type === "executive_brief")
    expect(target).toMatchObject({
      id: "target:executive_brief:briefs/market-brief.md",
      outputPath: "briefs/market-brief.md",
      artifactVersion: result.narrativeHash,
      contractStatus: "valid",
    })
    expect(target?.sourceNodeIds).toEqual(expect.arrayContaining(["narrative:test", "claim:market", "evidence:market"]))
    expect(target?.data).toMatchObject({
      narrativeHash: result.narrativeHash,
      format: "markdown",
      claimIds: ["claim:market"],
      evidenceBindingIds: ["evidence:market"],
    })
    expect(result.state.actions).toContainEqual(expect.objectContaining({
      type: "artifact.rendered",
      actor: "revela-brief",
      status: "success",
      outputs: expect.objectContaining({ outputPath: "briefs/market-brief.md" }),
    }))
  })

  it("allows explicit render override approval", () => {
    const state = executiveBriefState({ approved: false, override: true })

    const result = compileExecutiveBrief(state, { now: "2026-05-08T00:00:00.000Z" })

    expect(result.ok).toBe(true)
  })

  it("handles /revela make --brief by writing markdown and DECKS render target", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-executive-brief-"))
    writeDecksState(workspaceRoot, executiveBriefState({ approved: true }))
    const messages: string[] = []

    await handleBrief({ workspaceRoot, outputPath: "briefs/custom.md" }, async (text) => {
      messages.push(text)
    })

    expect(messages.join("\n")).toContain("Executive brief rendered")
    expect(existsSync(join(workspaceRoot, "briefs/custom.md"))).toBe(true)
    expect(readFileSync(join(workspaceRoot, "briefs/custom.md"), "utf-8")).toContain("claim:market")
    const reloaded = readDecksState(workspaceRoot)
    expect(reloaded.renderTargets).toContainEqual(expect.objectContaining({
      type: "executive_brief",
      outputPath: "briefs/custom.md",
    }))
  })

  it("parses only safe markdown output paths", () => {
    expect(parseBriefArgs("")).toEqual({ ok: true, args: {} })
    expect(parseBriefArgs("briefs/custom.md")).toEqual({ ok: true, args: { outputPath: "briefs/custom.md" } })
    expect(parseBriefArgs("briefs/custom.html").ok).toBe(false)
    expect(parseBriefArgs("../custom.md").ok).toBe(false)
  })
})

function executiveBriefState(input: { approved: boolean; override?: boolean }): DecksState {
  const state = createEmptyDecksState()
  const narrative: NarrativeStateV1 = {
    version: 1,
    id: "narrative:test",
    status: input.approved ? "approved" : "ready_for_approval",
    audience: {
      primary: "Board",
      beliefBefore: "Demand outlook is unclear.",
      beliefAfter: "Demand evidence supports a focused investment discussion.",
    },
    decision: {
      action: "Understand whether market demand justifies deeper investment review.",
      decisionType: "understand",
    },
    thesis: {
      id: "thesis:test",
      statement: "Demand evidence supports deeper investment review within a bounded scope.",
      confidence: "medium",
      caveat: "Forecast evidence remains separate.",
    },
    claims: [{
      id: "claim:market",
      kind: "opportunity",
      text: "Market demand grew materially in 2025.",
      importance: "central",
      evidenceRequired: true,
      evidenceStatus: "supported",
      supportedScope: "2025 demand growth",
      unsupportedScope: "2026 forecast",
      caveats: ["Regional mix is not covered."],
    }],
    evidenceBindings: [{
      id: "evidence:market",
      claimId: "claim:market",
      source: "Market report",
      findingsFile: "researches/market/demand.md",
      sourcePath: "sources/market.pdf",
      location: "page 4",
      quote: "Market demand grew 25% in 2025.",
      url: "https://example.com/market",
      caveat: "Does not forecast 2026.",
      supportScope: "2025 demand growth",
      unsupportedScope: "2026 forecast",
      strength: "strong",
    }],
    objections: [{
      id: "objection:forecast",
      text: "The forecast may not continue.",
      claimId: "claim:market",
      priority: "medium",
      response: "Separate current demand proof from forecast assumptions.",
    }],
    risks: [{
      id: "risk:forecast",
      text: "Forecast extrapolation could overreach.",
      claimId: "claim:market",
      severity: "medium",
      mitigation: "Keep future claims out of the brief unless separately sourced.",
    }],
    researchGaps: [{
      id: "research-gap:forecast",
      targetType: "claim",
      targetId: "claim:market",
      question: "What supports the 2026 forecast?",
      status: "open",
      priority: "medium",
      notes: "Not needed for current demand claim.",
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    }],
    approvals: [],
    updatedAt: "2026-05-08T00:00:00.000Z",
  }
  state.narrative = narrative
  const normalizedNarrative = normalizeNarrativeState(state)
  const narrativeHash = computeNarrativeHash(normalizedNarrative)
  if (input.approved || input.override) {
    normalizedNarrative.approvals.push({
      id: input.override ? "approval:override" : "approval:user",
      narrativeHash,
      approvedAt: "2026-05-08T00:00:00.000Z",
      approvedBy: input.override ? "override" : "user",
      scope: input.override ? "render_override" : "narrative",
    })
  }
  state.narrative = normalizedNarrative
  return state
}
