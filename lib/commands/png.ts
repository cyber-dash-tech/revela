import { resolve } from "path"
import { exportDeckToPng } from "../pdf/export"

export async function handlePng(
  rawPath: string,
  send: (text: string) => Promise<void>,
  workspaceRoot = process.cwd(),
): Promise<void> {
  const requested = rawPath.trim()
  if (requested.split(/\s+/).filter(Boolean).length > 1) {
    await send("Usage: `/revela export --deck png [file.html]`.")
    return
  }

  const file = requested || "decks/deck.html"
  try {
    const result = await exportDeckToPng(resolve(workspaceRoot, file))
    await send([
      "**PNG export complete**",
      "",
      `Output directory: \`${result.outputDir}\``,
      `Slides: ${result.slideCount}`,
      `Duration: ${result.durationMs}ms`,
    ].join("\n"))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await send(`**PNG export failed**\n\n\`\`\`\n${msg}\n\`\`\``)
  }
}
