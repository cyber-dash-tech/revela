import { createHash } from "crypto"
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "fs"
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

export type SkippedAsset = {
  source_ref: string
  page_or_slide?: string
  reason: "svg_asset" | "unmapped_media" | "low_value_asset"
  kind?: "svg" | "icon" | "logo" | "overlay" | "decoration"
}

export type PptxSlideElement = {
  id: string
  kind: "text" | "image" | "shape"
  zOrder: number
  bbox?: { x: number; y: number; w: number; h: number }
  likelyBackground?: boolean
  likelyHeroImage?: boolean
  likelyLogo?: boolean
  likelyOverlayMask?: boolean
  likelyDecoration?: boolean
  text?: string
  source_ref?: string
  path?: string
  asset_status?: "kept" | "skipped"
  name?: string
}

export type PptxSlide = {
  slide: string
  width?: number
  height?: number
  elements: PptxSlideElement[]
}

export type DocumentMaterialsResult = {
  status: "processed" | "skipped" | "failed"
  source: string
  type: "pptx" | "docx" | "xlsx" | "other"
  cache_dir?: string
  manifest_path?: string
  text_path?: string
  images?: DocumentMaterial[]
  skipped_assets?: SkippedAsset[]
  slides?: PptxSlide[]
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
  skipped_assets: SkippedAsset[]
  slides: PptxSlide[]
  tables: DocumentMaterial[]
}

type PptxImageExtraction = {
  images: DocumentMaterial[]
  skipped_assets: SkippedAsset[]
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
  const resolvedWorkspace = realpathSync(resolve(workspaceDir))
  const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(workspaceDir, filePath)
  const resolvedFile = existsSync(candidate)
    ? realpathSync(candidate)
    : candidate

  if (resolvedFile !== resolvedWorkspace && !resolvedFile.startsWith(resolvedWorkspace + "/")) {
    throw new Error("file must be within workspace")
  }

  return resolvedFile
}

function normalizeWorkspaceChild(filePath: string, workspaceDir: string): string {
  const workspaceAlias = resolve(workspaceDir)
  const workspaceReal = realpathSync(workspaceAlias)
  const candidate = resolve(filePath)

  if (existsSync(candidate)) return realpathSync(candidate)

  if (candidate === workspaceAlias || candidate.startsWith(workspaceAlias + "/")) {
    return join(workspaceReal, relative(workspaceAlias, candidate))
  }

  return candidate
}

function workspaceRelative(filePath: string, workspaceDir: string): string {
  const resolvedWorkspace = realpathSync(resolve(workspaceDir))
  const resolvedFile = normalizeWorkspaceChild(filePath, workspaceDir)
  return relative(resolvedWorkspace, resolvedFile).replace(/\\/g, "/")
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

function xmlLocalName(node: any): string {
  return node?.localName ?? String(node?.nodeName ?? "").split(":").pop() ?? ""
}

function xmlElementChildren(node: any): any[] {
  const children: any[] = []
  const childNodes = node?.childNodes ?? []
  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i]
    if (child?.nodeType === 1) children.push(child)
  }
  return children
}

function xmlDescendantsByLocalName(node: any, name: string): any[] {
  const matches: any[] = []
  const walk = (current: any) => {
    for (const child of xmlElementChildren(current)) {
      if (xmlLocalName(child) === name) matches.push(child)
      walk(child)
    }
  }
  walk(node)
  return matches
}

function firstDescendantByLocalName(node: any, name: string): any | null {
  const [match] = xmlDescendantsByLocalName(node, name)
  return match ?? null
}

function extractShapeText(node: any): string | undefined {
  const texts = xmlDescendantsByLocalName(node, "t")
    .map((textNode) => textNode.textContent?.trim())
    .filter(Boolean)
  return texts.length > 0 ? texts.join("\n") : undefined
}

function extractElementName(node: any): string | undefined {
  return firstDescendantByLocalName(node, "cNvPr")?.getAttribute?.("name") || undefined
}

