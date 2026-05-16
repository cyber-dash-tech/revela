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
    lastModified: new Date(stat.mtimeMs).toISOString(),
  }
}

export function sourceMaterialModifiedMs(material: SourceMaterial, workspaceRoot: string): number {
  if (material.lastModified) {
    const parsed = Date.parse(material.lastModified)
    if (Number.isFinite(parsed)) return parsed
  }

  try {
    return statSync(ensureWorkspaceFile(material.path, workspaceRoot)).mtimeMs
  } catch {
    return 0
  }
}

export interface SourceMaterialIngestPlan {
  vaultTimestamp: string | null
  vaultTimestampMs: number
  addedSourceMaterials: SourceMaterial[]
  changedSourceMaterials: SourceMaterial[]
  newerThanVaultSourceMaterials: SourceMaterial[]
  unchangedSourceMaterials: SourceMaterial[]
  ingestCandidates: SourceMaterial[]
  suggestedTasks: SourceMaterialIngestTask[]
}

export interface SourceMaterialIngestTask {
  path: string
  reason: Array<"added" | "changed" | "newer_than_vault">
  materialType: string
  needsExtraction: boolean
  suggestedAction: "read_directly" | "extract_then_read"
  note: string
}

export function classifySourceMaterialIngest(
  state: DecksState,
  materials: SourceMaterial[],
  workspaceRoot: string,
  vaultTimestampMs: number,
): SourceMaterialIngestPlan {
  const existingByPath = new Map((state.workspace.sourceMaterials ?? []).map((item) => [item.path.replace(/\\/g, "/"), item]))
  const addedSourceMaterials: SourceMaterial[] = []
  const changedSourceMaterials: SourceMaterial[] = []
  const newerThanVaultSourceMaterials: SourceMaterial[] = []
  const unchangedSourceMaterials: SourceMaterial[] = []
  const ingestByPath = new Map<string, SourceMaterial>()
  const reasonsByPath = new Map<string, SourceMaterialIngestTask["reason"]>()

  for (const material of materials) {
    const path = material.path.replace(/\\/g, "/")
    const existing = existingByPath.get(path)
    const added = !existing
    const changed = Boolean(existing?.fingerprint && material.fingerprint && existing.fingerprint !== material.fingerprint)
    const newerThanVault = sourceMaterialModifiedMs(material, workspaceRoot) > vaultTimestampMs
    const reasons: SourceMaterialIngestTask["reason"] = []

    if (added) addedSourceMaterials.push(material)
    if (changed) changedSourceMaterials.push(material)
    if (newerThanVault) newerThanVaultSourceMaterials.push(material)
    if (added) reasons.push("added")
    if (changed) reasons.push("changed")
    if (newerThanVault) reasons.push("newer_than_vault")
    if (added || changed || newerThanVault) {
      ingestByPath.set(path, material)
      reasonsByPath.set(path, reasons)
    }
    else unchangedSourceMaterials.push(material)
  }
  const ingestCandidates = [...ingestByPath.values()].sort((a, b) => a.path.localeCompare(b.path))

  return {
    vaultTimestamp: vaultTimestampMs > 0 ? new Date(vaultTimestampMs).toISOString() : null,
    vaultTimestampMs,
    addedSourceMaterials,
    changedSourceMaterials,
    newerThanVaultSourceMaterials,
    unchangedSourceMaterials,
    ingestCandidates,
    suggestedTasks: ingestCandidates.map((material) => sourceMaterialIngestTask(material, reasonsByPath.get(material.path.replace(/\\/g, "/")) ?? [])),
  }
}

function sourceMaterialIngestTask(material: SourceMaterial, reason: SourceMaterialIngestTask["reason"]): SourceMaterialIngestTask {
  const materialType = (material.type || sourceMaterialType(material.path)).toLowerCase()
  const needsExtraction = ["pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx"].includes(materialType)
  return {
    path: material.path,
    reason,
    materialType,
    needsExtraction,
    suggestedAction: needsExtraction ? "extract_then_read" : "read_directly",
    note: needsExtraction
      ? "Use revela-extract-document-materials before synthesizing stable narrative findings when this file is relevant."
      : "Read directly when relevant and distill stable narrative findings into the Markdown vault.",
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
    lastModified: material.lastModified ?? existing?.lastModified,
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
