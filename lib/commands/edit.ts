import { openRefineDeck } from "../refine/open"

export async function handleEdit(
  options: { client: any; sessionID: string; workspaceRoot: string; openBrowser?: boolean },
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    const result = openRefineDeck("", {
      client: options.client,
      sessionID: options.sessionID,
      workspaceRoot: options.workspaceRoot,
      mode: "edit",
      openBrowser: options.openBrowser,
    })

    await send(
      `\`/revela edit\` is deprecated. Opened \`/revela refine\` in Edit mode for the active HTML deck.\n` +
      `File: \`${result.deck.file}\`\n` +
      `${result.stateNote}\n` +
      `URL: ${result.url}\n\n` +
      `Use \`/revela refine\` directly going forward. Use Ctrl/Cmd-click in the browser to reference elements, then use the Edit tab to send targeted change comments.`
    )
  } catch (e: any) {
    await send(`**Edit failed:** ${e.message || String(e)}`)
  }
}
