/**
 * lib/commands/pdf.ts
 *
 * Handler for `/revela pdf <file_path>` — exports an HTML slide deck to PDF.
 *
 * Output: same directory and base name as the input, with .pdf extension.
 * Example: slides/my-deck.html → slides/my-deck.pdf
 */

import { resolve } from "path"
import { exportToPdf } from "../pdf/export"

export async function handlePdf(
  filePath: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  if (!filePath) {
    await send(
      "**Usage:** `/revela pdf <file_path>`\n\n" +
      "Example: `/revela pdf slides/my-deck.html`"
    )
    return
  }

  const abs = resolve(filePath)
  await send(`Exporting \`${abs}\` to PDF...`)

  try {
    const result = await exportToPdf(filePath)
    const secs = (result.durationMs / 1000).toFixed(1)
    await send(
      `**PDF exported successfully**\n\n` +
      `- Output: \`${result.outputPath}\`\n` +
      `- Slides: ${result.slideCount}\n` +
      `- Time: ${secs}s`
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await send(`**PDF export failed**\n\n\`\`\`\n${msg}\n\`\`\``)
  }
}
