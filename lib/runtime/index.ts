import { createHash } from "crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"
import {
  activeDesign,
  activateDesign,
  createDesignDraftPackage,
  createDesignPackage,
  getDesignComponent,
  getDesignInventory,
  getDesignLayout,
  getDesignSection,
  getDesignSkillMd,
  installDesignDraftPackage,
  listDesigns,
  seedBuiltinDesigns,
  validateDesignDraftPackage,
  validateDesignPackage,
} from "../design/designs"
import { createDeckFoundation as createDeckFoundationShell } from "../deck-html/foundation"
import { activeDomain, activateDomain, createDomainDraftPackage, createDomainPackage, getDomainSkillMd, installDomainDraftPackage, listDomains, seedBuiltinDomains, validateDomainDraftPackage, validateDomainPackage } from "../domain/domains"
import { compileNarrativeVault } from "../narrative-vault/compile"
import { autoCompileNarrativeVault } from "../narrative-vault/auto-compile"
import { extractNarrativeVaultMarkdownTargetsFromPatch } from "../narrative-vault/hook-targets"
import { runNarrativeMarkdownQa, type MarkdownQaOptions } from "../narrative-vault/markdown-qa"
import { formatArtifactQaUserNotice, formatMarkdownQaUserNotice } from "../hook-notifications"
import { deckPlanDesignDiagnostics, readDeckPlanArtifact, upsertDeckPlanSlideArtifact, type DeckPlanSlideUpsertInput } from "../narrative-state/deck-plan-artifact"
import { extractDesignClasses } from "../design/designs"
import { recordRenderedArtifact, workspaceRelative } from "../workspace-state/rendered-artifacts"
import { checkMaterialIntake, extractMaterial, materialIntakeNoticeForCommand, prepareLocalMaterials, recordMaterialReview } from "../material-intake"
import type { ReviewDeckOpenInput, ReviewDeckReadInput } from "./review"
import pkg from "../../package.json"
export { bindResearchFindings, evaluateResearchFindings, researchSave, researchTargets } from "./research"
export { storyRead } from "./story"
export { checkMaterialIntake, extractMaterial, materialIntakeNoticeForCommand, prepareLocalMaterials, recordMaterialReview }

export interface RuntimeWorkspaceInput {
  workspaceRoot?: string
}

export interface RuntimeFileInput extends RuntimeWorkspaceInput {
  file: string
}

export interface RuntimeNarrativeAutoCompileInput extends RuntimeWorkspaceInput {
  touched?: string[]
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
  workspaceRoot?: string
  name?: string
  section?: string
}

export interface RuntimeDesignInventoryInput {
  name?: string
}

export interface RuntimeDesignLayoutReadInput {
  name?: string
  layout: string | string[]
}

export interface RuntimeDesignComponentReadInput {
  name?: string
  component: string | string[]
}

export interface RuntimeDeckPlanSlideUpsertInput extends RuntimeWorkspaceInput, DeckPlanSlideUpsertInput {
  designName?: string
}

export interface RuntimeDesignCreateInput {
  name: string
  base?: string
  designMd: string
  previewHtml: string
  overwrite?: boolean
}

export interface RuntimeDesignDraftCreateInput extends RuntimeDesignCreateInput, RuntimeWorkspaceInput {}

export interface RuntimeDomainCreateInput {
  name: string
  domainMd: string
  overwrite?: boolean
}

export interface RuntimeDomainDraftCreateInput extends RuntimeDomainCreateInput, RuntimeWorkspaceInput {}

export interface RuntimeDraftInstallInput extends RuntimeWorkspaceInput {
  name: string
  overwrite?: boolean
}

export interface RuntimeNameInput {
  name: string
}

