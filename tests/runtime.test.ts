import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { DECKS_STATE_FILE } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { compileNarrativeVault } from "../lib/narrative-vault/compile"
import { bindResearchFindings, evaluateResearchFindings, readDeckPlan, researchSave, researchTargets, storyRead } from "../lib/runtime"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("runtime facade", () => {
  it("passes compiled narrative hash into deck-plan stale detection", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-hash-")
    writeMinimalVault(root)
    writeDeckPlan(root, "stale-narrative-hash")

    const result = readDeckPlan({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    expect(result.warnings).toContain("Deck plan narrativeHash does not match current narrative state.")
    expect(result.projection?.diagnostics).toContainEqual(expect.objectContaining({
      code: "stale_narrative_hash",
      file: "deck-plan/index.md",
    }))
  })

  it("does not warn when deck-plan narrative hash matches the compiled vault", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-current-")
    writeMinimalVault(root)
    const compiled = compileNarrativeVault(root)
    writeDeckPlan(root, computeNarrativeHash(compiled.narrative!))

    const result = readDeckPlan({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    expect(result.warnings).not.toContain("Deck plan narrativeHash does not match current narrative state.")
    expect(result.projection?.diagnostics.some((item) => item.code === "stale_narrative_hash")).toBe(false)
  })

  it("reads a vault-only Story map without creating compatibility state", () => {
    const root = tempWorkspace("revela-runtime-story-read-")
    writeMinimalVault(root)

    const result = storyRead({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected Story read to succeed")
    expect(result.narrativeHash).toBe(result.map.snapshot.narrativeHash)
    expect(result.map.claimFlow.map((claim) => claim.id)).toContain("claim-pilot")
    expect(result.map.claimFlow[0].evidence[0]).toMatchObject({
      source: "Proposal",
      unsupportedScope: "Does not prove external market demand.",
      caveat: "Intent evidence only.",
    })
    expect(result.map.researchGaps.map((gap) => gap.id)).toContain("gap-pilot-market")
    expect(result.diagnostics.ok).toBe(true)
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    expect(existsSync(join(root, "decks"))).toBe(false)
  })

  it("can include a stable Markdown Story view", () => {
    const root = tempWorkspace("revela-runtime-story-markdown-")
    writeMinimalVault(root)

    const result = storyRead({ workspaceRoot: root, format: "markdown" })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected Story read to succeed")
    expect(result.markdown).toContain("## Narrative Snapshot")
    expect(result.markdown).toContain("Proposal | strength: partial")
    expect(result.markdown).toContain("unsupported scope: Does not prove external market demand.")
    expect(result.markdown).toContain("What external evidence supports market demand?")
  })

  it("returns init guidance when Story reading has no vault", () => {
    const root = tempWorkspace("revela-runtime-story-missing-")

    const result = storyRead({ workspaceRoot: root, format: "markdown" })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected Story read to fail")
    expect(result.error).toContain("revela-narrative/")
    expect(result.guidance).toContain("/revela init")
  })

  it("derives research targets from vault gaps and missing evidence", () => {
    const root = tempWorkspace("revela-runtime-research-targets-")
    writeResearchVault(root)

    const result = researchTargets({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    expect(result.result.selected).toMatchObject({ kind: "research_gap", targetId: "claim-pilot" })
    expect(result.result.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "research_gap", targetId: "claim-pilot" }),
      expect.objectContaining({ kind: "missing_evidence", claimId: "claim-pilot" }),
    ]))
  })

  it("saves findings with sources and evaluates incomplete fields", () => {
    const root = tempWorkspace("revela-runtime-research-save-")
    writeResearchVault(root)

    const saved = researchSave({
      workspaceRoot: root,
      topic: "Pilot Research",
      filename: "Ops Evidence",
      sources: ["https://example.com/ops"],
      content: "- claimId: claim-pilot\n- Source: https://example.com/ops\n",
    })
    const file = join(root, saved.path)
    const evalResult = evaluateResearchFindings({ workspaceRoot: root, findingsFile: saved.path })

    expect(saved).toMatchObject({ ok: true, path: "researches/pilot-research/ops-evidence.md" })
    expect(readFileSync(file, "utf-8")).toContain('sources:\n  - "https://example.com/ops"')
    expect(evalResult.ok).toBe(true)
    if (!evalResult.ok) throw new Error("expected findings evaluation to succeed")
    const bindingEval = evalResult.result!.bindingEval
    expect(bindingEval).toMatchObject({
      status: "needs_fields",
      missingFields: expect.arrayContaining(["supportScope", "unsupportedScope", "caveat", "strength"]),
    })
  })

  it("binds bindable findings into canonical vault evidence with relations", () => {
    const root = tempWorkspace("revela-runtime-research-bind-")
    writeResearchVault(root)
    mkdirSync(join(root, "researches", "pilot"), { recursive: true })
    writeFileSync(join(root, "researches", "pilot", "ops.md"), `---
topic: pilot
axis: ops
sources:
  - "https://example.com/ops"
---

## Recommended evidence bindings
- claimId: claim-pilot
- Quote: "Pilot scope fits current operating constraints and can be delivered without expanding rollout commitments."
- Support scope: Supports pilot approval scope.
- Unsupported scope: Does not prove full rollout.
- Caveat: Pilot-only evidence from the operations study.
- Strength: strong
`, "utf-8")

    const evalResult = evaluateResearchFindings({ workspaceRoot: root, findingsFile: "researches/pilot/ops.md" })
    const bound = bindResearchFindings({ workspaceRoot: root, findingsFile: "researches/pilot/ops.md", evidenceId: "evidence-pilot-ops" })
    const evidence = readFileSync(join(root, "revela-narrative", "evidence", "evidence-pilot-ops.md"), "utf-8")

    expect(evalResult.ok).toBe(true)
    if (!evalResult.ok) throw new Error("expected findings evaluation to succeed")
    const bindingEval = evalResult.result!.bindingEval
    expect(bindingEval).toMatchObject({ status: "bindable", claimId: "claim-pilot" })
    expect(bound).toMatchObject({ ok: true, path: "evidence/evidence-pilot-ops.md", gapMutation: { ok: true, nodeId: "gap-pilot-evidence" } })
    expect(evidence).toContain("## Relations")
    expect(evidence).toContain("- supports: [[claim-pilot]]")
    expect(bound.diagnostics).toBeArray()
  })
})

function writeMinimalVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  mkdirSync(join(vault, "research-gaps"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:runtime-demo\nstatus: draft\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Executive committee\nbeliefBefore: Needs proof.\nbeliefAfter: Trusts a bounded pilot.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:runtime-demo\nconfidence: medium\n---\nA bounded pilot is the recommended next step.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim-pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\n---\nApprove a bounded pilot.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence-pilot\nsource: Proposal\nsourcePath: proposal.md\nquote: Pilot approval is requested.\nsupportScope: Supports the internal pilot request.\nunsupportedScope: Does not prove external market demand.\ncaveat: Intent evidence only.\nstrength: partial\n---\n\n## Relations\n\n- supports: [[claim-pilot]] - Proposal states the pilot request.\n", "utf-8")
  writeFileSync(join(vault, "research-gaps", "market.md"), "---\ntype: research-gap\nid: gap-pilot-market\ntargetType: claim\ntargetId: claim-pilot\nquestion: What external evidence supports market demand?\nstatus: open\npriority: medium\n---\nWhat external evidence supports market demand?\n\n## Relations\n\n- depends_on: [[claim-pilot]]\n", "utf-8")
}

function writeResearchVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  mkdirSync(join(vault, "research-gaps"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:runtime-research\nstatus: needs_research\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Executive committee\nbeliefBefore: Needs proof.\nbeliefAfter: Trusts a bounded pilot.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:runtime-research\nconfidence: medium\n---\nA bounded pilot is the recommended next step.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim-pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\n---\nApprove a bounded pilot.\n", "utf-8")
  writeFileSync(join(vault, "research-gaps", "pilot.md"), "---\ntype: research-gap\nid: gap-pilot-evidence\ntargetType: claim\ntargetId: claim-pilot\nquestion: What evidence supports the pilot decision?\nstatus: open\npriority: high\n---\nWhat evidence supports the pilot decision?\n\n## Relations\n\n- depends_on: [[claim-pilot]]\n", "utf-8")
}

function writeDeckPlan(root: string, narrativeHash: string): void {
  mkdirSync(join(root, "deck-plan", "slides"), { recursive: true })
  writeFileSync(join(root, "deck-plan", "index.md"), `---
id: deck-plan
narrativeHash: ${narrativeHash}
outputPath: decks/runtime-demo.html
---

# Deck Plan

## Source Authority

- Meaning: revela-narrative/.

## Audience / Goal / Decision

- Audience: Executive committee.

## Deck Parameters

- Target slides: 5.

## Chapter Map

- Pilot: slides 1-5.

## Slide Plan

- Slide 1: Cover.

## Evidence Trace

- Preserve evidence trace.

## Boundary / Risk Treatment

- Keep caveats visible.

## Chapter Writing Batches

- Batch 1: all slides.

## HTML Identity Contract

- Use positive 1-based slide indexes.
`, "utf-8")
}
