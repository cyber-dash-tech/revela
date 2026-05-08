import { openRefineDeck } from "../refine/open"

export async function handleInspect(
  options: { client: any; sessionID: string; workspaceRoot: string; openBrowser?: boolean },
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    const result = openRefineDeck("", {
      client: options.client,
      sessionID: options.sessionID,
      workspaceRoot: options.workspaceRoot,
      mode: "inspect",
      openBrowser: options.openBrowser,
    })
    await send(
      `\`/revela inspect\` is deprecated. Opened \`/revela refine\` in Inspect mode for the active HTML deck.\n` +
      `File: \`${result.deck.file}\`\n` +
      `${result.stateNote}\n` +
      `URL: ${result.url}\n\n` +
      `Use \`/revela refine\` directly going forward. Use Ctrl/Cmd-click in the browser to reference deck elements, then use the Inspect tab for read-only Source/Purpose review. There is no chat box or freeform prompt.`
    )
  } catch (e: any) {
    await send(`**Inspect failed:** ${e.message || String(e)}`)
  }
}
