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
  reusedSession: boolean
  liveSession: boolean
  openedBrowser: boolean
}

export interface OpenEditableDeckOptions {
  client: any
  sessionID: string
  workspaceRoot: string
  openBrowser?: boolean
  openUrl?: (url: string) => void
}

export interface EnsureEditableDeckOpenResult extends OpenEditableDeckResult {
  skippedReason?: "live-session"
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
  return openEditableDeckInternal(target, options, { skipLiveSession: false })
}

export function ensureEditableDeckOpenForChange(
  target: string,
  options: OpenEditableDeckOptions,
): EnsureEditableDeckOpenResult {
  return openEditableDeckInternal(target, options, { skipLiveSession: true })
}

function openEditableDeckInternal(
  target: string,
  options: OpenEditableDeckOptions,
  behavior: { skipLiveSession: boolean },
): EnsureEditableDeckOpenResult {
  const deck = resolveEditableDeck(options.workspaceRoot, target)
  const preflight = ensureEditableDeckState(options.workspaceRoot, deck)

  ctx.enabled = true
  if (!existsSync(ACTIVE_PROMPT_FILE)) {
    seedBuiltinDesigns()
    seedBuiltinDomains()
    buildPrompt()
  }

  const editServer = startEditServer()
  const session = editServer.getOrCreateSession({
    client: options.client,
    sessionID: options.sessionID,
    workspaceRoot: options.workspaceRoot,
    deck,
  })
  const url = `${editServer.baseUrl}/edit?token=${encodeURIComponent(session.token)}`
  const shouldOpen = options.openBrowser !== false && !(behavior.skipLiveSession && session.live)
  if (shouldOpen) (options.openUrl ?? openUrl)(url)

  const source = deck.source === "decks-state" ? "DECKS.json" : deck.source === "file-path" ? "file path" : "fallback path"
  const stateNote = preflight.changed ? "Deck state was prepared in DECKS.json for visual editing." : "Deck state already points to this visual edit target."

  return {
    deck,
    url,
    source,
    stateNote,
    preflightChanged: preflight.changed,
    reusedSession: session.reused,
    liveSession: session.live,
    openedBrowser: shouldOpen,
    skippedReason: behavior.skipLiveSession && session.live ? "live-session" : undefined,
  }
}
