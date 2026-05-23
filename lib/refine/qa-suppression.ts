import { resolve } from "path"

export interface ReviewApplyFixArtifactQaSuppressionInput {
  workspaceRoot: string
  file: string
  sessionID?: string
  ttlMs?: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const suppressions = new Map<string, number>()

export function suppressReviewApplyFixArtifactQa(input: ReviewApplyFixArtifactQaSuppressionInput): void {
  const key = suppressionKey(input)
  if (!key) return
  suppressions.set(key, Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS))
}

export function shouldSuppressReviewApplyFixArtifactQa(input: ReviewApplyFixArtifactQaSuppressionInput): boolean {
  const key = suppressionKey(input)
  if (!key) return false
  const expiresAt = suppressions.get(key)
  if (!expiresAt) return false
  if (Date.now() > expiresAt) {
    suppressions.delete(key)
    return false
  }
  return true
}

export function clearReviewApplyFixArtifactQaSuppressionsForTests(): void {
  suppressions.clear()
}

function suppressionKey(input: ReviewApplyFixArtifactQaSuppressionInput): string {
  const sessionID = input.sessionID?.trim()
  if (!sessionID) return ""
  const workspaceRoot = resolve(input.workspaceRoot)
  const file = resolve(workspaceRoot, input.file)
  return `${workspaceRoot}\0${file}\0${sessionID}`
}
