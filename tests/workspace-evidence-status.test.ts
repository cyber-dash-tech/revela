import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState, type DecksState } from "../lib/decks-state"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { applyEvidenceBindings, getEvidenceStatusForSelection } from "../lib/workspace-state/evidence-status"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("workspace evidence status service", () => {
  it("returns bound evidence for a selected supported claim", () => {
    const root = tempWorkspace("revela-evidence-status-bound-")
    writeDecksState(root, supportedState())

    const status = getEvidenceStatusForSelection(root, { slideIndex: 1, selectedText: "Conversion improved 18%", scope: "element" })

    expect(status.match).toMatchObject({
      confidence: "high",
      slideIndex: 1,
      canonicalClaimId: "claim:conversion",
      claimText: "Conversion improved 18%",
      claimEvidenceSupport: "supported",
      evidenceBindingIds: ["evidence:conversion:pilot"],
      supportedScope: "Pilot conversion metric only.",
      unsupportedScope: "Does not prove full-funnel growth.",
      caveats: ["Single pilot window."],
    })
    expect(status.boundEvidence).toEqual([expect.objectContaining({
      source: "Pilot dashboard",
      sourcePath: "sources/pilot.csv",
      quote: "Conversion improved 18%",
      evidenceBindingId: "evidence:conversion:pilot",
      claimId: "claim:conversion",
      strength: "strong",
      supportScope: "Pilot conversion metric only.",
      unsupportedScope: "Does not prove full-funnel growth.",
      hasDetail: true,
    })])
    expect(status.candidateEvidence).toEqual([])
    expect(status.gaps).toEqual([])
  })

  it("surfaces candidate evidence, unsupported scope, rewrite guidance, and search diagnostics", () => {
    const root = tempWorkspace("revela-evidence-status-candidate-")
    writeFactoryFindings(root)
    writeDecksState(root, missingEvidenceState())

    const status = getEvidenceStatusForSelection(root, { slideIndex: 2, selectedText: "Automation Islands", scope: "element" })
    const candidate = status.candidateEvidence[0]

    expect(status.match.slideIndex).toBe(2)
    expect(status.gaps).toEqual([expect.objectContaining({ type: "missing_evidence", slideIndex: 2 })])
    expect(candidate).toMatchObject({
      candidateId: expect.stringMatching(/^s2-[a-f0-9]{8}$/),
      relevant: true,
      findingsFile: "researches/factory/context.md",
      supportStrength: "partial",
      quote: expect.stringContaining("Automation Islands"),
      supportScope: expect.arrayContaining(["automation", "islands"]),
      unsupportedScope: expect.arrayContaining(["2030 AI Manufacturing OS"]),
      recommendedRewrite: expect.stringContaining("internal synthesis"),
    })
    expect(status.searchDiagnostics[0]).toMatchObject({
      researchPlanFindingsSearched: ["researches/factory/context.md"],
    })
  })

  it("applies selected evidence bindings explicitly without mutating HTML or slide text", () => {
    const root = tempWorkspace("revela-evidence-status-apply-")
    mkdirSync(join(root, "decks"), { recursive: true })
    writeFactoryFindings(root)
    const htmlPath = join(root, "decks", "demo.html")
    writeFileSync(htmlPath, '<section class="slide" data-slide-index="1"></section><section class="slide" data-slide-index="2"></section>')
    writeDecksState(root, missingEvidenceState())
    const candidateId = getEvidenceStatusForSelection(root, { slideIndex: 2, selectedText: "Automation Islands" }).candidateEvidence[0]?.candidateId
    expect(typeof candidateId).toBe("string")
    const beforeHtml = readFileSync(htmlPath, "utf-8")

    const result = applyEvidenceBindings(root, [candidateId!, "missing-candidate"])
    const next = readDecksState(root)
    const slide = next.decks.demo.slides.find((item) => item.index === 2)!

    expect(result.applied).toEqual([expect.objectContaining({ candidateId, slideIndex: 2 })])
    expect(result.skipped).toEqual([{ candidateId: "missing-candidate", reason: "Candidate was not found in the current review result." }])
    expect(result.nextReviewNeeded).toBe(true)
    expect(readFileSync(htmlPath, "utf-8")).toBe(beforeHtml)
    expect(slide.content.bullets).toEqual(["Automation Islands", "2030 AI Manufacturing OS"])
    expect(slide.evidence).toEqual([expect.objectContaining({
      findingsFile: "researches/factory/context.md",
      quote: expect.stringContaining("Automation Islands"),
      caveat: expect.stringContaining("Unsupported claim scope"),
    })])
    expect(next.actions).toContainEqual(expect.objectContaining({
      type: "evidence.binding_applied",
      actor: "revela-decks",
      status: "success",
      inputs: { candidateIds: [candidateId!, "missing-candidate"] },
      outputs: expect.objectContaining({ nextReviewNeeded: true }),
      nodeIds: ["slide:2"],
    }))
  })
})

