import { saveMediaAsset } from "./save"
import type { MediaPurpose, MediaSaveResult } from "./types"

export interface MediaBatchItem {
  candidateId: string
  description: string
  url: string
  alt?: string
  use: "logo" | "portrait" | "screenshot"
  sourceFile?: string
  intendedSection?: string
}

export interface MediaBatchSaveInput {
  topic: string
  items: MediaBatchItem[]
  intendedSection?: string
}

export interface MediaBatchSaveResultItem {
  candidateId: string
  assetId: string
  status: string
  path: string | null
  error?: string
}

export interface MediaBatchSaveResult {
  ok: true
  topic: string
  manifestPath: string | null
  saved: number
  failed: number
  results: MediaBatchSaveResultItem[]
}

function candidateKey(candidateId: string): string {
  return slugify(candidateId) || "item"
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function purposeForUse(use: MediaBatchItem["use"]): MediaPurpose {
  return use
}

function baseAssetId(item: MediaBatchItem): string {
  const description = slugify(item.description)
  const fallback = slugify(item.sourceFile ?? item.candidateId)
  return description || fallback || "image"
}

function buildDeterministicAssetIds(items: MediaBatchItem[]): Map<string, string> {
  const assetIds = new Map<string, string>()
  for (const item of items) {
    const base = baseAssetId(item)
    assetIds.set(item.candidateId, `${base}-${candidateKey(item.candidateId)}`)
  }
  return assetIds
}

export async function batchSaveMediaAssets(
  input: MediaBatchSaveInput,
  workspaceDir: string,
): Promise<MediaBatchSaveResult> {
  const topic = slugify(input.topic)
  const results: MediaBatchSaveResultItem[] = []
  const urlToResult = new Map<string, MediaBatchSaveResultItem>()
  const assetIds = buildDeterministicAssetIds(input.items)
  let manifestPath: string | null = null
  let saved = 0
  let failed = 0

  for (const item of input.items) {
    const normalizedUrl = item.url.trim()
    const existing = urlToResult.get(normalizedUrl)
    if (existing) {
      results.push({
        candidateId: item.candidateId,
        assetId: existing.assetId,
        status: existing.status,
        path: existing.path,
        error: existing.error,
      })
      continue
    }

    const assetId = assetIds.get(item.candidateId) ?? `${baseAssetId(item)}-01`
    const brief = item.sourceFile
      ? `${item.description} from ${item.sourceFile}`
      : item.description
    const saveResult: MediaSaveResult = await saveMediaAsset({
      topic,
      id: assetId,
      type: "image",
      purpose: purposeForUse(item.use),
      brief,
      status: "success",
      intendedSection: item.intendedSection ?? input.intendedSection,
      sourceUrl: normalizedUrl,
      alt: item.alt,
    }, workspaceDir)

    const mapped: MediaBatchSaveResultItem = saveResult.ok
      ? {
        candidateId: item.candidateId,
        assetId,
        status: saveResult.status,
        path: saveResult.path,
      }
      : {
        candidateId: item.candidateId,
        assetId,
        status: "error",
        path: null,
        error: saveResult.error,
      }

    if (saveResult.ok) manifestPath = saveResult.manifestPath
    if (mapped.path) saved += 1
    else failed += 1

    urlToResult.set(normalizedUrl, {
      candidateId: item.candidateId,
      assetId,
      status: mapped.status,
      path: mapped.path,
      error: mapped.error,
    })
    results.push(mapped)
  }

  return {
    ok: true,
    topic,
    manifestPath,
    saved,
    failed,
    results,
  }
}
