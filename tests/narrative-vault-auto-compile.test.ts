import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { DECKS_STATE_FILE, writeDecksState } from "../lib/decks-state"
import { autoCompileNarrativeVault, formatAutoCompileReport } from "../lib/narrative-vault/auto-compile"
import { inspectVaultMarkdown } from "../lib/narrative-vault/authoring-guard"
import { compileNarrativeVault } from "../lib/narrative-vault/compile"
import { runNarrativeMarkdownQa } from "../lib/narrative-vault/markdown-qa"
import {
  extractNarrativeVaultMarkdownTargetsFromPatch,
  isNarrativeVaultMarkdownPath,
  normalizeNarrativeVaultMarkdownPath,
} from "../lib/narrative-vault/hook-targets"
import { narrativeMapState } from "./helpers/narrative-fixtures"
import { readJsonFile, tempWorkspace } from "./helpers/tool-helpers"

describe("narrative vault auto-compile hook", () => {
  it("detects only workspace-contained narrative vault Markdown paths", () => {
    const root = tempWorkspace("revela-vault-targets-")

    expect(isNarrativeVaultMarkdownPath("revela-narrative/index.md", root)).toBe(true)
    expect(isNarrativeVaultMarkdownPath(join(root, "revela-narrative", "claims", "pilot.md"), root)).toBe(true)
    expect(isNarrativeVaultMarkdownPath("revela-narrative", root)).toBe(false)
    expect(isNarrativeVaultMarkdownPath("revela-narrative/claims/pilot.txt", root)).toBe(false)
    expect(isNarrativeVaultMarkdownPath("researches/topic/findings.md", root)).toBe(false)
    expect(isNarrativeVaultMarkdownPath(".opencode/revela/narrative-cache/diagnostics.md", root)).toBe(false)
    expect(isNarrativeVaultMarkdownPath(resolve(root, "..", "revela-narrative", "outside.md"), root)).toBe(false)
    expect(normalizeNarrativeVaultMarkdownPath(join(root, "revela-narrative", "claims", "pilot.md"), root)).toBe("revela-narrative/claims/pilot.md")
  })

  it("extracts add, update, delete, and move targets from patches", () => {
    const root = tempWorkspace("revela-vault-patch-targets-")
    const patch = `*** Begin Patch
*** Add File: revela-narrative/index.md
+---
*** Update File: revela-narrative/claims/pilot.md
@@
*** Delete File: researches/topic/findings.md
*** Update File: ../outside/revela-narrative/nope.md
*** Update File: revela-narrative/claims/pilot.md
*** Update File: DECKS.json
*** Update File: revela-narrative/claims/old.md
*** Move to: revela-narrative/claims/new.md
*** End Patch`

    expect(extractNarrativeVaultMarkdownTargetsFromPatch(patch, root)).toEqual([
      "revela-narrative/index.md",
      "revela-narrative/claims/pilot.md",
      "revela-narrative/claims/old.md",
      "revela-narrative/claims/new.md",
    ])
  })

  it("compiles cache and keeps DECKS narrative out of disk state on successful compile", () => {
    const root = tempWorkspace("revela-vault-auto-success-")
    writeDecksState(root, narrativeMapState())
    writeValidVault(root, "Board")

    const result = autoCompileNarrativeVault(root, ["revela-narrative/audience.md"])
    const written = readJsonFile<any>(join(root, DECKS_STATE_FILE))

    expect(result.ok).toBe(true)
    expect(result.mirrored).toBe("updated")
    expect(result.markdown).toContain("Status: ok")
    expect(result.markdown).toContain(`${DECKS_STATE_FILE} render state saved; runtime narrative hydrated from vault`)
    expect(written.narrative).toBeUndefined()
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")).toContain("narrative:auto-demo")
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "diagnostics.json"), "utf-8")).not.toContain('"severity": "error"')
  })

  it("writes failed compile diagnostics while preserving last-good cache and disk state", () => {
    const root = tempWorkspace("revela-vault-auto-fail-")
    const previous = narrativeMapState()
    writeDecksState(root, previous)
    writeValidVault(root, "Board")
    autoCompileNarrativeVault(root, ["revela-narrative/index.md"])
    writeFileSync(join(root, "revela-narrative", "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:missing\nsource: Ops note\nquote: Pilot constraints are explicit.\nsupportScope: Pilot only.\nunsupportedScope: Full rollout.\ncaveat: One source.\nstrength: strong\n---\n", "utf-8")

    const result = autoCompileNarrativeVault(root, ["revela-narrative/evidence/pilot.md"])
    const written = readJsonFile<any>(join(root, DECKS_STATE_FILE))
    const cached = readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")

    expect(result.ok).toBe(false)
    expect(result.mirrored).toBe("preserved_failed_compile")
    expect(result.markdown).toContain("Status: blocked")
    expect(result.markdown).toContain("evidence_claim_missing")
    expect(written.narrative).toBeUndefined()
    expect(written.narrativeApprovals).toEqual(previous.narrative?.approvals)
    expect(cached).toContain("narrative:auto-demo")
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "diagnostics.json"), "utf-8")).toContain("evidence_claim_missing")
  })

  it("reports authoring guard blockers for duplicate frontmatter, headings, typed links, invalid types, and missing claimId", () => {
    const diagnostics = inspectVaultMarkdown("research-gaps/bad.md", `---
type: "researchGap"
id: "gap-bad"
---
Body
---
type: "research_gap"
---
## Caveats
- One
## Caveats
- Two
## Relations
- supports: [[claim:claim-demo]]
`)

    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate_frontmatter", severity: "error" }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate_stable_heading", severity: "error" }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "typed_wikilink_target", severity: "error" }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid_node_type_authoring", severity: "error" }))
    expect(diagnostics.find((diagnostic) => diagnostic.code === "invalid_node_type_authoring")?.suggestedFix).toContain("research-gap")

    const evidenceDiagnostics = inspectVaultMarkdown("evidence/bad.md", `---
type: "evidence"
id: "evidence-bad"
source: "proposal.md"
---
Quote body.
`)
    expect(evidenceDiagnostics).toContainEqual(expect.objectContaining({ code: "evidence_claim_id_missing_authoring", severity: "error" }))
  })

  it("includes authoring guard blockers in auto-compile report", () => {
    const root = tempWorkspace("revela-vault-authoring-guard-")
    writeValidVault(root, "Board")
    writeFileSync(join(root, "revela-narrative", "claims", "pilot.md"), `---
type: claim
id: claim:pilot
kind: recommendation
importance: central
evidenceRequired: true
---
Approve a bounded pilot.
## Caveats
- One.
## Caveats
- Two.
## Relations
- supports: [[claim:another]]
`, "utf-8")

    const result = autoCompileNarrativeVault(root, ["revela-narrative/claims/pilot.md"])

    expect(result.ok).toBe(false)
    expect(result.markdownQa?.ok).toBe(false)
    expect(result.markdown).toContain("Markdown QA: blocked")
    expect(result.markdown).toContain("Markdown QA blockers")
    expect(result.markdown).toContain("duplicate_stable_heading")
    expect(result.markdown).toContain("typed_wikilink_target")
  })

  it("returns markdown QA repair cards for unresolved ids and evidence trace fields", () => {
    const root = tempWorkspace("revela-vault-markdown-qa-")
    writeValidVault(root, "Board")
    writeFileSync(join(root, "revela-narrative", "evidence", "bad.md"), `---
type: evidence
id: evidence-bad
claimId: claim-missing
source: proposal.md
---
`, "utf-8")

    const report = runNarrativeMarkdownQa(root)

    expect(report.ok).toBe(false)
    expect(report.repairCards).toContainEqual(expect.objectContaining({ issueCode: "unresolved_evidence_claim_id", file: "evidence/bad.md", smallestRepair: expect.stringContaining("narrativeInventory") }))
    expect(report.repairCards).toContainEqual(expect.objectContaining({ issueCode: "evidence_trace_fields_missing", severity: "warning", file: "evidence/bad.md" }))
  })

  it("reports invalid evidence claimId before normalization can drop the binding", () => {
    const root = tempWorkspace("revela-vault-auto-evidence-diagnostic-")
    writeValidVault(root, "Board")
    writeFileSync(join(root, "revela-narrative", "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:missing\nsource: Ops note\nquote: Pilot constraints are explicit.\nsupportScope: Pilot only.\nunsupportedScope: Full rollout.\ncaveat: One source.\nstrength: strong\n---\n", "utf-8")

    const result = compileNarrativeVault(root)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "evidence_claim_missing",
      file: "evidence/pilot.md",
      nodeId: "evidence:pilot",
      severity: "error",
    }))
  })

  it("compiles and writes cache without creating DECKS.json when state is absent", () => {
    const root = tempWorkspace("revela-vault-auto-no-decks-")
    writeValidVault(root, "Product leadership")

    const result = autoCompileNarrativeVault(root, ["revela-narrative/index.md"])

    expect(result.ok).toBe(true)
    expect(result.mirrored).toBe("skipped_no_decks")
    expect(result.markdown).toContain(`${DECKS_STATE_FILE} not found; no state created`)
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")).toContain("Product leadership")
  })

  it("caps compact report touched files and diagnostics", () => {
    const markdown = formatAutoCompileReport({
      ok: false,
      mirrored: "preserved_failed_compile",
      cachePath: ".opencode/revela/narrative-cache",
      touched: Array.from({ length: 12 }, (_, index) => `revela-narrative/claims/${index}.md`),
      blockers: Array.from({ length: 9 }, (_, index) => ({
        code: `blocker_${index}`,
        severity: "error",
        message: `Blocker ${index}`,
        suggestedFix: "Fix it.",
      })),
      warnings: Array.from({ length: 9 }, (_, index) => ({
        code: `warning_${index}`,
        severity: "warning",
        message: `Warning ${index}`,
        suggestedFix: "Check it.",
      })),
      markdownQa: {
        ok: false,
        repairCards: [{ issueCode: "duplicate_frontmatter", severity: "error", file: "claims/a.md", message: "Duplicate", smallestRepair: "Fix" }],
        blockers: [{ issueCode: "duplicate_frontmatter", severity: "error", file: "claims/a.md", message: "Duplicate", smallestRepair: "Fix" }],
        warnings: [],
      },
    })

    expect(markdown).toContain("Markdown QA: blocked")
    expect(markdown).toContain("duplicate_frontmatter")
    expect(markdown).toContain("... 2 more")
    expect(markdown).toContain("`blocker_7`")
    expect(markdown).not.toContain("`blocker_8`")
    expect(markdown).toContain("`warning_7`")
    expect(markdown).not.toContain("`warning_8`")
    expect(markdown).toContain("... 1 more")
  })

  it("keeps plugin hook ordering around state gates and deck QA", () => {
    const plugin = readFileSync(join(import.meta.dir, "..", "plugin.ts"), "utf-8")
    const blockedPatchIndex = plugin.indexOf('if (input.tool === "apply_patch" && blockedPatches.size > 0)')
    const vaultCompileIndex = plugin.indexOf("runPostWriteNarrativeVaultCompile(vaultTargets, output)")
    const deckQaIndex = plugin.indexOf("extractDeckHtmlTargetsFromPatch(patchText)")

    expect(plugin).toContain("normalizeNarrativeVaultMarkdownPath(filePath, workspaceRoot)")
    expect(plugin).toContain("extractNarrativeVaultMarkdownTargetsFromPatch(patchText, workspaceRoot)")
    expect(blockedPatchIndex).toBeGreaterThan(-1)
    expect(vaultCompileIndex).toBeGreaterThan(blockedPatchIndex)
    expect(deckQaIndex).toBeGreaterThan(vaultCompileIndex)
  })

  it("runs write and edit vault compile checks before deck QA", () => {
    const plugin = readFileSync(join(import.meta.dir, "..", "plugin.ts"), "utf-8")
    const writeBranchIndex = plugin.indexOf('if (input.tool === "write")')
    const writeVaultIndex = plugin.indexOf("const vaultTarget = normalizeNarrativeVaultMarkdownPath(filePath, workspaceRoot)", writeBranchIndex)
    const writeCompileIndex = plugin.indexOf("runPostWriteNarrativeVaultCompile([vaultTarget], output)", writeVaultIndex)
    const writeQaIndex = plugin.indexOf("runPostWriteArtifactQA(filePath, output)", writeCompileIndex)
    const editBranchIndex = plugin.indexOf('if (input.tool === "edit")')
    const editVaultIndex = plugin.indexOf("const vaultTarget = normalizeNarrativeVaultMarkdownPath(filePath, workspaceRoot)", editBranchIndex)
    const editCompileIndex = plugin.indexOf("runPostWriteNarrativeVaultCompile([vaultTarget], output)", editVaultIndex)
    const editQaIndex = plugin.indexOf("runPostWriteArtifactQA(filePath, output)", editCompileIndex)

    expect(writeBranchIndex).toBeGreaterThan(-1)
    expect(writeVaultIndex).toBeGreaterThan(writeBranchIndex)
    expect(writeCompileIndex).toBeGreaterThan(writeVaultIndex)
    expect(writeQaIndex).toBeGreaterThan(writeCompileIndex)
    expect(editBranchIndex).toBeGreaterThan(-1)
    expect(editVaultIndex).toBeGreaterThan(editBranchIndex)
    expect(editCompileIndex).toBeGreaterThan(editVaultIndex)
    expect(editQaIndex).toBeGreaterThan(editCompileIndex)
  })
})

function writeValidVault(root: string, audience: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:auto-demo\nstatus: ready_for_approval\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), `---\ntype: audience\nprimary: ${audience}\nbeliefBefore: Pilot value is unclear.\nbeliefAfter: Pilot value is bounded by evidence.\n---\n`, "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve a bounded pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:pilot\nconfidence: medium\n---\nA bounded pilot is justified.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Pilot decision.\nunsupportedScope: Full rollout.\n---\nApprove a bounded pilot.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:pilot\nsource: Ops note\nquote: Pilot constraints are explicit.\nsupportScope: Pilot only.\nunsupportedScope: Full rollout.\ncaveat: One source.\nstrength: strong\n---\n", "utf-8")
}
