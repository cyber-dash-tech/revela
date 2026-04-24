export type MediaPurpose = "hero" | "illustration" | "portrait" | "logo" | "screenshot"

export type MediaStatus = "success" | "cannot-download" | "invalid-url" | "cannot-generate"

export interface MediaSaveInput {
  topic: string
  id: string
  type: "image"
  purpose: MediaPurpose
  brief: string
  status: MediaStatus
  intendedSection?: string
  sourcePath?: string
  sourceUrl?: string
  alt?: string
  notes?: string
  failureReason?: string
}

export interface MediaAssetRecord {
  id: string
  type: "image"
  purpose: MediaPurpose
  brief: string
  status: MediaStatus
  path: string | null
  sourceUrl?: string
  sourcePath?: string
  intendedSection?: string
  alt?: string
  notes?: string
  failureReason?: string
  savedAt: string
}

export interface MediaManifest {
  topic: string
  updatedAt: string
  assets: MediaAssetRecord[]
}

export type MediaSaveResult =
  | {
    ok: true
    assetId: string
    status: MediaStatus
    path: string | null
    manifestPath: string
    updated: boolean
  }
  | {
    ok: false
    error: string
  }
