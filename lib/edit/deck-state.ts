import type { EditableDeck } from "./resolve-deck"

export interface EditDeckStatePreflightResult {
  changed: boolean
}

export function ensureEditableDeckState(workspaceRoot: string, deck: EditableDeck): EditDeckStatePreflightResult {
  void workspaceRoot
  void deck
  return { changed: false }
}
