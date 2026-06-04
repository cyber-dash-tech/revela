import { describe, expect, it } from "bun:test"
import { spawnSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { createDeckFoundation, deckFoundationMarkers } from "../lib/deck-html/foundation"
import { DECKS_STATE_FILE } from "../lib/decks-state"
import { seedBuiltinDesigns } from "../lib/design/designs"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { compileNarrativeVault } from "../lib/narrative-vault/compile"
import { bindResearchFindings, checkDesignRulesReadiness, checkMaterialIntake, designCreate, designDraftCreate, designDraftInstall, designDraftValidate, designList, designRead, designValidate, doctor, domainCreate, domainDraftCreate, domainDraftInstall, domainDraftValidate, domainList, domainValidate, evaluateResearchFindings, extractMaterial, prepareLocalMaterials, readDeckPlan, recordMaterialReview, researchSave, researchTargets, reviewDeckOpen, reviewDeckRead, storyRead, upsertDeckPlanSlide } from "../lib/runtime"
import { stopRefineServer } from "../lib/refine/server"
import pkg from "../package.json"
import { tempWorkspace } from "./helpers/tool-helpers"
import { zipSync, strToU8 } from "fflate"

describe("runtime facade", () => {
  it("reports the package version through doctor", () => {
    const root = tempWorkspace("revela-runtime-doctor-")

    const result = doctor({ workspaceRoot: root })

    expect(result).toMatchObject({
      ok: true,
      version: pkg.version,
      workspaceRoot: root,
      hasNarrativeVault: false,
      hasDeckPlan: false,
      hasDecksJson: false,
    })
    expect(typeof result.activeDomain).toBe("string")
    expect(typeof result.activeDomainDescription).toBe("string")
  })

  it("exposes the package version through CLI doctor", () => {
    const root = tempWorkspace("revela-runtime-doctor-cli-")
    const home = tempWorkspace("revela-runtime-doctor-cli-home-")
    const cli = join(import.meta.dir, "..", "bin", "revela.ts")

    const proc = spawnSync("bun", [cli, "doctor", "--workspaceRoot", root], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    })

    expect(proc.status).toBe(0)
    const result = JSON.parse(proc.stdout)
    expect(result).toMatchObject({
      ok: true,
      version: pkg.version,
      workspaceRoot: root,
      activeDomain: "general",
    })
    expect(result.activeDomainDescription).toContain("General purpose")
  })

  it("prepares, extracts, reviews, and checks local material intake", async () => {
    const root = tempWorkspace("revela-runtime-material-intake-")
    writeDocx(root, "proposal.docx", "Quarterly summary", true)

    const prepared = await prepareLocalMaterials({ workspaceRoot: root })

    expect(prepared.ok).toBe(true)
    expect(prepared.found).toBe(1)
    expect(prepared.suggestedTasks[0]).toMatchObject({
      path: "proposal.docx",
      needsExtraction: true,
      status: "extracted",
    })
    expect(prepared.suggestedTasks[0].allowedReadPath).toContain("read.md")
    expect(readFileSync(join(root, prepared.suggestedTasks[0].allowedReadPath!), "utf-8")).toContain("Quarterly summary")

    const checkBeforeReview = checkMaterialIntake({ workspaceRoot: root })
    expect(checkBeforeReview.ok).toBe(false)
    expect(checkBeforeReview.warnings.join("\n")).toContain("extracted but has no recorded material review")

    const reviewed = recordMaterialReview({
      workspaceRoot: root,
      sourcePath: "proposal.docx",
      reviewedPaths: [prepared.suggestedTasks[0].allowedReadPath!],
      reviewSummary: "The proposal states a quarterly summary but does not prove external demand.",
      narrativeDecisions: [{ kind: "gap", target: "research-gaps/external-demand.md", rationale: "External demand needs independent evidence." }],
    })

    expect(reviewed.path).toBe("researches/local-materials/proposal-review.md")
    expect(readFileSync(join(root, reviewed.path), "utf-8")).toContain("External demand needs independent evidence.")
    expect(checkMaterialIntake({ workspaceRoot: root }).ok).toBe(true)
  })

  it("extracts one local material through the runtime facade", async () => {
    const root = tempWorkspace("revela-runtime-material-extract-")
    writeDocx(root, "brief.docx", "Pilot scope is clear.", false)

    const extracted = await extractMaterial({ workspaceRoot: root, file: "brief.docx" })

    expect(extracted).toMatchObject({ status: "processed", type: "docx", source: "brief.docx" })
    expect(extracted.read_view_path).toContain("read.md")
    expect(readFileSync(join(root, extracted.read_view_path!), "utf-8")).toContain("Pilot scope is clear.")
  })

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

  it("upserts one structured deck-plan slide and reads its component plan", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-upsert-")
    writeMinimalVault(root)

    const result = upsertDeckPlanSlide(validDeckPlanSlideInput(root))

    expect(result.ok).toBe(true)
    expect(result.path).toBe("deck-plan/slides/001-pilot-proof.md")
    expect(existsSync(join(root, "deck-plan", "index.md"))).toBe(true)
    const read = readDeckPlan({ workspaceRoot: root })
    expect(read.ok).toBe(true)
    expect(read.projection?.slides).toHaveLength(1)
    expect(read.projection?.slides[0]).toMatchObject({
      slideIndex: 1,
      id: "slide-pilot-proof",
      title: "Pilot Proof",
      layout: "narrative",
      components: ["text-panel"],
    })
    expect(read.projection?.slides[0].componentPlan[0]).toMatchObject({
      name: "text-panel",
      slot: "left",
      position: "left-top",
      purpose: "State the decision logic.",
      content: "Approve a bounded pilot.",
      claimIds: ["claim-pilot"],
      evidenceIds: ["evidence-pilot"],
      sourceNotes: ["Proposal"],
      renderNotes: ["Use concise heading and body copy."],
    })
    expect(read.markdown).toContain("Slide 1: [[slide-pilot-proof]]")
  })

  it("re-upserting the same slideIndex updates the existing slide file", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-upsert-update-")
    writeMinimalVault(root)
    upsertDeckPlanSlide(validDeckPlanSlideInput(root))

    const result = upsertDeckPlanSlide({
      ...validDeckPlanSlideInput(root),
      title: "Pilot Decision",
      components: [{
        name: "text-panel",
        slot: "left",
        position: "left-top",
        purpose: "Update the recommendation.",
        content: "Fund the bounded pilot.",
      }],
    })

    expect(result.ok).toBe(true)
    expect(result.updated).toBe(true)
    expect(existsSync(join(root, "deck-plan", "slides", "001-pilot-proof.md"))).toBe(false)
    expect(existsSync(join(root, "deck-plan", "slides", "001-pilot-decision.md"))).toBe(true)
    const read = readDeckPlan({ workspaceRoot: root })
    expect(read.projection?.slides).toHaveLength(1)
    expect(read.projection?.slides[0].title).toBe("Pilot Decision")
    expect(read.projection?.slides[0].componentPlan[0].content).toBe("Fund the bounded pilot.")
  })

  it("hard-errors invalid structured deck-plan slide input before writing", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-upsert-invalid-")
    writeMinimalVault(root)

    const unknownLayout = upsertDeckPlanSlide({ ...validDeckPlanSlideInput(root), layout: "unknown-layout" })
    expect(unknownLayout.ok).toBe(false)
    expect(unknownLayout.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "slide_layout_unknown" }))
    expect(existsSync(join(root, "deck-plan", "slides"))).toBe(false)

    const unknownComponent = upsertDeckPlanSlide({
      ...validDeckPlanSlideInput(root),
      components: [{ ...validDeckPlanSlideInput(root).components[0], name: "unknown-component" }],
    })
    expect(unknownComponent.ok).toBe(false)
    expect(unknownComponent.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "slide_component_unknown" }))

    const missingPosition = upsertDeckPlanSlide({
      ...validDeckPlanSlideInput(root),
      components: [{ ...validDeckPlanSlideInput(root).components[0], position: "" }],
    })
    expect(missingPosition.ok).toBe(false)
    expect(missingPosition.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "slide_component_plan_incomplete" }))

    const missingVisualComponent = upsertDeckPlanSlide({
      ...validDeckPlanSlideInput(root),
      visualIntent: { kind: "copy", component: "stat-card" },
    })
    expect(missingVisualComponent.ok).toBe(false)
    expect(missingVisualComponent.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "slide_visual_component_missing" }))

    const duplicatePosition = upsertDeckPlanSlide({
      ...validDeckPlanSlideInput(root),
      components: [
        validDeckPlanSlideInput(root).components[0],
        { name: "box", slot: "left", position: "left-top", purpose: "Frame support.", content: "Evidence summary." },
      ],
    })
    expect(duplicatePosition.ok).toBe(false)
    expect(duplicatePosition.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "slide_component_position_duplicate" }))
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

  it("reads deck review diagnostics for a file-native deck without creating compatibility state", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-runtime-review-read-")
    writeMinimalVault(root)
    const compiled = compileNarrativeVault(root)
    writeDeckPlan(root, computeNarrativeHash(compiled.narrative!))
    writeMinimalDeck(root, "decks/review.html")

    const result = await reviewDeckRead({ workspaceRoot: root, file: "decks/review.html", format: "markdown" })

    expect(result.ok).toBe(true)
    expect(result.file).toBe("decks/review.html")
    expect(result.artifactQa.summary).toMatchObject({ passed: true, errors: 0 })
    expect(result.deckPlan.ok).toBe(true)
    expect(result.narrative.skipped).toBe(false)
    expect(result.narrative.summary.summary).toContain("Narrative vault diagnostics")
    expect(result.inspectionContext).toMatchObject({ ok: false, skipped: true })
    expect(result.inspectionContext.reason).toContain(`No ${DECKS_STATE_FILE} exists`)
    expect(result.markdown).toContain("Review Deck Read")
    expect(result.markdown).toContain("Artifact QA: passed")
    expect(result.evidenceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "evidence-pilot", claimId: "claim-pilot" }),
    ]))
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
  }, 60000)

  it("reads artifact QA when no narrative vault exists", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-runtime-review-no-vault-")
    writeMinimalDeck(root, "decks/no-vault.html")

    const result = await reviewDeckRead({ workspaceRoot: root, file: "decks/no-vault.html", format: "markdown" })

    expect(result.ok).toBe(true)
    expect(result.artifactQa.summary.passed).toBe(true)
    expect(result.narrative).toMatchObject({
      ok: false,
      skipped: true,
      reason: "No revela-narrative/ vault exists; narrative diagnostics skipped.",
    })
    expect(result.markdown).toContain("Narrative: No revela-narrative/ vault exists")
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
  }, 60000)

  it("returns a read-only error for a missing review deck file", async () => {
    const root = tempWorkspace("revela-runtime-review-missing-")

    const result = await reviewDeckRead({ workspaceRoot: root, file: "decks/missing.html", format: "markdown" })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("Deck HTML file not found")
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "file_not_found" }))
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    expect(existsSync(join(root, "decks"))).toBe(false)
  })

  it("exposes Review deck read through the CLI without creating state", () => {
    const root = tempWorkspace("revela-runtime-review-cli-missing-")
    const cli = join(import.meta.dir, "..", "bin", "revela.ts")

    const proc = spawnSync("bun", [cli, "review-read", "--workspaceRoot", root, "--file", "decks/missing.html"], {
      encoding: "utf-8",
    })

    expect(proc.status).toBe(0)
    const result = JSON.parse(proc.stdout)
    expect(result).toMatchObject({
      ok: false,
      file: "decks/missing.html",
    })
    expect(result.error).toContain("Deck HTML file not found")
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    expect(existsSync(join(root, "decks"))).toBe(false)
  })

  it("exposes design and domain controls through the CLI with isolated config", () => {
    const home = tempWorkspace("revela-runtime-cli-home-")
    const cli = join(import.meta.dir, "..", "bin", "revela.ts")
    const env = { ...process.env, HOME: home }

    const designUse = spawnSync("bun", [cli, "design-use", "--name", "starter"], {
      encoding: "utf-8",
      env,
    })
    const designList = spawnSync("bun", [cli, "design-list"], {
      encoding: "utf-8",
      env,
    })
    const domainRead = spawnSync("bun", [cli, "domain-read", "--name", "consulting"], {
      encoding: "utf-8",
      env,
    })
    const domainUse = spawnSync("bun", [cli, "domain-use", "--name", "general"], {
      encoding: "utf-8",
      env,
    })
    const domainList = spawnSync("bun", [cli, "domain-list"], {
      encoding: "utf-8",
      env,
    })

    expect(designUse.status).toBe(0)
    expect(JSON.parse(designUse.stdout)).toMatchObject({ ok: true, activeDesign: "starter" })
    expect(designList.status).toBe(0)
    expect(JSON.parse(designList.stdout)).toMatchObject({ ok: true, activeDesign: "starter" })
    expect(domainRead.status).toBe(0)
    expect(JSON.parse(domainRead.stdout)).toMatchObject({ ok: true, name: "consulting" })
    expect(domainUse.status).toBe(0)
    expect(JSON.parse(domainUse.stdout)).toMatchObject({ ok: true, activeDomain: "general" })
    expect(domainList.status).toBe(0)
    expect(JSON.parse(domainList.stdout)).toMatchObject({ ok: true, activeDomain: "general" })
  })

  it("creates, validates, and protects local design packages through the runtime", () => {
    const name = `runtime-codex-design-${Date.now()}`
    let createdPath = ""

    try {
      const created = designCreate({
        name,
        base: "starter",
        designMd: validDesignMd(name, "Original"),
        previewHtml: validPreviewHtml("Original"),
      })
      createdPath = created.path
      const validated = designValidate({ name })

      expect(created).toMatchObject({
        ok: true,
        name,
        base: "starter",
        overwritten: false,
        files: ["DESIGN.md", "preview.html"],
      })
      expect(existsSync(join(created.path, "DESIGN.md"))).toBe(true)
      expect(validated).toMatchObject({
        ok: true,
        name,
        hasDesignMd: true,
        hasPreview: true,
      })

      expect(() => designCreate({
        name,
        designMd: validDesignMd(name, "Duplicate"),
        previewHtml: validPreviewHtml("Duplicate"),
      })).toThrow("already exists")

      const overwritten = designCreate({
        name,
        designMd: validDesignMd(name, "Updated"),
        previewHtml: validPreviewHtml("Updated"),
        overwrite: true,
      })

      expect(overwritten).toMatchObject({ ok: true, name, overwritten: true })
      expect(readFileSync(join(overwritten.path, "preview.html"), "utf-8")).toContain("Updated")
    } finally {
      if (createdPath) rmSync(createdPath, { recursive: true, force: true })
    }
  })

  it("creates, validates, and installs design drafts through the runtime", () => {
    const root = tempWorkspace("revela-runtime-design-draft-")
    const name = `runtime-draft-design-${Date.now()}`
    const draft = designDraftCreate({
      workspaceRoot: root,
      name,
      base: "starter",
      designMd: validDesignMd(name, "Draft"),
      previewHtml: validPreviewHtml("Draft"),
    })
    let installed = ""

    try {
      const validated = designDraftValidate({ workspaceRoot: root, name })
      const activeBefore = designList().activeDesign
      const result = designDraftInstall({ workspaceRoot: root, name })
      installed = result.path

      expect(draft).toMatchObject({ ok: true, name, path: join(root, ".revela", "drafts", "designs", name), overwritten: false })
      expect(validated).toMatchObject({ ok: true, name, hasDesignMd: true, hasPreview: true })
      expect(result).toMatchObject({ ok: true, name, sourcePath: draft.path, overwritten: false })
      expect(existsSync(join(result.path, "DESIGN.md"))).toBe(true)
      expect(() => designDraftInstall({ workspaceRoot: root, name })).toThrow("already exists")

      const overwritten = designDraftInstall({ workspaceRoot: root, name, overwrite: true })
      expect(overwritten).toMatchObject({ ok: true, name, overwritten: true })
      expect(designList().activeDesign).toBe(activeBefore)
    } finally {
      if (installed) rmSync(installed, { recursive: true, force: true })
    }
  })

  it("blocks invalid design draft installs", () => {
    const root = tempWorkspace("revela-runtime-design-draft-invalid-")
    const name = `runtime-invalid-design-${Date.now()}`
    const draftDir = join(root, ".revela", "drafts", "designs", name)
    mkdirSync(draftDir, { recursive: true })
    writeFileSync(join(draftDir, "DESIGN.md"), validDesignMd(name, "Invalid"), "utf-8")

    const validated = designDraftValidate({ workspaceRoot: root, name })

    expect(validated.ok).toBe(false)
    expect(validated.errors).toContain("preview.html is missing")
    expect(() => designDraftInstall({ workspaceRoot: root, name })).toThrow("Design draft is invalid")
  })

  it("creates, validates, and protects local domain packages through the runtime", () => {
    const name = `runtime-codex-domain-${Date.now()}`
    const invalidName = `${name}-invalid`
    let createdPath = ""
    let invalidPath = ""

    try {
      const activeBefore = domainList().activeDomain
      const created = domainCreate({
        name,
        domainMd: validDomainMd(name, "Original"),
      })
      createdPath = created.path
      invalidPath = join(created.path, "..", invalidName)
      const validated = domainValidate({ name })

      expect(created).toMatchObject({
        ok: true,
        name,
        overwritten: false,
        files: ["INDUSTRY.md"],
      })
      expect(existsSync(join(created.path, "INDUSTRY.md"))).toBe(true)
      expect(validated).toMatchObject({
        ok: true,
        name,
        hasIndustryMd: true,
        hasRequiredFrontmatter: true,
        hasBody: true,
      })
      expect(domainList().activeDomain).toBe(activeBefore)

      expect(() => domainCreate({
        name,
        domainMd: validDomainMd(name, "Duplicate"),
      })).toThrow("already exists")

      const overwritten = domainCreate({
        name,
        domainMd: validDomainMd(name, "Updated"),
        overwrite: true,
      })

      expect(overwritten).toMatchObject({ ok: true, name, overwritten: true })
      expect(readFileSync(join(overwritten.path, "INDUSTRY.md"), "utf-8")).toContain("Updated domain")
      expect(() => domainCreate({ name: "Invalid Domain", domainMd: validDomainMd("invalid-domain", "Bad") })).toThrow("kebab-case")
      expect(() => domainCreate({ name: invalidName, domainMd: "---\nname: missing-fields\n---\n" })).toThrow("missing required field")
      expect(domainValidate({ name: invalidName })).toMatchObject({
        ok: false,
        name: invalidName,
        hasIndustryMd: true,
        hasRequiredFrontmatter: false,
        hasBody: false,
      })
    } finally {
      if (createdPath) rmSync(createdPath, { recursive: true, force: true })
      if (invalidPath) rmSync(invalidPath, { recursive: true, force: true })
    }
  })

  it("creates, validates, and installs domain drafts through the runtime", () => {
    const root = tempWorkspace("revela-runtime-domain-draft-")
    const name = `runtime-draft-domain-${Date.now()}`
    const draft = domainDraftCreate({
      workspaceRoot: root,
      name,
      domainMd: validDomainMd(name, "Draft"),
    })
    let installed = ""

    try {
      const validated = domainDraftValidate({ workspaceRoot: root, name })
      const activeBefore = domainList().activeDomain
      const result = domainDraftInstall({ workspaceRoot: root, name })
      installed = result.path

      expect(draft).toMatchObject({ ok: true, name, path: join(root, ".revela", "drafts", "domains", name), overwritten: false })
      expect(validated).toMatchObject({ ok: true, name, hasIndustryMd: true, hasRequiredFrontmatter: true, hasBody: true })
      expect(result).toMatchObject({ ok: true, name, sourcePath: draft.path, overwritten: false })
      expect(existsSync(join(result.path, "INDUSTRY.md"))).toBe(true)
      expect(() => domainDraftInstall({ workspaceRoot: root, name })).toThrow("already exists")

      const overwritten = domainDraftInstall({ workspaceRoot: root, name, overwrite: true })
      expect(overwritten).toMatchObject({ ok: true, name, overwritten: true })
      expect(domainList().activeDomain).toBe(activeBefore)
    } finally {
      if (installed) rmSync(installed, { recursive: true, force: true })
    }
  })

  it("blocks invalid domain draft installs", () => {
    const root = tempWorkspace("revela-runtime-domain-draft-invalid-")
    const name = `runtime-invalid-domain-${Date.now()}`
    const draftDir = join(root, ".revela", "drafts", "domains", name)
    mkdirSync(draftDir, { recursive: true })
    writeFileSync(join(draftDir, "INDUSTRY.md"), "---\nname: missing-fields\n---\n", "utf-8")

    const validated = domainDraftValidate({ workspaceRoot: root, name })

    expect(validated.ok).toBe(false)
    expect(validated.errors.join("\n")).toContain("missing required field")
    expect(() => domainDraftInstall({ workspaceRoot: root, name })).toThrow("Domain draft is invalid")
  })

  it("exposes design package validation through the CLI", () => {
    const name = `runtime-cli-design-${Date.now()}`
    const cli = join(import.meta.dir, "..", "bin", "revela.ts")
    const created = designCreate({
      name,
      designMd: validDesignMd(name, "CLI"),
      previewHtml: validPreviewHtml("CLI"),
    })

    try {
      const proc = spawnSync("bun", [cli, "design-validate", "--name", name], {
        encoding: "utf-8",
      })

      expect(proc.status).toBe(0)
      expect(JSON.parse(proc.stdout)).toMatchObject({ ok: true, name })
    } finally {
      rmSync(created.path, { recursive: true, force: true })
    }
  })

  it("reads design rules sections and records Codex deck-write hook context", () => {
    const root = tempWorkspace("revela-runtime-design-rules-")

    const result = designRead({ workspaceRoot: root, section: "rules" })
    const readiness = checkDesignRulesReadiness({ workspaceRoot: root })

    expect(result).toMatchObject({ ok: true, section: "rules" })
    expect(result.markdown).toContain("Canonical slide canvas")
    expect(result.markdown).not.toContain("@design:foundation:start")
    expect(readiness).toMatchObject({ ok: true, activeDesign: result.name })
    expect(existsSync(join(root, ".opencode", "revela", "codex-hooks", "design-rules-read.json"))).toBe(true)
  })

  it("opens a Codex-backed Review server by default without creating compatibility state", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-runtime-review-open-default-")
    writeMinimalDeck(root, "decks/review.html")
    const openedUrls: string[] = []

    try {
      const result = await reviewDeckOpen({
        workspaceRoot: root,
        file: "decks/review.html",
        openUrl: (url) => openedUrls.push(url),
      })

      expect(result).toMatchObject({
        ok: true,
        file: "decks/review.html",
        bridge: "codex-exec",
        mode: "edit",
        openedBrowser: true,
      })
      expect(result.url).toContain("/codex-review?token=")
      expect(openedUrls).toEqual([result.url])
      expect(result.token).toBeString()
      expect(result.deck).toMatchObject({ file: "decks/review.html", source: "file-path" })
      expect(result).not.toHaveProperty("reviewRead")
      expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    } finally {
      stopRefineServer()
    }
  }, 60000)

  it("returns a Codex-backed Review URL when browser opening is disabled", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-runtime-review-open-")
    writeMinimalDeck(root, "decks/review.html")

    try {
      const result = await reviewDeckOpen({ workspaceRoot: root, file: "decks/review.html", openBrowser: false })

      expect(result).toMatchObject({
        ok: true,
        file: "decks/review.html",
        bridge: "codex-exec",
        mode: "edit",
        openedBrowser: false,
      })
      expect(result.url).toContain("/codex-review?token=")
      expect(result.token).toBeString()
      expect(result.deck).toMatchObject({ file: "decks/review.html", source: "file-path" })
      expect(result).not.toHaveProperty("reviewRead")
      expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
    } finally {
      stopRefineServer()
    }
  }, 60000)
})

