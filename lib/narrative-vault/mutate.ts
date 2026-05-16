import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import type { AudienceIntent, DecisionIntent, NarrativeClaim, NarrativeClaimRelation, NarrativeClaimRelationType, NarrativeEvidenceBinding, NarrativeObjection, NarrativeResearchGap, NarrativeRisk, NarrativeStateV1, NarrativeThesis } from "../narrative-state/types"
import { NARRATIVE_VAULT_RELATION_TYPES } from "./constants"
import { narrativeVaultPath } from "./paths"
import { readNarrativeVaultDocuments } from "./read"
import { parseRelationRegistry } from "./relations"
import type { VaultRelation } from "./types"

export type UpsertVaultEvidenceInput = Partial<NarrativeEvidenceBinding> & {
  id: string
  claimId: string
}

export type UpdateVaultResearchGapInput = Partial<NarrativeResearchGap> & {
  id: string
}

export type UpsertVaultClaimInput = Partial<NarrativeClaim> & {
  id: string
  relations?: Array<Pick<NarrativeClaimRelation, "relation" | "toClaimId" | "rationale">>
}

export interface UpsertVaultRelationInput {
  id: string
  fromId: string
  toId: string
  relation: NarrativeClaimRelationType
  rationale?: string
}

export type UpsertVaultObjectionInput = Partial<NarrativeObjection> & {
  id: string
}

export type UpsertVaultRiskInput = Partial<NarrativeRisk> & {
  id: string
}

export interface UpdateVaultCoreInput {
  status?: NarrativeStateV1["status"]
  audience?: Partial<AudienceIntent>
  decision?: Partial<DecisionIntent>
  thesis?: Partial<NarrativeThesis>
}

export interface VaultNodeMutationResult {
  ok: boolean
  file?: string
  files?: string[]
  nodeId?: string
  missingFields?: string[]
  error?: string
  skipped?: boolean
}

type RelationRegistryMutationRead = { ok: true; relations: VaultRelation[] } | (VaultNodeMutationResult & { ok: false })

export function upsertVaultClaimNode(workspaceRoot: string, input: UpsertVaultClaimInput): VaultNodeMutationResult {
  const existingPath = existingNodePath(workspaceRoot, "claim", input.id)
  const existing = existingPath ? readNarrativeVaultDocuments(workspaceRoot).documents.find((doc) => doc.relativePath === existingPath) : undefined
  const missing = existing ? [] : missingNewClaimFields(input)
  if (missing.length > 0) return { ok: false, nodeId: input.id, missingFields: missing, error: `Claim node is missing required fields for creation: ${missing.join(", ")}.` }

  const root = narrativeVaultPath(workspaceRoot)
  const relativePath = existingPath ?? join("claims", `${safeFileName(input.id)}.md`)
  const frontmatter = {
    ...(existing?.frontmatter ?? {}),
    type: "claim",
    id: input.id,
    kind: input.kind ?? existing?.frontmatter.kind,
    importance: input.importance ?? existing?.frontmatter.importance,
    evidenceRequired: input.evidenceRequired ?? existing?.frontmatter.evidenceRequired,
    supportedScope: input.supportedScope ?? existing?.frontmatter.supportedScope,
    unsupportedScope: input.unsupportedScope ?? existing?.frontmatter.unsupportedScope,
    text: input.text ?? existing?.frontmatter.text,
    caveats: input.caveats ? undefined : existing?.frontmatter.caveats,
  }
  const overrides: Record<string, string> = {}
  if (input.caveats) overrides.caveats = formatList(input.caveats)
  const body = buildNodeBody(input.text ?? (stringValue(existing?.frontmatter.text) || existing?.body.trim() || ""), existing?.sections, overrides)
  writeVaultNode(root, relativePath, frontmatter, body)
  return { ok: true, file: relativePath, nodeId: input.id }
}

export function upsertVaultRelation(workspaceRoot: string, input: UpsertVaultRelationInput): VaultNodeMutationResult {
  const missing = missingRelationFields(input)
  if (missing.length > 0) return { ok: false, file: "relations.md", nodeId: input.id, missingFields: missing, error: `Relation edge is missing required fields: ${missing.join(", ")}.` }
  if (!isRelationType(input.relation)) return { ok: false, file: "relations.md", nodeId: input.id, error: `Invalid relation type: ${input.relation}.` }

  const registry = readRelationRegistryForMutation(workspaceRoot)
  if (!registry.ok) return registry
  const relations = registry.relations
  const next = [
    ...relations.filter((relation) => relation.id !== input.id),
    { id: input.id, fromId: input.fromId, toId: input.toId, relation: input.relation, rationale: input.rationale, file: "relations.md", source: "registry" as const },
  ].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  writeRelationRegistry(workspaceRoot, next)
  return { ok: true, file: "relations.md", nodeId: input.id }
}

