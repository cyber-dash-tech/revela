import { createHash } from "crypto"
import type { DecksState } from "../decks-state"
import type { WorkspaceAction, WorkspaceActionType } from "./types"

export const MAX_WORKSPACE_ACTIONS = 500

export interface WorkspaceActionInput {
  type: WorkspaceActionType
  actor?: string
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  status?: WorkspaceAction["status"]
  summary?: string
  nodeIds?: string[]
  timestamp?: string
}

export function recordWorkspaceAction(state: DecksState, input: WorkspaceActionInput): DecksState {
  const actions = state.actions ?? []
  const timestamp = input.timestamp ?? new Date().toISOString()
  const action: WorkspaceAction = {
    id: workspaceActionId(input.type, timestamp, actions.length, input),
    type: input.type,
    timestamp,
    status: input.status ?? "success",
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.inputs ? { inputs: compactActionPayload(input.inputs) } : {}),
    ...(input.outputs ? { outputs: compactActionPayload(input.outputs) } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.nodeIds && input.nodeIds.length > 0 ? { nodeIds: [...new Set(input.nodeIds)].sort() } : {}),
  }

  state.actions = [...actions, action].slice(-MAX_WORKSPACE_ACTIONS)
  return state
}

export function compactActionPayload(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const compacted = compactActionValue(value)
    if (compacted !== undefined) output[key] = compacted
  }
  return output
}

export function workspaceActionId(type: WorkspaceActionType, timestamp: string, sequence: number, input: Omit<WorkspaceActionInput, "timestamp">): string {
  return `action:${timestamp}:${type}:${stableHash(JSON.stringify({ sequence, input: compactActionPayload(input as Record<string, unknown>) }))}`
}

function compactActionValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return trimmed.length > 500 ? `${trimmed.slice(0, 500).trimEnd()}... [truncated]` : trimmed
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) {
    const items = value.map(compactActionValue).filter((item) => item !== undefined)
    return items.length > 0 ? items.slice(0, 50) : undefined
  }
  if (typeof value === "object") {
    const compacted = compactActionPayload(value as Record<string, unknown>)
    return Object.keys(compacted).length > 0 ? compacted : undefined
  }
  return undefined
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 10)
}
