import type { InspectionPromptProjection } from "../inspection-context/project"
import { buildDeterministicInspectionResult, type InspectionResult } from "../inspection-context/result"

export type InspectRequestStatus = "pending" | "completed" | "failed" | "expired"

export interface PendingInspectRequest {
  requestId: string
  status: InspectRequestStatus
  projection: InspectionPromptProjection
  deckVersion: string
  createdAt: number
  updatedAt: number
  result?: InspectionResult
  error?: string
}

const REQUEST_TTL_MS = 90 * 1000
const requests = new Map<string, PendingInspectRequest>()

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

export function failInspectRequest(requestId: string, error: string): PendingInspectRequest | undefined {
  const request = getInspectRequest(requestId)
  if (!request || request.status !== "pending") return request
  request.status = "failed"
  request.error = error
  request.updatedAt = Date.now()
  return request
}

export function cleanupInspectRequests(now = Date.now()): void {
  for (const [requestId, request] of requests) {
    if (request.status === "pending" && now - request.createdAt > REQUEST_TTL_MS) {
      request.status = "expired"
      request.error = "Inspection timed out before the LLM submitted a result."
      request.updatedAt = now
      continue
    }
    if (request.status !== "pending" && now - request.updatedAt > REQUEST_TTL_MS) {
      requests.delete(requestId)
    }
  }
}

export function clearInspectRequestsForTests(): void {
  requests.clear()
}
