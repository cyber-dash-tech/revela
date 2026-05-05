import { openInspectDeck } from "../inspect/open"

export async function handleInspect(
  options: { client: any; sessionID: string; workspaceRoot: string },
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    const result = openInspectDeck("", {
      client: options.client,
      sessionID: options.sessionID,
      workspaceRoot: options.workspaceRoot,
    })
    await send(
      `Opened Evidence Inspector for the active HTML deck.\n` +
      `File: \`${result.deck.file}\`\n` +
      `${result.stateNote}\n` +
      `URL: ${result.url}\n\n` +
      `Use Ctrl/Cmd-click in the browser to reference deck elements exactly like /revela edit, then click Inspect Selection. Deterministic Source/Purpose preprocessing appears first, followed by lazy LLM-generated cards. Selection is locked while the request is processed. There is no chat box or freeform prompt.`
    )
  } catch (e: any) {
    await send(`**Inspect failed:** ${e.message || String(e)}`)
  }
}