function parseCoordinate(value: string | null | undefined): number | undefined {
  if (value == null || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function extractElementBBox(node: any): { x: number; y: number; w: number; h: number } | undefined {
  const xfrm = firstDescendantByLocalName(node, "xfrm")
  if (!xfrm) return undefined

  const off = firstDescendantByLocalName(xfrm, "off")
  const ext = firstDescendantByLocalName(xfrm, "ext")
  if (!off || !ext) return undefined

  const x = parseCoordinate(off.getAttribute?.("x"))
  const y = parseCoordinate(off.getAttribute?.("y"))
  const w = parseCoordinate(ext.getAttribute?.("cx"))
  const h = parseCoordinate(ext.getAttribute?.("cy"))
  if ([x, y, w, h].some((value) => value == null)) return undefined

  return { x: x!, y: y!, w: w!, h: h! }
}

function getPptxSlideSize(files: Record<string, Uint8Array>): { width: number; height: number } | undefined {
  const doc = parseXml(files, "ppt/presentation.xml")
  const size = firstDescendantByLocalName(doc, "sldSz")
  if (!size) return undefined

  const width = parseCoordinate(size.getAttribute?.("cx"))
  const height = parseCoordinate(size.getAttribute?.("cy"))
  if (width == null || height == null) return undefined
  return { width, height }
}

function isNearCorner(
  bbox: { x: number; y: number; w: number; h: number },
  slideWidth: number,
  slideHeight: number,
): boolean {
  const thresholdX = slideWidth * 0.12
  const thresholdY = slideHeight * 0.12
  const right = bbox.x + bbox.w
  const bottom = bbox.y + bbox.h
  return (
    (bbox.x <= thresholdX && bbox.y <= thresholdY) ||
    (right >= slideWidth - thresholdX && bbox.y <= thresholdY) ||
    (bbox.x <= thresholdX && bottom >= slideHeight - thresholdY) ||
    (right >= slideWidth - thresholdX && bottom >= slideHeight - thresholdY)
  )
}

function applyPptxHeuristics(
  slide: PptxSlide,
  slideWidth: number | undefined,
  slideHeight: number | undefined,
): PptxSlide {
  if (!slideWidth || !slideHeight) return slide

  const slideArea = slideWidth * slideHeight
  slide.elements = slide.elements.map((element) => {
    if (!element.bbox) return element

    const areaRatio = (element.bbox.w * element.bbox.h) / slideArea
    const sourceName = `${element.source_ref ?? ""} ${element.name ?? ""}`.toLowerCase()

    if (element.kind === "image") {
      const flags: Partial<PptxSlideElement> = {}
      if (areaRatio >= 0.75 && element.asset_status === "kept") flags.likelyBackground = true
      else if (areaRatio >= 0.2 && element.asset_status === "kept") flags.likelyHeroImage = true
      if (areaRatio <= 0.03 && isNearCorner(element.bbox, slideWidth, slideHeight)) flags.likelyLogo = true
      if (/(logo|brand)/.test(sourceName)) flags.likelyLogo = true
      if (/(mask|overlay|shadow)/.test(sourceName) || element.asset_status === "skipped") flags.likelyOverlayMask = true
      if (/(arrow|ornament|decoration)/.test(sourceName)) flags.likelyDecoration = true
      return Object.keys(flags).length > 0 ? { ...element, ...flags } : element
    }

    if (element.kind === "shape") {
      const flags: Partial<PptxSlideElement> = {}
      if (areaRatio >= 0.4) flags.likelyOverlayMask = true
      if (areaRatio <= 0.03 || /(arrow|ornament|decoration)/.test(sourceName)) flags.likelyDecoration = true
      return Object.keys(flags).length > 0 ? { ...element, ...flags } : element
    }

    return element
  })

  return slide
}

function getSlideMediaTargets(files: Record<string, Uint8Array>, slidePath: string): Map<string, string> {
  const relPath = slidePath.replace("/slides/", "/slides/_rels/") + ".rels"
  const doc = parseXml(files, relPath)
  const targets = new Map<string, string>()
  if (!doc) return targets

  const relationships = doc.getElementsByTagName("Relationship")
  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i]
    const id = rel.getAttribute("Id")
    const target = rel.getAttribute("Target")
    if (!id || !target) continue
    const normalized = normalizeZipTarget(slidePath, target)
    if (!normalized.startsWith("ppt/media/")) continue
    targets.set(id, normalized)
  }

  return targets
}

