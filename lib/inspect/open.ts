import { existsSync } from "fs"
import { ACTIVE_PROMPT_FILE } from "../config"
import { ctx } from "../ctx"
import { seedBuiltinDesigns } from "../design/designs"
import { seedBuiltinDomains } from "../domain/domains"
import { ensureEditableDeckState } from "../edit/deck-state"
import { openUrl } from "../edit/open"
import { resolveEditableDeck, type EditableDeck } from "../edit/resolve-deck"
import { buildPrompt } from "../prompt-builder"
import { startInspectServer } from "./server"

export interface OpenInspectDeckResult {
  deck: EditableDeck
  url: string
  source: string
  stateNote: string
  preflightChanged: boolean
  reusedSession: boolean
  openedBrowser: boolean
}

export interface OpenInspectDeckOptions {
  client: any
  sessionID: string
  workspaceRoot: string
  openBrowser?: boolean
  openUrl?: (url: string) => void
}

export function openInspectDeck(target: string, options: OpenInspectDeckOptions): OpenInspectDeckResult {
  const deck = resolveEditableDeck(options.workspaceRoot, target)
  const preflight = ensureEditableDeckState(options.workspaceRoot, deck)

  ctx.enabled = true
  if (!existsSync(ACTIVE_PROMPT_FILE)) {
    seedBuiltinDesigns()
    seedBuiltinDomains()
    buildPrompt()
  }

  const inspectServer = startInspectServer()
  const session = inspectServer.getOrCreateSession({
    client: options.client,
    sessionID: options.sessionID,
    workspaceRoot: options.workspaceRoot,
    deck,
  })
  const url = `${inspectServer.baseUrl}/inspect?token=${encodeURIComponent(session.token)}`
  const shouldOpen = options.openBrowser !== false
  if (shouldOpen) (options.openUrl ?? openUrl)(url)

  return {
    deck,
    url,
    source: deck.source === "render-target" ? "render target" : deck.source === "decks-state" ? "DECKS.json" : deck.source === "file-path" ? "file path" : "fallback path",
    stateNote: preflight.changed ? "Deck state was prepared in DECKS.json for inspection." : "Deck state already points to this inspection target.",
    preflightChanged: preflight.changed,
    reusedSession: session.reused,
    openedBrowser: shouldOpen,
  }
}
