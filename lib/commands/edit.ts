import { openEditableDeck } from "../edit/open"

export async function handleEdit(
  options: { client: any; sessionID: string; workspaceRoot: string },
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    const result = openEditableDeck("", {
      client: options.client,
      sessionID: options.sessionID,
      workspaceRoot: options.workspaceRoot,
    })

    await send(
      `Opened visual editor for the only deck in \`decks/\`.\n` +
      `File: \`${result.deck.file}\`\n` +
      `${result.stateNote}\n` +
      `URL: ${result.url}\n\n` +
      `Use Ctrl/Cmd + click in the browser to reference elements, write a comment, then send comments. Revela mode has been enabled for the edit prompt.`
    )
  } catch (e: any) {
    await send(`**Edit failed:** ${e.message || String(e)}`)
  }
}
