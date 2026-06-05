import { existsSync } from "fs"
import { join } from "path"
import { existingWorkspaceMetaPath, workspaceMetaPath } from "../workspace-meta"
import { NARRATIVE_VAULT_DIR } from "./constants"

export function narrativeVaultPath(workspaceRoot: string): string {
  return join(workspaceRoot, NARRATIVE_VAULT_DIR)
}

export function narrativeVaultCachePath(workspaceRoot: string): string {
  return workspaceMetaPath(workspaceRoot, "narrative-cache")
}

export function existingNarrativeVaultCachePath(workspaceRoot: string): string {
  return existingWorkspaceMetaPath(workspaceRoot, "narrative-cache")
}

export function hasNarrativeVault(workspaceRoot: string): boolean {
  return existsSync(narrativeVaultPath(workspaceRoot))
}

export function vaultRelativePath(filePath: string): string {
  return filePath.split(/[/\\]+/).join("/")
}
