import { describe, expect, it } from "bun:test"
import { spawnSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { createDeckFoundation, deckFoundationMarkers } from "../lib/deck-html/foundation"
import { DECKS_STATE_FILE } from "../lib/decks-state"
import { seedBuiltinDesigns } from "../lib/design/designs"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { compileNarrativeVault } from "../lib/narrative-vault/compile"
import { addTemplateScaffold, addTemplateSlide, bindResearchFindings, checkDesignRulesReadiness, checkMaterialIntake, designCreate, designDraftCreate, designDraftInstall, designDraftValidate, designInstallArchive, designInventory, designList, designPack, designRead, designValidate, doctor, domainCreate, domainDraftCreate, domainDraftInstall, domainDraftValidate, domainList, domainValidate, evaluateResearchFindings, extractMaterial, listPageTemplates, pageTemplateFoundation, pageTemplateVocabulary, prepareLocalMaterials, readDeckPlan, recordMaterialReview, renderTemplateScaffold, renderTemplateSlide, researchSave, researchTargets, reviewDeckOpen, reviewDeckRead, storyRead, upsertDeckPlanSlide } from "../lib/runtime"
import { stopRefineServer } from "../lib/refine/server"
import { readTarArchive, writeTarArchive } from "../lib/design/archive"
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

  it("lists and renders built-in page templates through the runtime facade", () => {
    const root = tempWorkspace("revela-runtime-page-template-")
    createDeckFoundation({
      workspaceRoot: root,
      outputPath: "decks/templates.html",
      title: "Template Test",
      language: "en",
      designName: "lucent",
    })

    const listed = listPageTemplates()
    expect(listed.templates).toHaveLength(15)
    expect(listed.templates.every((template) => template.status === "renderable")).toBe(true)
    expect(listed.templates[0]).toHaveProperty("vocabulary")

    const foundation = pageTemplateFoundation({ templateId: "timeline-roadmap" })
    const vocabulary = pageTemplateVocabulary({ templateId: "timeline-roadmap" })
    expect(foundation.foundation.html).toContain('data-template="timeline-roadmap"')
    expect(vocabulary.vocabulary.requiredClasses).toContain("template-timeline-dot")

    const rendered = renderTemplateSlide({
      workspaceRoot: root,
      designName: "lucent",
      templateId: "timeline-roadmap",
      slideIndex: 1,
      content: {
        title: "Journey",
        milestones: [
          { date: "Mar 2019", label: "Launch", description: "Baseline mapping." },
          { date: "Nov 2019", label: "Audit", description: "Evidence sprint." },
          { date: "May 2020", label: "Scale", description: "Operating cadence." },
        ],
      },
    })

    expect(rendered.html).toContain('data-template="timeline-roadmap"')
    expect(rendered.html).toContain("template-timeline-dot")
    expect(rendered.html).toContain("template-timeline-copy")

    const added = addTemplateSlide({
      workspaceRoot: root,
      outputPath: "decks/templates.html",
      designName: "lucent",
      templateId: "timeline-roadmap",
      slideIndex: 1,
      content: {
        title: "Journey",
        milestones: [
          { date: "Mar 2019", label: "Launch", description: "Baseline mapping." },
          { date: "Nov 2019", label: "Audit", description: "Evidence sprint." },
          { date: "May 2020", label: "Scale", description: "Operating cadence." },
        ],
      },
    })

    expect(added.inserted).toBe(true)
    const html = readFileSync(join(root, "decks/templates.html"), "utf-8")
    expect(html).toContain("template-slide")
    expect(html).toContain("template-timeline")

    const scaffold = renderTemplateScaffold({
      workspaceRoot: root,
      designName: "lucent",
      templateId: "claim-supporting-visual",
      slideIndex: 2,
      seed: { title: "Claim scaffold" },
    })
    expect(scaffold.scaffold).toBe(true)
    expect(scaffold.html).toContain('data-template-slot="visual"')

    const addedScaffold = addTemplateScaffold({
      workspaceRoot: root,
      outputPath: "decks/templates.html",
      designName: "lucent",
      templateId: "chart-takeaways",
      slideIndex: 2,
      seed: { title: "Chart scaffold" },
    })
    expect(addedScaffold.inserted).toBe(true)
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

  it("reads deck-plan without narrative hash stale detection", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-hash-")
    writeMinimalVault(root)
    writeDeckPlan(root, "stale-narrative-hash")

    const result = readDeckPlan({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    expect(result.warnings).not.toContain("Deck plan narrativeHash does not match current narrative state.")
    expect(result.projection?.diagnostics.some((item) => item.code === "stale_narrative_hash")).toBe(false)
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

  it("reads hand-written deck-plan.md and reports design/source diagnostics", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-direct-diagnostics-")
    writeFileSync(join(root, "deck-plan.md"), directInvalidDeckPlanMarkdown(), "utf-8")

    const result = readDeckPlan({ workspaceRoot: root })
    const codes = result.projection?.diagnostics.map((item) => item.code) ?? []

    expect(result.ok).toBe(true)
    expect(result.projection?.designName).toBe("summit")
    expect(result.projection?.slides[0]).toMatchObject({
      slideIndex: 1,
      layout: "unknown-layout",
      sourceLinks: expect.objectContaining({ materials: [], findings: [], assets: [], urls: [], caveats: [] }),
    })
    expect(codes).toContain("slide_source_link_missing")
    expect(codes).toContain("slide_layout_unknown")
    expect(codes).toContain("slide_component_plan_unknown")
    expect(codes).toContain("slide_component_slot_invalid")
    expect(codes).toContain("slide_component_children_invalid")
  })

  it("reports synthesis-thin diagnostics for sourced slides without argument fields", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-synthesis-thin-")
    writeFileSync(join(root, "deck-plan.md"), synthesisThinDeckPlanMarkdown(), "utf-8")

    const result = readDeckPlan({ workspaceRoot: root })
    const codes = result.projection?.diagnostics.map((item) => item.code) ?? []

    expect(result.ok).toBe(true)
    expect(codes).toContain("slide_synthesis_thin")
    expect(codes).toContain("slide_finding_copy_risk")
  })

  it("does not report synthesis-thin diagnostics when sourced slides include argument fields", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-synthesis-")
    writeFileSync(join(root, "deck-plan.md"), synthesisReadyDeckPlanMarkdown(), "utf-8")

    const result = readDeckPlan({ workspaceRoot: root })
    const codes = result.projection?.diagnostics.map((item) => item.code) ?? []

    expect(result.ok).toBe(true)
    expect(codes).not.toContain("slide_synthesis_thin")
    expect(codes).not.toContain("slide_finding_copy_risk")
  })

  it("upserts one structured deck-plan slide and reads its component plan", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-upsert-")
    writeMinimalVault(root)

    const result = upsertDeckPlanSlide(validDeckPlanSlideInput(root))

    expect(result.ok).toBe(true)
    expect(result.path).toBe("deck-plan.md")
    expect(existsSync(join(root, "deck-plan.md"))).toBe(true)
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
    expect(read.projection?.slides[0].sourceLinks).toMatchObject({
      findings: ["researches/pilot.md"],
      urls: ["https://example.com/pilot"],
      caveats: [],
    })
    expect(read.markdown).toContain("---\nslideIndex: 1")
    expect(read.markdown).toContain("#### Content Plan")
    expect(read.markdown).toContain("#### Source Links")
    expect(read.markdown).toContain("#### Design Plan")
  })

  it("reads deck-plan.md with YAML slide separators", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-yaml-slides-")
    writeFileSync(join(root, "deck-plan.md"), separatorDeckPlanMarkdown(), "utf-8")

    const result = readDeckPlan({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    expect(result.projection?.slides).toHaveLength(1)
    expect(result.projection?.slides[0]).toMatchObject({
      slideIndex: 1,
      id: "slide-cover",
      title: "Cover",
      chapter: "Opening",
      layout: "cover",
      components: ["hero", "brand-watermark"],
      narrativeRole: "cover",
      sourceLinks: expect.objectContaining({
        materials: ["materials/source.md"],
        findings: ["researches/source-findings.md"],
        assets: ["assets/cover.png"],
        urls: ["https://example.com/source"],
        caveats: [],
      }),
    })
    expect(result.projection?.slides[0].componentPlan[0]).toMatchObject({
      name: "hero",
      slot: "canvas",
      position: "full-bleed",
      purpose: "Create the opening visual.",
      content: "Use the source-backed opening claim.",
      renderNotes: ["Keep title readable."],
    })
  })

  it("reads template-first deck-plan slides without requiring layout components", () => {
    const root = tempWorkspace("revela-runtime-template-plan-")
    writeFileSync(join(root, "deck-plan.md"), templateDeckPlanMarkdown(), "utf-8")

    const result = readDeckPlan({ workspaceRoot: root })
    const codes = result.projection?.diagnostics.map((item) => item.code) ?? []

    expect(result.ok).toBe(true)
    expect(result.projection?.slides[0]).toMatchObject({
      slideIndex: 1,
      template: "timeline-roadmap",
      title: "Journey",
    })
    expect(result.projection?.slides[0].templateContent?.milestones).toHaveLength(3)
    expect(codes).not.toContain("slide_layout_missing")
    expect(codes).not.toContain("slide_components_missing")
    expect(codes).not.toContain("slide_component_plan_missing")
  })

  it("re-upserting the same slideIndex updates the existing slide block", () => {
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
    expect(existsSync(join(root, "deck-plan.md"))).toBe(true)
    const read = readDeckPlan({ workspaceRoot: root })
    expect(read.projection?.slides).toHaveLength(1)
    expect(read.projection?.slides[0].title).toBe("Pilot Decision")
    expect(read.projection?.slides[0].componentPlan[0].content).toBe("Fund the bounded pilot.")
  })

  it("accepts toc layout/component plans for every built-in design", () => {
    for (const designName of ["starter", "summit", "monet"]) {
      const root = tempWorkspace(`revela-runtime-deck-plan-upsert-toc-${designName}-`)
      writeMinimalVault(root)

      const result = upsertDeckPlanSlide({
        ...validDeckPlanSlideInput(root),
        designName,
        id: `slide-${designName}-toc`,
        title: "Agenda",
        chapter: "Opening",
        narrativeRole: "Structural wayfinding for the deck.",
        structural: true,
        layout: "toc",
        components: [{
          name: "toc",
          slot: "main",
          position: "main",
          purpose: "Show the chapter sequence.",
          content: "Agenda sections.",
        }],
        visualIntent: { kind: "toc", component: "toc", rationale: "The slide is a structural table of contents." },
      })

      expect(result.ok).toBe(true)
      expect(result.diagnostics).not.toContainEqual(expect.objectContaining({ code: "slide_layout_unknown" }))
      expect(result.diagnostics).not.toContainEqual(expect.objectContaining({ code: "slide_component_slot_invalid" }))
    }
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

    const invalidSlot = upsertDeckPlanSlide({
      ...validDeckPlanSlideInput(root),
      components: [{ ...validDeckPlanSlideInput(root).components[0], slot: "top" }],
    })
    expect(invalidSlot.ok).toBe(false)
    expect(invalidSlot.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "slide_component_slot_invalid" }))

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
    expect(result.narrative).toBeUndefined()
    expect(result.inspectionContext).toBeUndefined()
    expect(result.markdown).toContain("Review Deck Read")
    expect(result.markdown).toContain("Artifact QA: passed")
    expect(result.evidenceTrace).toBeUndefined()
    expect(existsSync(join(root, DECKS_STATE_FILE))).toBe(false)
  }, 60000)

  it("reads artifact QA when no narrative vault exists", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-runtime-review-no-vault-")
    writeMinimalDeck(root, "decks/no-vault.html")

    const result = await reviewDeckRead({ workspaceRoot: root, file: "decks/no-vault.html", format: "markdown" })

    expect(result.ok).toBe(true)
    expect(result.artifactQa.summary.passed).toBe(true)
    expect(result.narrative).toBeUndefined()
    expect(result.markdown).not.toContain("Narrative:")
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

  it("packages and installs design archives with package-owned assets", () => {
    const root = tempWorkspace("revela-runtime-design-archive-")
    const name = `runtime-archive-design-${Date.now()}`
    const draft = designDraftCreate({
      workspaceRoot: root,
      name,
      base: "starter",
      designMd: validDesignMd(name, "Archive").replace("- Keep hierarchy clear.", "- Keep hierarchy clear.\n- Cover backgrounds may use `assets/cover-background.png`."),
      previewHtml: validPreviewHtml("Archive").replace("Archive Cover", "Archive Cover <img src=\"assets/cover-background.png\" alt=\"\">"),
      assets: [{
        path: "assets/cover-background.png",
        contentBase64: Buffer.from("fake png bytes", "utf-8").toString("base64"),
      }],
    })
    let installed = ""

    try {
      const packed = designPack({ workspaceRoot: root, name, source: "draft", overwrite: true })
      const installedResult = designInstallArchive({ archivePath: packed.archivePath, overwrite: true })
      installed = installedResult.path
      const read = designRead({ name })
      const archiveFiles = readTarArchive(packed.archivePath).map((entry) => entry.path)

      expect(draft.assets).toEqual([expect.objectContaining({ path: "assets/cover-background.png", kind: "cover-background" })])
      expect(draft.assets[0]).toMatchObject({ mimeType: "image/png", bytes: "fake png bytes".length })
      expect(existsSync(join(root, ".revela", "drafts", "designs", name, "DESIGN.md"))).toBe(true)
      expect(existsSync(join(root, ".revela", "drafts", "designs", name, "preview.html"))).toBe(true)
      expect(existsSync(join(root, ".revela", "drafts", "designs", name, "assets", "cover-background.png"))).toBe(true)
      expect(readFileSync(join(root, ".revela", "drafts", "designs", name, "preview.html"), "utf-8")).toContain("assets/cover-background.png")
      expect(readFileSync(join(root, ".revela", "drafts", "designs", name, "DESIGN.md"), "utf-8")).toContain("assets/cover-background.png")
      expect(designDraftValidate({ workspaceRoot: root, name }).ok).toBe(true)
      expect(packed).toMatchObject({ ok: true, name, format: "tar.gz" })
      expect(packed.archivePath).toBe(join(root, ".revela", "design-archives", `${name}.tar.gz`))
      expect(existsSync(packed.archivePath)).toBe(true)
      expect(packed.files).toContain("assets/cover-background.png")
      expect(archiveFiles).toEqual(expect.arrayContaining([
        `${name}/DESIGN.md`,
        `${name}/preview.html`,
        `${name}/assets/cover-background.png`,
      ]))
      expect(installedResult).toMatchObject({ ok: true, name, overwritten: false })
      expect(installedResult.assets).toEqual([expect.objectContaining({ path: "assets/cover-background.png", kind: "cover-background", mimeType: "image/png" })])
      expect(existsSync(join(installedResult.path, "assets", "cover-background.png"))).toBe(true)
      expect(read.assets).toEqual([expect.objectContaining({ path: "assets/cover-background.png", bytes: "fake png bytes".length })])
      expect(designValidate({ name }).ok).toBe(true)
    } finally {
      if (installed) rmSync(installed, { recursive: true, force: true })
    }
  })

  it("rejects design asset paths outside package assets", () => {
    const root = tempWorkspace("revela-runtime-design-asset-paths-")
    const invalidPaths = ["../cover.png", "/tmp/cover.png", "asset/cover.png", "assets/../cover.png"]

    for (const path of invalidPaths) {
      const name = `runtime-asset-path-${Date.now()}-${invalidPaths.indexOf(path)}`
      expect(() => designDraftCreate({
        workspaceRoot: root,
        name,
        designMd: validDesignMd(name, "Asset Path"),
        previewHtml: validPreviewHtml("Asset Path"),
        assets: [{ path, contentBase64: Buffer.from("x").toString("base64") }],
      })).toThrow("Design asset path must be located under assets/")
    }
  })

  it("rejects design archives with path traversal entries", () => {
    const root = tempWorkspace("revela-runtime-design-archive-invalid-")
    const archivePath = join(root, "bad.tar")
    expect(() => writeTarArchive([{ path: "../DESIGN.md", bytes: Buffer.from("bad") }], archivePath, false)).toThrow("Invalid archive path")
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
    const inventory = designInventory()
    const readiness = checkDesignRulesReadiness({ workspaceRoot: root })

    expect(result).toMatchObject({ ok: true, section: "rules" })
    expect(result.markdown).toContain("Canonical slide canvas")
    expect(result.markdown).not.toContain("@design:foundation:start")
    expect(inventory.pageTemplates.map((template) => template.templateId)).toContain("timeline-roadmap")
    expect(inventory.pageTemplates.find((template) => template.templateId === "timeline-roadmap")?.requiredClasses).toContain("template-timeline-dot")
    expect(readiness).toMatchObject({ ok: true, activeDesign: result.name })
    expect(existsSync(join(root, ".revela", "codex-hooks", "design-rules-read.json"))).toBe(true)
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

function directInvalidDeckPlanMarkdown(): string {
  return `---
id: deck-plan
designName: summit
---

# Deck Plan

## Goal

- Test direct authoring diagnostics.

## Audience

- Executive committee.

## Design

- Design: summit

## Source Authority

- Sources should stay explicit.

## Chapter Map

- Diagnostics: slides 1-2.

## Slides

### Slide 1 - Missing Source Links

- Id: slide-missing-source
- Chapter: Diagnostics
- Role: Show source diagnostics.
- Structural: false
- Layout: unknown-layout
- Components: text-panel

#### Component Plan

##### text-panel

- Slot: left
- Position: left-top
- Purpose: Explain the missing source.
- Content:
  This slide intentionally has no source links.

### Slide 2 - Invalid Components

- Id: slide-invalid-components
- Chapter: Diagnostics
- Role: Show design diagnostics.
- Structural: false
- Layout: narrative
- Components: text-panel, unknown-widget

#### Component Plan

##### text-panel

- Slot: top
- Position: top-left
- Purpose: Use an invalid slot and child.
- Content:
  Text panels cannot contain children.

###### stat-card

- Slot: top
- Position: top-right
- Purpose: Invalid child for text-panel.
- Content:
  42

##### unknown-widget

- Slot: left
- Position: left-bottom
- Purpose: Unknown component.
- Content:
  Unknown component.

#### Source Links

Caveats:
- [[Needs manual verification.]]

## Unresolved Inputs

- None.

## HTML Contract

- Use positive 1-based data-slide-index values.
`
}

function synthesisThinDeckPlanMarkdown(): string {
  return `---
id: deck-plan
designName: summit
---

# Deck Plan

## Goal

- Test synthesis-thin authoring diagnostics.

## Audience

- Executive committee.

## Design

- Design: summit

## Source Authority

- Sources should stay explicit.

## Chapter Map

- Decision: slide 1.

## Slides

---
slideIndex: 1
id: slide-synthesis-thin
title: Synthesis Thin
chapter: Decision
role: Repeat a finding without interpretation.
structural: false
layout: narrative
components: text-panel
---

#### Content Plan

- Finding: Pilot reduced cycle time.
- Source: researches/pilot/ops.md

#### Source Links

Findings:
- [[researches/pilot/ops.md#finding-cycle-time]]

#### Design Plan

##### text-panel

- Slot: body
- Position: main
- Purpose: Present the finding.
- Content:
  Pilot reduced cycle time.

## Unresolved Inputs

- None.

## HTML Contract

- Use positive 1-based data-slide-index values.
`
}

function synthesisReadyDeckPlanMarkdown(): string {
  return `---
id: deck-plan
designName: summit
---

# Deck Plan

## Goal

- Test synthesis-ready authoring diagnostics.

## Audience

- Executive committee.

## Design

- Design: summit

## Source Authority

- Sources should stay explicit.

## Chapter Map

- Decision: slide 1.

## Slides

---
slideIndex: 1
id: slide-synthesis-ready
title: Synthesis Ready
chapter: Decision
role: Explain the decision implication.
structural: false
layout: narrative
components: text-panel
---

#### Content Plan

- Claim: The sourced evidence supports a bounded pilot rather than a broad rollout.
- Reasoning: The finding shows operational lift in a pilot setting, while the synthesis keeps external market demand outside the claim.
- Audience takeaway: Approve the pilot now and hold rollout decisions for market validation.
- Evidence basis: [[researches/pilot/ops.md#synthesis-pilot-scope]]
- Boundary handling: State the market-demand boundary in the source note, not the main headline.

#### Source Links

Findings:
- [[researches/pilot/ops.md#synthesis-pilot-scope]]

#### Design Plan

##### text-panel

- Slot: body
- Position: main
- Purpose: Present the synthesized decision implication.
- Content:
  Use the claim, reasoning, and audience takeaway from the Content Plan.

## Unresolved Inputs

- None.

## HTML Contract

- Use positive 1-based data-slide-index values.
`
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
    sourceLinks: {
      findings: ["researches/pilot.md"],
      urls: ["https://example.com/pilot"],
      caveats: ["Intent evidence does not prove market demand."],
    },
    caveats: ["Intent evidence does not prove market demand."],
  }
}

function separatorDeckPlanMarkdown(): string {
  return `---
id: deck-plan
designName: summit
---

# Deck Plan

## Goal

Open with the source-backed decision context.

## Audience

Executives.

## Design

- Design: summit

## Source Authority

- Use only linked workspace materials, findings, assets, URLs, and user intent.

## Chapter Map

- Opening: slides 1

## Slides

---
slideIndex: 1
id: slide-cover
title: Cover
chapter: Opening
role: cover
layout: cover
components: hero, brand-watermark
---

#### Content Plan

- Message: Open the decision conversation.
- User review notes: Confirm final title language.

#### Source Links

Materials:
- [[materials/source.md]]

Findings:
- [[researches/source-findings.md]]

Assets:
- [[assets/cover.png]]

URLs:
- https://example.com/source

#### Design Plan

- Visual intent: full-bleed cover.

##### hero

- Slot: canvas
- Position: full-bleed
- Purpose: Create the opening visual.
- Content:
  Use the source-backed opening claim.
- Source notes: Source material and findings.
- Render notes: Keep title readable.

## Unresolved Inputs

- None.

## HTML Contract

- Use positive 1-based data-slide-index values.
`
}

function templateDeckPlanMarkdown(): string {
  return `---
id: deck-plan
designName: lucent
outputPath: decks/foo.html
---

# Deck Plan

## Goal

Demonstrate template-first deck planning.

## Audience

Revela maintainers.

## Design

- Design: lucent

## Source Authority

- Use only linked workspace materials, findings, assets, URLs, and user intent.

## Chapter Map

- Flow: slides 1

## Slides

---
slideIndex: 1
id: slide-journey
title: Journey
chapter: Flow
role: Show the timeline template contract.
template: timeline-roadmap
structural: false
---

#### Content Plan

- Claim: Timeline structure is now template-owned.
- Reasoning: The milestone dot and copy are rendered from one stable skeleton.
- Audience takeaway: Template pages can avoid recurring alignment regressions.

#### Template Content

\`\`\`json
{
  "title": "Journey",
  "orientation": "vertical",
  "milestones": [
    { "date": "Mar 2019", "label": "Launch", "description": "Baseline mapping." },
    { "date": "Nov 2019", "label": "Audit", "description": "Evidence sprint." },
    { "date": "May 2020", "label": "Scale", "description": "Operating cadence." }
  ]
}
\`\`\`

#### Source Links

Materials:
- [[materials/source.md]]

Findings:
- None.

Assets:
- None.

URLs:
- None.

## Unresolved Inputs

- None.

## HTML Contract

- Use positive 1-based data-slide-index values.
`
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
