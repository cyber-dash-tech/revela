import { openRefineDeck } from "../refine/open"
import type { RefineMode } from "../refine/server"

export async function handleRefine(
  options: { client: any; sessionID: string; workspaceRoot: string; mode?: RefineMode },
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    const result = openRefineDeck("", {
      client: options.client,
      sessionID: options.sessionID,
      workspaceRoot: options.workspaceRoot,
      mode: options.mode ?? "edit",
    })

    await send(
      `Opened Revela Review for the active HTML deck.\n` +
      `File: \`${result.deck.file}\`\n` +
      `${result.stateNote}\n` +
      `URL: ${result.url}\n\n` +
      `Use Ctrl/Cmd-click in the browser to reference deck elements. The Comment tab sends targeted change comments; the Insight tab reviews the same selection with Source/Purpose cards and does not edit the deck.`
    )
  } catch (e: any) {
    await send(`**Review failed:** ${e.message || String(e)}`)
  }
}
