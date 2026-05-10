import { formatDeckHtmlContractReport, validateDeckHtmlContract } from "../deck-html/contract"
import type { DesignClassVocabulary } from "../design/designs"
import { formatReport, runQA } from "./index"
import { runComplianceQA } from "./compliance"
import type { QAReport } from "./checks"

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

  const compliance = runComplianceQA(input.filePath, input.vocabulary)
  const complianceErrors = hardErrors(compliance)
  if (compliance.totalIssues > 0) {
    hardErrorCount += complianceErrors
    warningCount += warnings(compliance)
    sections.push("**[component compliance]**\n\n" + formatReport(compliance))
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

export function formatArtifactQAReport(report: ArtifactQAReport): string {
  const heading = report.passed ? "Artifact QA: PASSED" : "Artifact QA: FAILED"
  const summary = `**File:** \`${report.file}\`\n\n**Hard errors:** ${report.hardErrorCount}\n**Warnings:** ${report.warningCount}`
  if (report.sections.length === 0) return `## ${heading}\n\n${summary}\n\nAll artifact QA checks passed.`
  return `## ${heading}\n\n${summary}\n\n${report.sections.join("\n\n---\n\n")}`
}
