export type CommentRequestStatus = "pending" | "completed" | "failed" | "expired"

export interface PendingCommentRequest {
  requestId: string
  status: CommentRequestStatus
  deckVersion: string
  createdAt: number
  updatedAt: number
  error?: string
}

const REQUEST_TTL_MS = 120 * 1000
const requests = new Map<string, PendingCommentRequest>()

export function createCommentRequest(input: {
  requestId: string
  deckVersion: string
}): PendingCommentRequest {
  cleanupCommentRequests()
  const now = Date.now()
  const request: PendingCommentRequest = {
    requestId: input.requestId,
    status: "pending",
    deckVersion: input.deckVersion,
    createdAt: now,
    updatedAt: now,
  }
  requests.set(input.requestId, request)
  return request
}

export function getCommentRequest(requestId: string): PendingCommentRequest | undefined {
  cleanupCommentRequests()
  const request = requests.get(requestId)
  if (!request) return undefined
  if (request.status === "pending" && Date.now() - request.createdAt > REQUEST_TTL_MS) {
    request.status = "expired"
    request.error = "Review agent timed out before completing the comment request."
    request.updatedAt = Date.now()
  }
  return request
}

export function completeCommentRequest(requestId: string): PendingCommentRequest | undefined {
  const request = getCommentRequest(requestId)
  if (!request || request.status !== "pending") return request
  request.status = "completed"
  request.updatedAt = Date.now()
  return request
}

export function failCommentRequest(requestId: string, error: string): PendingCommentRequest | undefined {
  const request = getCommentRequest(requestId)
  if (!request || request.status !== "pending") return request
  request.status = "failed"
  request.error = error
  request.updatedAt = Date.now()
  return request
}

export function cleanupCommentRequests(now = Date.now()): void {
  for (const [requestId, request] of requests) {
    if (request.status === "pending" && now - request.createdAt > REQUEST_TTL_MS) {
      request.status = "expired"
      request.error = "Review agent timed out before completing the comment request."
      request.updatedAt = now
      continue
    }
    if (request.status !== "pending" && now - request.updatedAt > REQUEST_TTL_MS) {
      requests.delete(requestId)
    }
  }
}

export function clearCommentRequestsForTests(): void {
  requests.clear()
}
