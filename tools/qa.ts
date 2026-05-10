/**
 * tools/qa.ts
 *
 * revela-qa — Artifact quality assurance for generated slide HTML files.
 *
 * Exposed as a manual diagnostic tool. Export commands run pre-export QA automatically.
 */

import { tool } from "@opencode-ai/plugin"
import { resolve } from "path"
import { existsSync } from "fs"
import { extractDesignClasses } from "../lib/design/designs"
import { formatArtifactQAReport, runArtifactQA } from "../lib/qa/artifact"

export default tool({
  description:
    "Run artifact QA on a generated slide HTML file. " +
    "Opens the file in a headless browser and measures actual rendered geometry. " +
    "Checks deck contract, component compliance, exact 1920x1080 canvas, scrollbars, element overflow, text overflow, and content/evidence density warnings. " +
    "Returns a structured report with specific issues and fix instructions. " +
    "Deck writes and PDF/PPTX export commands run QA automatically; call it directly for explicit diagnostics.",
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
      let vocabulary
      try {
        vocabulary = extractDesignClasses()
      } catch {
        // Design may not be installed or may have no markers.
      }
      const report = await runArtifactQA({ workspaceRoot: directory || process.cwd(), filePath, vocabulary })
      const formatted = formatArtifactQAReport(report)

      // Prepend a compact JSON summary for programmatic use if needed
      const jsonSummary = JSON.stringify({
        passed: report.passed,
        errors: report.hardErrorCount,
        warnings: report.warningCount,
      })

      return `<!-- QA Summary: ${jsonSummary} -->\n\n${formatted}`
    } catch (err: any) {
      return `Error running artifact QA: ${err?.message ?? String(err)}\n\nMake sure Chrome is installed at /Applications/Google Chrome.app`
    }
  },
})
