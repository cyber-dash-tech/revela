import { existsSync } from "fs"
import { join } from "path"

export const WORKSPACE_META_DIR = ".revela"
export const LEGACY_WORKSPACE_META_DIR = ".opencode/revela"

export function workspaceMetaPath(workspaceRoot: string, ...segments: string[]): string {
  return join(workspaceRoot, WORKSPACE_META_DIR, ...segments)
}

export function legacyWorkspaceMetaPath(workspaceRoot: string, ...segments: string[]): string {
  return join(workspaceRoot, LEGACY_WORKSPACE_META_DIR, ...segments)
}

export function existingWorkspaceMetaPath(workspaceRoot: string, ...segments: string[]): string {
  const current = workspaceMetaPath(workspaceRoot, ...segments)
  if (existsSync(current)) return current
  const legacy = legacyWorkspaceMetaPath(workspaceRoot, ...segments)
  return existsSync(legacy) ? legacy : current
}

export function workspaceMetaRelativePath(...segments: string[]): string {
  return join(WORKSPACE_META_DIR, ...segments).replace(/\\/g, "/")
}

export function isWorkspaceMetaRelativePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "")
  return normalized === WORKSPACE_META_DIR ||
    normalized.startsWith(`${WORKSPACE_META_DIR}/`) ||
    normalized === ".opencode" ||
    normalized.startsWith(".opencode/")
}
