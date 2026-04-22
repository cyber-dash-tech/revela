import { createHash } from "crypto"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "path"
import { DOMParser } from "@xmldom/xmldom"
import { unzipSync } from "fflate"
import { extractDocx } from "../read-hooks/extractors/docx"
import { extractPptx } from "../read-hooks/extractors/pptx"
import { extractXlsx } from "../read-hooks/extractors/xlsx"

export type DocumentMaterial = {
  path: string
  source_ref: string
  page_or_slide?: string
  note?: string
}

export type DocumentMaterialsResult = {
  status: "processed" | "skipped" | "failed"
  source: string
  type: "pptx" | "docx" | "xlsx" | "other"
  cache_dir?: string
  manifest_path?: string
  text_path?: string
  images?: DocumentMaterial[]
  tables?: DocumentMaterial[]
  reason?: string
}

type SupportedType = Exclude<DocumentMaterialsResult["type"], "other">

type CachedManifest = {
  source: string
  type: SupportedType
  fingerprint: string
  cache_dir: string
  manifest_path: string
  text_path: string
  images: DocumentMaterial[]
  tables: DocumentMaterial[]
}

const SUPPORTED_EXTENSIONS: Record<string, SupportedType> = {
  ".pptx": "pptx",
  ".docx": "docx",
  ".xlsx": "xlsx",
}

function normalizeZipTarget(basePath: string, target: string): string {
  const segments = join(dirname(basePath), target).split("/")
  const normalized: string[] = []

  for (const segment of segments) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }

  return normalized.join("/")
}

function ensureWorkspacePath(filePath: string, workspaceDir: string): string {
  const resolvedWorkspace = resolve(workspaceDir)
  const resolvedFile = isAbsolute(filePath) ? resolve(filePath) : resolve(workspaceDir, filePath)

  if (resolvedFile !== resolvedWorkspace && !resolvedFile.startsWith(resolvedWorkspace + "/")) {
    throw new Error("file must be within workspace")
  }

  return resolvedFile
}

function workspaceRelative(filePath: string, workspaceDir: string): string {
  return relative(workspaceDir, filePath).replace(/\\/g, "/")
}

function buildFingerprint(filePath: string): string {
  const stat = statSync(filePath)
  return createHash("sha1")
    .update(`${resolve(filePath)}:${stat.mtimeMs}:${stat.size}`)
    .digest("hex")
}

function writeCachedBuffer(targetPath: string, buf: Uint8Array): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, new Uint8Array(buf))
}

function materialPath(cacheDir: string, workspaceDir: string, ...segments: string[]): string {
  return workspaceRelative(join(cacheDir, ...segments), workspaceDir)
}

function parseXml(files: Record<string, Uint8Array>, path: string): any | null {
  const file = files[path]
  if (!file) return null
  return new DOMParser().parseFromString(new TextDecoder().decode(file), "text/xml")
}

function extractPptxImages(files: Record<string, Uint8Array>, cacheDir: string, workspaceDir: string): DocumentMaterial[] {
  const relFiles = Object.keys(files)
    .filter((file) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const images: DocumentMaterial[] = []
  const seenTargets = new Set<string>()

  for (const relPath of relFiles) {
    const slideMatch = relPath.match(/slide(\d+)\.xml\.rels$/)
    const slideNumber = slideMatch?.[1] ?? "0"
    const slidePath = relPath.replace("/_rels/", "/").replace(/\.rels$/, "")
    const doc = parseXml(files, relPath)
    if (!doc) continue
    const relationships = doc.getElementsByTagName("Relationship")
    let imageIndex = 0

    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i]
      const target = rel.getAttribute("Target")
      if (!target) continue
      const normalized = normalizeZipTarget(slidePath, target)
      if (!normalized.startsWith("ppt/media/")) continue
      const media = files[normalized]
      if (!media) continue

      imageIndex += 1
      seenTargets.add(normalized)
      const exportedName = `slide-${slideNumber.padStart(2, "0")}-image-${String(imageIndex).padStart(2, "0")}${extname(normalized)}`
      const outputPath = join(cacheDir, "images", exportedName)
      writeCachedBuffer(outputPath, media)

      images.push({
        path: materialPath(cacheDir, workspaceDir, "images", exportedName),
        source_ref: normalized,
        page_or_slide: `slide-${slideNumber.padStart(2, "0")}`,
      })
    }
  }

  const remainingMedia = Object.keys(files)
    .filter((file) => file.startsWith("ppt/media/") && !seenTargets.has(file))
    .sort()

  for (const mediaPath of remainingMedia) {
    const exportedName = `unmapped-${basename(mediaPath)}`
    const outputPath = join(cacheDir, "images", exportedName)
    writeCachedBuffer(outputPath, files[mediaPath])

    images.push({
      path: materialPath(cacheDir, workspaceDir, "images", exportedName),
      source_ref: mediaPath,
      note: "No slide-level relationship found",
    })
  }

  return images
}

