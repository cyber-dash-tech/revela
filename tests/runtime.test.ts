import { describe, expect, it } from "bun:test"
import { spawnSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { createDeckFoundation, deckFoundationMarkers } from "../lib/deck-html/foundation"
import { DECKS_STATE_FILE } from "../lib/decks-state"
import { seedBuiltinDesigns } from "../lib/design/designs"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { compileNarrativeVault } from "../lib/narrative-vault/compile"
import { bindResearchFindings, checkDesignRulesReadiness, designCreate, designRead, designValidate, doctor, evaluateResearchFindings, readDeckPlan, researchSave, researchTargets, reviewDeckOpen, reviewDeckRead, storyRead } from "../lib/runtime"
import { stopRefineServer } from "../lib/refine/server"
import pkg from "../package.json"
import { tempWorkspace } from "./helpers/tool-helpers"

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
  })

  it("exposes the package version through CLI doctor", () => {
    const root = tempWorkspace("revela-runtime-doctor-cli-")
    const cli = join(import.meta.dir, "..", "bin", "revela.ts")

    const proc = spawnSync("bun", [cli, "doctor", "--workspaceRoot", root], {
      encoding: "utf-8",
    })

    expect(proc.status).toBe(0)
    expect(JSON.parse(proc.stdout)).toMatchObject({
      ok: true,
      version: pkg.version,
      workspaceRoot: root,
    })
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
<html><body>
<section class="slide" slide-qa="false" data-slide-role="cover"><div class="slide-canvas">${label} Cover</div></section>
<section class="slide" slide-qa="true"><div class="slide-canvas"><div data-preview-component="test-card" class="test-card">Card</div><span data-preview-component="test-badge" class="test-badge">${label} Badge</span></div></section>
<section class="slide" slide-qa="false" data-slide-role="closing"><div class="slide-canvas">${label} Closing</div></section>
</body></html>`
}