export function removeVaultRelation(workspaceRoot: string, id: string): VaultNodeMutationResult {
  const edgeId = id.trim()
  if (!edgeId) return { ok: false, file: "relations.md", missingFields: ["id"], error: "Relation id is required for removal." }

  const registry = readRelationRegistryForMutation(workspaceRoot)
  if (!registry.ok) return registry
  const relations = registry.relations
  const next = relations.filter((relation) => relation.id !== edgeId)
  if (next.length === relations.length) return { ok: false, skipped: true, file: "relations.md", nodeId: edgeId, error: `Relation edge was not found: ${edgeId}.` }
  writeRelationRegistry(workspaceRoot, next)
  return { ok: true, file: "relations.md", nodeId: edgeId }
}

export function upsertVaultObjectionNode(workspaceRoot: string, input: UpsertVaultObjectionInput): VaultNodeMutationResult {
  const existingPath = existingNodePath(workspaceRoot, "objection", input.id)
  const existing = existingPath ? readNarrativeVaultDocuments(workspaceRoot).documents.find((doc) => doc.relativePath === existingPath) : undefined
  const missing = existing ? [] : missingNewTextNodeFields(input)
  if (missing.length > 0) return { ok: false, nodeId: input.id, missingFields: missing, error: `Objection node is missing required fields for creation: ${missing.join(", ")}.` }

  const root = narrativeVaultPath(workspaceRoot)
  const relativePath = existingPath ?? join("objections", `${safeFileName(input.id)}.md`)
  const frontmatter = {
    ...(existing?.frontmatter ?? {}),
    type: "objection",
    id: input.id,
    text: input.text ?? existing?.frontmatter.text,
    claimId: input.claimId ?? existing?.frontmatter.claimId,
    priority: input.priority ?? existing?.frontmatter.priority,
    response: input.response ?? existing?.frontmatter.response,
  }
  const body = buildNodeBody(input.text ?? (stringValue(existing?.frontmatter.text) || existing?.body.trim() || ""), existing?.sections, input.response ? { response: input.response } : {})
  writeVaultNode(root, relativePath, frontmatter, body)
  return { ok: true, file: relativePath, nodeId: input.id }
}

export function upsertVaultRiskNode(workspaceRoot: string, input: UpsertVaultRiskInput): VaultNodeMutationResult {
  const existingPath = existingNodePath(workspaceRoot, "risk", input.id)
  const existing = existingPath ? readNarrativeVaultDocuments(workspaceRoot).documents.find((doc) => doc.relativePath === existingPath) : undefined
  const missing = existing ? [] : missingNewTextNodeFields(input)
  if (missing.length > 0) return { ok: false, nodeId: input.id, missingFields: missing, error: `Risk node is missing required fields for creation: ${missing.join(", ")}.` }

  const root = narrativeVaultPath(workspaceRoot)
  const relativePath = existingPath ?? join("risks", `${safeFileName(input.id)}.md`)
  const frontmatter = {
    ...(existing?.frontmatter ?? {}),
    type: "risk",
    id: input.id,
    text: input.text ?? existing?.frontmatter.text,
    claimId: input.claimId ?? existing?.frontmatter.claimId,
    severity: input.severity ?? existing?.frontmatter.severity,
    mitigation: input.mitigation ?? existing?.frontmatter.mitigation,
  }
  const body = buildNodeBody(input.text ?? (stringValue(existing?.frontmatter.text) || existing?.body.trim() || ""), existing?.sections, input.mitigation ? { mitigation: input.mitigation } : {})
  writeVaultNode(root, relativePath, frontmatter, body)
  return { ok: true, file: relativePath, nodeId: input.id }
}