function extractDocxImages(files: Record<string, Uint8Array>, cacheDir: string, workspaceDir: string): DocumentMaterial[] {
  return Object.keys(files)
    .filter((file) => file.startsWith("word/media/"))
    .sort()
    .map((mediaPath, index) => {
      const exportedName = `document-image-${String(index + 1).padStart(2, "0")}${extname(mediaPath)}`
      const outputPath = join(cacheDir, "images", exportedName)
      writeCachedBuffer(outputPath, files[mediaPath])

      return {
        path: materialPath(cacheDir, workspaceDir, "images", exportedName),
        source_ref: mediaPath,
        note: "Document-wide association",
      }
    })
}

function extractXlsxImages(files: Record<string, Uint8Array>, cacheDir: string, workspaceDir: string): DocumentMaterial[] {
  const drawingToImages = new Map<string, string[]>()
  const drawingRelFiles = Object.keys(files)
    .filter((file) => /^xl\/drawings\/_rels\/drawing\d+\.xml\.rels$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  for (const relPath of drawingRelFiles) {
    const relDoc = parseXml(files, relPath)
    if (!relDoc) continue
    const drawingPath = relPath.replace("/_rels/", "/").replace(/\.rels$/, "")
    const drawingDoc = parseXml(files, drawingPath)
    if (!drawingDoc) continue

    const targetByRid = new Map<string, string>()
    const relationships = relDoc.getElementsByTagName("Relationship")
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i]
      const id = rel.getAttribute("Id")
      const target = rel.getAttribute("Target")
      if (!id || !target) continue
      const normalized = normalizeZipTarget(drawingPath, target)
      if (normalized.startsWith("xl/media/")) {
        targetByRid.set(id, normalized)
      }
    }

    const blips = drawingDoc.getElementsByTagName("a:blip")
    const mediaPaths: string[] = []
    for (let i = 0; i < blips.length; i++) {
      const rid = blips[i].getAttribute("r:embed") || blips[i].getAttribute("embed")
      if (!rid) continue
      const mediaPath = targetByRid.get(rid)
      if (mediaPath) mediaPaths.push(mediaPath)
    }

    if (mediaPaths.length > 0) {
      drawingToImages.set(drawingPath, mediaPaths)
    }
  }

  const images: DocumentMaterial[] = []
  const exportedMedia = new Set<string>()
  const sheetRelFiles = Object.keys(files)
    .filter((file) => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  for (const relPath of sheetRelFiles) {
    const sheetMatch = relPath.match(/sheet(\d+)\.xml\.rels$/)
    const sheetNumber = sheetMatch?.[1] ?? "0"
    const sheetPath = relPath.replace("/_rels/", "/").replace(/\.rels$/, "")
    const relDoc = parseXml(files, relPath)
    if (!relDoc) continue
    const relationships = relDoc.getElementsByTagName("Relationship")
    let imageIndex = 0

    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i]
      const target = rel.getAttribute("Target")
      if (!target) continue
      const normalized = normalizeZipTarget(sheetPath, target)
      const mediaPaths = drawingToImages.get(normalized)
      if (!mediaPaths) continue

      for (const mediaPath of mediaPaths) {
        const media = files[mediaPath]
        if (!media) continue
        imageIndex += 1
        exportedMedia.add(mediaPath)
        const exportedName = `sheet-${sheetNumber.padStart(2, "0")}-image-${String(imageIndex).padStart(2, "0")}${extname(mediaPath)}`
        const outputPath = join(cacheDir, "images", exportedName)
        writeCachedBuffer(outputPath, media)

        images.push({
          path: materialPath(cacheDir, workspaceDir, "images", exportedName),
          source_ref: mediaPath,
          page_or_slide: `sheet-${sheetNumber.padStart(2, "0")}`,
        })
      }
    }
  }

  const unmapped = Object.keys(files)
    .filter((file) => file.startsWith("xl/media/") && !exportedMedia.has(file))
    .sort()

  for (const mediaPath of unmapped) {
    const exportedName = `unmapped-${basename(mediaPath)}`
    const outputPath = join(cacheDir, "images", exportedName)
    writeCachedBuffer(outputPath, files[mediaPath])

    images.push({
      path: materialPath(cacheDir, workspaceDir, "images", exportedName),
      source_ref: mediaPath,
      note: "No sheet-level relationship found",
    })
  }

  return images
}