function supportedState(): DecksState {
  let state = baseState()
  state.narrative = normalizeNarrativeState({
    ...state,
    narrative: {
      version: 1,
      id: "narrative:demo",
      status: "ready_for_approval",
      audience: {
        primary: "Growth team",
        beliefBefore: "The pilot impact is unclear.",
        beliefAfter: "The pilot has a bounded conversion signal.",
      },
      decision: { action: "Approve launch expansion.", decisionType: "approve" },
      thesis: { id: "thesis:conversion", statement: "Pilot conversion supports a bounded launch expansion.", confidence: "medium" },
      claims: [{
        id: "claim:conversion",
        kind: "evidence",
        text: "Conversion improved 18%",
        importance: "central",
        evidenceRequired: true,
        evidenceStatus: "supported",
        supportedScope: "Pilot conversion metric only.",
        unsupportedScope: "Does not prove full-funnel growth.",
        caveats: ["Single pilot window."],
      }],
      evidenceBindings: [{
        id: "evidence:conversion:pilot",
        claimId: "claim:conversion",
        source: "Pilot dashboard",
        sourcePath: "sources/pilot.csv",
        quote: "Conversion improved 18%",
        supportScope: "Pilot conversion metric only.",
        unsupportedScope: "Does not prove full-funnel growth.",
        strength: "strong",
      }],
      objections: [],
      risks: [],
      approvals: [],
      updatedAt: "2026-05-07T00:00:00.000Z",
    },
  })
  state = upsertSlides(state, "demo", [{
    index: 1,
    title: "Launch",
    purpose: "Show evidence for launch approval",
    narrativeRole: "evidence",
    layout: "two-col",
    components: ["card"],
    claimRefs: [{ claimId: "claim:conversion", role: "primary" }],
    evidenceBindingIds: ["evidence:conversion:pilot"],
    content: { headline: "Conversion improved 18%" },
    evidence: [{ source: "Pilot dashboard", sourcePath: "sources/pilot.csv", quote: "Conversion improved 18%" }],
    status: "ready",
  }])
  return state
}

function missingEvidenceState(): DecksState {
  let state = baseState()
  state.decks.demo.researchPlan = [{ axis: "factory context", needed: true, status: "read", findingsFile: "researches/factory/context.md" }]
  state = upsertSlides(state, "demo", [
    {
      index: 1,
      title: "Cover",
      purpose: "Introduce the deck",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "Factory intelligence" },
      evidence: [{ source: "user request" }],
      status: "ready",
    },
    {
      index: 2,
      title: "Factory Intelligence Evolution Roadmap",
      purpose: "Show the progression from automation islands to 2030 AI manufacturing OS.",
      layout: "card-grid",
      components: ["card"],
      content: { headline: "Factory Intelligence Evolution Roadmap", bullets: ["Automation Islands", "2030 AI Manufacturing OS"] },
      evidence: [],
      status: "ready",
    },
  ])
  return state
}

function baseState(): DecksState {
  let state = createEmptyDecksState()
  state = upsertDeck(state, {
    slug: "demo",
    goal: "Create a traceable deck.",
    outputPath: "decks/demo.html",
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
  return state
}

function writeFactoryFindings(root: string): void {
  mkdirSync(join(root, "researches", "factory"), { recursive: true })
  writeFileSync(join(root, "researches", "factory", "context.md"), `## Data
- P&G/Plug and Play proposal summarizes current operations as "Automation Islands" with fragmented legacy systems and human bottlenecks.
- Source: Updating V2-Plug and Play Proposal for P&G (English).pdf
`)
}
