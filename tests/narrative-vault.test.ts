import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { readDecksState, writeDecksState } from "../lib/decks-state"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { buildNarrativeVaultInventory, compileNarrativeVault, exportNarrativeStateToVault, formatVaultDiagnosticMarkdown, formatVaultDiagnosticReport, getNarrativeVaultMigrationHint, initNarrativeVault, parseRelations, updateVaultCoreNodes, updateVaultResearchGapNode, upsertVaultClaimNode, upsertVaultEvidenceNode, upsertVaultObjectionNode, upsertVaultRiskNode } from "../lib/narrative-vault"
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

  it("persists approvals outside the DECKS narrative mirror in vault workspaces", async () => {
    const root = tempWorkspace("revela-vault-approval-provenance-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

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

  it("writes claim relations through structured vault actions using plain wikilinks", async () => {
    const root = tempWorkspace("revela-vault-tool-claim-relations-")
    writeDecksState(root, narrativeMapState())
    writeMutableVault(root)

    await executeDecksTool({
      action: "upsertVaultClaim",
      narrative: { claims: [{ id: "claim-recommendation", kind: "recommendation", text: "Approve the focused recommendation.", importance: "central", evidenceRequired: true }] },
    }, root)
    const result = await executeDecksTool({
      action: "upsertVaultClaim",
      narrative: {
        claims: [{ id: "claim-belief-change-purpose", kind: "context", text: "The artifact must change audience belief before asking for approval.", importance: "supporting", evidenceRequired: false }],
        claimRelations: [{ fromClaimId: "claim-belief-change-purpose", toClaimId: "claim-recommendation", relation: "supports", rationale: "Belief change frames the recommendation." }],
      },
    }, root)
    const file = readFileSync(join(root, "revela-narrative", "claims", "claim-belief-change-purpose.md"), "utf-8")
    const hydrated = readDecksState(root)

    expect(result.ok).toBe(true)
    expect(file).toContain("- supports: [[claim-recommendation]] - Belief change frames the recommendation.")
    expect(file).not.toContain("[[claim:claim-recommendation]]")
    expect(hydrated.narrative?.claimRelations).toContainEqual(expect.objectContaining({ fromClaimId: "claim-belief-change-purpose", toClaimId: "claim-recommendation", relation: "supports" }))
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
    const written = JSON.parse(readFileSync(join(root, "DECKS.json"), "utf-8"))
    const hydrated = readDecksState(root)

    expect(claim.ok).toBe(true)
    expect(objection.ok).toBe(true)
    expect(risk.ok).toBe(true)
    expect(core.ok).toBe(true)
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
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:pilot\nsource: Internal note\nsourcePath: notes/pilot.md\nquote: The team believes a pilot may be feasible.\nsupportScope: Supports only internal interest in a pilot.\nunsupportedScope: Does not prove rollout readiness.\ncaveat: Internal note, not external validation.\nstrength: weak\n---\n", "utf-8")
}