function extractTables(type: SupportedType, textPath: string): DocumentMaterial[] {
  if (type !== "xlsx") return []
  return [{ path: textPath, source_ref: "workbook", note: "Sheet text and tables extracted to text file" }]
}

async function processOfficeFile(filePath: string, workspaceDir: string, type: SupportedType): Promise<DocumentMaterialsResult> {
  const relativeSource = workspaceRelative(filePath, workspaceDir)
  const fingerprint = buildFingerprint(filePath)
  const cacheDir = join(workspaceDir, ".opencode", "revela", "doc-materials", fingerprint)
  const manifestPath = join(cacheDir, "manifest.json")

  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as CachedManifest
    return {
      status: "processed",
      source: manifest.source,
      type: manifest.type,
      cache_dir: manifest.cache_dir,
      manifest_path: manifest.manifest_path,
      text_path: manifest.text_path,
      images: manifest.images,
      tables: manifest.tables,
    }
  }

  mkdirSync(join(cacheDir, "images"), { recursive: true })
  mkdirSync(join(cacheDir, "tables"), { recursive: true })

  const buf = readFileSync(filePath)
  const files = unzipSync(new Uint8Array(buf))

  const text = type === "pptx"
    ? await extractPptx(buf)
    : type === "docx"
      ? await extractDocx(buf)
      : await extractXlsx(buf)

  const textPath = join(cacheDir, "text.txt")
  writeFileSync(textPath, `[Extracted from: ${basename(filePath)}]\n\n${text}`, "utf-8")

  const images = type === "pptx"
    ? extractPptxImages(files, cacheDir, workspaceDir)
    : type === "docx"
      ? extractDocxImages(files, cacheDir, workspaceDir)
      : extractXlsxImages(files, cacheDir, workspaceDir)

  const result: DocumentMaterialsResult = {
    status: "processed",
    source: relativeSource,
    type,
    cache_dir: workspaceRelative(cacheDir, workspaceDir),
    manifest_path: workspaceRelative(manifestPath, workspaceDir),
    text_path: workspaceRelative(textPath, workspaceDir),
    images,
    tables: extractTables(type, workspaceRelative(textPath, workspaceDir)),
  }

  const manifest: CachedManifest = {
    source: result.source,
    type,
    fingerprint,
    cache_dir: result.cache_dir!,
    manifest_path: result.manifest_path!,
    text_path: result.text_path!,
    images: result.images ?? [],
    tables: result.tables ?? [],
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8")
  return result
}

export async function extractDocumentMaterials(filePath: string, workspaceDir: string): Promise<DocumentMaterialsResult> {
  try {
    const resolvedFile = ensureWorkspacePath(filePath, workspaceDir)
    const relativeSource = workspaceRelative(resolvedFile, workspaceDir)
    const type = SUPPORTED_EXTENSIONS[extname(resolvedFile).toLowerCase()]

    if (!type) {
      return {
        status: "skipped",
        source: relativeSource,
        type: "other",
        reason: "unsupported_file_type",
      }
    }

    return await processOfficeFile(resolvedFile, workspaceDir, type)
  } catch (e) {
    return {
      status: "failed",
      source: filePath,
      type: "other",
      reason: e instanceof Error ? e.message : String(e),
    }
  }
}
