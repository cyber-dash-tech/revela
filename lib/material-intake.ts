import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "path"
import { extractDocumentMaterials, type DocumentMaterialsResult } from "./document-materials/extract"
import { sourceMaterialMetadata, sourceMaterialType } from "./source-materials"
import type { SourceMaterial } from "./decks-state"

export type MaterialIntakeStatus =
  | "scanned"
  | "extracted"
  | "reviewed"
  | "text_only_read"
  | "skipped"
  | "unsupported"
  | "failed"

export interface MaterialRegistryEntry {
  sourcePath: string
  type: string
  fingerprint?: string
  size?: number
  lastModified?: string
  status: MaterialIntakeStatus
  requiresExtraction: boolean
  allowedReadPath?: string | null
  extraction?: {
    manifestPath?: string
    textPath?: string
    readViewPath?: string
    cacheDir?: string
    imageCount: number
    tableCount: number
  } | null
  review?: {
    reviewPath: string
    reviewedAt: string
    reviewedPaths: string[]
    summary: string
  } | null
  warnings?: string[]
  firstSeen: string
  lastChecked: string
}

export interface MaterialRegistry {
  version: 1
  updatedAt: string
  sources: MaterialRegistryEntry[]
}

export interface MaterialIngestTask {
  path: string
  materialType: string
  needsExtraction: boolean
  suggestedAction: "read_directly" | "extract_then_read"
  status: MaterialIntakeStatus
  allowedReadPath?: string | null
  note: string
}

export interface PrepareLocalMaterialsInput {
  workspaceRoot?: string
  path?: string
  maxDepth?: number
  autoExtract?: boolean
}

export interface PrepareLocalMaterialsResult {
  ok: true
  workspaceRoot: string
  registryPath: string
  found: number
  files: SourceMaterial[]
  suggestedTasks: MaterialIngestTask[]
  extractions: DocumentMaterialsResult[]
  warnings: string[]
}

export interface RecordMaterialReviewInput {
  workspaceRoot?: string
  sourcePath: string
  reviewedPaths: string[]
  reviewSummary: string
  narrativeDecisions: Array<{
    kind: "merged" | "gap" | "ignored" | "deferred"
    target?: string
    rationale: string
  }>
}

export interface RecordMaterialReviewResult {
  ok: true
  path: string
  registryPath: string
  sourcePath: string
}

export interface CheckMaterialIntakeInput {
  workspaceRoot?: string
  strictness?: "authoring" | "readiness" | "render"
}

export interface CheckMaterialIntakeResult {
  ok: boolean
  registryPath: string
  warnings: string[]
  sources: Array<MaterialRegistryEntry & { recommendedNextAction?: string }>
}

const DOC_EXTENSIONS = new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".csv", ".md", ".txt"])
const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", ".opencode", "researches", "revela-narrative", "designs", "domains"])
const EXCLUDE_FILENAMES = new Set(["AGENTS.md", "DECKS.md", "README.md", "README.zh-CN.md"])
const EXTRACTION_EXTENSIONS = new Set(["pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx"])
const SUPPORTED_EXTRACTION_EXTENSIONS = new Set(["pdf", "pptx", "docx", "xlsx"])

export function materialRegistryPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".opencode", "revela", "material-intake", "registry.json")
}

export function readMaterialRegistry(workspaceRoot: string): MaterialRegistry {
  const path = materialRegistryPath(workspaceRoot)
  if (!existsSync(path)) return { version: 1, updatedAt: new Date(0).toISOString(), sources: [] }
  return JSON.parse(readFileSync(path, "utf-8")) as MaterialRegistry
}

export function writeMaterialRegistry(workspaceRoot: string, registry: MaterialRegistry): string {
  const path = materialRegistryPath(workspaceRoot)
  mkdirSync(join(workspaceRoot, ".opencode", "revela", "material-intake"), { recursive: true })
  writeFileSync(path, JSON.stringify({ ...registry, updatedAt: new Date().toISOString() }, null, 2), "utf-8")
  return workspaceRelative(path, workspaceRoot)
}

