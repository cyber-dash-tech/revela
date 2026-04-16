/**
 * lib/qa/index.ts
 *
 * Public entry point for the slide layout QA system.
 * Combines measurement (Puppeteer) + checks (geometry rules) into one call.
 */

import { measureSlides } from "./measure"
import { runChecks, formatReport } from "./checks"
import type { QAReport, RunChecksOptions } from "./checks"
import type { DesignClassVocabulary } from "../design/designs"

export type { QAReport, SlideReport, LayoutIssue, IssueSeverity } from "./checks"
export type { RunChecksOptions } from "./checks"

/**
 * Run a full layout QA pass on `htmlFilePath`.
 *
 * 1. Opens the file in headless Chrome (puppeteer-core)
 * 2. Measures each .slide element's geometry + CSS class definitions
 * 3. Runs all checks (overflow, balance, symmetry, rhythm, compliance)
 * 4. Returns a structured QAReport
 *
 * Pass `vocabulary` (from `extractDesignClasses()`) to enable compliance checks.
 * Omit it to run geometry-only checks (backward compatible).
 *
 * Throws if the file cannot be opened or Chrome is not found.
 */
export async function runQA(
  htmlFilePath: string,
  vocabulary?: DesignClassVocabulary,
): Promise<QAReport> {
  const result = await measureSlides(htmlFilePath)
  const options: RunChecksOptions | undefined = vocabulary
    ? {
        allowedClasses: vocabulary.classes,
        prefixExemptions: vocabulary.prefixExemptions,
        cssDefinedClasses: result.cssDefinedClasses,
      }
    : undefined
  return runChecks(htmlFilePath, result.slides, options)
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
