import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs"
import { dirname, join, relative, resolve, sep } from "path"
import { downloadImageFromUrl, inferImageExtension } from "./download"
import type {
  MediaAssetRecord,
  MediaManifest,
  MediaSaveInput,
  MediaSaveResult,
  MediaStatus,
} from "./types"

function nowIso(): string {
  return new Date().toISOString()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function ensureInsideWorkspace(pathValue: string, workspaceDir: string): string {
  const abs = resolve(workspaceDir, pathValue)
  const root = resolve(workspaceDir)
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error("sourcePath must be within workspace")
  }
  return abs
}

function readManifest(manifestPath: string, topic: string): MediaManifest {
  if (!existsSync(manifestPath)) {
    return { topic, updatedAt: nowIso(), assets: [] }
  }

  const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as Partial<MediaManifest>
  return {
    topic,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    assets: Array.isArray(parsed.assets) ? parsed.assets as MediaAssetRecord[] : [],
  }
}

function buildFailureRecord(
  input: MediaSaveInput,
  topic: string,
  status: Exclude<MediaStatus, "success">,
  failureReason: string,
  sourcePath?: string,
): MediaAssetRecord {
  return {
    id: slugify(input.id),
    type: "image",
    purpose: input.purpose,
    brief: input.brief,
    status,
    path: null,
    sourceUrl: input.sourceUrl,
    sourcePath,
    intendedSection: input.intendedSection,
    alt: input.alt,
    notes: input.notes,
    failureReason,
    savedAt: nowIso(),
  }
}

function upsertAsset(manifest: MediaManifest, record: MediaAssetRecord): { manifest: MediaManifest; previous?: MediaAssetRecord } {
  const assets = [...manifest.assets]
  const index = assets.findIndex((asset) => asset.id === record.id)
  const previous = index === -1 ? undefined : assets[index]
  if (index === -1) assets.push(record)
  else assets[index] = record
  return {
    previous,
    manifest: {
      topic: manifest.topic,
      updatedAt: nowIso(),
      assets,
    },
  }
}

function writeManifest(manifestPath: string, manifest: MediaManifest): void {
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8")
}

function saveFailureResult(
  input: MediaSaveInput,
  workspaceDir: string,
  topic: string,
  manifestPath: string,
  status: Exclude<MediaStatus, "success">,
  failureReason: string,
  sourcePath?: string,
): MediaSaveResult {
  const manifest = readManifest(manifestPath, topic)
  const existing = manifest.assets.find((asset) => asset.id === slugify(input.id))
  const record = existing?.path
    ? {
      ...existing,
      sourceUrl: input.sourceUrl ?? existing.sourceUrl,
      sourcePath: sourcePath ?? existing.sourcePath,
      alt: input.alt ?? existing.alt,
      notes: input.notes ?? existing.notes,
      failureReason,
    }
    : buildFailureRecord(input, topic, status, failureReason, sourcePath)
  const { manifest: nextManifest, previous } = upsertAsset(manifest, record)
  writeManifest(manifestPath, nextManifest)

  if (!existing?.path && previous?.path) {
    rmSync(join(workspaceDir, previous.path), { force: true })
  }

  return {
    ok: true,
    assetId: record.id,
    status,
    path: null,
    manifestPath: relative(workspaceDir, manifestPath),
    updated: true,
  }
}

export async function saveMediaAsset(input: MediaSaveInput, workspaceDir: string): Promise<MediaSaveResult> {
  try {
    const topic = slugify(input.topic)
    const assetId = slugify(input.id)
    if (!topic) return { ok: false, error: "topic is required" }
    if (!assetId) return { ok: false, error: "id is required" }
    if (input.type !== "image") return { ok: false, error: "type must be 'image'" }

    const topicDir = join(workspaceDir, "assets", topic)
    const mediaDir = join(topicDir, "media")
    const manifestPath = join(topicDir, "media-manifest.json")
    mkdirSync(mediaDir, { recursive: true })

    const relativeSourcePath = input.sourcePath
      ? relative(workspaceDir, ensureInsideWorkspace(input.sourcePath, workspaceDir))
      : undefined

    if (input.status !== "success") {
      if (!input.failureReason?.trim()) {
        return { ok: false, error: "failureReason is required when status is not 'success'" }
      }
      return saveFailureResult(
        input,
        workspaceDir,
        topic,
        manifestPath,
        input.status,
        input.failureReason.trim(),
        relativeSourcePath,
      )
    }

    if (!input.sourcePath && !input.sourceUrl) {
      return { ok: false, error: "sourcePath or sourceUrl is required when status is 'success'" }
    }

    let buffer: Buffer
    let extension: string | null = null

    if (input.sourcePath) {
      const absPath = ensureInsideWorkspace(input.sourcePath, workspaceDir)
      if (!existsSync(absPath)) {
        return { ok: false, error: `sourcePath not found: ${input.sourcePath}` }
      }
      extension = inferImageExtension(null, absPath)
      if (!extension) {
        return { ok: false, error: `unsupported local image type: ${input.sourcePath}` }
      }
      const destinationPath = join(mediaDir, `${assetId}${extension}`)
      const manifest = readManifest(manifestPath, topic)
      const previous = manifest.assets.find((asset) => asset.id === assetId)
      copyFileSync(absPath, destinationPath)
      const record: MediaAssetRecord = {
        id: assetId,
        type: "image",
        purpose: input.purpose,
        brief: input.brief,
        status: "success",
        path: relative(workspaceDir, destinationPath),
        sourceUrl: input.sourceUrl,
        sourcePath: relativeSourcePath,
        intendedSection: input.intendedSection,
        alt: input.alt,
        notes: input.notes,
        savedAt: nowIso(),
      }
      const { manifest: nextManifest } = upsertAsset(manifest, record)
      writeManifest(manifestPath, nextManifest)
      if (previous?.path && previous.path !== record.path) {
        rmSync(join(workspaceDir, previous.path), { force: true })
      }
      return {
        ok: true,
        assetId,
        status: "success",
        path: record.path,
        manifestPath: relative(workspaceDir, manifestPath),
        updated: true,
      }
    }

    try {
      const downloaded = await downloadImageFromUrl(input.sourceUrl!)
      buffer = downloaded.buffer
      extension = downloaded.extension
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === "INVALID_URL") {
        return saveFailureResult(input, workspaceDir, topic, manifestPath, "invalid-url", "Invalid image URL")
      }
      return saveFailureResult(
        input,
        workspaceDir,
        topic,
        manifestPath,
        "cannot-download",
        `Failed to download image: ${message}`,
      )
    }

    const destinationPath = join(mediaDir, `${assetId}${extension}`)
    const manifest = readManifest(manifestPath, topic)
    const previous = manifest.assets.find((asset) => asset.id === assetId)
    writeFileSync(destinationPath, new Uint8Array(buffer))
    const record: MediaAssetRecord = {
      id: assetId,
      type: "image",
      purpose: input.purpose,
      brief: input.brief,
      status: "success",
      path: relative(workspaceDir, destinationPath),
      sourceUrl: input.sourceUrl,
      sourcePath: relativeSourcePath,
      intendedSection: input.intendedSection,
      alt: input.alt,
      notes: input.notes,
      savedAt: nowIso(),
    }
    const { manifest: nextManifest } = upsertAsset(manifest, record)
    writeManifest(manifestPath, nextManifest)
    if (previous?.path && previous.path !== record.path) {
      rmSync(join(workspaceDir, previous.path), { force: true })
    }

    return {
      ok: true,
      assetId,
      status: "success",
      path: record.path,
      manifestPath: relative(workspaceDir, manifestPath),
      updated: true,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
