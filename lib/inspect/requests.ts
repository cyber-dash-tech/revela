import type { InspectionPromptProjection } from "../inspection-context/project"
import { buildDeterministicInspectionResult, type InspectionResult } from "../inspection-context/result"
import type { ReviewBridgeEvent } from "../refine/prompt-bridge"

export type InspectRequestStatus = "pending" | "completed" | "failed" | "expired"

export interface PendingInspectRequest {
  requestId: string
  status: InspectRequestStatus
  projection: InspectionPromptProjection
  deckVersion: string
  createdAt: number
  updatedAt: number
  events: ReviewBridgeEvent[]
  result?: InspectionResult
  error?: string
  raw?: string
}

const REQUEST_TTL_MS = 90 * 1000
const requests = new Map<string, PendingInspectRequest>()
const subscribers = new Map<string, Set<(event: ReviewBridgeEvent) => void>>()

export function createInspectRequest(input: {
  requestId: string
  projection: InspectionPromptProjection
  deckVersion: string
}): PendingInspectRequest {
  cleanupInspectRequests()
  const now = Date.now()
  const request: PendingInspectRequest = {
    requestId: input.requestId,
    status: "pending",
    projection: input.projection,
    deckVersion: input.deckVersion,
    createdAt: now,
    updatedAt: now,
    events: [],
  }
  requests.set(input.requestId, request)
  return request
}

export function getInspectRequest(requestId: string): PendingInspectRequest | undefined {
  cleanupInspectRequests()
  const request = requests.get(requestId)
  if (!request) return undefined
  if (request.status === "pending" && Date.now() - request.createdAt > REQUEST_TTL_MS) {
    request.status = "expired"
    request.error = "Inspection timed out before the LLM submitted a result."
    appendInspectRequestEvent(request, {
      type: "timeout",
      message: request.error,
      timestamp: Date.now(),
    })
    request.updatedAt = Date.now()
  }
  return request
}

export function completeInspectRequest(requestId: string, result: InspectionResult): PendingInspectRequest {
  const request = getInspectRequest(requestId)
  if (!request) throw new Error(`Unknown inspection request: ${requestId}`)
  if (request.status !== "pending") throw new Error(`Inspection request is not pending: ${request.status}`)
  request.status = "completed"
  request.result = normalizeInspectionResult(request.projection, result, requestId)
  request.updatedAt = Date.now()
  if (!hasTerminalEvent(request)) {
    appendInspectRequestEvent(request, {
      type: "completed",
      message: "Codex completed the inspection.",
      timestamp: request.updatedAt,
    })
  }
  return request
}

function normalizeInspectionResult(
  projection: InspectionPromptProjection,
  result: InspectionResult,
  requestId: string,
): InspectionResult {
  const deterministic = buildDeterministicInspectionResult(projection, { requestId })
  return {
    ...result,
    requestId,
    cards: {
      reading: result.cards.reading ?? deterministic.cards.reading,
      exploratory: result.cards.exploratory ?? deterministic.cards.exploratory,
      purpose: result.cards.purpose,
      source: result.cards.source,
    },
    stale: result.stale ?? deterministic.stale,
  }
}

export function failInspectRequest(requestId: string, error: string, raw?: string): PendingInspectRequest | undefined {
  const request = getInspectRequest(requestId)
  if (!request || request.status !== "pending") return request
  request.status = "failed"
  request.error = error
  if (raw) request.raw = boundedTail(raw)
  request.updatedAt = Date.now()
  if (!hasTerminalEvent(request)) {
    appendInspectRequestEvent(request, {
      type: "failed",
      message: error,
      timestamp: request.updatedAt,
      ...(raw ? { detail: boundedTail(raw) } : {}),
    })
  }
  return request
}

export function addInspectRequestEvent(requestId: string, event: ReviewBridgeEvent): PendingInspectRequest | undefined {
  const request = getInspectRequest(requestId)
  if (!request) return undefined
  appendInspectRequestEvent(request, event)
  request.updatedAt = Date.now()
  return request
}

export function subscribeInspectRequestEvents(
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

export function cleanupInspectRequests(now = Date.now()): void {
  for (const [requestId, request] of requests) {
    if (request.status === "pending" && now - request.createdAt > REQUEST_TTL_MS) {
      request.status = "expired"
      request.error = "Inspection timed out before the LLM submitted a result."
      request.updatedAt = now
      appendInspectRequestEvent(request, {
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

export function clearInspectRequestsForTests(): void {
  requests.clear()
  subscribers.clear()
}

function appendInspectRequestEvent(request: PendingInspectRequest, event: ReviewBridgeEvent): void {
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

function hasTerminalEvent(request: PendingInspectRequest): boolean {
  return request.events.some((event) => event.type === "completed" || event.type === "failed" || event.type === "timeout")
}

function boundedTail(text: string, limit = 4096): string {
  if (text.length <= limit) return text
  return text.slice(text.length - limit)
}