export async function prepareLocalMaterials(input: PrepareLocalMaterialsInput = {}): Promise<PrepareLocalMaterialsResult> {
  const workspaceRoot = root(input.workspaceRoot)
  const scanRoot = scanRootFor(workspaceRoot, input.path)
  const files = scanWorkspaceSources(workspaceRoot, scanRoot, input.maxDepth ?? 2)
  let registry = readMaterialRegistry(workspaceRoot)
  const now = new Date().toISOString()
  const extractions: DocumentMaterialsResult[] = []

  for (const file of files) {
    registry = upsertRegistryEntry(registry, materialEntryFromSource(file, now))
  }

  if (input.autoExtract ?? true) {
    for (const file of files) {
      const type = (file.type || sourceMaterialType(file.path)).toLowerCase()
      if (!EXTRACTION_EXTENSIONS.has(type)) continue
      const result = await extractAndUpdateRegistry({ workspaceRoot, file: file.path }, registry)
      registry = result.registry
      extractions.push(result.extraction)
    }
  }

  const registryPath = writeMaterialRegistry(workspaceRoot, registry)
  return {
    ok: true,
    workspaceRoot,
    registryPath,
    found: files.length,
    files,
    suggestedTasks: registry.sources.map((entry) => ingestTask(entry)),
    extractions,
    warnings: intakeWarnings(registry.sources),
  }
}

export async function extractMaterial(input: { workspaceRoot?: string; file: string }): Promise<DocumentMaterialsResult> {
  const workspaceRoot = root(input.workspaceRoot)
  const registry = readMaterialRegistry(workspaceRoot)
  const result = await extractAndUpdateRegistry({ workspaceRoot, file: input.file }, registry)
  writeMaterialRegistry(workspaceRoot, result.registry)
  return result.extraction
}

export function recordMaterialReview(input: RecordMaterialReviewInput): RecordMaterialReviewResult {
  const workspaceRoot = root(input.workspaceRoot)
  const registry = readMaterialRegistry(workspaceRoot)
  const entry = registry.sources.find((item) => item.sourcePath === normalizePath(input.sourcePath))
  const sourcePath = entry?.sourcePath ?? normalizePath(input.sourcePath)
  const reviewPath = writeReviewMarkdown(workspaceRoot, {
    sourcePath,
    fingerprint: entry?.fingerprint,
    extraction: entry?.extraction ?? null,
    reviewedPaths: input.reviewedPaths.map(normalizePath),
    reviewSummary: input.reviewSummary,
    narrativeDecisions: input.narrativeDecisions,
  })
  const now = new Date().toISOString()
  const nextEntry: MaterialRegistryEntry = {
    ...(entry ?? {
      sourcePath,
      type: sourceMaterialType(sourcePath),
      status: "scanned",
      requiresExtraction: EXTRACTION_EXTENSIONS.has(sourceMaterialType(sourcePath)),
      firstSeen: now,
      lastChecked: now,
    }),
    status: "reviewed",
    review: {
      reviewPath,
      reviewedAt: now,
      reviewedPaths: input.reviewedPaths.map(normalizePath),
      summary: input.reviewSummary,
    },
    warnings: [],
    lastChecked: now,
  }
  const updated = upsertRegistryEntry(registry, nextEntry)
  const registryPath = writeMaterialRegistry(workspaceRoot, updated)
  return { ok: true, path: reviewPath, registryPath, sourcePath }
}

export function checkMaterialIntake(input: CheckMaterialIntakeInput = {}): CheckMaterialIntakeResult {
  const workspaceRoot = root(input.workspaceRoot)
  const registry = readMaterialRegistry(workspaceRoot)
  const sources = registry.sources.map((source) => {
    const recommendedNextAction = recommendedAction(source, input.strictness ?? "authoring")
    return recommendedNextAction ? { ...source, recommendedNextAction } : source
  })
  const warnings = intakeWarnings(registry.sources)
  return {
    ok: warnings.length === 0,
    registryPath: workspaceRelative(materialRegistryPath(workspaceRoot), workspaceRoot),
    warnings,
    sources,
  }
}

