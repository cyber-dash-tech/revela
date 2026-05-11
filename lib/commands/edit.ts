export async function handleEdit(
  options: { client: any; sessionID: string; workspaceRoot: string; openBrowser?: boolean },
  send: (text: string) => Promise<void>,
): Promise<void> {
  void options
  await send("`/revela edit` has been removed. Use `/revela refine --deck` for the unified reading, inspection, and editing workspace.")
}
