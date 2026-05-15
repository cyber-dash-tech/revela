import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { readDecksState, writeDecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { compileNarrativeVault, exportNarrativeStateToVault, parseRelations, updateVaultResearchGapNode, upsertVaultEvidenceNode } from "../lib/narrative-vault"
import { narrativeMapState } from "./helpers/narrative-fixtures"
import { executeDecksTool, tempWorkspace } from "./helpers/tool-helpers"

describe("narrative vault", () => {
  it("parses typed wikilink relations", () => {
    const result = parseRelations("- supports: [[claim:partial|Line data]] - because it proves the path\n- unknown: [[claim:x]]", "claim:supported", "claims/supported.md")

    expect(result.relations).toEqual([{ fromId: "claim:supported", relation: "supports", toId: "claim:partial", rationale: "because it proves the path", file: "claims/supported.md" }])
    expect(result.unknownTypes).toEqual(["unknown"])
  })

  it("compiles Markdown nodes into NarrativeStateV1 and diagnostics", () => {
    const root = tempWorkspace("revela-vault-compile-")
    writeSampleVault(root)

    const result = compileNarrativeVault(root, { now: "2026-05-15T00:00:00.000Z" })

    expect(result.ok).toBe(false)
    expect(result.narrative).toMatchObject({
      id: "narrative:vault-demo",
      audience: { primary: "Board", beliefBefore: "AI operations feel speculative.", beliefAfter: "A staged pilot feels bounded." },
      decision: { action: "Approve the staged pilot.", decisionType: "approve" },
      thesis: { id: "thesis:pilot", statement: "A staged pilot captures upside while bounding execution risk." },
    })
    expect(result.narrative?.claims).toContainEqual(expect.objectContaining({ id: "claim:supported", evidenceStatus: "supported", caveats: ["Only covers pilot scope."] }))
    expect(result.narrative?.claimRelations).toContainEqual(expect.objectContaining({ fromClaimId: "claim:supported", toClaimId: "claim:partial", relation: "supports" }))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "broken_link", severity: "error", nodeId: "claim:partial" }))
    expect(result.graph.nodes.some((node) => node.id === "evidence:supported:ops" && node.type === "evidence")).toBe(true)
  })

  it("reports unknown node types and illegal relation endpoints", () => {
    const root = tempWorkspace("revela-vault-diagnostics-")
    writeSampleVault(root)
    const vault = join(root, "revela-narrative")
    writeFileSync(join(vault, "claims", "bad-type.md"), "---\ntype: claimish\nid: claim:bad-type\n---\nInvalid node type.\n", "utf-8")
    writeFileSync(join(vault, "evidence", "bad-relation.md"), "---\ntype: evidence\nid: evidence:bad-relation\nclaimId: claim:supported\nsource: Test source\nquote: Test quote.\nsupportScope: Test scope.\nunsupportedScope: No broader scope.\ncaveat: Test caveat.\nstrength: weak\n---\n\n## Relations\n\n- supports: [[claim:supported]]\n", "utf-8")
    writeFileSync(join(vault, "claims", "bad-target.md"), "---\ntype: claim\nid: claim:bad-target\nkind: evidence\nimportance: supporting\nevidenceRequired: false\n---\nBad relation target.\n\n## Relations\n\n- supports: [[evidence:supported:ops]]\n", "utf-8")

    const result = compileNarrativeVault(root)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "unknown_node_type", nodeId: "claim:bad-type" }))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "illegal_relation_target", nodeId: "evidence:bad-relation" }))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "illegal_relation_target", nodeId: "claim:bad-target" }))
  })

  it("exports existing narrative to vault without approvals and round-trips source trace", () => {
    const root = tempWorkspace("revela-vault-export-")
    const narrative = narrativeMapState().narrative!
    const result = exportNarrativeStateToVault(root, narrative)
    const compiled = compileNarrativeVault(root, { fallbackApprovals: narrative.approvals, now: narrative.updatedAt })

    expect(result.files).toContain("claims/claim-supported.md")
    expect(readFileSync(join(root, "revela-narrative", "index.md"), "utf-8")).not.toContain("approvals")
    expect(compiled.narrative?.approvals).toEqual(narrative.approvals)
    expect(compiled.narrative?.evidenceBindings).toContainEqual(expect.objectContaining({
      id: "evidence:supported:ops",
      findingsFile: "researches/map-demo/ops.md",
      quote: "Pilot scope fits current operating constraints.",
      location: "section 2",
      supportScope: "Pilot scope only.",
    }))
  })

  it("prefers vault over DECKS narrative and mirrors compiled narrative on write", () => {
    const root = tempWorkspace("revela-vault-source-")
    const state = narrativeMapState()
    writeDecksState(root, state)
    writeSampleVault(root)

    const read = readDecksState(root)
    expect(read.narrative?.id).toBe("narrative:vault-demo")
    expect(read.narrative?.audience.primary).toBe("Board")

    read.workspace.openQuestions.push("Keep render state intact.")
    writeDecksState(root, read)
    const mirrored = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    expect(mirrored.narrative.id).toBe("narrative:vault-demo")
    expect(mirrored.workspace.openQuestions).toEqual(["Keep render state intact."])
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")).toContain("narrative:vault-demo")
  })

  it("does not replace existing DECKS narrative when the vault is empty", () => {
    const root = tempWorkspace("revela-vault-empty-")
    const state = narrativeMapState()
    writeDecksState(root, state)
    mkdirSync(join(root, "revela-narrative"), { recursive: true })

    const read = readDecksState(root)

    expect(read.narrative?.id).toBe(state.narrative?.id)
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "diagnostics.json"), "utf-8")).toContain("empty_vault")
  })

  it("tool actions compile/export vault and block JSON narrative mutation when vault exists", async () => {
    const root = tempWorkspace("revela-vault-tools-")
    const state = narrativeMapState()
    writeDecksState(root, state)

    const exported = await executeDecksTool({ action: "exportNarrativeVault" }, root)
    expect(exported.ok).toBe(true)

    const compile = await executeDecksTool({ action: "compileNarrativeVault" }, root)
    expect(compile.result.narrative.id).toBe(state.narrative?.id)

    const blocked = await executeDecksTool({ action: "upsertNarrative", narrative: { audience: { primary: "New audience" } } }, root)
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain("revela-narrative/")

    const approved = readDecksState(root).narrative!.approvals[0]
    expect(approved.narrativeHash).toBe(computeNarrativeHash(state.narrative!))
  })

  it("upserts evidence Markdown nodes without rewriting unrelated vault nodes", () => {
    const root = tempWorkspace("revela-vault-mutate-evidence-")
    writeMutableVault(root)

    const mutation = upsertVaultEvidenceNode(root, {
      id: "evidence:pilot:ops",
      claimId: "claim:pilot",
      source: "Operations study",
      sourcePath: "sources/ops.pdf",
      findingsFile: "researches/pilot/ops.md",
      quote: "Pilot scope fits current operating constraints.",
      location: "section 2",
      supportScope: "Supports pilot approval scope.",
      unsupportedScope: "Does not prove full rollout.",
      caveat: "Pilot-only evidence.",
      strength: "strong",
    })
    const compiled = compileNarrativeVault(root)

    expect(mutation).toMatchObject({ ok: true, file: "evidence/evidence-pilot-ops.md" })
    expect(readFileSync(join(root, "revela-narrative", "claims", "pilot.md"), "utf-8")).toContain("Approve a bounded pilot.")
    expect(readFileSync(join(root, "revela-narrative", "evidence", "evidence-pilot-ops.md"), "utf-8")).toContain("unsupportedScope: \"Does not prove full rollout.\"")
    expect(compiled.ok).toBe(true)
    expect(compiled.narrative?.evidenceBindings).toContainEqual(expect.objectContaining({ id: "evidence:pilot:ops", claimId: "claim:pilot", strength: "strong" }))
  })

  it("rejects evidence mutation when source trace fields are missing", () => {
    const root = tempWorkspace("revela-vault-mutate-missing-")
    writeMutableVault(root)

    const mutation = upsertVaultEvidenceNode(root, {
      id: "evidence:pilot:missing",
      claimId: "claim:pilot",
      source: "Operations study",
    })

    expect(mutation.ok).toBe(false)
    expect(mutation.missingFields).toContain("quote")
    expect(mutation.missingFields).toContain("sourcePath|url|findingsFile")
  })

  it("updates research gap Markdown nodes and preserves existing fields", () => {
    const root = tempWorkspace("revela-vault-mutate-gap-")
    writeMutableVault(root)

    const mutation = updateVaultResearchGapNode(root, {
      id: "gap:pilot-evidence",
      status: "evidence_bound",
      findingsFile: "researches/pilot/ops.md",
      evidenceBindingIds: ["evidence:pilot:ops"],
      notes: "Resolved by operations study evidence.",
    }, { now: "2026-05-15T00:00:00.000Z" })
    const compiled = compileNarrativeVault(root)

    expect(mutation).toMatchObject({ ok: true, file: "research-gaps/pilot.md" })
    expect(compiled.narrative?.researchGaps).toContainEqual(expect.objectContaining({
      id: "gap:pilot-evidence",
      targetType: "claim",
      targetId: "claim:pilot",
      status: "evidence_bound",
      findingsFile: "researches/pilot/ops.md",
      evidenceBindingIds: ["evidence:pilot:ops"],
      notes: "Resolved by operations study evidence.",
    }))
  })

  it("tool actions mutate vault Markdown, compile cache, and mirror DECKS narrative", async () => {
    const root = tempWorkspace("revela-vault-tool-mutate-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    const evidence = await executeDecksTool({
      action: "upsertVaultEvidence",
      evidence: {
        id: "evidence:pilot:ops",
        claimId: "claim:pilot",
        source: "Operations study",
        sourcePath: "sources/ops.pdf",
        findingsFile: "researches/pilot/ops.md",
        quote: "Pilot scope fits current operating constraints.",
        location: "section 2",
        supportScope: "Supports pilot approval scope.",
        unsupportedScope: "Does not prove full rollout.",
        caveat: "Pilot-only evidence.",
        strength: "strong",
      },
    }, root)
    const gap = await executeDecksTool({
      action: "updateVaultResearchGap",
      gapId: "gap:pilot-evidence",
      gapStatus: "evidence_bound",
      findingsFile: "researches/pilot/ops.md",
      evidenceBindingIds: ["evidence:pilot:ops"],
      gapNotes: "Resolved by operations study evidence.",
    }, root)
    const mirrored = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))

    expect(evidence.ok).toBe(true)
    expect(gap.ok).toBe(true)
    expect(mirrored.narrative.evidenceBindings).toContainEqual(expect.objectContaining({ id: "evidence:pilot:ops" }))
    expect(mirrored.narrative.researchGaps).toContainEqual(expect.objectContaining({ id: "gap:pilot-evidence", status: "evidence_bound" }))
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")).toContain("evidence:pilot:ops")
  })
})

function writeSampleVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:vault-demo\nstatus: ready_for_approval\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Board\nbeliefBefore: AI operations feel speculative.\nbeliefAfter: A staged pilot feels bounded.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve the staged pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:pilot\nconfidence: medium\n---\nA staged pilot captures upside while bounding execution risk.\n", "utf-8")
  writeFileSync(join(vault, "claims", "supported.md"), "---\ntype: claim\nid: claim:supported\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Pilot scope only.\n---\nPhased pilot approval is the safer path.\n\n## Caveats\n\n- Only covers pilot scope.\n\n## Relations\n\n- supports: [[claim:partial]] - Line evidence supports the recommendation.\n", "utf-8")
  writeFileSync(join(vault, "claims", "partial.md"), "---\ntype: claim\nid: claim:partial\nkind: evidence\nimportance: supporting\nevidenceRequired: true\n---\nCurrent line data supports initial automation gains.\n\n## Relations\n\n- depends_on: [[claim:missing]]\n", "utf-8")
  writeFileSync(join(vault, "evidence", "supported.md"), "---\ntype: evidence\nid: evidence:supported:ops\nclaimId: claim:supported\nsource: Operations study\nfindingsFile: researches/map-demo/ops.md\nquote: Pilot scope fits current operating constraints.\nlocation: section 2\nsupportScope: Pilot scope only.\nunsupportedScope: Does not prove full rollout.\ncaveat: Pilot-only evidence.\nstrength: strong\n---\n", "utf-8")
}

function writeMutableVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  mkdirSync(join(vault, "research-gaps"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:mutable-demo\nstatus: needs_research\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Board\nbeliefBefore: Pilot evidence is incomplete.\nbeliefAfter: Pilot evidence is bounded and traceable.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve a bounded pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:pilot\nconfidence: medium\n---\nA bounded pilot is the right next step.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Pilot decision only.\nunsupportedScope: Full rollout remains unsupported.\n---\nApprove a bounded pilot.\n", "utf-8")
  writeFileSync(join(vault, "research-gaps", "pilot.md"), "---\ntype: research-gap\nid: gap:pilot-evidence\ntargetType: claim\ntargetId: claim:pilot\nquestion: What evidence supports the pilot decision?\nstatus: open\npriority: high\ncreatedFromIssueType: claim_missing_evidence\n---\nWhat evidence supports the pilot decision?\n", "utf-8")
}