function writeDocx(root: string, relativePath: string, text: string, includeImage: boolean): void {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
      </w:document>`,
    ),
  }
  if (includeImage) files["word/media/image1.png"] = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  writeFileSync(join(root, relativePath), zipSync(files))
}

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

function validDeckPlanSlideInput(root: string) {
  return {
    workspaceRoot: root,
    designName: "summit",
    slideIndex: 1,
    id: "slide-pilot-proof",
    title: "Pilot Proof",
    chapter: "Decision",
    narrativeRole: "Show why the bounded pilot is the next decision.",
    structural: false,
    layout: "narrative",
    components: [{
      name: "text-panel",
      slot: "left",
      position: "left-top",
      purpose: "State the decision logic.",
      content: "Approve a bounded pilot.",
      claimIds: ["claim-pilot"],
      evidenceIds: ["evidence-pilot"],
      sourceNotes: ["Proposal"],
      renderNotes: ["Use concise heading and body copy."],
      placementNote: "Keep this as the primary reading path.",
    }],
    visualIntent: { kind: "copy-led", component: "text-panel", rationale: "The slide should privilege the decision sentence." },
    narrativeLinks: {
      claimIds: ["claim-pilot"],
      evidenceIds: ["evidence-pilot"],
    },
    caveats: ["Intent evidence does not prove market demand."],
  }
}

function writeMinimalDeck(root: string, outputPath: string): void {
  createDeckFoundation({
    workspaceRoot: root,
    outputPath,
    title: "Review Smoke",
    language: "en",
    designName: "starter",
  })
  const htmlPath = join(root, outputPath)
  const markers = deckFoundationMarkers()
  const html = readFileSync(htmlPath, "utf-8")
  const slide = `
    <section class="slide" slide-qa="false" data-slide-index="1">
        <div class="slide-canvas">
            <div class="page">
                <div class="eyebrow">Review</div>
                <h2>Bounded pilot</h2>
                <p>This minimal slide gives Review deck QA a valid canvas and slide identity.</p>
            </div>
        </div>
    </section>`
  writeFileSync(htmlPath, html.replace(`${markers.start}\n    ${markers.end}`, `${markers.start}${slide}\n    ${markers.end}`), "utf-8")
}

function validDesignMd(name: string, label: string): string {
  return `---
name: ${name}
description: ${label} design
author: test
version: 1.0.0
---

<!-- @design:foundation:start -->
### Foundation
\`\`\`css
.test-card { color: red; }
.test-badge { color: blue; }
\`\`\`
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
### Rules
- Keep hierarchy clear.
<!-- @design:rules:end -->

<!-- @layout:test-layout:start qa=true -->
#### Test Layout
\`\`\`html
<section class="slide" slide-qa="true"><div class="slide-canvas"></div></section>
\`\`\`
<!-- @layout:test-layout:end -->

<!-- @component:test-card:start -->
#### Test Card
\`\`\`html
<div class="test-card">Card</div>
\`\`\`
<!-- @component:test-card:end -->

<!-- @component:test-badge:start -->
#### Test Badge
\`\`\`html
<span class="test-badge">Badge</span>
\`\`\`
<!-- @component:test-badge:end -->`
}

function validPreviewHtml(label: string): string {
  return `<!doctype html>
<html><head><style>
.slide { min-height: 100dvh; display: flex; }
.slide-canvas { width: 1920px; height: 1080px; }
</style></head><body>
<section class="slide" slide-qa="false" data-slide-role="cover"><div class="slide-canvas">${label} Cover</div></section>
<section class="slide" slide-qa="true"><div class="slide-canvas"><div data-preview-component="test-card" class="test-card">Card</div><span data-preview-component="test-badge" class="test-badge">${label} Badge</span></div></section>
<section class="slide" slide-qa="false" data-slide-role="closing"><div class="slide-canvas">${label} Closing</div></section>
</body></html>`
}

function validDomainMd(name: string, label: string): string {
  return `---
name: ${name}
description: ${label} domain
author: test
version: 1.0.0
---

# ${label} Domain

Use this domain guidance to frame audience, decision, claims, objections, risks, and research gaps.

## Narrative Framing

- Prefer evidence-first claims.
- Preserve source boundaries.
`
}
