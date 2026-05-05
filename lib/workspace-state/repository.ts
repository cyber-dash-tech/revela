import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { WORKSPACE_STATE_FILE, type WorkspaceStateRepositoryOptions } from "./types"

export function workspaceStatePath(workspaceRoot: string, fileName = WORKSPACE_STATE_FILE): string {
  return join(workspaceRoot, fileName)
}

export function hasWorkspaceState(workspaceRoot: string, fileName = WORKSPACE_STATE_FILE): boolean {
  return existsSync(workspaceStatePath(workspaceRoot, fileName))
}

export function readWorkspaceState<TState>(workspaceRoot: string, options: WorkspaceStateRepositoryOptions<TState> = {}): TState {
  const parsed = JSON.parse(readFileSync(workspaceStatePath(workspaceRoot, options.fileName), "utf-8")) as TState
  return options.normalize ? options.normalize(parsed) : parsed
}

export function writeWorkspaceState<TState>(workspaceRoot: string, state: TState, options: WorkspaceStateRepositoryOptions<TState> = {}): void {
  const filePath = workspaceStatePath(workspaceRoot, options.fileName)
  const next = options.normalize ? options.normalize(state) : state
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n", "utf-8")
}

export function readOrCreateWorkspaceState<TState>(
  workspaceRoot: string,
  createState: () => TState,
  options: WorkspaceStateRepositoryOptions<TState> = {},
): TState {
  if (hasWorkspaceState(workspaceRoot, options.fileName)) return readWorkspaceState(workspaceRoot, options)

  const state = createState()
  writeWorkspaceState(workspaceRoot, state, options)
  return state
}

export function loadCanonicalState<TState>(workspaceRoot: string, options: WorkspaceStateRepositoryOptions<TState> = {}): TState {
  return readWorkspaceState(workspaceRoot, options)
}

export function saveCanonicalState<TState>(workspaceRoot: string, state: TState, options: WorkspaceStateRepositoryOptions<TState> = {}): void {
  writeWorkspaceState(workspaceRoot, state, options)
}
