/**
 * lib/qa/index.ts
 *
 * Public entry point for the slide layout QA system.
 * Combines measurement (Puppeteer) + checks (geometry rules) into one call.
 */

import { measureSlides } from "./measure"
import { runChecks, formatReport } from "./checks"
import type { QAReport } from "./checks"

export type { QAReport, SlideReport, LayoutIssue, IssueSeverity } from "./checks"

/**
 * Run a full layout QA pass on `htmlFilePath`.
 *
 * 1. Opens the file in headless Chrome (puppeteer-core)
 * 2. Measures each .slide element's geometry
 * 3. Runs all checks (fill, whitespace, overflow, asymmetry, sparse)
 * 4. Returns a structured QAReport
 *
 * Throws if the file cannot be opened or Chrome is not found.
 */
export async function runQA(htmlFilePath: string): Promise<QAReport> {
  const metrics = await measureSlides(htmlFilePath)
  return runChecks(htmlFilePath, metrics)
}

/**
 * Run QA and return a formatted markdown report string.
 * Suitable for injecting into tool output or sending as a message to the LLM.
 */
export async function runQAFormatted(htmlFilePath: string): Promise<string> {
  const report = await runQA(htmlFilePath)
  return formatReport(report)
}

export { formatReport } from "./checks"
