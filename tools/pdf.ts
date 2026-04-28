/**
 * tools/pdf.ts
 *
 * revela-pdf — Export a Revela HTML slide deck to PDF.
 */

import { tool } from "@opencode-ai/plugin"
import { existsSync } from "fs"
import { resolve } from "path"
import { exportToPdf } from "../lib/pdf/export"

export default tool({
  description:
    "Export a Revela-generated HTML slide deck to PDF. " +
    "Use this after the deck HTML has been written and layout QA has passed. " +
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
      const result = await exportToPdf(filePath)
      return JSON.stringify({ ok: true, ...result }, null, 2)
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: e?.message ?? String(e) })
    }
  },
})
