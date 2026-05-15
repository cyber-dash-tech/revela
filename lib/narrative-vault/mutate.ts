import { existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import type { NarrativeEvidenceBinding, NarrativeResearchGap } from "../narrative-state/types"
import { narrativeVaultPath } from "./paths"
import { readNarrativeVaultDocuments } from "./read"

export type UpsertVaultEvidenceInput = Partial<NarrativeEvidenceBinding> & {
  id: string
  claimId: string
}

export type UpdateVaultResearchGapInput = Partial<NarrativeResearchGap> & {
  id: string
}

export interface VaultNodeMutationResult {
  ok: boolean
  file?: string
  nodeId?: string
  missingFields?: string[]
  error?: string
}

export function upsertVaultEvidenceNode(workspaceRoot: string, input: UpsertVaultEvidenceInput): VaultNodeMutationResult {
  const missing = missingEvidenceFields(input)
  if (missing.length > 0) return { ok: false, nodeId: input.id, missingFields: missing, error: `Evidence node is missing required source trace fields: ${missing.join(", ")}.` }

  const root = narrativeVaultPath(workspaceRoot)
  const relativePath = existingNodePath(workspaceRoot, "evidence", input.id) ?? join("evidence", `${safeFileName(input.id)}.md`)
  const existing = readNarrativeVaultDocuments(workspaceRoot).documents.find((doc) => doc.relativePath === relativePath)
  const frontmatter = {
    ...(existing?.frontmatter ?? {}),
    type: "evidence",
    id: input.id,
    claimId: input.claimId,
    source: input.source,
    sourcePath: input.sourcePath,
    findingsFile: input.findingsFile,
    quote: input.quote,
    location: input.location,
    url: input.url,
    caveat: input.caveat,
    supportScope: input.supportScope,
    unsupportedScope: input.unsupportedScope,
    strength: input.strength,
  }
  writeVaultNode(root, relativePath, frontmatter, `${input.quote?.trim() ?? ""}\n`)
  return { ok: true, file: relativePath, nodeId: input.id }
}

export function updateVaultResearchGapNode(workspaceRoot: string, input: UpdateVaultResearchGapInput, options: { now?: string } = {}): VaultNodeMutationResult {
  const now = options.now ?? new Date().toISOString()
  const existingPath = existingNodePath(workspaceRoot, "research-gap", input.id)
  const existing = existingPath ? readNarrativeVaultDocuments(workspaceRoot).documents.find((doc) => doc.relativePath === existingPath) : undefined
  const missing = existing ? [] : missingNewResearchGapFields(input)
  if (missing.length > 0) return { ok: false, nodeId: input.id, missingFields: missing, error: `Research gap node is missing required fields for creation: ${missing.join(", ")}.` }

  const root = narrativeVaultPath(workspaceRoot)
  const relativePath = existingPath ?? join("research-gaps", `${safeFileName(input.id)}.md`)
  const currentStatus = stringValue(existing?.frontmatter.status)
  const nextStatus = input.status ?? (currentStatus || "open")
  const frontmatter = {
    ...(existing?.frontmatter ?? {}),
    type: "research-gap",
    id: input.id,
    targetType: input.targetType ?? existing?.frontmatter.targetType,
    targetId: input.targetId ?? existing?.frontmatter.targetId,
    question: input.question ?? existing?.frontmatter.question,
    status: nextStatus,
    priority: input.priority ?? existing?.frontmatter.priority,
    findingsFile: input.findingsFile ?? existing?.frontmatter.findingsFile,
    evidenceBindingIds: input.evidenceBindingIds ?? existing?.frontmatter.evidenceBindingIds,
    createdFromIssueType: input.createdFromIssueType ?? existing?.frontmatter.createdFromIssueType,
    notes: input.notes ?? existing?.frontmatter.notes,
    createdAt: existing?.frontmatter.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    closedAt: nextStatus === "closed" ? input.closedAt ?? existing?.frontmatter.closedAt ?? now : input.closedAt ?? existing?.frontmatter.closedAt,
  }
  const question = input.question ?? (stringValue(existing?.frontmatter.question) || existing?.body.trim() || "")
  const notes = input.notes ?? (stringValue(existing?.frontmatter.notes) || existing?.sections.notes?.trim() || "")
  const body = `${question.trim()}${notes ? `\n\n## Notes\n\n${notes.trim()}\n` : "\n"}`
  writeVaultNode(root, relativePath, frontmatter, body)
  return { ok: true, file: relativePath, nodeId: input.id }
}

function missingEvidenceFields(input: UpsertVaultEvidenceInput): string[] {
  const missing: string[] = []
  for (const key of ["id", "claimId", "source", "quote", "supportScope", "unsupportedScope", "caveat", "strength"] as const) {
    if (!String(input[key] ?? "").trim()) missing.push(key)
  }
  if (!input.sourcePath?.trim() && !input.url?.trim() && !input.findingsFile?.trim()) missing.push("sourcePath|url|findingsFile")
  return missing
}

function missingNewResearchGapFields(input: UpdateVaultResearchGapInput): string[] {
  const missing: string[] = []
  for (const key of ["id", "targetType", "targetId", "question"] as const) {
    if (!String(input[key] ?? "").trim()) missing.push(key)
  }
  return missing
}

function existingNodePath(workspaceRoot: string, type: string, id: string): string | undefined {
  if (!existsSync(narrativeVaultPath(workspaceRoot))) return undefined
  return readNarrativeVaultDocuments(workspaceRoot).documents.find((doc) => doc.frontmatter.type === type && doc.frontmatter.id === id)?.relativePath
}

function writeVaultNode(root: string, relativePath: string, frontmatter: Record<string, unknown>, body: string): void {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${formatFrontmatter(frontmatter)}\n${body.endsWith("\n") ? body : `${body}\n`}`, "utf-8")
}

function formatFrontmatter(values: Record<string, unknown>): string {
  const lines = ["---"]
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${quote(String(item))}`)
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value ? "true" : "false"}`)
    } else {
      lines.push(`${key}: ${quote(String(value))}`)
    }
  }
  lines.push("---")
  return lines.join("\n")
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function safeFileName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node"
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