function extractPptxSlides(
  files: Record<string, Uint8Array>,
  images: DocumentMaterial[],
  skippedAssets: SkippedAsset[],
): PptxSlide[] {
  const slideSize = getPptxSlideSize(files)
  const keptBySource = new Map(images.map((image) => [image.source_ref, image]))
  const skippedBySource = new Map(skippedAssets.map((asset) => [asset.source_ref, asset]))
  const slideFiles = Object.keys(files)
    .filter((file) => /^ppt\/slides\/slide\d+\.xml$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return slideFiles.map((slidePath) => {
    const slideNumber = slidePath.match(/slide(\d+)\.xml$/)?.[1] ?? "0"
    const slideId = `slide-${slideNumber.padStart(2, "0")}`
    const doc = parseXml(files, slidePath)
    const mediaTargets = getSlideMediaTargets(files, slidePath)
    const elements: PptxSlideElement[] = []

    if (!doc) return { slide: slideId, ...(slideSize ?? {}), elements }

    const spTree = firstDescendantByLocalName(doc, "spTree")
    if (!spTree) return { slide: slideId, ...(slideSize ?? {}), elements }

    for (const node of xmlElementChildren(spTree)) {
      const kind = xmlLocalName(node)
      if (kind === "nvGrpSpPr" || kind === "grpSpPr") continue

      const zOrder = elements.length + 1
      const id = `${slideId}-element-${String(zOrder).padStart(2, "0")}`
      const name = extractElementName(node)
      const bbox = extractElementBBox(node)

      if (kind === "sp") {
        const text = extractShapeText(node)
        elements.push(text
          ? { id, kind: "text", zOrder, text, ...(bbox ? { bbox } : {}), ...(name ? { name } : {}) }
          : { id, kind: "shape", zOrder, ...(bbox ? { bbox } : {}), ...(name ? { name } : {}) })
        continue
      }

      if (kind === "pic") {
        const blip = firstDescendantByLocalName(node, "blip")
        const rid = blip?.getAttribute?.("r:embed") || blip?.getAttribute?.("embed") || undefined
        const sourceRef = rid ? mediaTargets.get(rid) : undefined
        const kept = sourceRef ? keptBySource.get(sourceRef) : undefined
        const skipped = sourceRef ? skippedBySource.get(sourceRef) : undefined

        elements.push({
          id,
          kind: "image",
          zOrder,
          ...(bbox ? { bbox } : {}),
          ...(name ? { name } : {}),
          ...(sourceRef ? { source_ref: sourceRef } : {}),
          ...(kept?.path ? { path: kept.path } : {}),
          ...((kept || skipped) ? { asset_status: kept ? "kept" as const : "skipped" as const } : {}),
        })
        continue
      }

      if (kind === "cxnSp" || kind === "graphicFrame" || kind === "grpSp") {
        elements.push({ id, kind: "shape", zOrder, ...(bbox ? { bbox } : {}), ...(name ? { name } : {}) })
      }
    }

    return applyPptxHeuristics({ slide: slideId, ...(slideSize ?? {}), elements }, slideSize?.width, slideSize?.height)
  })
}

const LOW_VALUE_PPTX_ASSET = /(icon|logo|mask|overlay|shadow|decoration|ornament|arrow)/i

function classifySkippedAsset(sourceRef: string, reason: SkippedAsset["reason"]): SkippedAsset["kind"] | undefined {
  if (sourceRef.endsWith(".svg")) return "svg"
  if (/icon/i.test(sourceRef)) return "icon"
  if (/logo/i.test(sourceRef)) return "logo"
  if (/(mask|overlay|shadow)/i.test(sourceRef)) return "overlay"
  if (/(decoration|ornament|arrow)/i.test(sourceRef)) return "decoration"
  if (reason === "svg_asset") return "svg"
  return undefined
}

function shouldSkipPptxAsset(sourceRef: string): { reason: SkippedAsset["reason"]; kind?: SkippedAsset["kind"] } | null {
  if (sourceRef.endsWith(".svg")) {
    return { reason: "svg_asset", kind: "svg" }
  }
  if (LOW_VALUE_PPTX_ASSET.test(basename(sourceRef))) {
    return { reason: "low_value_asset", kind: classifySkippedAsset(sourceRef, "low_value_asset") }
  }
  return null
}

function extractPptxImages(files: Record<string, Uint8Array>, cacheDir: string, workspaceDir: string): PptxImageExtraction {
  const relFiles = Object.keys(files)
    .filter((file) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const images: DocumentMaterial[] = []
  const skipped_assets: SkippedAsset[] = []
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

      seenTargets.add(normalized)
      const skipped = shouldSkipPptxAsset(normalized)
      if (skipped) {
        skipped_assets.push({
          source_ref: normalized,
          page_or_slide: `slide-${slideNumber.padStart(2, "0")}`,
          reason: skipped.reason,
          kind: skipped.kind,
        })
        continue
      }

      imageIndex += 1
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
    skipped_assets.push({
      source_ref: mediaPath,
      reason: "unmapped_media",
      kind: classifySkippedAsset(mediaPath, "unmapped_media"),
    })
  }

  return { images, skipped_assets }
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
      skipped_assets: manifest.skipped_assets,
      slides: manifest.slides,
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

  const pptxAssets = type === "pptx"
    ? extractPptxImages(files, cacheDir, workspaceDir)
    : null
  const images = type === "pptx"
    ? pptxAssets!.images
    : type === "docx"
      ? extractDocxImages(files, cacheDir, workspaceDir)
      : extractXlsxImages(files, cacheDir, workspaceDir)
  const slides = type === "pptx"
    ? extractPptxSlides(files, images, pptxAssets!.skipped_assets)
    : undefined

  const result: DocumentMaterialsResult = {
    status: "processed",
    source: relativeSource,
    type,
    cache_dir: workspaceRelative(cacheDir, workspaceDir),
    manifest_path: workspaceRelative(manifestPath, workspaceDir),
    text_path: workspaceRelative(textPath, workspaceDir),
    images,
    skipped_assets: pptxAssets?.skipped_assets ?? [],
    slides,
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
    skipped_assets: result.skipped_assets ?? [],
    slides: result.slides ?? [],
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