export function materialIntakeNoticeForCommand(input: { workspaceRoot?: string; command: string }): string | null {
  const workspaceRoot = root(input.workspaceRoot)
  const registry = readMaterialRegistry(workspaceRoot)
  const command = input.command
  const rawOfficeRead = /\b(textutil|pandoc|strings|unzip)\b/.test(command) && /\.(docx|doc|pptx|ppt|xlsx|xls|pdf)\b/i.test(command)
  const matched = registry.sources.filter((entry) => entry.requiresExtraction && command.includes(entry.sourcePath))
  if (!rawOfficeRead && matched.length === 0) return null

  const paths = matched.length > 0
    ? matched.map((entry) => entry.sourcePath)
    : registry.sources.filter((entry) => entry.requiresExtraction).map((entry) => entry.sourcePath)
  const unique = [...new Set(paths)].slice(0, 5)
  return [
    "Revela material intake notice:",
    unique.length > 0
      ? `Scanned source(s) require Revela extraction before narrative intake: ${unique.map((path) => `\`${path}\``).join(", ")}.`
      : "This command appears to read an Office/PDF source directly.",
    "Use `revela_extract_document_materials` and read the returned `read_view_path` so embedded images and manifests are considered.",
    "If this is intentionally text-only, mark it as degraded intake in the init report; do not treat it as complete material review.",
  ].join("\n")
}

async function extractAndUpdateRegistry(
  input: { workspaceRoot: string; file: string },
  registry: MaterialRegistry,
): Promise<{ extraction: DocumentMaterialsResult; registry: MaterialRegistry }> {
  const sourcePath = normalizePath(input.file)
  const extraction = await extractDocumentMaterials(sourcePath, input.workspaceRoot)
  const existing = registry.sources.find((entry) => entry.sourcePath === sourcePath)
  const now = new Date().toISOString()
  const type = extraction.type === "other" ? sourceMaterialType(sourcePath) : extraction.type
  const unsupported = EXTRACTION_EXTENSIONS.has(type) && !SUPPORTED_EXTRACTION_EXTENSIONS.has(type)
  const status: MaterialIntakeStatus = extraction.status === "processed"
    ? "extracted"
    : extraction.status === "failed"
      ? "failed"
      : unsupported
        ? "unsupported"
        : "skipped"

  return {
    extraction,
    registry: upsertRegistryEntry(registry, {
      ...(existing ?? {
        sourcePath,
        type,
        requiresExtraction: EXTRACTION_EXTENSIONS.has(type),
        firstSeen: now,
      }),
      sourcePath,
      type,
      status,
      requiresExtraction: EXTRACTION_EXTENSIONS.has(type),
      allowedReadPath: extraction.read_view_path ?? extraction.text_path ?? null,
      extraction: extraction.status === "processed"
        ? {
            manifestPath: extraction.manifest_path,
            textPath: extraction.text_path,
            readViewPath: extraction.read_view_path,
            cacheDir: extraction.cache_dir,
            imageCount: extraction.images?.length ?? 0,
            tableCount: extraction.tables?.length ?? 0,
          }
        : null,
      warnings: extractionWarnings(extraction, unsupported),
      lastChecked: now,
    }),
  }
}

function scanWorkspaceSources(workspaceRoot: string, scanRoot: string, maxDepth: number): SourceMaterial[] {
  const results: SourceMaterial[] = []
  scanDir(scanRoot, workspaceRoot, results, maxDepth, 0)
  return results.sort((a, b) => a.path.localeCompare(b.path))
}

function scanDir(dir: string, workspaceRoot: string, results: SourceMaterial[], maxDepth: number, depth: number): void {
  if (depth > maxDepth || !existsSync(dir)) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.startsWith(".") || EXCLUDE_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      scanDir(fullPath, workspaceRoot, results, maxDepth, depth + 1)
      continue
    }
    if (!stat.isFile() || EXCLUDE_FILENAMES.has(entry) || entry.startsWith("~$")) continue
    if (!DOC_EXTENSIONS.has(extname(entry).toLowerCase())) continue
    results.push({ ...sourceMaterialMetadata(fullPath, workspaceRoot), status: "discovered" })
  }
}

function materialEntryFromSource(source: SourceMaterial, now: string): MaterialRegistryEntry {
  const type = (source.type || sourceMaterialType(source.path)).toLowerCase()
  return {
    sourcePath: source.path,
    type,
    fingerprint: source.fingerprint,
    size: source.size,
    lastModified: source.lastModified,
    status: "scanned",
    requiresExtraction: EXTRACTION_EXTENSIONS.has(type),
    allowedReadPath: EXTRACTION_EXTENSIONS.has(type) ? null : source.path,
    extraction: null,
    review: null,
    warnings: [],
    firstSeen: now,
    lastChecked: now,
  }
}

function upsertRegistryEntry(registry: MaterialRegistry, entry: MaterialRegistryEntry): MaterialRegistry {
  const sourcePath = normalizePath(entry.sourcePath)
  const existingIndex = registry.sources.findIndex((item) => item.sourcePath === sourcePath)
  const existing = existingIndex >= 0 ? registry.sources[existingIndex] : undefined
  const unchangedFingerprint = Boolean(existing?.fingerprint && entry.fingerprint && existing.fingerprint === entry.fingerprint)
  const scanRefresh = entry.status === "scanned" && unchangedFingerprint
  const next: MaterialRegistryEntry = {
    ...existing,
    ...entry,
    sourcePath,
    status: scanRefresh ? existing!.status : entry.status,
    allowedReadPath: scanRefresh ? existing!.allowedReadPath : entry.allowedReadPath,
    extraction: scanRefresh ? existing!.extraction : entry.extraction,
    firstSeen: existing?.firstSeen ?? entry.firstSeen,
    review: scanRefresh ? existing!.review : entry.review === undefined ? existing?.review : entry.review,
  }
  const sources = [...registry.sources]
  if (existingIndex >= 0) sources[existingIndex] = next
  else sources.push(next)
  return { version: 1, updatedAt: new Date().toISOString(), sources: sources.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)) }
}

function ingestTask(entry: MaterialRegistryEntry): MaterialIngestTask {
  return {
    path: entry.sourcePath,
    materialType: entry.type,
    needsExtraction: entry.requiresExtraction,
    suggestedAction: entry.requiresExtraction ? "extract_then_read" : "read_directly",
    status: entry.status,
    allowedReadPath: entry.allowedReadPath ?? null,
    note: entry.requiresExtraction
      ? "Read the extracted read_view_path after Revela extraction; do not read the original Office/PDF source for narrative intake."
      : "Read directly when relevant and record narrative meaning only after source content is actually inspected.",
  }
}

function extractionWarnings(result: DocumentMaterialsResult, unsupported: boolean): string[] {
  if (unsupported) return ["This source type is discovered but not supported for Revela extraction in v1."]
  if (result.status === "failed") return [`Extraction failed: ${result.reason ?? "unknown error"}`]
  if (result.status === "skipped") return [`Extraction skipped: ${result.reason ?? "unsupported file type"}`]
  return []
}

function intakeWarnings(sources: MaterialRegistryEntry[]): string[] {
  const warnings: string[] = []
  for (const source of sources) {
    if (!source.requiresExtraction) continue
    if (source.status === "scanned") warnings.push(`${source.sourcePath} was scanned but not extracted through Revela material extraction.`)
    else if (source.status === "extracted") warnings.push(`${source.sourcePath} was extracted but has no recorded material review.`)
    else if (source.status === "text_only_read") warnings.push(`${source.sourcePath} was read as text-only; embedded images or structure may not have been considered.`)
    else if (source.status === "unsupported") warnings.push(`${source.sourcePath} is not supported for extraction; convert it to a supported format such as .docx/.pptx/.xlsx when needed.`)
    else if (source.status === "failed") warnings.push(`${source.sourcePath} extraction failed and should not be treated as complete intake.`)
  }
  return warnings
}

function recommendedAction(source: MaterialRegistryEntry, strictness: "authoring" | "readiness" | "render"): string | undefined {
  if (!source.requiresExtraction) return undefined
  if (source.status === "scanned") return "Call `revela_extract_document_materials`, then read the returned `read_view_path`."
  if (source.status === "extracted") return strictness === "authoring"
    ? "Read `allowedReadPath`, then call `revela_record_material_review`."
    : "Record material review before treating this source as considered for narrative readiness."
  if (source.status === "text_only_read") return "Use Revela extraction and review before treating this source as complete intake."
  if (source.status === "unsupported") return "Convert to a supported format or keep the source as an explicit intake gap."
  if (source.status === "failed") return "Fix extraction failure or record the source as an intake gap."
  return undefined
}

function writeReviewMarkdown(
  workspaceRoot: string,
  input: {
    sourcePath: string
    fingerprint?: string
    extraction: MaterialRegistryEntry["extraction"]
    reviewedPaths: string[]
    reviewSummary: string
    narrativeDecisions: RecordMaterialReviewInput["narrativeDecisions"]
  },
): string {
  const dir = join(workspaceRoot, "researches", "local-materials")
  mkdirSync(dir, { recursive: true })
  const fileName = `${slugify(input.sourcePath)}-review.md`
  const path = join(dir, fileName)
  const lines = [
    "---",
    "type: local-material-review",
    `sourcePath: ${JSON.stringify(input.sourcePath)}`,
    input.fingerprint ? `fingerprint: ${JSON.stringify(input.fingerprint)}` : undefined,
    input.extraction?.manifestPath ? `extractionManifestPath: ${JSON.stringify(input.extraction.manifestPath)}` : undefined,
    input.extraction?.textPath ? `extractionTextPath: ${JSON.stringify(input.extraction.textPath)}` : undefined,
    input.extraction?.readViewPath ? `readViewPath: ${JSON.stringify(input.extraction.readViewPath)}` : undefined,
    `reviewedAt: ${JSON.stringify(new Date().toISOString())}`,
    "status: reviewed",
    "---",
    "",
    "# Local Material Review",
    "",
    "## Review Summary",
    "",
    input.reviewSummary.trim(),
    "",
    "## Reviewed Paths",
    "",
    ...input.reviewedPaths.map((path) => `- ${path}`),
    "",
    "## Narrative Decisions",
    "",
    ...input.narrativeDecisions.map((decision) => `- ${decision.kind}${decision.target ? `: ${decision.target}` : ""} - ${decision.rationale}`),
    "",
    "## Extracted Images",
    "",
    input.extraction?.imageCount ? `- ${input.extraction.imageCount} extracted image(s); do not treat as interpreted evidence without explicit image review.` : "- None recorded.",
    "",
  ].filter((line): line is string => line !== undefined)
  writeFileSync(path, lines.join("\n"), "utf-8")
  return workspaceRelative(path, workspaceRoot)
}

function scanRootFor(workspaceRoot: string, path?: string): string {
  if (!path) return workspaceRoot
  if (isAbsolute(path)) throw new Error("path must be relative to workspace root")
  const candidate = resolve(workspaceRoot, path)
  const resolvedWorkspace = resolve(workspaceRoot)
  if (candidate !== resolvedWorkspace && !candidate.startsWith(resolvedWorkspace + sep)) throw new Error("path must be within workspace")
  return candidate
}

function root(workspaceRoot?: string): string {
  return resolve(workspaceRoot || process.cwd())
}

function workspaceRelative(path: string, workspaceRoot: string): string {
  return relative(resolve(workspaceRoot), resolve(path)).replace(/\\/g, "/")
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/")
}

function slugify(value: string): string {
  const base = basename(value).replace(/\.[^.]+$/, "")
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "material"
}
