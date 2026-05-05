import { hasDecksState, readDecksState, type DecksState } from "../decks-state"
import { compileInspectionContext } from "../inspection-context/compile"
import { matchInspectionElement, type InspectionElementSnapshot } from "../inspection-context/match"
import { projectInspectionMatch, type InspectionPromptProjection } from "../inspection-context/project"
import { buildDeterministicInspectionResult, type InspectionResult } from "../inspection-context/result"

export interface InspectElementResult {
  requestId?: string
  result: InspectionResult
}

export interface InspectElementProjectionResult {
  requestId?: string
  projection: InspectionPromptProjection
  preprocess: InspectionResult
}

export function inspectElementInState(
  state: DecksState,
  snapshot: InspectionElementSnapshot,
  options: { requestId?: string; staleReason?: string; slug?: string } = {},
): InspectElementResult {
  const context = compileInspectionContext(state, options.slug)
  const match = matchInspectionElement(context, snapshot)
  const projection = projectInspectionMatch(context, match, snapshot)
  return {
    requestId: options.requestId,
    result: buildDeterministicInspectionResult(projection, {
      requestId: options.requestId,
      staleReason: options.staleReason,
    }),
  }
}

export function projectElementInState(
  state: DecksState,
  snapshot: InspectionElementSnapshot,
  options: { requestId?: string; slug?: string } = {},
): InspectElementProjectionResult {
  const context = compileInspectionContext(state, options.slug)
  const match = matchInspectionElement(context, snapshot)
  const projection = projectInspectionMatch(context, match, snapshot)
  return {
    requestId: options.requestId,
    projection,
    preprocess: buildDeterministicInspectionResult(projection, { requestId: options.requestId }),
  }
}

export function inspectWorkspaceElement(
  workspaceRoot: string,
  snapshot: InspectionElementSnapshot,
  options: { requestId?: string; staleReason?: string; slug?: string } = {},
): InspectElementResult {
  if (!hasDecksState(workspaceRoot)) {
    throw new Error("DECKS.json is required before inspection. Run /revela init first.")
  }
  return inspectElementInState(readDecksState(workspaceRoot), snapshot, options)
}

export function projectWorkspaceElement(
  workspaceRoot: string,
  snapshot: InspectionElementSnapshot,
  options: { requestId?: string; slug?: string } = {},
): InspectElementProjectionResult {
  if (!hasDecksState(workspaceRoot)) {
    throw new Error("DECKS.json is required before inspection. Run /revela init first.")
  }
  return projectElementInState(readDecksState(workspaceRoot), snapshot, options)
}
