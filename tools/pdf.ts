/**
 * tools/pdf.ts
 *
 * revela-pdf — Export a Revela HTML slide deck to PDF.
 */

import { tool } from "@opencode-ai/plugin"
import { existsSync } from "fs"
import { resolve } from "path"
import { exportToPdf } from "../lib/pdf/export"
import { recordRenderedArtifact, workspaceRelative } from "../lib/workspace-state/rendered-artifacts"

export default tool({
  description:
    "Export HTML to PDF. Revela deck HTML exports as a multi-page deck PDF; non-deck HTML falls back to a single-page artifact PDF. " +
    "Output is written beside the input file with the same basename and a .pdf extension.",
  args: {
    file: tool.schema
      .string()
      .describe(
        "Path to the HTML slide file to export. " +
        "Can be absolute or relative to the current working directory."
      ),
  },
  async execute({ file }, { directory }) {
    const filePath = resolve(directory || process.cwd(), file)

    if (!existsSync(filePath)) {
      return JSON.stringify({ ok: false, error: `File not found: ${filePath}` })
    }

    if (!/\.html?$/i.test(filePath)) {
      return JSON.stringify({ ok: false, error: `File must be an HTML file: ${filePath}` })
    }

    try {
      const root = directory || process.cwd()
      const result = await exportToPdf(filePath)
      recordRenderedArtifact(root, {
        sourceHtmlPath: workspaceRelative(resolve(root), filePath),
        outputPath: result.outputPath,
        type: "pdf",
        actor: "revela-pdf",
      })
      return JSON.stringify({ ok: true, ...result }, null, 2)
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: e?.message ?? String(e) })
    }
  },
})
