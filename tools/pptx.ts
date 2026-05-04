/**
 * tools/pptx.ts
 *
 * revela-pptx — Export a Revela HTML slide deck to editable PPTX.
 */

import { tool } from "@opencode-ai/plugin"
import { existsSync } from "fs"
import { resolve } from "path"
import { exportToPptx } from "../lib/pptx/export"

export default tool({
  description:
    "Export a Revela-generated HTML slide deck to editable PPTX. " +
    "Output is written beside the input file with the same basename and a .pptx extension.",
  args: {
    file: tool.schema
      .string()
      .describe(
        "Path to the HTML slide file to export. " +
        "Can be absolute or relative to the current working directory."
      ),
    speakerNotes: tool.schema.array(tool.schema.object({
      index: tool.schema.number().describe("1-based slide index."),
      notes: tool.schema.string().describe("Speaker notes for this slide. Use an empty string for no notes."),
    })).optional().describe(
      "Optional PowerPoint speaker notes to write during export. " +
      "When provided, these override any fallback notes embedded in the HTML."
    ),
  },
  async execute({ file, speakerNotes }, { directory }) {
    const filePath = resolve(directory || process.cwd(), file)

    if (!existsSync(filePath)) {
      return JSON.stringify({ ok: false, error: `File not found: ${filePath}` })
    }

    if (!/\.html?$/i.test(filePath)) {
      return JSON.stringify({ ok: false, error: `File must be an HTML file: ${filePath}` })
    }

    const progress: string[] = []

    try {
      const result = await exportToPptx(filePath, {
        speakerNotes: normalizeSpeakerNotes(speakerNotes),
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

function normalizeSpeakerNotes(
  input?: Array<{ index?: number; notes?: string }>,
): Array<string | null | undefined> | undefined {
  if (!input) return undefined

  const notesBySlide: Array<string | null | undefined> = []
  for (const item of input) {
    const index = Math.floor(Number(item.index ?? 0))
    if (index < 1) continue
    notesBySlide[index - 1] = item.notes ?? ""
  }
  return notesBySlide
}
