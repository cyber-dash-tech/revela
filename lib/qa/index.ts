/**
 * lib/qa/index.ts
 *
 * Public entry point for hard-error slide QA.
 * Runs overflow measurement only; design compliance is an automatic post-write
 * hook concern, not part of manual/export QA.
 */

import { measureSlides } from "./measure"
import { runChecks, formatReport } from "./checks"
import type { QAReport } from "./checks"
import type { DesignClassVocabulary } from "../design/designs"

export type { QAReport, SlideReport, LayoutIssue, IssueSeverity } from "./checks"
export type { RunChecksOptions } from "./checks"

/**
 * Run hard-error QA on `htmlFilePath`.
 *
 * 1. Opens the file in headless Chrome (puppeteer-core)
 * 2. Measures each .slide element's geometry + CSS class definitions
 * 3. Runs hard-error overflow checks only
 * 4. Returns a structured QAReport
 *
 * Pass `vocabulary` (from `extractDesignClasses()`) to enable compliance checks.
 * Omit it to run geometry-only checks (backward compatible).
 *
 * Throws if the file cannot be opened or Chrome is not found.
 */
export async function runQA(
  htmlFilePath: string,
  _vocabulary?: DesignClassVocabulary,
): Promise<QAReport> {
  const result = await measureSlides(htmlFilePath)
  return runChecks(htmlFilePath, result.slides)
}

/**
 * Run QA and return a formatted markdown report string.
 * Suitable for injecting into tool output or sending as a message to the LLM.
 */
export async function runQAFormatted(
  htmlFilePath: string,
  vocabulary?: DesignClassVocabulary,
): Promise<string> {
  const report = await runQA(htmlFilePath, vocabulary)
  return formatReport(report)
}

export { formatReport } from "./checks"
export { runComplianceQA } from "./compliance"
