export async function handleInspect(
  options: { client: any; sessionID: string; workspaceRoot: string; openBrowser?: boolean },
  send: (text: string) => Promise<void>,
): Promise<void> {
  void options
  await send("`/revela inspect` is no longer a public command. Use `/revela refine --deck` and the Inspect tab for grounded Source/Purpose/Narrative Reading.")
}
