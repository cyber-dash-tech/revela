import type { DecksState } from "../decks-state"
import type { DecksStateV1Projection, WorkspaceState } from "./types"

export function isDecksStateV1(state: WorkspaceState): state is DecksState {
  return state.version === 1
}

export function asDecksStateV1Projection(state: DecksState): DecksStateV1Projection {
  return state
}