export function updateVaultCoreNodes(workspaceRoot: string, input: UpdateVaultCoreInput): VaultNodeMutationResult {
  const root = narrativeVaultPath(workspaceRoot)
  const read = readNarrativeVaultDocuments(workspaceRoot)
  const files: string[] = []
  if (input.status) {
    const existing = read.documents.find((doc) => doc.relativePath === "index.md")
    writeVaultNode(root, "index.md", { ...(existing?.frontmatter ?? {}), type: "index", id: stringValue(existing?.frontmatter.id) || "narrative:vault", status: input.status }, existing?.body ? `${existing.body.trim()}\n` : "")
    files.push("index.md")
  }
  if (input.audience) {
    const existing = read.documents.find((doc) => doc.relativePath === "audience.md")
    const frontmatter = { ...(existing?.frontmatter ?? {}), type: "audience", ...input.audience }
    writeVaultNode(root, "audience.md", frontmatter, `${input.audience.primary ?? existing?.body.trim() ?? ""}\n`)
    files.push("audience.md")
  }
  if (input.decision) {
    const existing = read.documents.find((doc) => doc.relativePath === "decision.md")
    const frontmatter = { ...(existing?.frontmatter ?? {}), type: "decision", ...input.decision }
    writeVaultNode(root, "decision.md", frontmatter, `${input.decision.action ?? existing?.body.trim() ?? ""}\n`)
    files.push("decision.md")
  }
  if (input.thesis) {
    const existing = read.documents.find((doc) => doc.relativePath === "thesis.md")
    const frontmatter = { ...(existing?.frontmatter ?? {}), type: "thesis", id: input.thesis.id ?? existing?.frontmatter.id ?? "thesis:main", confidence: input.thesis.confidence ?? existing?.frontmatter.confidence, caveat: input.thesis.caveat ?? existing?.frontmatter.caveat }
    writeVaultNode(root, "thesis.md", frontmatter, `${input.thesis.statement ?? existing?.body.trim() ?? ""}\n`)
    files.push("thesis.md")
  }
  if (files.length === 0) return { ok: false, missingFields: ["status|audience|decision|thesis"], error: "No core narrative fields were provided." }
  return { ok: true, file: files[0], files, nodeId: "narrative:core" }
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

function missingRelationFields(input: Partial<UpsertVaultRelationInput>): string[] {
  const missing: string[] = []
  for (const key of ["id", "fromId", "toId", "relation"] as const) {
    if (!String(input[key] ?? "").trim()) missing.push(key)
  }
  return missing
}

function readRelationRegistryForMutation(workspaceRoot: string): RelationRegistryMutationRead {
  const filePath = join(narrativeVaultPath(workspaceRoot), "relations.md")
  if (!existsSync(filePath)) return { ok: true, relations: [] }
  const parsed = parseRelationRegistry(readFileSync(filePath, "utf-8"), "relations.md")
  if (parsed.diagnostics.length > 0) {
    return {
      ok: false,
      file: "relations.md",
      error: `relations.md has parse diagnostics and must be repaired before helper mutation: ${parsed.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}.`,
    }
  }
  return { ok: true, relations: parsed.relations }
}

function writeRelationRegistry(workspaceRoot: string, relations: VaultRelation[]): void {
  const root = narrativeVaultPath(workspaceRoot)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, "relations.md"), serializeRelationRegistry(relations), "utf-8")
}

function serializeRelationRegistry(relations: VaultRelation[]): string {
  const lines = ["edges:"]
  for (const relation of relations) {
    lines.push(`  - id: ${quoteRelationScalar(relation.id ?? "")}`)
    lines.push(`    from: ${quoteRelationScalar(relation.fromId)}`)
    lines.push(`    to: ${quoteRelationScalar(relation.toId)}`)
    lines.push(`    type: ${quoteRelationScalar(relation.relation)}`)
    if (relation.rationale?.trim()) lines.push(`    rationale: ${quoteRelationScalar(relation.rationale)}`)
  }
  return `${lines.join("\n")}\n`
}

function quoteRelationScalar(value: string): string {
  return /^[a-zA-Z0-9:_./-]+$/.test(value) ? value : JSON.stringify(value)
}

function isRelationType(value: string): value is NarrativeClaimRelationType {
  return (NARRATIVE_VAULT_RELATION_TYPES as readonly string[]).includes(value)
}

function missingNewResearchGapFields(input: UpdateVaultResearchGapInput): string[] {
  const missing: string[] = []
  for (const key of ["id", "targetType", "targetId", "question"] as const) {
    if (!String(input[key] ?? "").trim()) missing.push(key)
  }
  return missing
}

function missingNewClaimFields(input: UpsertVaultClaimInput): string[] {
  const missing = missingNewTextNodeFields(input)
  for (const key of ["kind", "importance", "evidenceRequired"] as const) {
    if (input[key] === undefined || !String(input[key]).trim()) missing.push(key)
  }
  return missing
}

function missingNewTextNodeFields(input: { id?: string; text?: string }): string[] {
  const missing: string[] = []
  for (const key of ["id", "text"] as const) {
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

function buildNodeBody(main: string, existingSections: Record<string, string> = {}, overrides: Record<string, string> = {}): string {
  const sections = { ...existingSections, ...overrides }
  const chunks = [main.trim()]
  for (const [name, value] of Object.entries(sections)) {
    const trimmed = value.trim()
    if (!trimmed) continue
    chunks.push(`## ${sectionTitle(name)}\n\n${trimmed}`)
  }
  return `${chunks.filter(Boolean).join("\n\n")}\n`
}

function formatList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n")
}

function sectionTitle(name: string): string {
  return name.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ")
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
