import { formatDeckHtmlContractReport, validateDeckHtmlContract } from "../deck-html/contract"
import { activeDesign, extractDesignComponentContracts } from "../design/designs"
import type { DesignClassVocabulary, DesignComponentContract } from "../design/designs"
import { formatReport, runQA } from "./index"
import { runComplianceQA } from "./compliance"
import { runComponentContractQA } from "./component-contracts"
import { formatPageTemplateContractReport, validatePageTemplateContracts } from "../page-templates"
import type { QAReport } from "./checks"
import { existsSync, readFileSync } from "fs"
import { basename, dirname, resolve } from "path"

export interface ArtifactQAReport {
  file: string
  passed: boolean
  hardErrorCount: number
  warningCount: number
  sections: string[]
}

function hardErrors(report: QAReport): number {
  return report.slides.reduce((sum, slide) => sum + slide.issues.filter((issue) => issue.severity === "error").length, 0)
}

function warnings(report: QAReport): number {
  return report.slides.reduce((sum, slide) => sum + slide.issues.filter((issue) => issue.severity === "warning").length, 0)
}

export async function runArtifactQA(input: {
  workspaceRoot: string
  filePath: string
  vocabulary?: DesignClassVocabulary
  componentContracts?: DesignComponentContract[]
}): Promise<ArtifactQAReport> {
  const sections: string[] = []
  let hardErrorCount = 0
  let warningCount = 0

  const contract = validateDeckHtmlContract(input.workspaceRoot, input.filePath)
  if (contract.status === "invalid") {
    hardErrorCount += contract.issues.filter((issue) => issue.severity === "error").length
    warningCount += contract.warnings.length
    sections.push("**[deck HTML contract]**\n\n" + formatDeckHtmlContractReport(contract))
  } else if (contract.warnings.length > 0) {
    warningCount += contract.warnings.length
    sections.push("**[deck HTML contract]**\n\n" + formatDeckHtmlContractReport(contract))
  }

  const designCss = validateLinkedDesignCss(input.filePath)
  if (designCss.errors.length > 0 || designCss.warnings.length > 0) {
    hardErrorCount += designCss.errors.length
    warningCount += designCss.warnings.length
    sections.push("**[design CSS snapshot]**\n\n" + [
      ...designCss.errors.map((message) => `- ERROR: ${message}`),
      ...designCss.warnings.map((message) => `- WARNING: ${message}`),
    ].join("\n"))
  }

  if (shouldRunArtifactCompliance(input.filePath)) {
    const compliance = runComplianceQA(input.filePath, input.vocabulary)
    const complianceErrors = hardErrors(compliance)
    if (compliance.totalIssues > 0) {
      hardErrorCount += complianceErrors
      warningCount += warnings(compliance)
      sections.push("**[component compliance]**\n\n" + formatReport(compliance))
    }
  }

  const componentContracts = input.componentContracts ?? componentContractsForArtifact(input.filePath)
  if (componentContracts.length > 0) {
    const componentContractReport = runComponentContractQA(input.filePath, componentContracts)
    const contractErrors = hardErrors(componentContractReport)
    if (componentContractReport.totalIssues > 0) {
      hardErrorCount += contractErrors
      warningCount += warnings(componentContractReport)
      sections.push("**[component structure contracts]**\n\n" + formatReport(componentContractReport))
    }
  }

  const templateContracts = validatePageTemplateContracts(input.filePath)
  if (templateContracts.issues.length > 0) {
    hardErrorCount += templateContracts.issues.filter((issue) => issue.severity === "error").length
    warningCount += templateContracts.issues.filter((issue) => issue.severity === "warning").length
    sections.push("**[page template contracts]**\n\n" + formatPageTemplateContractReport(templateContracts))
  }

  try {
    const browser = await runQA(input.filePath)
    const browserErrors = hardErrors(browser)
    if (browser.totalIssues > 0) {
      hardErrorCount += browserErrors
      warningCount += warnings(browser)
      sections.push("**[browser artifact QA]**\n\n" + formatReport(browser))
    }
  } catch (e) {
    hardErrorCount += 1
    sections.push("**[browser artifact QA]**\n\nError running browser QA: " + (e instanceof Error ? e.message : String(e)))
  }

  return {
    file: input.filePath,
    passed: hardErrorCount === 0,
    hardErrorCount,
    warningCount,
    sections,
  }
}

function validateLinkedDesignCss(filePath: string): { errors: string[]; warnings: string[] } {
  if (isDesignPreviewFile(filePath)) return { errors: [], warnings: [] }
  const errors: string[] = []
  const warnings: string[] = []
  let html = ""
  try {
    html = readFileSync(filePath, "utf-8")
  } catch {
    return { errors, warnings }
  }
  const hrefs = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']*design\.css)["'][^>]*>/gi)].map((match) => match[1])
  if (hrefs.length === 0) {
    warnings.push("Deck does not reference a design.css snapshot.")
    return { errors, warnings }
  }
  for (const href of hrefs) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue
    const cssPath = resolve(dirname(filePath), href)
    if (!existsSync(cssPath)) {
      errors.push(`Linked design CSS is missing: ${href}`)
      continue
    }
    const css = readFileSync(cssPath, "utf-8")
    for (const asset of cssAssetUrls(css)) {
      const assetPath = resolve(dirname(cssPath), asset)
      if (!existsSync(assetPath)) errors.push(`Linked design CSS references missing asset: ${href} -> ${asset}`)
    }
  }
  return { errors, warnings }
}

function cssAssetUrls(css: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const urlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi
  let match: RegExpExecArray | null
  while ((match = urlRe.exec(css)) !== null) {
    const raw = match[1].trim()
    if (!raw || raw.startsWith("data:") || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    urls.push(raw)
  }
  return urls
}

function componentContractsForArtifact(filePath: string): DesignComponentContract[] {
  const designName = designNameFromPreviewPath(filePath)
  try {
    return extractDesignComponentContracts(designName || activeDesign())
  } catch {
    return []
  }
}

export function shouldRunArtifactCompliance(filePath: string): boolean {
  return !isDesignPreviewFile(filePath)
}

function isDesignPreviewFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/")
  if (basename(normalizedPath) !== "preview.html") return false
  const parts = dirname(normalizedPath).split("/")
  return parts.length >= 2 && parts[parts.length - 2] === "designs"
}

function designNameFromPreviewPath(filePath: string): string | undefined {
  const normalizedPath = filePath.replace(/\\/g, "/")
  if (basename(normalizedPath) !== "preview.html") return undefined
  const parts = dirname(normalizedPath).split("/")
  if (parts.length >= 2 && parts[parts.length - 2] === "designs") return parts[parts.length - 1]
  return undefined
}

export function formatArtifactQAReport(report: ArtifactQAReport): string {
  const heading = report.passed ? "Artifact QA: PASSED" : "Artifact QA: FAILED"
  const summary = `**File:** \`${report.file}\`\n\n**Hard errors:** ${report.hardErrorCount}\n**Warnings:** ${report.warningCount}`
  if (report.sections.length === 0) return `## ${heading}\n\n${summary}\n\nAll artifact QA checks passed.`
  return `## ${heading}\n\n${summary}\n\n${report.sections.join("\n\n---\n\n")}`
}
