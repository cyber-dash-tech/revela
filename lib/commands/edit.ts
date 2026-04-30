import { openEditableDeck } from "../edit/open"

export async function handleEdit(
  input: string,
  options: { client: any; sessionID: string; workspaceRoot: string },
  send: (text: string) => Promise<void>,
): Promise<void> {
  const target = input.trim()
  if (!target) {
    await send("**Usage:** `/revela edit <deck-slug|decks/file.html>`\n\nExamples: `/revela edit investor-update`, `/revela edit decks/investor-update.html`")
    return
  }

  try {
    const result = openEditableDeck(target, {
      client: options.client,
      sessionID: options.sessionID,
      workspaceRoot: options.workspaceRoot,
    })

    await send(
      `Opened visual editor for deck \`${result.deck.slug}\`.\n` +
      `File: \`${result.deck.file}\` (${result.source})\n` +
      `${result.stateNote}\n` +
      `URL: ${result.url}\n\n` +
      `Use Ctrl/Cmd + click in the browser to reference elements, write a comment, then send comments. Revela mode has been enabled for the edit prompt.`
    )
  } catch (e: any) {
    await send(`**Edit failed:** ${e.message || String(e)}`)
  }
}
