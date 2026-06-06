import type { ReviewBridgeEvent } from "./prompt-bridge"

export type CommentRequestStatus = "pending" | "completed" | "failed" | "expired"

export interface PendingCommentRequest {
  requestId: string
  status: CommentRequestStatus
  deckVersion: string
  createdAt: number
  updatedAt: number
  events: ReviewBridgeEvent[]
  error?: string
  raw?: string
}

const REQUEST_TTL_MS = 360 * 1000
const requests = new Map<string, PendingCommentRequest>()
const subscribers = new Map<string, Set<(event: ReviewBridgeEvent) => void>>()

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
    events: [],
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
    appendCommentRequestEvent(request, {
      type: "timeout",
      message: request.error,
      timestamp: Date.now(),
    })
    request.updatedAt = Date.now()
  }
  return request
}

export function completeCommentRequest(requestId: string): PendingCommentRequest | undefined {
  const request = getCommentRequest(requestId)
  if (!request || request.status !== "pending") return request
  request.status = "completed"
  request.updatedAt = Date.now()
  if (!hasTerminalEvent(request)) {
    appendCommentRequestEvent(request, {
      type: "completed",
      message: "Codex completed.",
      timestamp: request.updatedAt,
    })
  }
  return request
}

export function failCommentRequest(requestId: string, error: string, raw?: string): PendingCommentRequest | undefined {
  const request = getCommentRequest(requestId)
  if (!request || request.status !== "pending") return request
  request.status = "failed"
  request.error = error
  if (raw) request.raw = boundedTail(raw)
  request.updatedAt = Date.now()
  if (!hasTerminalEvent(request)) {
    appendCommentRequestEvent(request, {
      type: "failed",
      message: error,
      timestamp: request.updatedAt,
      ...(raw ? { detail: boundedTail(raw) } : {}),
    })
  }
  return request
}

function boundedTail(text: string, limit = 4096): string {
  if (text.length <= limit) return text
  return text.slice(text.length - limit)
}

export function addCommentRequestEvent(requestId: string, event: ReviewBridgeEvent): PendingCommentRequest | undefined {
  const request = getCommentRequest(requestId)
  if (!request) return undefined
  appendCommentRequestEvent(request, event)
  request.updatedAt = Date.now()
  return request
}

export function subscribeCommentRequestEvents(
  requestId: string,
  listener: (event: ReviewBridgeEvent) => void,
): () => void {
  const set = subscribers.get(requestId) ?? new Set<(event: ReviewBridgeEvent) => void>()
  set.add(listener)
  subscribers.set(requestId, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) subscribers.delete(requestId)
  }
}

export function cleanupCommentRequests(now = Date.now()): void {
  for (const [requestId, request] of requests) {
    if (request.status === "pending" && now - request.createdAt > REQUEST_TTL_MS) {
      request.status = "expired"
      request.error = "Review agent timed out before completing the comment request."
      request.updatedAt = now
      appendCommentRequestEvent(request, {
        type: "timeout",
        message: request.error,
        timestamp: now,
      })
      continue
    }
    if (request.status !== "pending" && now - request.updatedAt > REQUEST_TTL_MS) {
      requests.delete(requestId)
      subscribers.delete(requestId)
    }
  }
}

export function clearCommentRequestsForTests(): void {
  requests.clear()
  subscribers.clear()
}

function appendCommentRequestEvent(request: PendingCommentRequest, event: ReviewBridgeEvent): void {
  const previous = request.events.at(-1)
  if (
    previous
    && previous.type === event.type
    && previous.message === event.message
    && previous.detail === event.detail
    && Math.abs(previous.timestamp - event.timestamp) < 100
  ) {
    return
  }
  request.events.push(event)
  const set = subscribers.get(request.requestId)
  if (!set) return
  for (const listener of set) listener(event)
}

function hasTerminalEvent(request: PendingCommentRequest): boolean {
  return request.events.some((event) => event.type === "completed" || event.type === "failed" || event.type === "timeout")
}
