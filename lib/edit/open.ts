import { existsSync } from "fs"
import { ctx } from "../ctx"
import { ACTIVE_PROMPT_FILE } from "../config"
import { seedBuiltinDesigns } from "../design/designs"
import { seedBuiltinDomains } from "../domain/domains"
import { buildPrompt } from "../prompt-builder"
import { ensureEditableDeckState } from "./deck-state"
import { resolveEditableDeck, type EditableDeck } from "./resolve-deck"
import { startEditServer } from "./server"

export interface OpenEditableDeckResult {
  deck: EditableDeck
  url: string
  source: string
  stateNote: string
  preflightChanged: boolean
}

export interface OpenEditableDeckOptions {
  client: any
  sessionID: string
  workspaceRoot: string
  openBrowser?: boolean
}

export function openUrl(url: string): void {
  if (process.platform === "darwin") {
    const proc = Bun.spawnSync(["open", url])
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open edit page")
    return
  }

  if (process.platform === "win32") {
    const proc = Bun.spawnSync(["cmd", "/c", "start", "", url])
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open edit page")
    return
  }

  const proc = Bun.spawnSync(["xdg-open", url])
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open edit page")
}

export function openEditableDeck(target: string, options: OpenEditableDeckOptions): OpenEditableDeckResult {
  const deck = resolveEditableDeck(options.workspaceRoot, target)
  const preflight = ensureEditableDeckState(options.workspaceRoot, deck)
  if (!preflight.readiness.ready) {
    throw new Error(preflight.readiness.blocker || "Deck is not ready for HTML edits.")
  }

  ctx.enabled = true
  if (!existsSync(ACTIVE_PROMPT_FILE)) {
    seedBuiltinDesigns()
    seedBuiltinDomains()
    buildPrompt()
  }

  const editServer = startEditServer()
  const token = editServer.createSession({
    client: options.client,
    sessionID: options.sessionID,
    deck,
  })
  const url = `${editServer.baseUrl}/edit?token=${encodeURIComponent(token)}`
  if (options.openBrowser !== false) openUrl(url)

  const source = deck.source === "decks-state" ? "DECKS.json" : deck.source === "file-path" ? "file path" : "fallback path"
  const stateNote = preflight.changed ? "Deck state was prepared in DECKS.json before opening the editor." : "Deck state is ready in DECKS.json."

  return {
    deck,
    url,
    source,
    stateNote,
    preflightChanged: preflight.changed,
  }
}
