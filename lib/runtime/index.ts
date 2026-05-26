import { existsSync } from "fs"
import { resolve } from "path"
import { activeDesign, activateDesign, getDesignSkillMd, listDesigns, seedBuiltinDesigns } from "../design/designs"
import { createDeckFoundation as createDeckFoundationShell } from "../deck-html/foundation"
import { activeDomain, activateDomain, getDomainSkillMd, listDomains, seedBuiltinDomains } from "../domain/domains"
import { computeNarrativeHash } from "../narrative-state/hash"
import { compileNarrativeVault } from "../narrative-vault/compile"
import { runNarrativeMarkdownQa, type MarkdownQaOptions } from "../narrative-vault/markdown-qa"
import { readDeckPlanArtifact } from "../narrative-state/deck-plan-artifact"
import { extractDesignClasses } from "../design/designs"
import { recordRenderedArtifact, workspaceRelative } from "../workspace-state/rendered-artifacts"
import type { ReviewDeckOpenInput, ReviewDeckReadInput } from "./review"
import pkg from "../../package.json"
export { bindResearchFindings, evaluateResearchFindings, researchSave, researchTargets } from "./research"
export { storyRead } from "./story"

export interface RuntimeWorkspaceInput {
  workspaceRoot?: string
}

export interface RuntimeFileInput extends RuntimeWorkspaceInput {
  file: string
}

export interface RuntimeDeckFoundationInput extends RuntimeWorkspaceInput {
  outputPath: string
  title: string
  language: string
  designName?: string
  mode?: "create" | "repair"
  overwrite?: boolean
}

export interface RuntimeDesignReadInput {
  name?: string
}

export interface RuntimeNameInput {
  name: string
}

export function doctor(input: RuntimeWorkspaceInput = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  return {
    ok: true,
    version: pkg.version,
    workspaceRoot,
    hasNarrativeVault: existsSync(resolve(workspaceRoot, "revela-narrative")),
    hasDeckPlan: existsSync(resolve(workspaceRoot, "deck-plan")),
    hasDecksJson: existsSync(resolve(workspaceRoot, "DECKS.json")),
    activeDesign: safe(activeDesign),
  }
}

export function compileNarrative(input: RuntimeWorkspaceInput = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  return compileNarrativeVault(workspaceRoot)
}

export function markdownQa(input: RuntimeWorkspaceInput & MarkdownQaOptions = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  return runNarrativeMarkdownQa(workspaceRoot, {
    scope: input.scope,
    strictness: input.strictness,
    touched: input.touched,
  })
}

export function readDeckPlan(input: RuntimeWorkspaceInput = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  const compiled = compileNarrativeVault(workspaceRoot)
  const knownNodeIds = compiled.graph ? new Set(compiled.graph.nodes.map((node) => node.id)) : undefined
  return readDeckPlanArtifact(workspaceRoot, {
    narrativeHash: compiled.narrative ? computeNarrativeHash(compiled.narrative) : undefined,
    knownNodeIds,
  })
}

export function createDeckFoundation(input: RuntimeDeckFoundationInput) {
  return createDeckFoundationShell({
    workspaceRoot: root(input.workspaceRoot),
    outputPath: input.outputPath,
    title: input.title,
    language: input.language,
    designName: input.designName,
    mode: input.mode,
    overwrite: input.overwrite ?? false,
  })
}

export async function runDeckQa(input: RuntimeFileInput) {
  const { formatArtifactQAReport, runArtifactQA } = await import("../qa/artifact")
  const workspaceRoot = root(input.workspaceRoot)
  const filePath = resolve(workspaceRoot, input.file)
  let vocabulary
  try {
    vocabulary = extractDesignClasses()
  } catch {
    // Design vocabulary is optional.
  }
  const report = await runArtifactQA({ workspaceRoot, filePath, vocabulary })
  return {
    ok: report.passed,
    summary: {
      passed: report.passed,
      errors: report.hardErrorCount,
      warnings: report.warningCount,
    },
    report,
    markdown: formatArtifactQAReport(report),
  }
}

export async function exportPdf(input: RuntimeFileInput) {
  const { exportToPdf } = await import("../pdf/export")
  const { assertExportQAPassed } = await import("../qa/export-gate")
  const workspaceRoot = root(input.workspaceRoot)
  const filePath = resolve(workspaceRoot, input.file)
  await assertExportQAPassed(filePath, { workspaceRoot })
  const result = await exportToPdf(filePath)
  recordRenderedArtifact(workspaceRoot, {
    sourceHtmlPath: workspaceRelative(resolve(workspaceRoot), filePath),
    outputPath: result.outputPath,
    type: "pdf",
    actor: "revela-codex-mcp",
  })
  return { ok: true, ...result }
}

export async function exportPptx(input: RuntimeFileInput & { speakerNotes?: Array<string | null | undefined> }) {
  const { exportToPptx } = await import("../pptx/export")
  const { assertExportQAPassed } = await import("../qa/export-gate")
  const workspaceRoot = root(input.workspaceRoot)
  const filePath = resolve(workspaceRoot, input.file)
  await assertExportQAPassed(filePath, { workspaceRoot })
  const result = await exportToPptx(filePath, { speakerNotes: input.speakerNotes })
  recordRenderedArtifact(workspaceRoot, {
    sourceHtmlPath: workspaceRelative(resolve(workspaceRoot), filePath),
    outputPath: result.outputPath,
    type: "pptx",
    actor: "revela-codex-mcp",
  })
  return { ok: true, ...result }
}

export async function reviewDeckRead(input: ReviewDeckReadInput) {
  const review = await import("./review")
  return review.reviewDeckRead(input)
}

export async function reviewDeckOpen(input: ReviewDeckOpenInput) {
  const review = await import("./review")
  return review.reviewDeckOpen(input)
}

export function designList() {
  seedBuiltinDesigns()
  return {
    ok: true,
    activeDesign: activeDesign(),
    designs: listDesigns({ includeInternal: false }).map((design) => ({
      name: design.name,
      description: design.description,
      author: design.author,
      version: design.version,
    })),
  }
}

export function designRead(input: RuntimeDesignReadInput = {}) {
  seedBuiltinDesigns()
  const name = input.name || activeDesign()
  return {
    ok: true,
    name,
    markdown: getDesignSkillMd(name),
  }
}

export function designActivate(input: RuntimeNameInput) {
  seedBuiltinDesigns()
  activateDesign(requiredName(input, "design"))
  return {
    ok: true,
    activeDesign: activeDesign(),
  }
}

export function domainList() {
  seedBuiltinDomains()
  return {
    ok: true,
    activeDomain: activeDomain(),
    domains: listDomains().map((domain) => ({
      name: domain.name,
      description: domain.description,
      author: domain.author,
      version: domain.version,
    })),
  }
}

export function domainRead(input: RuntimeDesignReadInput = {}) {
  seedBuiltinDomains()
  const name = input.name || activeDomain()
  return {
    ok: true,
    name,
    markdown: getDomainSkillMd(name),
  }
}

export function domainActivate(input: RuntimeNameInput) {
  seedBuiltinDomains()
  activateDomain(requiredName(input, "domain"))
  return {
    ok: true,
    activeDomain: activeDomain(),
  }
}

function root(workspaceRoot: string | undefined): string {
  return resolve(workspaceRoot || process.cwd())
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

function requiredName(input: RuntimeNameInput, label: string): string {
  const name = input?.name?.trim()
  if (!name) throw new Error(`${label} name is required`)
  return name
}
