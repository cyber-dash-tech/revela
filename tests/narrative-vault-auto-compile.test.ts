import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { DECKS_STATE_FILE, writeDecksState } from "../lib/decks-state"
import { autoCompileNarrativeVault, formatAutoCompileReport } from "../lib/narrative-vault/auto-compile"
import { compileNarrativeVault } from "../lib/narrative-vault/compile"
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

  it("compiles cache and mirrors DECKS narrative on successful compile", () => {
    const root = tempWorkspace("revela-vault-auto-success-")
    writeDecksState(root, narrativeMapState())
    writeValidVault(root, "Board")

    const result = autoCompileNarrativeVault(root, ["revela-narrative/audience.md"])
    const mirrored = readJsonFile<any>(join(root, DECKS_STATE_FILE))

    expect(result.ok).toBe(true)
    expect(result.mirrored).toBe("updated")
    expect(result.markdown).toContain("Status: ok")
    expect(result.markdown).toContain(`${DECKS_STATE_FILE} narrative mirror updated`)
    expect(mirrored.narrative.id).toBe("narrative:auto-demo")
    expect(mirrored.narrative.audience.primary).toBe("Board")
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "compiled-narrative.json"), "utf-8")).toContain("narrative:auto-demo")
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "diagnostics.json"), "utf-8")).not.toContain('"severity": "error"')
  })

  it("writes failed compile diagnostics while preserving the previous DECKS mirror", () => {
    const root = tempWorkspace("revela-vault-auto-fail-")
    const previous = narrativeMapState()
    writeDecksState(root, previous)
    writeValidVault(root, "Board")
    writeFileSync(join(root, "revela-narrative", "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:missing\nsource: Ops note\nquote: Pilot constraints are explicit.\nsupportScope: Pilot only.\nunsupportedScope: Full rollout.\ncaveat: One source.\nstrength: strong\n---\n", "utf-8")

    const result = autoCompileNarrativeVault(root, ["revela-narrative/evidence/pilot.md"])
    const mirrored = readJsonFile<any>(join(root, DECKS_STATE_FILE))

    expect(result.ok).toBe(false)
    expect(result.mirrored).toBe("preserved_failed_compile")
    expect(result.markdown).toContain("Status: blocked")
    expect(result.markdown).toContain("evidence_claim_missing")
    expect(mirrored.narrative.id).toBe(previous.narrative?.id)
    expect(readFileSync(join(root, ".opencode", "revela", "narrative-cache", "diagnostics.json"), "utf-8")).toContain("evidence_claim_missing")
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
    })

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
