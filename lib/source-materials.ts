import { createHash } from "crypto"
import { existsSync, realpathSync, statSync } from "fs"
import { extname, isAbsolute, join, relative, resolve, sep } from "path"
import {
  type DecksState,
  type SourceMaterial,
} from "./decks-state"

export type SourceMaterialStatus = NonNullable<SourceMaterial["status"]>

export function ensureWorkspaceFile(filePath: string, workspaceRoot: string): string {
  const resolvedWorkspace = realpathSync(resolve(workspaceRoot))
  const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(workspaceRoot, filePath)
  const resolvedFile = existsSync(candidate) ? realpathSync(candidate) : candidate

  if (resolvedFile !== resolvedWorkspace && !resolvedFile.startsWith(resolvedWorkspace + sep)) {
    throw new Error("file must be within workspace")
  }

  return resolvedFile
}

export function workspaceRelativePath(filePath: string, workspaceRoot: string): string {
  const resolvedWorkspace = realpathSync(resolve(workspaceRoot))
  const candidate = resolve(filePath)
  const resolvedFile = existsSync(candidate) ? realpathSync(candidate) : candidate
  return relative(resolvedWorkspace, resolvedFile).replace(/\\/g, "/")
}

export function sourceMaterialType(filePath: string): string {
  return extname(filePath).replace(/^\./, "").toLowerCase() || "other"
}

export function computeSourceFingerprint(filePath: string): string {
  const stat = statSync(filePath)
  return createHash("sha1")
    .update(`${resolve(filePath)}:${stat.mtimeMs}:${stat.size}`)
    .digest("hex")
}

export function sourceMaterialMetadata(filePath: string, workspaceRoot: string): SourceMaterial {
  const resolvedFile = ensureWorkspaceFile(filePath, workspaceRoot)
  const stat = statSync(resolvedFile)
  return {
    path: workspaceRelativePath(resolvedFile, workspaceRoot),
    type: sourceMaterialType(resolvedFile),
    size: stat.size,
    fingerprint: computeSourceFingerprint(resolvedFile),
  }
}

export function hasValidExtraction(material: SourceMaterial, workspaceRoot: string): boolean {
  const extraction = material.extraction
  if (!extraction?.manifestPath || !extraction.textPath || !extraction.cacheDir) return false
  return [extraction.manifestPath, extraction.textPath, extraction.cacheDir]
    .every((item) => existsSync(join(workspaceRoot, item)))
}

export function upsertSourceMaterial(
  state: DecksState,
  material: SourceMaterial,
  status: SourceMaterialStatus = material.status ?? "discovered",
): DecksState {
  const now = new Date().toISOString()
  const list = state.workspace.sourceMaterials ?? []
  const path = material.path.replace(/\\/g, "/")
  const existingIndex = list.findIndex((entry) => entry.path === path)
  const existing = existingIndex >= 0 ? list[existingIndex] : undefined
  const changedFingerprint = Boolean(existing?.fingerprint && material.fingerprint && existing.fingerprint !== material.fingerprint)
  const nextStatus = changedFingerprint
    ? status === "extracted" ? "extracted" : "discovered"
    : status === "discovered" && existing?.status ? existing.status : status

  const next: SourceMaterial = {
    ...existing,
    ...material,
    path,
    type: material.type ?? existing?.type,
    status: nextStatus,
    firstSeen: existing?.firstSeen ?? material.firstSeen ?? now,
    lastChecked: now,
  }

  if (changedFingerprint && status !== "extracted") {
    delete next.extraction
    delete next.lastExtracted
  }

  if (existingIndex >= 0) list[existingIndex] = next
  else list.push(next)
  state.workspace.sourceMaterials = list.sort((a, b) => a.path.localeCompare(b.path))
  return state
}
