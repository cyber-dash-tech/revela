/**
 * tools/pptx.ts
 *
 * revela-pptx — Export a Revela HTML slide deck to editable PPTX.
 */

import { tool } from "@opencode-ai/plugin"
import { existsSync } from "fs"
import { resolve } from "path"
import { exportToPptx } from "../lib/pptx/export"
import { assertExportQAPassed } from "../lib/qa/export-gate"

export default tool({
  description:
    "Export a Revela-generated HTML slide deck to editable PPTX. " +
    "Runs pre-export QA before writing the PPTX. " +
    "Output is written beside the input file with the same basename and a .pptx extension.",
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

    const progress: string[] = []

    try {
      await assertExportQAPassed(filePath)
      const result = await exportToPptx(filePath, {
        onProgress: (event) => {
          progress.push(event.message)
        },
      })
      return JSON.stringify({ ok: true, ...result, progress }, null, 2)
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: e?.message ?? String(e), progress })
    }
  },
})
