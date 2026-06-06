import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { randomBytes } from "crypto"
import { workspaceMetaPath } from "../workspace-meta"

export type ReviewCommentStatus = "open" | "queued" | "applying" | "applied" | "failed"

export interface ReviewCommentRecord {
  id: string
  deckFile: string
  slideIndex: number
  deckVersion: string
  comment: string
  elements: any[]
  asset?: any
  drop?: any
  status: ReviewCommentStatus
  createdAt: string
  updatedAt: string
  lastApplyRequestId?: string
  lastApplyError?: string
  lastApplyRaw?: string
}

export interface ReviewCommentCreateInput {
  deckFile: string
  deckVersion: string
  comment: string
  elements: any[]
  asset?: any
  drop?: any
}

export function createReviewComment(workspaceRoot: string, input: ReviewCommentCreateInput): ReviewCommentRecord {
  const comment = input.comment.trim()
  if (!comment) throw new Error("Comment is required")
  const elements = Array.isArray(input.elements) ? input.elements : []
  const slideIndex = deriveSlideIndex(elements)
  const now = new Date().toISOString()
  const record: ReviewCommentRecord = {
    id: randomBytes(10).toString("base64url"),
    deckFile: normalizeDeckFile(input.deckFile),
    slideIndex,
    deckVersion: input.deckVersion,
    comment,
    elements,
    ...(input.asset ? { asset: input.asset } : {}),
    ...(input.drop ? { drop: input.drop } : {}),
    status: "open",
    createdAt: now,
    updatedAt: now,
  }
  writeReviewComment(workspaceRoot, record)
  return record
}

export function listReviewComments(workspaceRoot: string, deckFile: string): ReviewCommentRecord[] {
  const file = normalizeDeckFile(deckFile)
  const dir = reviewCommentsDir(workspaceRoot)
  if (!existsSync(dir)) return []
  const registry = readRegistry(workspaceRoot)
  const records = registry.commentIds
    .map((id) => readReviewComment(workspaceRoot, id))
    .filter((record): record is ReviewCommentRecord => Boolean(record))
  return records
    .filter((record) => record.deckFile === file)
    .sort((a, b) => a.slideIndex - b.slideIndex || a.createdAt.localeCompare(b.createdAt))
}

export function readReviewComment(workspaceRoot: string, id: string): ReviewCommentRecord | undefined {
  const safeId = normalizeId(id)
  if (!safeId) return undefined
  const path = reviewCommentPath(workspaceRoot, safeId)
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, "utf-8")) as ReviewCommentRecord
}

export function markReviewCommentApplying(workspaceRoot: string, id: string, requestId: string): ReviewCommentRecord | undefined {
  return updateReviewComment(workspaceRoot, id, (record) => ({
    ...record,
    status: "applying",
    lastApplyRequestId: requestId,
    lastApplyError: undefined,
    lastApplyRaw: undefined,
  }))
}

export function markReviewCommentQueued(workspaceRoot: string, id: string): ReviewCommentRecord | undefined {
  return updateReviewComment(workspaceRoot, id, (record) => ({
    ...record,
    status: "queued",
    lastApplyError: undefined,
    lastApplyRaw: undefined,
  }))
}

export function markReviewCommentApplied(workspaceRoot: string, id: string): ReviewCommentRecord | undefined {
  return updateReviewComment(workspaceRoot, id, (record) => ({
    ...record,
    status: "applied",
    lastApplyError: undefined,
    lastApplyRaw: undefined,
  }))
}

export function markReviewCommentFailed(workspaceRoot: string, id: string, error: string, raw?: string): ReviewCommentRecord | undefined {
  return updateReviewComment(workspaceRoot, id, (record) => ({
    ...record,
    status: "failed",
    lastApplyError: error,
    ...(raw ? { lastApplyRaw: boundedTail(raw) } : {}),
  }))
}

export function markReviewCommentStopped(workspaceRoot: string, id: string): ReviewCommentRecord | undefined {
  return markReviewCommentFailed(workspaceRoot, id, "Stopped by user.", "Stopped by user.")
}

export function deleteReviewComment(workspaceRoot: string, id: string): boolean {
  const safeId = normalizeId(id)
  if (!safeId) return false
  const path = reviewCommentPath(workspaceRoot, safeId)
  if (!existsSync(path)) return false
  unlinkSync(path)
  const registry = readRegistry(workspaceRoot)
  writeRegistry(workspaceRoot, {
    version: 1,
    commentIds: registry.commentIds.filter((item) => item !== safeId),
  })
  return true
}

function updateReviewComment(
  workspaceRoot: string,
  id: string,
  update: (record: ReviewCommentRecord) => ReviewCommentRecord,
): ReviewCommentRecord | undefined {
  const record = readReviewComment(workspaceRoot, id)
  if (!record) return undefined
  const next = { ...update(record), updatedAt: new Date().toISOString() }
  writeReviewComment(workspaceRoot, next)
  return next
}

function writeReviewComment(workspaceRoot: string, record: ReviewCommentRecord): void {
  const registry = readRegistry(workspaceRoot)
  const dir = reviewCommentsDir(workspaceRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(reviewCommentPath(workspaceRoot, record.id), `${JSON.stringify(record, null, 2)}\n`, "utf-8")
  if (!registry.commentIds.includes(record.id)) {
    registry.commentIds.push(record.id)
    writeRegistry(workspaceRoot, registry)
  }
}

function readRegistry(workspaceRoot: string): { version: 1; commentIds: string[] } {
  const path = join(reviewCommentsDir(workspaceRoot), "registry.json")
  if (!existsSync(path)) return { version: 1, commentIds: [] }
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as { version?: number; commentIds?: unknown[] }
  return {
    version: 1,
    commentIds: Array.isArray(parsed.commentIds) ? parsed.commentIds.filter((item): item is string => typeof item === "string") : [],
  }
}

function writeRegistry(workspaceRoot: string, registry: { version: 1; commentIds: string[] }): void {
  const dir = reviewCommentsDir(workspaceRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`, "utf-8")
}

function reviewCommentsDir(workspaceRoot: string): string {
  return workspaceMetaPath(workspaceRoot, "review-comments")
}

function reviewCommentPath(workspaceRoot: string, id: string): string {
  return join(reviewCommentsDir(workspaceRoot), `${id}.json`)
}

function normalizeDeckFile(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "")
}

function normalizeId(id: string): string {
  const trimmed = id.trim()
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : ""
}

function deriveSlideIndex(elements: any[]): number {
  const indexes = new Set<number>()
  for (const element of elements) {
    const value = element?.slideIndex
    if (Number.isInteger(value) && value > 0) indexes.add(value)
  }
  if (indexes.size === 0) throw new Error("Comment must reference one slide. Ctrl/Cmd-click an element on the target slide first.")
  if (indexes.size > 1) throw new Error("Comment references multiple slides. Split this into per-slide comments before applying fixes.")
  return [...indexes][0]
}

function boundedTail(text: string, limit = 4096): string {
  if (text.length <= limit) return text
  return text.slice(text.length - limit)
}
