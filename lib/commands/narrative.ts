import { hasDecksState, readDecksState } from "../decks-state"
import { buildNarrativeMap, formatNarrativeMap } from "../narrative-state/map"

export async function handleNarrative(
  options: { workspaceRoot: string },
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    if (!hasDecksState(options.workspaceRoot)) {
      await send("No `DECKS.json` found. Run `/revela init` first to initialize the narrative workspace.")
      return
    }

    const state = readDecksState(options.workspaceRoot)
    const map = buildNarrativeMap(state)
    await send(formatNarrativeMap(map))
  } catch (e: any) {
    await send(`**Narrative map failed:** ${e.message || String(e)}`)
  }
}
