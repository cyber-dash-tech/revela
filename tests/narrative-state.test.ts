import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { narrativeToBrief } from "../lib/narrative-state/project-compat"
import { approveNarrativeState, reviewNarrativeState } from "../lib/narrative-state/readiness"
import decksTool from "../tools/decks"

describe("narrative state", () => {
  function legacyDecisionDeck() {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "narrative-demo",
      goal: "Recommend whether to approve phased expansion.",
      audience: "Investment committee",
      outputPath: "decks/narrative-demo.html",
      narrativeBrief: {
        audienceBeliefBefore: "The committee is unsure about demand.",
        audienceBeliefAfter: "The committee trusts phased expansion.",
        decisionOrAction: "Approve phased expansion.",
        narrativeArc: "Demand proof supports a phased approval with explicit execution risk.",
        keyClaims: ["Demand supports phased expansion."],
        objections: ["The forecast may be too optimistic."],
        risks: ["Execution risk remains material."],
      },
    })
    state = upsertSlides(state, "narrative-demo", [{
      index: 1,
      title: "Demand Proof",
      purpose: "Show why phased expansion is credible",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      content: {
        headline: "Demand supports phased expansion.",
        bullets: ["Market demand grew 25% since 2024"],
      },
      evidence: [{
        source: "Market report",
        findingsFile: "researches/narrative-demo/market.md",
        location: "page 4",
        quote: "Demand increased 25% from 2024 to 2025.",
      }],
      status: "ready",
    }])
    return state
  }

  it("migrates legacy narrativeBrief and slides into canonical narrative state", () => {
    const narrative = normalizeNarrativeState(legacyDecisionDeck())

    expect(narrative).toMatchObject({
      version: 1,
      status: "draft",
      audience: {
        primary: "Investment committee",
        beliefBefore: "The committee is unsure about demand.",
        beliefAfter: "The committee trusts phased expansion.",
      },
      decision: { action: "Approve phased expansion.", decisionType: "approve" },
      thesis: { statement: "Demand proof supports a phased approval with explicit execution risk." },
    })
    expect(narrative.claims).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^claim:/),
      text: "Demand supports phased expansion.",
      importance: "central",
      evidenceStatus: "partial",
    }))
    expect(narrative.evidenceBindings).toContainEqual(expect.objectContaining({
      claimId: narrative.claims.find((claim) => claim.text === "Demand supports phased expansion.")?.id,
      findingsFile: "researches/narrative-demo/market.md",
      location: "page 4",
      strength: "partial",
    }))
    expect(narrative.objections).toContainEqual(expect.objectContaining({ text: "The forecast may be too optimistic." }))
    expect(narrative.risks).toContainEqual(expect.objectContaining({ text: "Execution risk remains material." }))
  })

  it("preserves canonical narrative when DECKS.json is normalized", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-state-"))
    const state = legacyDecisionDeck()
    const narrative = normalizeNarrativeState(state)
    state.narrative = { ...narrative, status: "ready_for_approval", updatedAt: "2026-05-06T00:00:00.000Z" }

    writeDecksState(workspaceRoot, state)
    const reloaded = readDecksState(workspaceRoot)

    expect(reloaded.narrative).toMatchObject({
      id: narrative.id,
      status: "ready_for_approval",
      updatedAt: "2026-05-06T00:00:00.000Z",
    })
    expect(reloaded.decks["narrative-demo"].narrativeBrief?.decisionOrAction).toBe("Approve phased expansion.")
  })

  it("normalizes old workspaces by adding top-level canonical narrative", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-migrate-"))
    const state = legacyDecisionDeck()

    writeDecksState(workspaceRoot, state)
    const reloaded = readDecksState(workspaceRoot)

    expect(reloaded.narrative).toMatchObject({
      audience: { primary: "Investment committee" },
      decision: { action: "Approve phased expansion." },
    })
    expect(reloaded.narrative?.approvals).toEqual([])
    expect(reloaded.decks["narrative-demo"].writeReadiness.status).toBe("blocked")
  })

  it("keeps narrative hash independent from approvals, timestamps, and deck write readiness", () => {
    const state = legacyDecisionDeck()
    const narrative = normalizeNarrativeState(state)
    const before = computeNarrativeHash(narrative)
    narrative.updatedAt = "2099-01-01T00:00:00.000Z"
    narrative.status = "approved"
    narrative.approvals.push({
      id: "approval:test",
      narrativeHash: before,
      approvedAt: "2099-01-01T00:00:00.000Z",
      approvedBy: "user",
      scope: "narrative",
    })
    state.decks["narrative-demo"].writeReadiness = { status: "ready", blockers: [], lastReviewedAt: "2099-01-01T00:00:00.000Z" }

    expect(computeNarrativeHash(narrative)).toBe(before)
  })

  it("changes narrative hash when a central claim changes", () => {
    const narrative = normalizeNarrativeState(legacyDecisionDeck())
    const before = computeNarrativeHash(narrative)
    narrative.claims[0].text = "Demand does not yet support phased expansion."

    expect(computeNarrativeHash(narrative)).not.toBe(before)
  })

  it("projects canonical narrative back to the legacy narrativeBrief compatibility shape", () => {
    const brief = narrativeToBrief(normalizeNarrativeState(legacyDecisionDeck()))

    expect(brief).toEqual({
      audienceBeliefBefore: "The committee is unsure about demand.",
      audienceBeliefAfter: "The committee trusts phased expansion.",
      decisionOrAction: "Approve phased expansion.",
      narrativeArc: "Demand proof supports a phased approval with explicit execution risk.",
      keyClaims: ["Demand supports phased expansion."],
      objections: ["The forecast may be too optimistic."],
      risks: ["Execution risk remains material."],
    })
  })

  it("marks evidence-complete narratives as ready for approval before explicit approval", () => {
    const reviewed = reviewNarrativeState(legacyDecisionDeck(), { now: "2026-05-06T00:00:00.000Z" })

    expect(reviewed.result.status).toBe("ready_for_approval")
    expect(reviewed.result.blockers).toEqual([])
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({ type: "approval_missing", severity: "warning" }))
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({ type: "weak_evidence", severity: "warning", claimText: "Demand supports phased expansion." }))
    expect(reviewed.state.narrative?.status).toBe("ready_for_approval")
  })

  it("blocks central claims with missing required evidence as needs_research", () => {
    const state = legacyDecisionDeck()
    state.decks["narrative-demo"].slides[0].evidence = []

    const reviewed = reviewNarrativeState(state, { now: "2026-05-06T00:00:00.000Z" })

    expect(reviewed.result.status).toBe("needs_research")
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "missing_evidence",
      severity: "blocker",
      claimText: "Demand supports phased expansion.",
    }))
    expect(reviewed.state.narrative?.status).toBe("needs_research")
  })

  it("records current approval and detects stale approval after narrative changes", () => {
    const approved = approveNarrativeState(legacyDecisionDeck(), { now: "2026-05-06T00:00:00.000Z" })

    expect(approved.result.approved).toBe(true)
    expect(approved.result.readiness.status).toBe("approved")
    expect(approved.state.narrative?.approvals).toContainEqual(expect.objectContaining({
      narrativeHash: approved.result.narrativeHash,
      approvedBy: "user",
      scope: "narrative",
    }))

    approved.state.narrative!.claims[0].text = "Demand evidence now supports only a pilot expansion."
    const stale = reviewNarrativeState(approved.state, { now: "2026-05-07T00:00:00.000Z" })

    expect(stale.result.status).toBe("ready_for_approval")
    expect(stale.result.approval).toMatchObject({ current: false, stale: true })
    expect(stale.result.issues).toContainEqual(expect.objectContaining({ type: "approval_stale", severity: "warning" }))
  })

  it("does not warn about saved findings already bound to canonical narrative evidence", () => {
    const state = legacyDecisionDeck()
    state.actions.push({
      id: "action:findings-saved",
      type: "research.findings_saved",
      actor: "revela-research-save",
      timestamp: "2026-05-07T00:00:00.000Z",
      inputs: {},
      outputs: { path: "researches/narrative-demo/market.md" },
      status: "success",
      summary: "Saved market findings.",
    })

    const reviewed = reviewNarrativeState(state, { now: "2026-05-07T00:00:00.000Z" })

    expect(reviewed.result.issues).not.toContainEqual(expect.objectContaining({ type: "research_findings_unattached" }))
    expect(reviewed.result.nextActions).not.toContain("Attach the findings to a research axis or bind specific evidence before treating them as canonical support.")
  })

  it("warns about saved findings that are neither attached nor bound", () => {
    const state = legacyDecisionDeck()
    state.actions.push({
      id: "action:findings-saved-unbound",
      type: "research.findings_saved",
      actor: "revela-research-save",
      timestamp: "2026-05-07T00:00:00.000Z",
      inputs: {},
      outputs: { path: "researches/narrative-demo/unbound.md" },
      status: "success",
      summary: "Saved unbound findings.",
    })

    const reviewed = reviewNarrativeState(state, { now: "2026-05-07T00:00:00.000Z" })

    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "research_findings_unattached",
      source: "researches/narrative-demo/unbound.md",
    }))
  })

  it("refuses normal approval when narrative has unresolved blockers", () => {
    const state = legacyDecisionDeck()
    state.decks["narrative-demo"].slides[0].evidence = []

    const result = approveNarrativeState(state, { now: "2026-05-06T00:00:00.000Z" })

    expect(result.result).toMatchObject({ approved: false, skipped: true })
    expect(result.result.reason).toContain("unresolved readiness blockers")
    expect(result.state.narrative?.approvals).toEqual([])
  })

  it("exposes reviewNarrative and approveNarrative through revela-decks", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-tool-"))
    writeDecksState(workspaceRoot, legacyDecisionDeck())

    const review = JSON.parse(await (decksTool as any).execute({ action: "reviewNarrative" }, { directory: workspaceRoot }))
    const approval = JSON.parse(await (decksTool as any).execute({ action: "approveNarrative", approvalNote: "Approved for narrative handoff." }, { directory: workspaceRoot }))
    const reloaded = readDecksState(workspaceRoot)

    expect(review.ok).toBe(true)
    expect(review.result.status).toBe("ready_for_approval")
    expect(approval.ok).toBe(true)
    expect(approval.result.approved).toBe(true)
    expect(reloaded.narrative?.status).toBe("approved")
    expect(reloaded.actions).toContainEqual(expect.objectContaining({
      type: "review.performed",
      actor: "revela-decks",
      outputs: expect.objectContaining({ kind: "narrative", status: "ready_for_approval" }),
    }))
    expect(reloaded.actions).toContainEqual(expect.objectContaining({
      type: "narrative.approved",
      actor: "revela-decks",
      outputs: expect.objectContaining({ approved: true, approvalId: expect.stringMatching(/^approval:/) }),
    }))
  })

  it("exposes upsertNarrative through revela-decks and projects compatibility brief", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-upsert-"))
    writeDecksState(workspaceRoot, legacyDecisionDeck())

    const result = JSON.parse(await (decksTool as any).execute({
      action: "upsertNarrative",
      narrative: {
        audience: {
          primary: "Board",
          beliefBefore: "The board is unsure a pilot is safer.",
          beliefAfter: "The board sees pilot approval as the safer path.",
        },
        decision: { action: "Approve pilot expansion.", decisionType: "approve" },
        thesis: { statement: "Pilot expansion preserves upside while bounding execution risk.", confidence: "medium" },
        claims: [{
          text: "Pilot expansion lowers execution risk.",
          kind: "recommendation",
          importance: "central",
          evidenceRequired: true,
        }],
        risks: [{ text: "Execution capacity remains constrained.", severity: "medium" }],
      },
    }, { directory: workspaceRoot }))
    const reloaded = readDecksState(workspaceRoot)

    expect(result.ok).toBe(true)
    expect(reloaded.narrative).toMatchObject({
      audience: { primary: "Board" },
      decision: { action: "Approve pilot expansion." },
      thesis: { statement: "Pilot expansion preserves upside while bounding execution risk." },
    })
    expect(reloaded.narrative?.claims).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^claim:/),
      text: "Pilot expansion lowers execution risk.",
      evidenceStatus: "missing",
    }))
    expect(reloaded.decks[reloaded.activeDeck!].narrativeBrief).toMatchObject({
      audienceBeliefBefore: "The board is unsure a pilot is safer.",
      audienceBeliefAfter: "The board sees pilot approval as the safer path.",
      decisionOrAction: "Approve pilot expansion.",
      keyClaims: ["Pilot expansion lowers execution risk."],
      risks: ["Execution capacity remains constrained."],
    })
    expect(reloaded.actions).toContainEqual(expect.objectContaining({
      type: "narrative.upserted",
      actor: "revela-decks",
      outputs: expect.objectContaining({ claimCount: 1, riskCount: 1 }),
    }))
  })

  it("compiles an approved canonical narrative into deck slide specs without marking deck ready", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-compile-"))
    writeDecksState(workspaceRoot, legacyDecisionDeck())
    await (decksTool as any).execute({ action: "approveNarrative", approvalNote: "Approved for deck planning." }, { directory: workspaceRoot })

    const result = JSON.parse(await (decksTool as any).execute({ action: "compileDeckPlan" }, { directory: workspaceRoot }))
    const reloaded = readDecksState(workspaceRoot)
    const deck = reloaded.decks[reloaded.activeDeck!]

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({ compiled: true, skipped: false, slideCount: 5 })
    expect(deck.slides.map((slide) => slide.narrativeRole)).toEqual(["context", "recommendation", "evidence", "risk", "ask"])
    expect(deck.slides[1]).toMatchObject({
      title: "Demand supports phased expansion.",
      content: { headline: "Demand supports phased expansion." },
      evidence: [expect.objectContaining({ findingsFile: "researches/narrative-demo/market.md", quote: "Demand increased 25% from 2024 to 2025." })],
    })
    expect(deck.requiredInputs).toMatchObject({
      topicClarified: true,
      audienceClarified: true,
      researchNeedAssessed: true,
      researchFindingsRead: true,
      slidePlanConfirmed: false,
      designLayoutsFetched: false,
    })
    expect(deck.writeReadiness.status).toBe("blocked")
    expect(deck.narrativeBrief?.decisionOrAction).toBe("Approve phased expansion.")
    expect(reloaded.actions).toContainEqual(expect.objectContaining({
      type: "deck.plan_compiled",
      actor: "revela-decks",
      outputs: expect.objectContaining({ slideCount: 5, narrativeHash: expect.any(String) }),
    }))
  })

  it("refuses to compile a deck plan before narrative approval or render override", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-compile-refuse-"))
    writeDecksState(workspaceRoot, legacyDecisionDeck())

    const result = JSON.parse(await (decksTool as any).execute({ action: "compileDeckPlan" }, { directory: workspaceRoot }))
    const reloaded = readDecksState(workspaceRoot)

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({ compiled: false, skipped: true })
    expect(result.result.reason).toContain("approved or explicitly overridden")
    expect(reloaded.actions.some((action) => action.type === "deck.plan_compiled")).toBe(false)
  })
})
