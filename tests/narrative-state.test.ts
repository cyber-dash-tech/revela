import { describe, expect, it } from "bun:test"
import { readDecksState, writeDecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { narrativeToBrief } from "../lib/narrative-state/project-compat"
import { approveNarrativeState, reviewNarrativeState } from "../lib/narrative-state/readiness"
import { closeResearchGapInState, deriveResearchGapsFromReadiness, updateResearchGapInState } from "../lib/narrative-state/research-gaps"
import { legacyDecisionDeck } from "./helpers/narrative-fixtures"
import { executeDecksTool, runDecksTool, tempWorkspace } from "./helpers/tool-helpers"

describe("narrative state", () => {
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
    const workspaceRoot = tempWorkspace("revela-narrative-state-")
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
    const workspaceRoot = tempWorkspace("revela-narrative-migrate-")
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

  it("keeps narrative hash independent from research gap lifecycle", () => {
    const state = legacyDecisionDeck()
    const narrative = normalizeNarrativeState(state)
    const before = computeNarrativeHash(narrative)

    narrative.researchGaps = [{
      id: "research-gap:market-proof",
      targetType: "claim",
      targetId: narrative.claims[0].id,
      question: "Find additional market proof.",
      status: "open",
      priority: "high",
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }]

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

  it("does not warn about unbound visual asset findings", () => {
    const state = legacyDecisionDeck()
    state.actions.push({
      id: "action:image-leads-saved",
      type: "research.findings_saved",
      actor: "revela-research-save",
      timestamp: "2026-05-07T00:00:00.000Z",
      inputs: { axis: "image-asset-leads-md" },
      outputs: { path: "researches/narrative-demo/image-asset-leads-md.md" },
      status: "success",
      summary: "Saved visual asset leads.",
    })

    const reviewed = reviewNarrativeState(state, { now: "2026-05-07T00:00:00.000Z" })

    expect(reviewed.result.issues).not.toContainEqual(expect.objectContaining({
      type: "research_findings_unattached",
      source: "researches/narrative-demo/image-asset-leads-md.md",
    }))
    expect(reviewed.result.nextActions).not.toContain("Attach the findings to a research axis or bind specific evidence before treating them as canonical support.")
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
    const workspaceRoot = tempWorkspace("revela-narrative-tool-")
    writeDecksState(workspaceRoot, legacyDecisionDeck())

    const review = await executeDecksTool({ action: "reviewNarrative" }, workspaceRoot)
    const approval = await executeDecksTool({ action: "approveNarrative", approvalNote: "Approved for narrative handoff." }, workspaceRoot)
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
    const workspaceRoot = tempWorkspace("revela-narrative-upsert-")
    writeDecksState(workspaceRoot, legacyDecisionDeck())

    const result = await executeDecksTool({
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
          id: "claim:pilot-risk",
          text: "Pilot expansion lowers execution risk.",
          kind: "recommendation",
          importance: "central",
          evidenceRequired: true,
        }, {
          id: "claim:capacity-proof",
          text: "Capacity evidence supports the pilot sequence.",
          kind: "evidence",
          importance: "supporting",
          evidenceRequired: true,
        }],
        claimRelations: [{
          fromClaimId: "claim:capacity-proof",
          toClaimId: "claim:pilot-risk",
          relation: "supports",
          rationale: "Capacity proof supports the recommendation.",
        }],
        risks: [{ text: "Execution capacity remains constrained.", severity: "medium" }],
      },
    }, workspaceRoot)
    const reloaded = readDecksState(workspaceRoot)

    expect(result.ok).toBe(true)
    expect(reloaded.narrative).toMatchObject({
      audience: { primary: "Board" },
      decision: { action: "Approve pilot expansion." },
      thesis: { statement: "Pilot expansion preserves upside while bounding execution risk." },
    })
    expect(reloaded.narrative?.claims).toContainEqual(expect.objectContaining({
      id: "claim:pilot-risk",
      text: "Pilot expansion lowers execution risk.",
      evidenceStatus: "missing",
    }))
    expect(reloaded.narrative?.claimRelations).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^claim-relation:/),
      fromClaimId: "claim:capacity-proof",
      toClaimId: "claim:pilot-risk",
      relation: "supports",
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
      outputs: expect.objectContaining({ claimCount: 2, riskCount: 1 }),
    }))
  })

  it("treats claim relations as narrative meaning in the approval hash", () => {
    const narrative = normalizeNarrativeState(legacyDecisionDeck())
    narrative.claims.push({
      id: "claim:execution-risk",
      kind: "risk",
      text: "Execution risk constrains expansion pace.",
      importance: "supporting",
      evidenceRequired: false,
      evidenceStatus: "not_required",
    })
    const before = computeNarrativeHash(narrative)

    narrative.claimRelations = [{
      id: "relation:risk",
      fromClaimId: narrative.claims[0].id,
      toClaimId: "claim:execution-risk",
      relation: "constrains",
    }]

    expect(computeNarrativeHash(narrative)).not.toBe(before)
  })

  it("warns when claim relations lack objective rationale or overextend evidence boundaries", () => {
    const state = legacyDecisionDeck()
    const narrative = normalizeNarrativeState(state)
    const centralClaim = narrative.claims[0]
    narrative.claims.push({
      id: "claim:expansion-ask",
      kind: "ask",
      text: "Approve expansion beyond the pilot.",
      importance: "central",
      evidenceRequired: true,
      evidenceStatus: "missing",
    })
    narrative.claimRelations = [{
      id: "relation:overextended",
      fromClaimId: centralClaim.id,
      toClaimId: "claim:expansion-ask",
      relation: "supports",
    }]
    state.narrative = narrative

    const reviewed = reviewNarrativeState(state, { now: "2026-05-07T00:00:00.000Z" })

    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "claim_chain_gap",
      severity: "warning",
      message: "Claim relation lacks objective causal rationale.",
      claimText: "Approve expansion beyond the pilot.",
    }))
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({
      type: "claim_chain_gap",
      severity: "warning",
      message: "Claim relation may overextend the source claim's evidence boundary.",
      claimText: "Approve expansion beyond the pilot.",
    }))
  })

  it("compiles an approved canonical narrative into deck slide specs without marking deck ready", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-compile-")
    writeDecksState(workspaceRoot, legacyDecisionDeck())
    await runDecksTool({ action: "approveNarrative", approvalNote: "Approved for deck planning." }, workspaceRoot)

    const result = await executeDecksTool({ action: "compileDeckPlan" }, workspaceRoot)
    const reloaded = readDecksState(workspaceRoot)
    const deck = reloaded.decks[reloaded.activeDeck!]

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({ compiled: true, skipped: false, slideCount: 6 })
    expect(result.result.qualityChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "toc_present", status: "pass" }),
      expect.objectContaining({ id: "closing_ask_present", status: "pass" }),
      expect.objectContaining({ id: "central_claims_covered", status: "pass" }),
      expect.objectContaining({ id: "simplified_design_grammar", status: "pass" }),
    ]))
    expect(deck.slides.map((slide) => slide.narrativeRole)).toEqual(["context", "context", "recommendation", "evidence", "risk", "ask"])
    expect(deck.slides[1]).toMatchObject({
      title: "Storyline",
      layout: "toc",
      components: ["toc", "text-panel"],
      content: { bullets: expect.arrayContaining(["Context and belief shift", "Evidence and proof", "Decision ask"]) },
    })
    expect(deck.slides.flatMap((slide) => slide.components)).not.toContain("card")
    expect(deck.slides[2]).toMatchObject({
      title: "Demand supports phased expansion.",
      claimIds: [expect.stringMatching(/^claim:/)],
      claimRefs: [expect.objectContaining({ claimId: expect.stringMatching(/^claim:/), role: "primary" })],
      components: ["box", "text-panel", "quote"],
      evidenceBindingIds: [expect.stringMatching(/^evidence:/)],
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
    expect(deck.planReview).toMatchObject({
      status: "pending",
      narrativeHash: result.result.narrativeHash,
      planHash: expect.any(String),
      qualityChecks: expect.arrayContaining([expect.objectContaining({ id: "central_claims_covered", status: "pass" })]),
    })
    expect(deck.writeReadiness.status).toBe("blocked")
    expect(deck.narrativeBrief?.decisionOrAction).toBe("Approve phased expansion.")
    expect(reloaded.renderTargets).toContainEqual(expect.objectContaining({
      type: "html_deck",
      outputPath: "decks/narrative-demo.html",
      data: expect.objectContaining({
        narrativeHash: result.result.narrativeHash,
        planQualityChecks: expect.arrayContaining([expect.objectContaining({ id: "simplified_design_grammar", status: "pass" })]),
        requiredClaimIds: expect.arrayContaining([expect.stringMatching(/^claim:/)]),
        coveredClaimIds: expect.arrayContaining([expect.stringMatching(/^claim:/)]),
        claimSlideRefs: expect.arrayContaining([expect.objectContaining({ claimId: expect.stringMatching(/^claim:/), slideIndex: 3, match: "metadata", role: "primary", location: "claimRefs:primary" })]),
      }),
    }))
    expect(reloaded.actions).toContainEqual(expect.objectContaining({
      type: "deck.plan_compiled",
      actor: "revela-decks",
      outputs: expect.objectContaining({ slideCount: 6, narrativeHash: expect.any(String) }),
    }))
  })

  it("compiles the same approved narrative into a stable v2 deck plan", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-compile-stable-")
    writeDecksState(workspaceRoot, legacyDecisionDeck())
    await runDecksTool({ action: "approveNarrative", approvalNote: "Approved for stable deck planning." }, workspaceRoot)

    await runDecksTool({ action: "compileDeckPlan" }, workspaceRoot)
    const firstState = readDecksState(workspaceRoot)
    const firstDeck = firstState.decks[firstState.activeDeck!]
    const firstPlan = firstDeck.slides.map((slide) => ({
      title: slide.title,
      role: slide.narrativeRole,
      components: slide.components,
      claimRefs: slide.claimRefs,
      evidenceBindingIds: slide.evidenceBindingIds,
    }))
    const firstPlanHash = firstDeck.planReview?.planHash

    await runDecksTool({ action: "compileDeckPlan" }, workspaceRoot)
    const secondState = readDecksState(workspaceRoot)
    const secondDeck = secondState.decks[secondState.activeDeck!]
    const secondPlan = secondDeck.slides.map((slide) => ({
      title: slide.title,
      role: slide.narrativeRole,
      components: slide.components,
      claimRefs: slide.claimRefs,
      evidenceBindingIds: slide.evidenceBindingIds,
    }))

    expect(secondDeck.planReview?.planHash).toBe(firstPlanHash)
    expect(secondPlan).toEqual(firstPlan)
  })

  it("records user confirmation for the current compiled deck plan", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-plan-confirm-")
    writeDecksState(workspaceRoot, legacyDecisionDeck())
    await runDecksTool({ action: "approveNarrative", approvalNote: "Approved for deck planning." }, workspaceRoot)
    await runDecksTool({ action: "compileDeckPlan" }, workspaceRoot)

    const result = await executeDecksTool({ action: "confirmDeckPlan", approvalBy: "user", approvalNote: "Confirmed slide plan and low-fi sketches." }, workspaceRoot)
    const reloaded = readDecksState(workspaceRoot)
    const deck = reloaded.decks[reloaded.activeDeck!]

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({ confirmed: true, skipped: false, slug: deck.slug })
    expect(deck.requiredInputs.slidePlanConfirmed).toBe(true)
    expect(deck.planReview).toMatchObject({
      status: "confirmed",
      confirmedBy: "user",
      summary: "Confirmed slide plan and low-fi sketches.",
      narrativeHash: expect.any(String),
      planHash: expect.any(String),
      qualityChecks: expect.arrayContaining([expect.objectContaining({ id: "toc_present", status: "pass" })]),
    })
    expect(reloaded.actions).toContainEqual(expect.objectContaining({
      type: "deck.plan_confirmed",
      actor: "revela-decks",
      outputs: expect.objectContaining({ slug: deck.slug, narrativeHash: expect.any(String), planHash: expect.any(String) }),
    }))
  })

  it("backfills slide claimRefs through the decks tool without mutating HTML or narrative substance", async () => {
    const workspaceRoot = tempWorkspace("revela-coverage-backfill-")
    const state = legacyDecisionDeck()
    writeDecksState(workspaceRoot, state)
    const beforeHash = computeNarrativeHash(readDecksState(workspaceRoot).narrative!)

    const result = await executeDecksTool({ action: "backfillClaimRefs" }, workspaceRoot)
    const reloaded = readDecksState(workspaceRoot)
    const deck = reloaded.decks[reloaded.activeDeck!]

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({ updated: true, narrativeHash: beforeHash })
    expect(result.result.addedCount).toBeGreaterThan(0)
    expect(computeNarrativeHash(reloaded.narrative!)).toBe(beforeHash)
    expect(deck.slides[0].claimRefs).toContainEqual(expect.objectContaining({ role: "primary" }))
    expect(reloaded.actions).toContainEqual(expect.objectContaining({ type: "artifact.coverage_backfilled" }))
  })

  it("refuses to compile a deck plan before narrative approval or render override", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-compile-refuse-")
    writeDecksState(workspaceRoot, legacyDecisionDeck())

    const result = await executeDecksTool({ action: "compileDeckPlan" }, workspaceRoot)
    const reloaded = readDecksState(workspaceRoot)

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({ compiled: false, skipped: true })
    expect(result.result.reason).toContain("approved or explicitly overridden")
    expect(reloaded.actions.some((action) => action.type === "deck.plan_compiled")).toBe(false)
  })

  it("derives research gaps from missing central evidence without duplicating repeated derives", () => {
    const state = legacyDecisionDeck()
    state.decks["narrative-demo"].slides[0].evidence = []

    const first = deriveResearchGapsFromReadiness(state, { now: "2026-05-07T00:00:00.000Z" })
    const second = deriveResearchGapsFromReadiness(first.state, { now: "2026-05-07T00:01:00.000Z" })

    const centralGap = first.result.created.find((gap) => gap.priority === "high")

    expect(first.result.created).toHaveLength(2)
    expect(centralGap).toMatchObject({
      targetType: "claim",
      status: "open",
      priority: "high",
      createdFromIssueType: "missing_evidence",
    })
    expect(second.state.narrative?.researchGaps).toHaveLength(2)
    expect(second.state.actions).toContainEqual(expect.objectContaining({ type: "research.gap_created", actor: "revela-decks" }))
    expect(second.state.actions).toContainEqual(expect.objectContaining({ type: "research.gap_updated", actor: "revela-decks" }))
  })

  it("moves research gaps through findings and evidence-bound lifecycle without binding proof automatically", () => {
    const state = legacyDecisionDeck()
    state.decks["narrative-demo"].slides[0].evidence = []
    const derived = deriveResearchGapsFromReadiness(state, { now: "2026-05-07T00:00:00.000Z" })
    const gapId = derived.result.created.find((gap) => gap.priority === "high")!.id

    const withFindings = updateResearchGapInState(derived.state, {
      id: gapId,
      status: "findings_saved",
      findingsFile: "researches/narrative-demo/supplier.md",
      notes: "Findings saved but not yet bound.",
    }, { now: "2026-05-07T00:02:00.000Z" })
    const reviewed = reviewNarrativeState(withFindings.state, { now: "2026-05-07T00:03:00.000Z" })

    expect(withFindings.result.updated[0]).toMatchObject({ status: "findings_saved", findingsFile: "researches/narrative-demo/supplier.md" })
    expect(reviewed.result.status).toBe("needs_research")
    expect(reviewed.result.issues).toContainEqual(expect.objectContaining({ type: "missing_evidence", severity: "blocker" }))

    const bound = updateResearchGapInState(withFindings.state, {
      id: gapId,
      status: "evidence_bound",
      evidenceBindingIds: ["evidence:demo:supplier"],
    }, { now: "2026-05-07T00:04:00.000Z" })
    const closed = closeResearchGapInState(bound.state, gapId, "Evidence boundary resolved.", { now: "2026-05-07T00:05:00.000Z" })

    expect(bound.result.updated[0]).toMatchObject({ status: "evidence_bound", evidenceBindingIds: ["evidence:demo:supplier"] })
    expect(closed.result).toMatchObject({ closed: true, skipped: false, gap: expect.objectContaining({ status: "closed", closedAt: "2026-05-07T00:05:00.000Z" }) })
    expect(closed.state.actions).toContainEqual(expect.objectContaining({ type: "research.gap_closed", actor: "revela-decks" }))
  })

  it("exposes research gap lifecycle through revela-decks", async () => {
    const workspaceRoot = tempWorkspace("revela-research-gap-tool-")
    const state = legacyDecisionDeck()
    state.decks["narrative-demo"].slides[0].evidence = []
    writeDecksState(workspaceRoot, state)

    const derived = await executeDecksTool({ action: "deriveResearchGaps" }, workspaceRoot)
    const gapId = derived.result.created[0].id
    const updated = await executeDecksTool({ action: "updateResearchGap", gapId, gapStatus: "attached", findingsFile: "researches/narrative-demo/market.md" }, workspaceRoot)
    const closed = await executeDecksTool({ action: "closeResearchGap", gapId, gapNotes: "Resolved by bound evidence." }, workspaceRoot)

    expect(derived.ok).toBe(true)
    expect(updated.result.updated[0]).toMatchObject({ status: "attached", findingsFile: "researches/narrative-demo/market.md" })
    expect(closed.result.closed).toBe(true)
  })
})
