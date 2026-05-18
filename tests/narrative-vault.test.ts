import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { readDecksState, writeDecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { buildNarrativeVaultInventory, compileNarrativeVault, exportNarrativeStateToVault, formatVaultDiagnosticMarkdown, formatVaultDiagnosticReport, getNarrativeVaultMigrationHint, initNarrativeVault, parseRelations, removeVaultRelation, runNarrativeMarkdownQa, updateVaultCoreNodes, updateVaultResearchGapNode, upsertVaultClaimNode, upsertVaultEvidenceNode, upsertVaultObjectionNode, upsertVaultRelation, upsertVaultRiskNode } from "../lib/narrative-vault"
import { narrativeMapState } from "./helpers/narrative-fixtures"
import { executeDecksTool, tempWorkspace } from "./helpers/tool-helpers"

describe("narrative vault", () => {
  it("parses inline wikilink relations with deterministic ids", () => {
    const result = parseRelations("- supports: [[claim-partial|Line data]] - because it proves the path\n- unknown: [[claim-x]]", "claim-supported", "claims/supported.md")

    expect(result.relations).toEqual([{ id: "rel-claim-supported-supports-claim-partial", fromId: "claim-supported", relation: "supports", toId: "claim-partial", rationale: "because it proves the path", file: "claims/supported.md", source: "inline" }])
    expect(result.unknownTypes).toEqual(["unknown"])
  })

  it("compiles inline relations and derives evidence claim bindings", () => {
    const root = tempWorkspace("revela-vault-inline-compile-")
    writeRegistryVault(root)

    const result = compileNarrativeVault(root)
    const inventory = buildNarrativeVaultInventory(root)

    expect(result.ok).toBe(true)
    expect(result.narrative?.claimRelations).toContainEqual(expect.objectContaining({ fromClaimId: "claim:pilot", toClaimId: "claim:execution", relation: "supports" }))
    expect(result.narrative?.evidenceBindings).toContainEqual(expect.objectContaining({ id: "evidence:pilot", claimId: "claim:pilot", strength: "partial" }))
    expect(result.graph.relations).toContainEqual(expect.objectContaining({ id: "rel-evidence-pilot-supports-claim-pilot", source: "inline" }))
    expect(inventory.relationCoverage.danglingEdges).toEqual([])
    expect(inventory.evidence).toContainEqual(expect.objectContaining({ id: "evidence:pilot", claimId: "claim:pilot" }))
  })

  it("projects deck-plan slide wikilinks into the workspace graph without changing narrative state", () => {
    const root = tempWorkspace("revela-vault-deck-plan-projection-")
    writeRegistryVault(root)
    const before = compileNarrativeVault(root)
    const narrativeHash = before.narrative ? computeNarrativeHash(before.narrative) : ""
    mkdirSync(join(root, "deck-plan", "slides"), { recursive: true })
    writeFileSync(join(root, "deck-plan", "index.md"), `---
id: deck-plan
narrativeHash: ${narrativeHash}
outputPath: decks/pilot.html
---

# Deck Plan

## Source Authority

- Meaning: revela-narrative/.

## Audience / Goal / Decision

- Audience: committee.

## Deck Parameters

- Target slides: 8.

## Chapter Map

- Pilot: slides 1-3.

## Slide Plan

- [[slide-pilot-proof]] uses the pilot claim and evidence.

## Evidence Trace

- Preserve evidence source trace.

## Boundary / Risk Treatment

- Keep caveats audience-facing.

## Chapter Writing Batches

- Batch 1: pilot.

## HTML Identity Contract

- Use positive 1-based slide indexes.
`, "utf-8")
    writeFileSync(join(root, "deck-plan", "slides", "001-pilot-proof.md"), `---
type: deck-plan-slide
id: slide-pilot-proof
slideIndex: 1
title: Pilot proof
chapter: Pilot
layout: narrative
components: box, text-panel
structural: false
---

# Pilot proof

## Narrative Links

Claims:
- [[claim:pilot]]

Evidence:
- [[evidence:pilot]]
`, "utf-8")

    const compiled = compileNarrativeVault(root)

    expect(compiled.ok).toBe(true)
    expect(compiled.narrative?.claimRelations).toEqual(before.narrative?.claimRelations)
    expect(computeNarrativeHash(compiled.narrative!)).toBe(narrativeHash)
    expect(compiled.graph.nodes).toContainEqual(expect.objectContaining({ id: "deck-plan", type: "deck-plan", file: "deck-plan/index.md" }))
    expect(compiled.graph.nodes).toContainEqual(expect.objectContaining({ id: "slide-pilot-proof", type: "deck-plan-slide", file: "deck-plan/slides/001-pilot-proof.md" }))
    expect(compiled.graph.relations).toContainEqual(expect.objectContaining({ fromId: "slide-pilot-proof", relation: "uses_claim", toId: "claim:pilot" }))
    expect(compiled.graph.relations).toContainEqual(expect.objectContaining({ fromId: "slide-pilot-proof", relation: "uses_evidence", toId: "evidence:pilot" }))
  })

  it("prefers wikilink relations over frontmatter bindings and derives gap context through evidence", () => {
    const root = tempWorkspace("revela-vault-wikilink-first-")
    writeRegistryVault(root)
    const vault = join(root, "revela-narrative")
    writeFileSync(join(vault, "claims", "legacy.md"), "---\ntype: claim\nid: claim:legacy\nkind: evidence\nimportance: supporting\nevidenceRequired: false\n---\nLegacy fallback claim.\n", "utf-8")
    writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:legacy\nsource: Proposal\nsourcePath: proposal.md\nquote: Pilot approval is requested.\nsupportScope: Supports the internal pilot request.\nunsupportedScope: Does not prove external market demand.\ncaveat: Intent evidence only.\nstrength: partial\n---\n\n## Relations\n\n- supports: [[claim:pilot]] - Proposal states the pilot request.\n", "utf-8")
    mkdirSync(join(vault, "research-gaps"), { recursive: true })
    writeFileSync(join(vault, "research-gaps", "pilot.md"), "---\ntype: research-gap\nid: gap:pilot\nquestion: What stronger evidence supports pilot approval?\nstatus: open\npriority: high\n---\nFind stronger evidence.\n\n## Relations\n\n- depends_on: [[evidence:pilot]]\n", "utf-8")

    const compiled = compileNarrativeVault(root)
    const inventory = buildNarrativeVaultInventory(root)

    expect(compiled.ok).toBe(true)
    expect(compiled.narrative?.evidenceBindings).toContainEqual(expect.objectContaining({ id: "evidence:pilot", claimId: "claim:pilot" }))
    expect(compiled.narrative?.researchGaps).toContainEqual(expect.objectContaining({ id: "gap:pilot", targetType: "claim", targetId: "claim:pilot", evidenceBindingIds: ["evidence:pilot"] }))
    expect(compiled.graph.relations).toContainEqual(expect.objectContaining({ fromId: "gap:pilot", toId: "evidence:pilot", relation: "depends_on" }))
    expect(inventory.relationCoverage.fallbackOnlyBindings).toContainEqual(expect.objectContaining({ nodeId: "evidence:pilot", targetId: "claim:legacy" }))
  })

  it("warns when valid frontmatter bindings have no wikilink relation", () => {
    const root = tempWorkspace("revela-vault-frontmatter-fallback-qa-")
    writeSampleVault(root)

    const inventory = buildNarrativeVaultInventory(root)
    const qa = runNarrativeMarkdownQa(root, { scope: "full", strictness: "authoring" })

    expect(inventory.relationCoverage.fallbackOnlyBindings).toContainEqual(expect.objectContaining({ nodeId: "evidence:supported:ops", field: "claimId", relation: "supports", targetId: "claim:supported" }))
    expect(qa.warnings).toContainEqual(expect.objectContaining({ issueCode: "frontmatter_binding_without_relation", nodeId: "evidence:supported:ops" }))
  })

  it("rejects deprecated relation registry helpers", () => {
    const root = tempWorkspace("revela-vault-relation-mutate-")
    writeRegistryVault(root)

    const updated = upsertVaultRelation(root, {
      id: "rel-pilot-supports-execution",
      fromId: "claim:execution",
      toId: "claim:pilot",
      relation: "supports",
      rationale: "Execution framing supports the pilot recommendation.",
    })
    const removed = removeVaultRelation(root, "rel-pilot-leads-to-execution")

    expect(updated).toMatchObject({ ok: false, skipped: true, nodeId: "rel-pilot-supports-execution" })
    expect(updated.error).toContain("## Relations")
    expect(removed).toMatchObject({ ok: false, skipped: true, nodeId: "rel-pilot-leads-to-execution" })
  })

  it("rejects incomplete relation helper inputs", () => {
    const root = tempWorkspace("revela-vault-relation-mutate-invalid-")
    writeRegistryVault(root)

    const missing = upsertVaultRelation(root, { id: "rel-missing", fromId: "claim:pilot", toId: "", relation: "supports" })
    const invalid = upsertVaultRelation(root, { id: "rel-invalid", fromId: "claim:pilot", toId: "claim:execution", relation: "invalid" as any })

    expect(missing).toMatchObject({ ok: false, missingFields: ["toId"] })
    expect(invalid).toMatchObject({ ok: false, error: "Invalid relation type: invalid." })
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
    writeFileSync(join(vault, "evidence", "bad-relation.md"), "---\ntype: evidence\nid: evidence:bad-relation\nclaimId: claim:supported\nsource: Test source\nquote: Test quote.\nsupportScope: Test scope.\nunsupportedScope: No broader scope.\ncaveat: Test caveat.\nstrength: weak\n---\n\n## Relations\n\n- depends_on: [[claim:supported]]\n", "utf-8")
    writeFileSync(join(vault, "claims", "bad-target.md"), "---\ntype: claim\nid: claim:bad-target\nkind: evidence\nimportance: supporting\nevidenceRequired: false\n---\nBad relation target.\n\n## Relations\n\n- supports: [[evidence:supported:ops]]\n", "utf-8")

    const result = compileNarrativeVault(root)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "unknown_node_type", nodeId: "claim:bad-type" }))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "illegal_relation_target", nodeId: "evidence:bad-relation" }))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "illegal_relation_target", nodeId: "claim:bad-target" }))
  })

  it("formats diagnostic reports with suggested fixes and next actions", () => {
    const report = formatVaultDiagnosticReport([
      { severity: "error", code: "broken_link", message: "Relation points to unknown node: claim:missing", file: "claims/pilot.md", nodeId: "claim:pilot" },
      { severity: "warning", code: "claim_missing_evidence", message: "Evidence-required claim claim:pilot has no evidence binding.", nodeId: "claim:pilot" },
      { severity: "warning", code: "evidence_trace_incomplete", message: "Evidence node evidence:pilot is missing trace.", nodeId: "evidence:pilot" },
    ])
    const markdown = formatVaultDiagnosticMarkdown(report)

    expect(report.ok).toBe(false)
    expect(report.errorCount).toBe(1)
    expect(report.warningCount).toBe(2)
    expect(report.blockers[0]).toMatchObject({ code: "broken_link", file: "claims/pilot.md", suggestedAction: "Repair the wikilink and rerun compileNarrativeVault." })
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "claim_missing_evidence", suggestedAction: "Run /revela research or use upsertVaultEvidence when source trace is explicit." }))
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "evidence_trace_incomplete", suggestedAction: "Use upsertVaultEvidence with complete source trace fields." }))
    expect(markdown).toContain("Narrative vault diagnostics")
    expect(markdown).toContain("claims/pilot.md / claim:pilot")
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

  it("prefers vault over DECKS narrative and strips persisted narrative on write", () => {
    const root = tempWorkspace("revela-vault-source-")
    const state = narrativeMapState()
    writeDecksState(root, state)
    writeSampleVault(root)

    const read = readDecksState(root)
    expect(read.narrative?.id).toBe("narrative:vault-demo")
    expect(read.narrative?.audience.primary).toBe("Board")

    read.workspace.openQuestions.push("Keep render state intact.")
    writeDecksState(root, read)
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    const hydrated = readDecksState(root)
    expect(written.narrative).toBeUndefined()
    expect(written.workspace.openQuestions).toEqual(["Keep render state intact."])
    expect(hydrated.narrative?.id).toBe("narrative:vault-demo")
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "diagnostics.json"), "utf-8")).toContain("broken_link")
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
    expect(exported.files).toContain("index.md")
    expect(exported.migrationNote).toContain("Approvals")
    expect(exported.preservedInDecksJson).toContain("renderTargets")
    expect(exported.nextActions).toContain("Review diagnosticReport for any source trace, evidence, relation, or approval warnings.")

    const compile = await executeDecksTool({ action: "compileNarrativeVault" }, root)
    expect(compile.result.narrative.id).toBe(state.narrative?.id)
    expect(compile.diagnosticReport).toMatchObject({ ok: true, errorCount: 0 })
    expect(compile.diagnosticReport.warningCount).toBeGreaterThan(0)

    const blocked = await executeDecksTool({ action: "upsertNarrative", narrative: { audience: { primary: "New audience" } } }, root)
    expect(blocked.ok).toBe(false)
    expect(blocked.deprecated).toBe(true)
    expect(blocked.error).toContain("initNarrativeVault")
    expect(blocked.authoringContract.allowedActions).toContain("upsertVaultResearchGap")

    const approved = readDecksState(root).narrative!.approvals[0]
    expect(approved.narrativeHash).toBe(computeNarrativeHash(state.narrative!))
  })

  it("bootstraps a draft Markdown vault without requiring complete narrative information", () => {
    const root = tempWorkspace("revela-vault-bootstrap-")

    const result = initNarrativeVault(root, {
      id: "narrative:bootstrap",
      audience: { primary: "Executive team" },
      decision: { action: "Decide whether to fund discovery." },
      thesis: { statement: "Discovery should proceed only with explicit evidence gaps.", confidence: "low" },
    })
    const compiled = compileNarrativeVault(root)

    expect(result).toMatchObject({ ok: true, created: true, path: "revela-narrative" })
    expect(result.files).toEqual(["index.md", "audience.md", "decision.md", "thesis.md"])
    for (const dir of ["claims", "evidence", "objections", "risks", "research-gaps"]) {
      expect(readFileSync(join(root, "revela-narrative", "index.md"), "utf-8")).toContain("narrative:bootstrap")
      expect(() => readFileSync(join(root, "revela-narrative", dir, "missing.md"), "utf-8")).toThrow()
    }
    expect(compiled.ok).toBe(true)
    expect(compiled.narrative).toMatchObject({
      id: "narrative:bootstrap",
      audience: { primary: "Executive team" },
      decision: { action: "Decide whether to fund discovery." },
      thesis: { statement: "Discovery should proceed only with explicit evidence gaps." },
    })
  })

  it("tool action initializes a vault, cache, and hydrated DECKS runtime state for new workspaces", async () => {
    const root = tempWorkspace("revela-vault-tool-bootstrap-")

    const result = await executeDecksTool({
      action: "initNarrativeVault",
      narrative: {
        audience: { primary: "Product leadership" },
        decision: { action: "Choose whether to continue 0.17.0 scope." },
        thesis: { statement: "Record findings early and leave gaps visible.", confidence: "medium" },
      },
    }, root)
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    const hydrated = readDecksState(root)

    expect(result.ok).toBe(true)
    expect(result.created).toBe(true)
    expect(result.files).toContain("index.md")
    expect(result.authoringContract.allowedActions).toContain("upsertVaultResearchGap")
    expect(result.authoringContract.forbiddenCompatibilityActions).toContain("upsertResearchGaps")
    expect(result.authoringContract.idConvention.avoid).toContain("claim:belief-change-purpose")
    expect(result.nextActions).toContain("Treat workspace source material records as candidates until explicit evidence trace is written.")
    expect(written.narrative).toBeUndefined()
    expect(hydrated.narrative?.audience.primary).toBe("Product leadership")
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")).toContain("Product leadership")
  })

  it("smoke tests fresh init with proposal intent, inventory-first authoring, QA repair, and graph compile", async () => {
    const root = tempWorkspace("revela-vault-phase7-init-smoke-")
    const proposalPath = join(root, "proposal.md")
    writeFileSync(proposalPath, [
      "# Pilot Proposal",
      "",
      "Audience: Product leadership.",
      "Decision: Approve a bounded AI operations pilot.",
      "Thesis: Start with a narrow pilot while external market demand remains unproven.",
      "Evidence: The proposal requests pilot approval and caps scope to the operations workflow.",
      "Gap: External market demand has not been validated in the proposal.",
      "",
    ].join("\n"), "utf-8")

    const init = await executeDecksTool({
      action: "init",
      sourceMaterials: [{
        path: "proposal.md",
        type: "md",
        size: readFileSync(proposalPath, "utf-8").length,
        fingerprint: "phase7-proposal-v1",
        status: "discovered",
        summary: "Intent brief for a bounded AI operations pilot.",
        bestUsedFor: "Audience, decision, thesis, internal intent evidence, and missing external validation gap.",
        firstSeen: "2026-05-16T00:00:00.000Z",
        lastChecked: "2026-05-16T00:00:00.000Z",
      }],
    }, root)
    const bootstrapped = await executeDecksTool({
      action: "initNarrativeVault",
      narrative: {
        audience: { primary: "Product leadership", beliefBefore: "AI operations pilots feel speculative.", beliefAfter: "A narrow pilot feels bounded but external demand remains unproven." },
        decision: { action: "Approve a bounded AI operations pilot.", decisionType: "approve" },
        thesis: { statement: "Start with a narrow pilot while external market demand remains unproven.", confidence: "medium" },
      },
    }, root)
    const beforeAuthoring = await executeDecksTool({ action: "narrativeInventory" }, root)

    expect(init.ingest.ingestCandidates).toContainEqual(expect.objectContaining({ path: "proposal.md" }))
    expect(init.ingest.suggestedTasks).toContainEqual(expect.objectContaining({ path: "proposal.md", suggestedAction: "read_directly" }))
    expect(bootstrapped.ok).toBe(true)
    expect(beforeAuthoring.narrativeInventory.counts.claims).toBe(0)
    expect(beforeAuthoring.authoringContract.relationSyntax.avoid).toContain("[[claim:claim-belief-change-purpose]]")

    const claimsDir = join(root, "revela-narrative", "claims")
    const evidenceDir = join(root, "revela-narrative", "evidence")
    const gapsDir = join(root, "revela-narrative", "research-gaps")
    writeFileSync(join(claimsDir, "pilot.md"), "---\ntype: claim\nid: claim-pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Internal pilot approval request only.\nunsupportedScope: Does not prove external market demand.\n---\nApprove a bounded AI operations pilot.\n\n## Relations\n\n- supports: [[claim:claim-market-demand]]\n", "utf-8")

    const typoQa = await executeDecksTool({ action: "markdownQa", markdownQaScope: "touched", markdownQaStrictness: "authoring" }, root)
    expect(typoQa.markdownQa.blockers).toContainEqual(expect.objectContaining({ issueCode: "typed_wikilink_target", file: "claims/pilot.md" }))

    writeFileSync(join(claimsDir, "pilot.md"), "---\ntype: claim\nid: claim-pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Internal pilot approval request only.\nunsupportedScope: Does not prove external market demand.\n---\nApprove a bounded AI operations pilot.\n\n## Relations\n\n- supports: [[claim-market-demand]] - Pilot approval depends on acknowledging the unsupported market-demand boundary.\n", "utf-8")
    writeFileSync(join(claimsDir, "market-demand.md"), "---\ntype: claim\nid: claim-market-demand\nkind: assumption\nimportance: central\nevidenceRequired: true\nsupportedScope: No direct proposal support.\nunsupportedScope: External demand validation is missing.\n---\nExternal market demand still needs validation before scaling beyond the pilot.\n", "utf-8")
    writeFileSync(join(evidenceDir, "pilot-request.md"), "---\ntype: evidence\nid: evidence-pilot-request\nsource: proposal.md\nsourcePath: proposal.md\nquote: The proposal requests pilot approval and caps scope to the operations workflow.\nsupportScope: Supports the internal pilot request and bounded scope.\nunsupportedScope: Does not prove external market demand or commercial viability.\ncaveat: Intent brief evidence only.\nstrength: partial\n---\nThe local proposal explicitly requests pilot approval with a bounded scope.\n\n## Relations\n\n- supports: [[claim-pilot]] - The proposal states the internal pilot request.\n", "utf-8")
    writeFileSync(join(gapsDir, "market-demand.md"), "---\ntype: research-gap\nid: gap-market-demand\nquestion: What public evidence validates external market demand for this AI operations pilot?\nstatus: open\npriority: high\n---\nThe proposal does not validate external demand.\n\n## Relations\n\n- depends_on: [[claim-market-demand]] - The gap tracks missing support for the market-demand assumption.\n", "utf-8")

    const qa = await executeDecksTool({ action: "markdownQa", markdownQaScope: "full", markdownQaStrictness: "readiness" }, root)
    const compiled = await executeDecksTool({ action: "compileNarrativeVault" }, root)
    const inventory = await executeDecksTool({ action: "narrativeInventory" }, root)
    const persisted = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))

    expect(qa.markdownQa.blockers).toEqual([])
    expect(inventory.narrativeInventory.relationCoverage.danglingEdges).toEqual([])
    expect(inventory.narrativeInventory.relationCoverage.unboundEvidence).toEqual([])
    expect(compiled.result.graph.relations).toContainEqual(expect.objectContaining({ id: "rel-evidence-pilot-request-supports-claim-pilot", source: "inline" }))
    expect(compiled.result.narrative.evidenceBindings).toContainEqual(expect.objectContaining({ id: "evidence-pilot-request", claimId: "claim-pilot", strength: "partial" }))
    expect(compiled.result.narrative.claims).toContainEqual(expect.objectContaining({ id: "claim-market-demand", evidenceStatus: "missing", unsupportedScope: "External demand validation is missing." }))
    expect(compiled.result.narrative.researchGaps).toContainEqual(expect.objectContaining({ id: "gap-market-demand", targetId: "claim-market-demand", status: "open" }))
    expect(compiled.diagnosticReport.warnings).toContainEqual(expect.objectContaining({ code: "claim_missing_evidence", nodeId: "claim-market-demand" }))
    expect(persisted.narrative).toBeUndefined()
  })

  it("persists approvals outside the DECKS narrative mirror in vault workspaces", async () => {
    const root = tempWorkspace("revela-vault-approval-provenance-")
    writeDecksState(root, narrativeMapState())
    writeRegistryVault(root)

    const approval = await executeDecksTool({ action: "approveNarrative", approvalBy: "override", approvalScope: "render_override", approvalNote: "Override for cache migration test." }, root)
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    const hydrated = readDecksState(root)

    expect(approval.ok).toBe(true)
    expect(approval.result.approved).toBe(true)
    expect(written.narrative).toBeUndefined()
    expect(written.narrativeApprovals).toContainEqual(expect.objectContaining({ id: approval.result.approval.id, scope: "render_override" }))
    expect(hydrated.narrative?.approvals).toContainEqual(expect.objectContaining({ id: approval.result.approval.id, scope: "render_override" }))
  })

  it("tool initNarrativeVault is a no-op when the vault already exists", async () => {
    const root = tempWorkspace("revela-vault-tool-bootstrap-existing-")
    writeMutableVault(root)

    const result = await executeDecksTool({ action: "initNarrativeVault", narrative: { audience: { primary: "Should not overwrite" } } }, root)

    expect(result.ok).toBe(true)
    expect(result.created).toBe(false)
    expect(result.files).toEqual([])
    expect(result.authoringContract.allowedActions).toContain("upsertVaultClaim")
    expect(readFileSync(join(root, "revela-narrative", "audience.md"), "utf-8")).toContain("primary: Board")
  })

  it("reports migration hints for JSON narrative workspaces without a vault", async () => {
    const root = tempWorkspace("revela-vault-migration-hint-")
    const state = narrativeMapState()
    writeDecksState(root, state)

    const direct = getNarrativeVaultMigrationHint(root, readDecksState(root))
    const summary = await executeDecksTool({ action: "read", summary: true }, root)

    expect(direct).toMatchObject({ available: true, suggestedAction: "exportNarrativeVault" })
    expect(summary.migration).toMatchObject({ available: true, suggestedAction: "exportNarrativeVault" })
    expect(summary.migration.reason).toContain("no revela-narrative/ vault exists yet")
    expect(summary.migration.preservedInDecksJson).toContain("approvals")
    expect(summary.migration.nextActions).toContain("Run revela-decks action exportNarrativeVault to create editable Markdown narrative files.")
  })

  it("does not suggest migration when a Markdown vault already exists", async () => {
    const root = tempWorkspace("revela-vault-migration-existing-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    const summary = await executeDecksTool({ action: "read", summary: true }, root)

    expect(summary.migration).toMatchObject({ available: false })
    expect(summary.migration.reason).toContain("already exists")
    expect(summary.vaultDiagnostics).toBeDefined()
    expect(summary.authoringContract.allowedActions).toContain("upsertVaultResearchGap")
  })

  it("tool read summary and compile expose vault diagnostic reports", async () => {
    const root = tempWorkspace("revela-vault-tool-diagnostic-report-")
    writeDecksState(root, narrativeMapState())
    writeSampleVault(root)

    const summary = await executeDecksTool({ action: "read", summary: true }, root)
    const compile = await executeDecksTool({ action: "compileNarrativeVault" }, root)

    expect(summary.vaultDiagnostics).toMatchObject({ ok: false, errorCount: 1 })
    expect(summary.markdownQa).toMatchObject({ ok: false })
    expect(summary.markdownQa.repairCards).toContainEqual(expect.objectContaining({ issueCode: "broken_relation_target", file: "claims/partial.md" }))
    expect(summary.narrativeInventory).toMatchObject({ counts: expect.objectContaining({ claims: 2, evidence: 1, unresolvedRefs: 1 }) })
    expect(summary.vaultDiagnostics.blockers).toContainEqual(expect.objectContaining({ code: "broken_link", suggestedAction: "Repair the wikilink and rerun compileNarrativeVault." }))
    expect(compile.ok).toBe(false)
    expect(compile.diagnosticReport).toMatchObject({ ok: false, errorCount: 1 })
    expect(compile.markdownQa.repairCards).toContainEqual(expect.objectContaining({ issueCode: "broken_relation_target" }))
    expect(compile.narrativeInventory).toMatchObject({ counts: expect.objectContaining({ unresolvedRefs: 1 }) })
  })

  it("keeps compile status separate from Markdown QA status", async () => {
    const root = tempWorkspace("revela-vault-compile-qa-separate-")
    writeDecksState(root, narrativeMapState())
    writeQaOnlyIssueVault(root)

    const compile = await executeDecksTool({ action: "compileNarrativeVault" }, root)
    const summary = await executeDecksTool({ action: "read", summary: true }, root)
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))

    expect(compile.ok).toBe(true)
    expect(compile.diagnosticReport).toMatchObject({ ok: true, errorCount: 0 })
    expect(compile.markdownQa).toMatchObject({ ok: false })
    expect(compile.markdownQa.repairCards).toContainEqual(expect.objectContaining({ issueCode: "duplicate_stable_heading", file: "claims/pilot.md" }))
    expect(compile.narrativeInventory).toMatchObject({ counts: expect.objectContaining({ claims: 1, unresolvedRefs: 0 }) })
    expect(summary.markdownQa).toMatchObject({ ok: false })
    expect(summary.narrativeInventory).toMatchObject({ counts: expect.objectContaining({ claims: 1 }) })
    expect(written.narrative).toBeUndefined()
  })

  it("keeps structural Markdown QA separate from evidence strength", async () => {
    const root = tempWorkspace("revela-vault-qa-evidence-strength-")
    writeDecksState(root, narrativeMapState())
    writeWeakEvidenceVault(root)

    const compile = await executeDecksTool({ action: "compileNarrativeVault" }, root)
    const summary = await executeDecksTool({ action: "read", summary: true }, root)

    expect(compile.ok).toBe(true)
    expect(compile.markdownQa).toMatchObject({ ok: true, repairCards: [] })
    expect(compile.result.narrative.claims).toContainEqual(expect.objectContaining({ id: "claim:pilot", evidenceStatus: "weak" }))
    expect(compile.result.narrative.evidenceBindings).toContainEqual(expect.objectContaining({ id: "evidence:pilot", strength: "weak", unsupportedScope: "Does not prove rollout readiness." }))
    expect(summary.markdownQa).toMatchObject({ ok: true, repairCards: [] })
    expect(summary.narrativeInventory.evidence).toContainEqual(expect.objectContaining({ id: "evidence:pilot", strength: "weak" }))
  })

  it("tool markdownQa returns repair cards without mutating state", async () => {
    const root = tempWorkspace("revela-vault-tool-markdown-qa-")
    writeDecksState(root, narrativeMapState())
    writeSampleVault(root)
    const before = readFileSync(join(root, "DECKS.json"), "utf-8")

    const result = await executeDecksTool({ action: "markdownQa" }, root)
    const after = readFileSync(join(root, "DECKS.json"), "utf-8")

    expect(result.ok).toBe(false)
    expect(result.markdownQa.repairCards).toContainEqual(expect.objectContaining({ issueCode: "broken_relation_target", file: "claims/partial.md", smallestRepair: expect.stringContaining("narrativeInventory") }))
    expect(result.narrativeInventory.counts.unresolvedRefs).toBe(1)
    expect(after).toBe(before)
  })

  it("Markdown QA checks touched relation syntax and full relation sync", () => {
    const root = tempWorkspace("revela-vault-relation-qa-scope-")
    writeSampleVault(root)

    const touched = runNarrativeMarkdownQa(root, { touched: ["revela-narrative/claims/supported.md"], scope: "touched", strictness: "authoring" })
    const full = runNarrativeMarkdownQa(root, { scope: "full", strictness: "readiness" })

    expect(touched.repairCards).not.toContainEqual(expect.objectContaining({ issueCode: "legacy_inline_relation", file: "claims/supported.md" }))
    expect(touched.repairCards).not.toContainEqual(expect.objectContaining({ issueCode: "isolated_central_claim" }))
    expect(full.repairCards).toContainEqual(expect.objectContaining({ issueCode: "broken_relation_target", file: "claims/partial.md" }))
  })

  it("Markdown QA blocks typed wikilink relation targets", () => {
    const root = tempWorkspace("revela-vault-typed-wikilink-qa-")
    writeSampleVault(root)
    writeFileSync(join(root, "revela-narrative", "claims", "supported.md"), "---\ntype: claim\nid: claim:supported\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Pilot scope only.\n---\nPhased pilot approval is the safer path.\n\n## Relations\n\n- supports: [[claim:claim-partial]]\n", "utf-8")

    const qa = runNarrativeMarkdownQa(root, { touched: ["revela-narrative/claims/supported.md"], scope: "touched", strictness: "authoring" })

    expect(qa.blockers).toContainEqual(expect.objectContaining({ issueCode: "typed_wikilink_target", file: "claims/supported.md" }))
  })

  it("inventory exposes relation coverage for unbound nodes", () => {
    const root = tempWorkspace("revela-vault-relation-coverage-")
    writeRegistryVault(root)
    writeFileSync(join(root, "revela-narrative", "evidence", "unbound.md"), "---\ntype: evidence\nid: evidence:unbound\nsource: Proposal\nsourcePath: proposal.md\nquote: Unbound quote.\nsupportScope: Narrow support.\nunsupportedScope: No broader support.\ncaveat: Needs binding.\nstrength: partial\n---\n", "utf-8")

    const inventory = buildNarrativeVaultInventory(root)
    const qa = runNarrativeMarkdownQa(root, { scope: "full", strictness: "readiness" })

    expect(inventory.relationCoverage.unboundEvidence).toContain("evidence:unbound")
    expect(inventory.relationCoverage.orphanNodes).toContain("evidence:unbound")
    expect(qa.repairCards).toContainEqual(expect.objectContaining({ issueCode: "unbound_evidence", nodeId: "evidence:unbound", severity: "error" }))
  })

  it("inventory exposes advisory relation candidates without mutating inline relation state", async () => {
    const root = tempWorkspace("revela-vault-relation-candidates-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)
    writeFileSync(join(root, "revela-narrative", "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:pilot\nsource: Proposal\nsourcePath: proposal.md\nquote: Pilot approval is requested.\nsupportScope: Supports the internal pilot request.\nunsupportedScope: Does not prove external market demand.\ncaveat: Intent evidence only.\nstrength: partial\n---\n", "utf-8")

    const direct = buildNarrativeVaultInventory(root)
    const tool = await executeDecksTool({ action: "narrativeInventory" }, root)

    expect(direct.counts.relations).toBe(1)
    expect(direct.relationSummary).toMatchObject({ inlineEdges: 1, advisoryCandidates: 4 })
    expect(direct.relationCandidates).toContainEqual(expect.objectContaining({ id: "rel-evidence-pilot-supports-claim-pilot", fromId: "evidence:pilot", toId: "claim:pilot", relation: "supports", source: "frontmatter" }))
    expect(tool.narrativeInventory.relationCandidates).toContainEqual(expect.objectContaining({ fromId: "risk:execution", toId: "claim:pilot", relation: "constrains" }))
    expect(readFileSync(join(root, "revela-narrative", "claims", "pilot.md"), "utf-8")).toContain("## Relations")
  })

  it("inventory suppresses advisory candidates that already exist inline", () => {
    const root = tempWorkspace("revela-vault-relation-candidates-dedupe-")
    writeRegistryVault(root)

    const inventory = buildNarrativeVaultInventory(root)

    expect(inventory.relationSummary).toMatchObject({ inlineEdges: 2, advisoryCandidates: 0 })
    expect(inventory.relationCandidates).not.toContainEqual(expect.objectContaining({ fromId: "evidence:pilot", toId: "claim:pilot", relation: "supports" }))
  })

  it("blocks readiness and render actions when strict relation sync has blockers", async () => {
    const root = tempWorkspace("revela-vault-inline-strict-gate-")
    writeDecksState(root, narrativeMapState())
    writeBrokenRegistryVault(root)

    const review = await executeDecksTool({ action: "reviewNarrative" }, root)
    const approval = await executeDecksTool({ action: "approveNarrative", approvalNote: "Approve narrative." }, root)
    const plan = await executeDecksTool({ action: "compileDeckPlan" }, root)

    expect(review).toMatchObject({ ok: false, skipped: true, action: "reviewNarrative" })
    expect(review.reason).toContain("Markdown QA readiness blockers")
    expect(review.markdownQa.blockers).toContainEqual(expect.objectContaining({ issueCode: "broken_relation_target", file: "claims/pilot.md" }))
    expect(approval).toMatchObject({ ok: false, skipped: true, action: "approveNarrative" })
    expect(plan).toMatchObject({ ok: false, skipped: true, action: "compileDeckPlan" })
    expect(plan.reason).toContain("Markdown QA render blockers")
  })

  it("builds a read-only narrative inventory for existing vault nodes", async () => {
    const root = tempWorkspace("revela-vault-inventory-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    const direct = buildNarrativeVaultInventory(root)
    const tool = await executeDecksTool({ action: "narrativeInventory" }, root)
    const alias = await executeDecksTool({ action: "vaultInventory" }, root)

    expect(direct.ok).toBe(true)
    expect(direct.counts).toMatchObject({ claims: 2, evidence: 0, researchGaps: 1, objections: 1, risks: 1, relations: 1, unresolvedRefs: 0 })
    expect(direct.claims).toContainEqual(expect.objectContaining({ id: "claim:pilot", file: "claims/pilot.md", evidenceRequired: true }))
    expect(direct.researchGaps).toContainEqual(expect.objectContaining({ id: "gap:pilot-evidence", targetId: "claim:pilot", status: "open" }))
    expect(direct.relations).toContainEqual(expect.objectContaining({ fromId: "claim:pilot", toId: "claim:execution", unresolved: false }))
    expect(direct.idHints.nextClaimIdExamples[0]).toContain("claim-market-context")
    expect(tool.ok).toBe(true)
    expect(tool.narrativeInventory.counts.claims).toBe(2)
    expect(tool.authoringContract.standardSession).toContain("narrativeInventory before authoring ids or relations")
    expect(alias.narrativeInventory.counts.researchGaps).toBe(1)
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

  it("tool actions mutate vault Markdown, compile cache, and hydrate runtime narrative", async () => {
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
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    const hydrated = readDecksState(root)

    expect(evidence.ok).toBe(true)
    expect(evidence.diagnosticReport.warningCount).toBeGreaterThan(0)
    expect(gap.ok).toBe(true)
    expect(written.narrative).toBeUndefined()
    expect(hydrated.narrative?.evidenceBindings).toContainEqual(expect.objectContaining({ id: "evidence:pilot:ops" }))
    expect(hydrated.narrative?.researchGaps).toContainEqual(expect.objectContaining({ id: "gap:pilot-evidence", status: "evidence_bound" }))
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")).toContain("evidence:pilot:ops")
  })

  it("upserts research gaps through a vault-native structured action", async () => {
    const root = tempWorkspace("revela-vault-tool-gap-upsert-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    const result = await executeDecksTool({
      action: "upsertVaultResearchGap",
      researchGaps: [{
        id: "gap-market-size",
        targetType: "claim",
        targetId: "claim:pilot",
        question: "What source supports the market-size claim?",
        status: "open",
        priority: "high",
        createdFromIssueType: "missing_evidence",
        notes: "Needed before treating market size as supported.",
      }],
    }, root)
    const file = readFileSync(join(root, "revela-narrative", "research-gaps", "gap-market-size.md"), "utf-8")
    const hydrated = readDecksState(root)

    expect(result.ok).toBe(true)
    expect(result.mutation).toMatchObject({ ok: true, nodeId: "gap-market-size", file: "research-gaps/gap-market-size.md" })
    expect(result.authoringContract.allowedActions).toContain("upsertVaultResearchGap")
    expect(file).toContain("type: \"research-gap\"")
    expect(file).toContain("What source supports the market-size claim?")
    expect(hydrated.narrative?.researchGaps).toContainEqual(expect.objectContaining({ id: "gap-market-size", status: "open", priority: "high" }))
  })

  it("upserts research gaps in batches and returns recovery examples for incomplete creates", async () => {
    const root = tempWorkspace("revela-vault-tool-gap-batch-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    const batch = await executeDecksTool({
      action: "upsertVaultResearchGap",
      researchGaps: [
        { id: "gap-market-size", targetType: "claim", targetId: "claim:pilot", question: "What source supports market size?", status: "open", priority: "high" },
        { id: "gap-competitor-proof", targetType: "claim", targetId: "claim:execution", question: "What source supports competitor proof?", status: "open", priority: "medium" },
      ],
    }, root)
    const incomplete = await executeDecksTool({ action: "upsertVaultResearchGap", gapId: "gap-new-lifecycle-only", gapStatus: "open" }, root)

    expect(batch.ok).toBe(true)
    expect(batch.mutations).toHaveLength(2)
    expect(readFileSync(join(root, "revela-narrative", "research-gaps", "gap-market-size.md"), "utf-8")).toContain("What source supports market size?")
    expect(readFileSync(join(root, "revela-narrative", "research-gaps", "gap-competitor-proof.md"), "utf-8")).toContain("What source supports competitor proof?")
    expect(incomplete.ok).toBe(false)
    expect(incomplete.recovery.message).toContain("Research gap helper could not complete")
    expect(incomplete.recovery.message).toContain("targetType")
    expect(incomplete.recovery.examples.tool.researchGaps[0]).toMatchObject({ id: "gap-market-size", targetType: "claim" })
    expect(incomplete.recovery.examples.markdown).toContain("type: research-gap")
    expect(incomplete.narrativeInventory.counts.researchGaps).toBeGreaterThanOrEqual(3)
  })

  it("returns inline relation guidance for claim relation helper inputs", async () => {
    const root = tempWorkspace("revela-vault-tool-claim-relations-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    await executeDecksTool({
      action: "upsertVaultClaim",
      narrative: { claims: [{ id: "claim-recommendation", kind: "recommendation", text: "Approve the focused recommendation.", importance: "central", evidenceRequired: true }] },
    }, root)
    const claimResult = await executeDecksTool({
      action: "upsertVaultClaim",
      narrative: {
        claims: [{ id: "claim-belief-change-purpose", kind: "context", text: "The artifact must change audience belief before asking for approval.", importance: "supporting", evidenceRequired: false }],
        claimRelations: [{ fromClaimId: "claim-belief-change-purpose", toClaimId: "claim-recommendation", relation: "supports", rationale: "Belief change frames the recommendation." }],
      },
    }, root)
    const result = await executeDecksTool({
      action: "upsertVaultRelation",
      relation: { id: "rel-belief-change-supports-recommendation", from: "claim-belief-change-purpose", to: "claim-recommendation", type: "supports", rationale: "Belief change frames the recommendation." },
    }, root)
    const file = readFileSync(join(root, "revela-narrative", "claims", "claim-belief-change-purpose.md"), "utf-8")
    const hydrated = readDecksState(root)

    expect(claimResult.ok).toBe(true)
    expect(claimResult.relationHint).toContain("## Relations")
    expect(result.ok).toBe(false)
    expect(result.recovery.examples.markdown).toContain("## Relations")
    expect(file).not.toContain("## Relations")
    expect(file).not.toContain("[[claim:claim-recommendation]]")
    expect(hydrated.narrative?.claimRelations).not.toContainEqual(expect.objectContaining({ fromClaimId: "claim-belief-change-purpose", toClaimId: "claim-recommendation", relation: "supports" }))
  })

  it("blocks JSON-era research and evidence mutations in vault workspaces with replacements", async () => {
    const root = tempWorkspace("revela-vault-block-json-era-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    const gaps = await executeDecksTool({ action: "upsertResearchGaps", researchGaps: [{ id: "gap:legacy", question: "Legacy gap" }] }, root)
    const update = await executeDecksTool({ action: "updateResearchGap", gapId: "gap:pilot-evidence", gapStatus: "closed" }, root)
    const close = await executeDecksTool({ action: "closeResearchGap", gapId: "gap:pilot-evidence" }, root)
    const derive = await executeDecksTool({ action: "deriveResearchGaps" }, root)
    const evidence = await executeDecksTool({ action: "applyEvidenceCandidates", candidateIds: ["candidate"] }, root)

    for (const result of [gaps, update, close, derive, evidence]) {
      expect(result.ok).toBe(false)
      expect(result.error).toContain("JSON-era compatibility action")
      expect(result.authoringContract.forbiddenCompatibilityActions).toContain("upsertResearchGaps")
    }
    expect(gaps.error).toContain("upsertVaultResearchGap")
    expect(evidence.error).toContain("bindResearchFindings")
  })

  it("binds research findings into vault evidence only when binding eval is safe", async () => {
    const root = tempWorkspace("revela-vault-bind-findings-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)
    mkdirSync(join(root, "researches", "pilot"), { recursive: true })
    writeFileSync(join(root, "researches", "pilot", "ops.md"), `## Recommended evidence bindings
- claimId: claim:pilot
- Source: https://example.com/ops-study
- Quote: "Pilot scope fits current operating constraints and can be delivered without expanding rollout commitments."
- Support scope: Supports pilot approval scope.
- Unsupported scope: Does not prove full rollout.
- Caveat: Pilot-only evidence from the operations study.
- Strength: strong
`, "utf-8")

    const bound = await executeDecksTool({ action: "bindResearchFindings", findingsFile: "researches/pilot/ops.md" }, root)
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    const hydrated = readDecksState(root)

    expect(bound.ok).toBe(true)
    expect(bound.bindingEval).toMatchObject({ status: "bindable", claimId: "claim:pilot" })
    expect(bound.mutation).toMatchObject({ ok: true, file: expect.stringContaining("evidence") })
    expect(bound.gapMutation).toMatchObject({ ok: true, nodeId: "gap:pilot-evidence" })
    expect(written.narrative).toBeUndefined()
    expect(hydrated.narrative?.evidenceBindings).toContainEqual(expect.objectContaining({ claimId: "claim:pilot", findingsFile: "researches/pilot/ops.md", strength: "strong" }))
    expect(hydrated.narrative?.researchGaps).toContainEqual(expect.objectContaining({ id: "gap:pilot-evidence", status: "evidence_bound" }))
  })

  it("does not bind research findings when binding eval is incomplete", async () => {
    const root = tempWorkspace("revela-vault-bind-findings-incomplete-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)
    mkdirSync(join(root, "researches", "pilot"), { recursive: true })
    writeFileSync(join(root, "researches", "pilot", "ops.md"), `## Data
- claimId: claim:pilot
- Source: https://example.com/ops-study
`, "utf-8")

    const bound = await executeDecksTool({ action: "bindResearchFindings", findingsFile: "researches/pilot/ops.md" }, root)
    const hydrated = readDecksState(root)

    expect(bound).toMatchObject({ ok: false, skipped: true, reason: "findings are not safely bindable" })
    expect(bound.bindingEval).toMatchObject({ status: "needs_fields", missingFields: expect.arrayContaining(["quoteOrSnippet", "supportScope", "unsupportedScope", "caveat", "strength"]) })
    expect(hydrated.narrative?.evidenceBindings.some((binding) => binding.findingsFile === "researches/pilot/ops.md")).toBe(false)
  })

  it("upserts claim nodes while preserving existing relations", () => {
    const root = tempWorkspace("revela-vault-mutate-claim-")
    writeMutableVault(root)

    const mutation = upsertVaultClaimNode(root, {
      id: "claim:pilot",
      text: "Approve a tightly bounded pilot.",
      supportedScope: "Pilot decision and pilot budget only.",
      caveats: ["Does not approve full rollout."],
    })
    const claimFile = readFileSync(join(root, "revela-narrative", "claims", "pilot.md"), "utf-8")
    const compiled = compileNarrativeVault(root)

    expect(mutation).toMatchObject({ ok: true, file: "claims/pilot.md" })
    expect(claimFile).toContain("Approve a tightly bounded pilot.")
    expect(claimFile).toContain("## Relations")
    expect(claimFile).toContain("supports: [[claim:execution]]")
    expect(compiled.narrative?.claims).toContainEqual(expect.objectContaining({ id: "claim:pilot", text: "Approve a tightly bounded pilot.", caveats: ["Does not approve full rollout."] }))
    expect(compiled.narrative?.claimRelations).toContainEqual(expect.objectContaining({ fromClaimId: "claim:pilot", toClaimId: "claim:execution", relation: "supports" }))
  })

  it("rejects new claim mutation when required fields are missing", () => {
    const root = tempWorkspace("revela-vault-mutate-claim-missing-")
    writeMutableVault(root)

    const mutation = upsertVaultClaimNode(root, { id: "claim:new" })

    expect(mutation.ok).toBe(false)
    expect(mutation.missingFields).toContain("text")
    expect(mutation.missingFields).toContain("kind")
    expect(mutation.missingFields).toContain("importance")
    expect(mutation.missingFields).toContain("evidenceRequired")
  })

  it("does not create inline relations for new claim mutations", () => {
    const root = tempWorkspace("revela-vault-mutate-claim-no-inline-legacy-")
    writeMutableVault(root)

    const mutation = upsertVaultClaimNode(root, {
      id: "claim:new",
      kind: "context",
      text: "New context claim.",
      importance: "supporting",
      evidenceRequired: false,
      relations: [{ relation: "supports", toClaimId: "claim:pilot", rationale: "Explicit relation should be authored inline separately." }],
    })
    const claimFile = readFileSync(join(root, "revela-narrative", "claims", "claim-new.md"), "utf-8")

    expect(mutation).toMatchObject({ ok: true, file: "claims/claim-new.md" })
    expect(claimFile).not.toContain("## Relations")
    expect(claimFile).not.toContain("supports: [[claim:pilot]]")
  })

  it("updates objection and risk nodes while preserving existing fields", () => {
    const root = tempWorkspace("revela-vault-mutate-objection-risk-")
    writeMutableVault(root)

    const objection = upsertVaultObjectionNode(root, { id: "objection:budget", response: "Pilot spend is capped before rollout." })
    const risk = upsertVaultRiskNode(root, { id: "risk:execution", mitigation: "Use a two-week readiness checkpoint." })
    const compiled = compileNarrativeVault(root)

    expect(objection).toMatchObject({ ok: true, file: "objections/budget.md" })
    expect(risk).toMatchObject({ ok: true, file: "risks/execution.md" })
    expect(compiled.narrative?.objections).toContainEqual(expect.objectContaining({ id: "objection:budget", claimId: "claim:pilot", priority: "high", response: "Pilot spend is capped before rollout." }))
    expect(compiled.narrative?.risks).toContainEqual(expect.objectContaining({ id: "risk:execution", claimId: "claim:pilot", severity: "high", mitigation: "Use a two-week readiness checkpoint." }))
  })

  it("updates core narrative Markdown nodes", () => {
    const root = tempWorkspace("revela-vault-mutate-core-")
    writeMutableVault(root)

    const mutation = updateVaultCoreNodes(root, {
      status: "ready_for_approval",
      audience: { primary: "Executive committee", beliefAfter: "Pilot evidence is decision-ready." },
      decision: { action: "Approve pilot funding.", owner: "COO" },
      thesis: { statement: "A funded pilot is justified with bounded scope.", confidence: "high" },
    })
    const compiled = compileNarrativeVault(root)

    expect(mutation.ok).toBe(true)
    expect(mutation.files).toEqual(["index.md", "audience.md", "decision.md", "thesis.md"])
    expect(compiled.narrative).toMatchObject({
      status: "ready_for_approval",
      audience: { primary: "Executive committee", beliefAfter: "Pilot evidence is decision-ready." },
      decision: { action: "Approve pilot funding.", owner: "COO" },
      thesis: { statement: "A funded pilot is justified with bounded scope.", confidence: "high" },
    })
  })

  it("tool actions mutate targeted vault nodes and keep DECKS narrative out of disk state", async () => {
    const root = tempWorkspace("revela-vault-tool-targeted-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    const claim = await executeDecksTool({ action: "upsertVaultClaim", narrative: { claims: [{ id: "claim:pilot", text: "Approve a tightly bounded pilot." }] } }, root)
    const objection = await executeDecksTool({ action: "upsertVaultObjection", narrative: { objections: [{ id: "objection:budget", response: "Budget is capped." }] } }, root)
    const risk = await executeDecksTool({ action: "upsertVaultRisk", narrative: { risks: [{ id: "risk:execution", mitigation: "Use a readiness checkpoint." }] } }, root)
    const core = await executeDecksTool({ action: "updateVaultCoreNarrative", narrative: { audience: { primary: "Executive committee" } } }, root)
    const relation = await executeDecksTool({ action: "upsertVaultRelation", relation: { id: "rel-execution-supports-pilot", from: "claim:execution", to: "claim:pilot", type: "supports", rationale: "Execution guardrails support the pilot ask." } }, root)
    const removedRelation = await executeDecksTool({ action: "removeVaultRelation", relationId: "rel-execution-supports-pilot" }, root)
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    const hydrated = readDecksState(root)

    expect(claim.ok).toBe(true)
    expect(objection.ok).toBe(true)
    expect(risk.ok).toBe(true)
    expect(core.ok).toBe(true)
    expect(relation).toMatchObject({ ok: false, mutation: { ok: false, skipped: true, nodeId: "rel-execution-supports-pilot" } })
    expect(removedRelation).toMatchObject({ ok: false, mutation: { ok: false, skipped: true, nodeId: "rel-execution-supports-pilot" } })
    expect(written.narrative).toBeUndefined()
    expect(hydrated.narrative?.claims).toContainEqual(expect.objectContaining({ id: "claim:pilot", text: "Approve a tightly bounded pilot." }))
    expect(hydrated.narrative?.objections).toContainEqual(expect.objectContaining({ id: "objection:budget", response: "Budget is capped." }))
    expect(hydrated.narrative?.risks).toContainEqual(expect.objectContaining({ id: "risk:execution", mitigation: "Use a readiness checkpoint." }))
    expect(hydrated.narrative?.audience.primary).toBe("Executive committee")
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
  mkdirSync(join(vault, "objections"), { recursive: true })
  mkdirSync(join(vault, "risks"), { recursive: true })
  mkdirSync(join(vault, "research-gaps"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:mutable-demo\nstatus: needs_research\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Board\nbeliefBefore: Pilot evidence is incomplete.\nbeliefAfter: Pilot evidence is bounded and traceable.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve a bounded pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:pilot\nconfidence: medium\n---\nA bounded pilot is the right next step.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Pilot decision only.\nunsupportedScope: Full rollout remains unsupported.\n---\nApprove a bounded pilot.\n\n## Relations\n\n- supports: [[claim:execution]]\n", "utf-8")
  writeFileSync(join(vault, "claims", "execution.md"), "---\ntype: claim\nid: claim:execution\nkind: evidence\nimportance: supporting\nevidenceRequired: false\n---\nExecution can be checked before rollout.\n", "utf-8")
  writeFileSync(join(vault, "objections", "budget.md"), "---\ntype: objection\nid: objection:budget\nclaimId: claim:pilot\npriority: high\n---\nBudget could exceed pilot guardrails.\n", "utf-8")
  writeFileSync(join(vault, "risks", "execution.md"), "---\ntype: risk\nid: risk:execution\nclaimId: claim:pilot\nseverity: high\n---\nPilot execution may slip.\n", "utf-8")
  writeFileSync(join(vault, "research-gaps", "pilot.md"), "---\ntype: research-gap\nid: gap:pilot-evidence\ntargetType: claim\ntargetId: claim:pilot\nquestion: What evidence supports the pilot decision?\nstatus: open\npriority: high\ncreatedFromIssueType: claim_missing_evidence\n---\nWhat evidence supports the pilot decision?\n", "utf-8")
}

function writeQaOnlyIssueVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:qa-demo\nstatus: needs_research\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Board\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:qa-demo\nconfidence: medium\n---\nA bounded pilot is ready for more evidence.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\n---\nApprove a bounded pilot.\n\n## Caveats\n\n- Covers only pilot scope.\n\n## Caveats\n\n- Full rollout remains unsupported.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:pilot\nsource: Proposal\nsourcePath: proposal.md\nquote: Pilot approval is requested.\nsupportScope: Supports the internal pilot request.\nunsupportedScope: Does not prove external market demand.\ncaveat: Intent evidence only.\nstrength: partial\n---\n", "utf-8")
}

function writeWeakEvidenceVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:weak-demo\nstatus: needs_research\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Board\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:weak-demo\nconfidence: medium\n---\nA pilot needs stronger evidence before rollout.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Supports only a cautious pilot discussion.\nunsupportedScope: Rollout readiness remains unsupported.\n---\nConsider a bounded pilot.\n\n## Caveats\n\n- Evidence is weak and internal only.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:pilot\nsource: Internal note\nsourcePath: notes/pilot.md\nquote: The team believes a pilot may be feasible.\nsupportScope: Supports only internal interest in a pilot.\nunsupportedScope: Does not prove rollout readiness.\ncaveat: Internal note, not external validation.\nstrength: weak\n---\n\n## Relations\n\n- supports: [[claim:pilot]]\n", "utf-8")
}

function writeRegistryVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:registry-demo\nstatus: needs_research\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Board\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:registry-demo\nconfidence: medium\n---\nA bounded pilot is the recommended next step.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\n---\nApprove a bounded pilot.\n\n## Relations\n\n- supports: [[claim:execution]] - Pilot recommendation is supported by execution framing.\n", "utf-8")
  writeFileSync(join(vault, "claims", "execution.md"), "---\ntype: claim\nid: claim:execution\nkind: evidence\nimportance: supporting\nevidenceRequired: false\n---\nExecution risk is bounded by pilot scope.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nsource: Proposal\nsourcePath: proposal.md\nquote: Pilot approval is requested.\nsupportScope: Supports the internal pilot request.\nunsupportedScope: Does not prove external market demand.\ncaveat: Intent evidence only.\nstrength: partial\n---\n\n## Relations\n\n- supports: [[claim:pilot]] - Proposal states the pilot request.\n", "utf-8")
}

function writeBrokenRegistryVault(root: string): void {
  writeRegistryVault(root)
  writeFileSync(join(root, "revela-narrative", "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\n---\nApprove a bounded pilot.\n\n## Relations\n\n- supports: [[claim:missing]] - Broken edge used to verify strict relation gates.\n", "utf-8")
}