export function doctor(input: RuntimeWorkspaceInput = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  const domain = activeDomainDoctorInfo()
  return {
    ok: true,
    version: pkg.version,
    workspaceRoot,
    hasNarrativeVault: existsSync(resolve(workspaceRoot, "revela-narrative")),
    hasDeckPlan: existsSync(resolve(workspaceRoot, "deck-plan")),
    hasDecksJson: existsSync(resolve(workspaceRoot, "DECKS.json")),
    activeDesign: safe(activeDesign),
    activeDomain: domain.name,
    activeDomainDescription: domain.description,
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

export function autoCompileNarrative(input: RuntimeNarrativeAutoCompileInput = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  return autoCompileNarrativeVault(workspaceRoot, input.touched ?? [])
}

export function extractNarrativeVaultMarkdownPatchTargets(input: RuntimeWorkspaceInput & { patch: string }) {
  const workspaceRoot = root(input.workspaceRoot)
  return extractNarrativeVaultMarkdownTargetsFromPatch(input.patch, workspaceRoot)
}

export { formatArtifactQaUserNotice, formatMarkdownQaUserNotice }

export function readDeckPlan(input: RuntimeWorkspaceInput = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  const read = readDeckPlanArtifact(workspaceRoot)
  if (read.projection) {
    try {
      const inventory = getDesignInventory(read.projection.designName || activeDesign())
      const diagnostics = deckPlanDesignDiagnostics(read.projection, {
        layouts: inventory.layouts.map((layout) => layout.name),
        components: inventory.components.map((component) => component.name),
        layoutSlots: Object.fromEntries(inventory.layouts.map((layout) => [layout.name, layout.slots])),
        componentNesting: Object.fromEntries(inventory.components.map((component) => [component.name, component.nesting])),
      })
      read.projection.diagnostics.push(...diagnostics)
      read.warnings.push(...diagnostics.map((diagnostic) => diagnostic.message))
    } catch {
      // Design diagnostics are advisory; deck-plan reading remains available.
    }
  }
  return read
}

export function upsertDeckPlanSlide(input: RuntimeDeckPlanSlideUpsertInput) {
  const workspaceRoot = root(input.workspaceRoot)
  const designName = input.designName || activeDesign()
  const inventory = getDesignInventory(designName)
  const result = upsertDeckPlanSlideArtifact(workspaceRoot, input, {
    designLayouts: inventory.layouts.map((layout) => layout.name),
    designComponents: inventory.components.map((component) => component.name),
    layoutSlots: Object.fromEntries(inventory.layouts.map((layout) => [layout.name, layout.slots])),
    componentNesting: Object.fromEntries(inventory.components.map((component) => [component.name, component.nesting])),
  })
  return {
    ...result,
    designName,
  }
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
  const workspaceRoot = root(input.workspaceRoot)
  const filePath = resolve(workspaceRoot, input.file)
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
  const workspaceRoot = root(input.workspaceRoot)
  const filePath = resolve(workspaceRoot, input.file)
  const result = await exportToPptx(filePath, { speakerNotes: input.speakerNotes })
  recordRenderedArtifact(workspaceRoot, {
    sourceHtmlPath: workspaceRelative(resolve(workspaceRoot), filePath),
    outputPath: result.outputPath,
    type: "pptx",
    actor: "revela-codex-mcp",
  })
  return { ok: true, ...result }
}

export async function exportPng(input: RuntimeFileInput & { outputDir?: string }) {
  const { exportDeckToPng } = await import("../pdf/export")
  const workspaceRoot = root(input.workspaceRoot)
  const filePath = resolve(workspaceRoot, input.file)
  const outputDir = input.outputDir ? resolve(workspaceRoot, input.outputDir) : undefined
  const result = await exportDeckToPng(filePath, { outputDir })
  recordRenderedArtifact(workspaceRoot, {
    sourceHtmlPath: workspaceRelative(resolve(workspaceRoot), filePath),
    outputPath: result.outputDir,
    type: "png",
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
  const name = input.name || activeDesign()
  if (input.section) {
    const markdown = getDesignSection(input.section, name)
    const result = {
      ok: true,
      name,
      section: input.section,
      markdown,
    }
    if (input.section === "rules") recordDesignRulesRead(root(input.workspaceRoot), name, markdown)
    return result
  }
  return {
    ok: true,
    name,
    markdown: getDesignSkillMd(name),
  }
}

export function designInventory(input: RuntimeDesignInventoryInput = {}) {
  return {
    ok: true,
    ...getDesignInventory(input.name || activeDesign()),
  }
}

export function designReadLayout(input: RuntimeDesignLayoutReadInput) {
  const name = input.name || activeDesign()
  return {
    ok: true,
    name,
    layout: input.layout,
    markdown: getDesignLayout(input.layout, name),
  }
}

export function designReadComponent(input: RuntimeDesignComponentReadInput) {
  const name = input.name || activeDesign()
  return {
    ok: true,
    name,
    component: input.component,
    markdown: getDesignComponent(input.component, name),
  }
}

export function designCreate(input: RuntimeDesignCreateInput) {
  seedBuiltinDesigns()
  return createDesignPackage({
    name: requiredString(input?.name, "design name"),
    base: input.base,
    designMd: requiredString(input?.designMd, "designMd"),
    previewHtml: requiredString(input?.previewHtml, "previewHtml"),
    overwrite: input.overwrite ?? false,
  })
}

export function designValidate(input: RuntimeNameInput) {
  return validateDesignPackage(requiredName(input, "design"))
}

export function designDraftCreate(input: RuntimeDesignDraftCreateInput) {
  return createDesignDraftPackage({
    workspaceRoot: root(input.workspaceRoot),
    name: requiredString(input?.name, "design name"),
    base: input.base,
    designMd: requiredString(input?.designMd, "designMd"),
    previewHtml: requiredString(input?.previewHtml, "previewHtml"),
    overwrite: input.overwrite ?? false,
  })
}

export function designDraftValidate(input: RuntimeWorkspaceInput & RuntimeNameInput) {
  return validateDesignDraftPackage(root(input.workspaceRoot), requiredName(input, "design draft"))
}

export function designDraftInstall(input: RuntimeDraftInstallInput) {
  seedBuiltinDesigns()
  return installDesignDraftPackage({
    workspaceRoot: root(input.workspaceRoot),
    name: requiredName(input, "design draft"),
    overwrite: input.overwrite ?? false,
  })
}

export interface DesignRulesReadinessResult {
  ok: boolean
  activeDesign: string
  markerPath: string
  reason?: string
}

const DESIGN_RULES_MARKER_TTL_MS = 8 * 60 * 60 * 1000

export function checkDesignRulesReadiness(input: RuntimeWorkspaceInput = {}): DesignRulesReadinessResult {
  const workspaceRoot = root(input.workspaceRoot)
  const design = activeDesign()
  const rules = getDesignSection("rules", design)
  const markerPath = designRulesMarkerPath(workspaceRoot)
  if (!existsSync(markerPath)) {
    return { ok: false, activeDesign: design, markerPath, reason: "Design rules have not been read for this workspace." }
  }

  let marker: any
  try {
    marker = JSON.parse(readFileSync(markerPath, "utf-8"))
  } catch {
    return { ok: false, activeDesign: design, markerPath, reason: "Design rules marker is unreadable." }
  }

  if (marker.designName !== design) {
    return { ok: false, activeDesign: design, markerPath, reason: `Design rules marker is for '${marker.designName ?? "unknown"}', but active design is '${design}'.` }
  }
  if (marker.rulesHash !== hashDesignRules(rules)) {
    return { ok: false, activeDesign: design, markerPath, reason: "Design rules marker is stale for the current active design rules." }
  }
  if (typeof marker.readAt !== "string" || Number.isNaN(Date.parse(marker.readAt))) {
    return { ok: false, activeDesign: design, markerPath, reason: "Design rules marker is missing a valid read timestamp." }
  }
  if (Date.now() - Date.parse(marker.readAt) > DESIGN_RULES_MARKER_TTL_MS) {
    return { ok: false, activeDesign: design, markerPath, reason: "Design rules marker is older than 8 hours." }
  }

  return { ok: true, activeDesign: design, markerPath }
}

function recordDesignRulesRead(workspaceRoot: string, designName: string, rules: string): void {
  const markerPath = designRulesMarkerPath(workspaceRoot)
  mkdirSync(dirname(markerPath), { recursive: true })
  writeFileSync(markerPath, JSON.stringify({
    designName,
    rulesHash: hashDesignRules(rules),
    readAt: new Date().toISOString(),
  }, null, 2) + "\n", "utf-8")
}

function designRulesMarkerPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, ".opencode", "revela", "codex-hooks", "design-rules-read.json")
}

function hashDesignRules(rules: string): string {
  return createHash("sha256").update(rules).digest("hex")
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

export function domainCreate(input: RuntimeDomainCreateInput) {
  seedBuiltinDomains()
  return createDomainPackage({
    name: requiredString(input?.name, "domain name"),
    domainMd: requiredString(input?.domainMd, "domainMd"),
    overwrite: input.overwrite ?? false,
  })
}

export function domainValidate(input: RuntimeNameInput) {
  seedBuiltinDomains()
  return validateDomainPackage(requiredName(input, "domain"))
}

export function domainDraftCreate(input: RuntimeDomainDraftCreateInput) {
  return createDomainDraftPackage({
    workspaceRoot: root(input.workspaceRoot),
    name: requiredString(input?.name, "domain name"),
    domainMd: requiredString(input?.domainMd, "domainMd"),
    overwrite: input.overwrite ?? false,
  })
}

export function domainDraftValidate(input: RuntimeWorkspaceInput & RuntimeNameInput) {
  return validateDomainDraftPackage(root(input.workspaceRoot), requiredName(input, "domain draft"))
}

export function domainDraftInstall(input: RuntimeDraftInstallInput) {
  seedBuiltinDomains()
  return installDomainDraftPackage({
    workspaceRoot: root(input.workspaceRoot),
    name: requiredName(input, "domain draft"),
    overwrite: input.overwrite ?? false,
  })
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

function activeDomainDoctorInfo(): { name: string; description: string } {
  try {
    seedBuiltinDomains()
    const name = activeDomain()
    const description = listDomains().find((domain) => domain.name === name)?.description ?? ""
    return { name, description }
  } catch {
    return { name: safe(activeDomain) ?? "", description: "" }
  }
}

function requiredName(input: RuntimeNameInput, label: string): string {
  const name = input?.name?.trim()
  if (!name) throw new Error(`${label} name is required`)
  return name
}

function requiredString(value: string | undefined, label: string): string {
  const text = value?.trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}
