/**
 * lib/qa/index.ts
 *
 * Public entry point for browser-rendered slide QA.
 * Combined artifact QA, including contract and component compliance, lives in
 * `lib/qa/artifact.ts`.
 */

import { measureSlides } from "./measure"
import { runChecks, formatReport } from "./checks"
import type { LayoutIssue, QAReport } from "./checks"
import type { DesignClassVocabulary } from "../design/designs"
import { existsSync, readFileSync } from "fs"
import { dirname, resolve } from "path"

export type { QAReport, SlideReport, LayoutIssue, IssueSeverity } from "./checks"
export type { RunChecksOptions } from "./checks"

/**
 * Run hard-error QA on `htmlFilePath`.
 *
 * 1. Opens the file in headless Chrome (puppeteer-core)
 * 2. Measures each .slide element's geometry, scroll state, text clipping,
 *    content-density signals, and CSS class definitions
 * 3. Runs browser QA checks for exact 1920x1080 slides, scrollbars, overflow,
 *    text clipping, and claim/evidence density warnings
 * 4. Returns a structured QAReport
 *
 * The optional `vocabulary` argument is retained for backward compatibility;
 * design compliance is handled by combined artifact QA.
 *
 * Throws if the file cannot be opened or Chrome is not found.
 */
export async function runQA(
  htmlFilePath: string,
  _vocabulary?: DesignClassVocabulary,
): Promise<QAReport> {
  const result = await measureSlides(htmlFilePath)
  const report = runChecks(htmlFilePath, result.slides)
  return withAssetChecks(report, htmlFilePath)
}

function withAssetChecks(report: QAReport, htmlFilePath: string): QAReport {
  const issues = scanAssetRefs(htmlFilePath)
  if (!issues.length) return report
  const slides = [...report.slides]
  const first = slides[0] ?? { index: 1, title: "Deck", issues: [] }
  slides[0] = { ...first, issues: [...first.issues, ...issues] }
  const errorCount = report.errorCount + issues.filter((issue) => issue.severity === "error").length
  const warningCount = report.warningCount + issues.filter((issue) => issue.severity === "warning").length
  return {
    ...report,
    slides,
    totalIssues: report.totalIssues + issues.length,
    errorCount,
    warningCount,
    summary: errorCount === 0
      ? `QA passed with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
      : `QA failed with ${errorCount} error${errorCount === 1 ? "" : "s"} and ${warningCount} warning${warningCount === 1 ? "" : "s"}.`,
  }
}

function scanAssetRefs(htmlFilePath: string): LayoutIssue[] {
  let html = ""
  try {
    html = readFileSync(htmlFilePath, "utf-8")
  } catch {
    return []
  }
  const refs = new Set<string>()
  const attrPattern = /\b(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let match: RegExpExecArray | null
  while ((match = attrPattern.exec(html))) refs.add(match[1] ?? match[2] ?? match[3] ?? "")
  const cssPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi
  while ((match = cssPattern.exec(html))) refs.add(match[1] ?? match[2] ?? match[3] ?? "")

  const issues: LayoutIssue[] = []
  for (const raw of refs) {
    const ref = raw.trim()
    if (!ref || ref.startsWith("data:") || ref.startsWith("#") || ref.startsWith("mailto:") || ref.startsWith("tel:")) continue
    if (/^https?:\/\//i.test(ref) || ref.startsWith("//")) {
      if (isAllowedRemoteRuntimeRef(ref)) continue
      issues.push({ type: "asset", sub: "remote_url", severity: "error", detail: `Deck HTML references remote asset URL \`${ref}\`. Save network images to workspace assets and reference the local file instead.` })
      continue
    }
    if (ref.includes("/__revela_asset")) {
      issues.push({ type: "asset", sub: "refine_proxy", severity: "error", detail: `Deck HTML references Refine proxy URL \`${ref}\`. Use the saved workspace asset path instead.` })
      continue
    }
    if (!looksLikeImageRef(ref)) continue
    const pathOnly = safeDecode(ref.split(/[?#]/)[0])
    const resolved = resolve(dirname(htmlFilePath), pathOnly)
    if (!existsSync(resolved)) {
      issues.push({ type: "asset", sub: "missing_file", severity: "error", detail: `Deck HTML references missing image asset \`${ref}\`. Use a path relative to the deck HTML file or save the asset into workspace assets first.` })
    }
  }
  return issues
}

function isAllowedRemoteRuntimeRef(ref: string): boolean {
  try {
    const url = new URL(ref.startsWith("//") ? `https:${ref}` : ref)
    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return true
    if (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/npm/echarts@")) return true
  } catch {
    return false
  }
  return false
}

function looksLikeImageRef(ref: string): boolean {
  return /\.(?:png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i.test(ref)
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
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
