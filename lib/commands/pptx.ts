/**
 * lib/commands/pptx.ts
 *
 * Handler for `/revela pptx <file_path>` — exports an HTML slide deck to PPTX.
 *
 * Output: same directory and base name as the input, with .pptx extension.
 * Example: decks/my-deck.html → decks/my-deck.pptx
 */

import { resolve } from "path"
import { exportToPptx } from "../pptx/export"

function formatSecs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export async function handlePptx(
  filePath: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  if (!filePath) {
    await send(
      "**Usage:** `/revela pptx <file_path>`\n\n" +
      "Example: `/revela pptx decks/my-deck.html`"
    )
    return
  }

  const abs = resolve(filePath)
  await send(`Exporting \`${abs}\` to PPTX...`)

  try {
    let lastSlideUpdate = 0
    let longDeckThreshold: number | null = null

    const result = await exportToPptx(filePath, {
      onProgress: async (progress) => {
        if (progress.kind === "stage") {
          await send(progress.message)
          return
        }

        const current = progress.current ?? 0
        const total = progress.total ?? 0
        if (!total) return

        if (longDeckThreshold === null) {
          longDeckThreshold = total >= 8 ? (total > 20 ? 5 : 2) : -1
        }
        if (longDeckThreshold < 0) return

        const shouldSend = current === 1 || current === total || current - lastSlideUpdate >= longDeckThreshold
        if (!shouldSend) return

        lastSlideUpdate = current
        await send(`Editable export progress: slide ${current}/${total}`)
      },
    })

    await send(
      `**PPTX exported successfully**\n\n` +
      `- Output: \`${result.outputPath}\`\n` +
      `- Slides: ${result.slideCount}\n` +
      `- Time: ${formatSecs(result.durationMs)}\n` +
      `- Prepare: ${formatSecs(result.timingsMs.prepareMs)}\n` +
      `- Page setup: ${formatSecs(result.timingsMs.pageSetupMs)}\n` +
      `- Slide export: ${formatSecs(result.timingsMs.slideExportMs)}\n` +
      `- Merge: ${formatSecs(result.timingsMs.mergeMs)}\n` +
      `- Write: ${formatSecs(result.timingsMs.writeMs)}`
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await send(`**PPTX export failed**\n\n\`\`\`\n${msg}\n\`\`\``)
  }
}
