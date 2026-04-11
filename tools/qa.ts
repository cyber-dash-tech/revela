/**
 * tools/qa.ts
 *
 * revela-qa — Layout quality assurance tool for generated slide HTML files.
 *
 * Exposed to the LLM so it can run layout checks after writing a slides file.
 * Also called automatically by the tool.execute.after hook in plugin.ts
 * when the LLM writes a file matching slides/*.html.
 */

import { tool } from "@opencode-ai/plugin"
import { resolve } from "path"
import { existsSync } from "fs"
import { runQA, formatReport } from "../lib/qa"

export default tool({
  description:
    "Run layout quality checks on a generated slide HTML file. " +
    "Opens the file in a headless browser and measures actual rendered geometry. " +
    "Checks for: canvas underfill (too much empty space), bottom whitespace, " +
    "left-right column asymmetry, element overflow, and card height variance. " +
    "Returns a structured report with specific issues and fix instructions. " +
    "Call this after writing or editing any slides/*.html file to verify layout quality.",
  args: {
    file: tool.schema
      .string()
      .describe(
        "Path to the HTML slide file to check. " +
        "Can be absolute or relative to the current working directory."
      ),
  },
  async execute({ file }, { directory }) {
    // Resolve path relative to working directory
    const filePath = resolve(directory || process.cwd(), file)

    if (!existsSync(filePath)) {
      return `Error: File not found: ${filePath}`
    }

    if (!filePath.endsWith(".html")) {
      return `Error: File must be an HTML file: ${filePath}`
    }

    try {
      const report = await runQA(filePath)
      const formatted = formatReport(report)

      // Prepend a compact JSON summary for programmatic use if needed
      const jsonSummary = JSON.stringify({
        totalIssues: report.totalIssues,
        errors: report.errorCount,
        warnings: report.warningCount,
        slidesWithIssues: report.slides.filter((s) => s.issues.length > 0).map((s) => s.index + 1),
      })

      return `<!-- QA Summary: ${jsonSummary} -->\n\n${formatted}`
    } catch (err: any) {
      return `Error running layout QA: ${err?.message ?? String(err)}\n\nMake sure Chrome is installed at /Applications/Google Chrome.app`
    }
  },
})
