import { randomBytes } from "crypto"
import { existsSync, readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, extname, isAbsolute, relative, resolve, sep } from "path"
import { ctx } from "../ctx"
import type { EditableDeck } from "../edit/resolve-deck"
import { buildEditPrompt, type EditCommentPayload } from "../edit/prompt"
import { buildPrompt } from "../prompt-builder"
import type { InspectionElementSnapshot } from "../inspection-context/match"
import { buildInspectionPrompt } from "../inspect/prompt"
import { projectWorkspaceElement } from "../inspect/request"
import { addInspectRequestEvent, completeInspectRequest, createInspectRequest, failInspectRequest, getInspectRequest, subscribeInspectRequestEvents } from "../inspect/requests"
import { saveMediaAsset } from "../media/save"
import { searchRemoteImages, type ImageCandidate } from "../media/search"
import type { MediaAssetRecord, MediaPurpose } from "../media/types"
import { addCommentRequestEvent, completeCommentRequest, createCommentRequest, failCommentRequest, getCommentRequest, stopCommentRequest, subscribeCommentRequestEvents } from "./comment-requests"
import { createOpenCodeReviewPromptBridge, type ReviewPromptBridge } from "./prompt-bridge"
import { suppressReviewApplyFixArtifactQa } from "./qa-suppression"
import { createReviewComment, deleteReviewComment, listReviewComments, markReviewCommentApplied, markReviewCommentApplying, markReviewCommentFailed, markReviewCommentQueued, markReviewCommentStopped, readReviewComment, type ReviewCommentRecord } from "./review-comments"
import { annotateVisualEditTargets, applyVisualTargetChanges, type VisualEditTarget } from "./visual-targets"

const TOKEN_BYTES = 24
const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const IDLE_STOP_MS = 30 * 60 * 1000
const REVIEW_UI_ASSET_ROUTE = "/__revela_ui_asset"
const REVIEW_UI_ASSETS = new Map<string, string>([
  ["/logo-wordmark.png", resolve(dirname(fileURLToPath(import.meta.url)), "../../assets/img/logo-wordmark.png")],
])
export const REVIEW_REF_LABEL_MAX_DISPLAY_CHARS = 32
export const LIVE_EDITOR_IDLE_MS = 10 * 1000

export function displayReviewReferenceLabel(label: string): string {
  const text = String(label || "")
  return text.length > REVIEW_REF_LABEL_MAX_DISPLAY_CHARS ? text.slice(0, REVIEW_REF_LABEL_MAX_DISPLAY_CHARS - 1) + "…" : text
}

interface EditAsset {
  id: string
  absoluteFile: string
}

interface EditSession {
  token: string
  client?: any
  sessionID?: string
  promptBridge: ReviewPromptBridge
  deck: string
  file: string
  absoluteFile: string
  workspaceRoot: string
  assets: Map<string, EditAsset>
  assetKeys: Map<string, string>
  nextAssetId: number
  createdAt: number
  lastActiveAt: number
  defaultMode: RefineMode
  visualTargets: Map<string, VisualEditTarget>
  visualTargetDeckVersion?: string
  activeApplyCommentId?: string
  activeApplyRequestId?: string
  activeApplyController?: AbortController
  applyQueue: string[]
}

export type RefineMode = "edit" | "inspect"
export type ReviewShellSurface = "legacy" | "codex"

function lucideIcon(name: "image" | "list" | "play" | "plus" | "refresh-cw" | "send" | "square" | "trash-2", className = "composer-icon"): string {
  const paths: Record<typeof name, string> = {
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    "refresh-cw": '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    square: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
    "trash-2": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  }
  return `<svg class="lucide lucide-${name} ${className}" data-lucide="${name}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`
}

export interface RefineServerHandle {
  baseUrl: string
  getOrCreateSession(input: {
    client?: any
    sessionID?: string
    workspaceRoot: string
    deck: EditableDeck
    mode?: RefineMode
    promptBridge?: ReviewPromptBridge
  }): EditServerSessionResult
}

export interface EditServerSessionResult {
  token: string
  reused: boolean
  live: boolean
}

let server: ReturnType<typeof Bun.serve> | undefined
let baseUrl = ""
let idleTimer: Timer | undefined
const sessions = new Map<string, EditSession>()

export function startRefineServer(): RefineServerHandle {
  if (!server) {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: handleRequest,
    })
    baseUrl = `http://127.0.0.1:${server.port}`
    scheduleIdleStop()
  }

  return {
    baseUrl,
    getOrCreateSession(input) {
      cleanupExpiredSessions()
      const existing = findSessionForDeck(input.deck.absoluteFile)
      if (existing) {
        existing.session.client = input.client
        existing.session.sessionID = input.sessionID
        existing.session.promptBridge = input.promptBridge ?? createOpenCodeReviewPromptBridge(input.client, input.sessionID ?? "")
        existing.session.deck = input.deck.slug
        existing.session.file = input.deck.file
        existing.session.workspaceRoot = resolve(input.workspaceRoot)
        existing.session.defaultMode = input.mode ?? "edit"
        existing.session.visualTargets = existing.session.visualTargets ?? new Map()
        existing.session.applyQueue = existing.session.applyQueue ?? []
        return {
          token: existing.token,
          reused: true,
          live: isSessionLive(existing.session),
        }
      }

      const token = randomBytes(TOKEN_BYTES).toString("base64url")
      sessions.set(token, {
        token,
        client: input.client,
        sessionID: input.sessionID,
        promptBridge: input.promptBridge ?? createOpenCodeReviewPromptBridge(input.client, input.sessionID ?? ""),
        deck: input.deck.slug,
        file: input.deck.file,
        absoluteFile: input.deck.absoluteFile,
        workspaceRoot: resolve(input.workspaceRoot),
        assets: new Map(),
        assetKeys: new Map(),
        nextAssetId: 1,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        defaultMode: input.mode ?? "edit",
        visualTargets: new Map(),
        applyQueue: [],
      })
      return { token, reused: false, live: false }
    },
  }
}

export function hasLiveEditorSession(deck: EditableDeck, maxIdleMs = LIVE_EDITOR_IDLE_MS): boolean {
  cleanupExpiredSessions()
  const existing = findSessionForDeck(deck.absoluteFile)
  return existing ? isSessionLive(existing.session, maxIdleMs) : false
}

export function hasLiveEditorSessionForFile(workspaceRoot: string, filePath: string, maxIdleMs = LIVE_EDITOR_IDLE_MS): boolean {
  if (!filePath) return false
  const root = resolve(workspaceRoot)
  const absoluteFile = resolve(root, filePath)
  if (absoluteFile !== root && !absoluteFile.startsWith(root.endsWith(sep) ? root : root + sep)) return false
  cleanupExpiredSessions()
  const existing = findSessionForDeck(absoluteFile)
  return existing ? isSessionLive(existing.session, maxIdleMs) : false
}

export function stopRefineServer(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = undefined
  sessions.clear()
  server?.stop()
  server = undefined
  baseUrl = ""
}

export const stopEditServer = stopRefineServer

function findSessionForDeck(absoluteFile: string): { token: string; session: EditSession } | undefined {
  for (const [token, session] of sessions) {
    if (session.absoluteFile === absoluteFile) return { token, session }
  }
  return undefined
}

function isSessionLive(session: EditSession, maxIdleMs = LIVE_EDITOR_IDLE_MS): boolean {
  return Date.now() - session.lastActiveAt <= maxIdleMs
}

async function handleRequest(req: Request): Promise<Response> {
  cleanupExpiredSessions()
  const url = new URL(req.url)

  if (url.pathname === "/health") return textResponse("ok")

  if (url.pathname.startsWith(`${REVIEW_UI_ASSET_ROUTE}/`) && (req.method === "GET" || req.method === "HEAD")) {
    return handleReviewUiAsset(url.pathname, req.method)
  }

  if (url.pathname === "/refine" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return htmlResponse(renderRefineShell(session.value.token, session.value.defaultMode))
  }

  if (url.pathname === "/codex-review" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return htmlResponse(renderCodexReviewShell(session.value.token, session.value.defaultMode))
  }

  if (url.pathname === "/deck" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleDeck(session.value)
  }

  if (url.pathname === "/__revela_asset" && (req.method === "GET" || req.method === "HEAD")) {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleAsset(session.value, url.searchParams.get("id"), req.method)
  }

  if (url.pathname === "/api/comment" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    if (session.value.activeApplyCommentId) return applyLockedResponse()
    return handleComment(req, session.value)
  }

  if (url.pathname === "/api/comments" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleReviewCommentsList(session.value)
  }

  if (url.pathname === "/api/comments" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleReviewCommentCreate(req, session.value)
  }

  const applyMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/apply$/)
  if (applyMatch && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleReviewCommentApply(decodeURIComponent(applyMatch[1]), req, session.value)
  }

  const stopMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/stop$/)
  if (stopMatch && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleReviewCommentStop(decodeURIComponent(stopMatch[1]), session.value)
  }

  const deleteMatch = url.pathname.match(/^\/api\/comments\/([^/]+)$/)
  if (deleteMatch && req.method === "DELETE") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    if (session.value.activeApplyCommentId) return applyLockedResponse()
    return handleReviewCommentDelete(decodeURIComponent(deleteMatch[1]), session.value)
  }

  if (url.pathname === "/api/comment-result" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleCommentResult(url.searchParams.get("requestId"), session.value)
  }

  if (url.pathname === "/api/comment-events" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleCommentEvents(url.searchParams.get("requestId"), session.value)
  }

  if (url.pathname === "/api/inspect" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return jsonResponse({ ok: false, error: "Review Insight/Inspect was removed in Revela 0.18. Use Comment for deck edits." }, 410)
  }

  if (url.pathname === "/api/inspect-result" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return jsonResponse({ ok: false, error: "Review Insight/Inspect was removed in Revela 0.18." }, 410)
  }

  if (url.pathname === "/api/inspect-events" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return jsonResponse({ ok: false, error: "Review Insight/Inspect was removed in Revela 0.18." }, 410)
  }

  if (url.pathname === "/api/deck-version" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleDeckVersion(session.value)
  }

  if (url.pathname === "/api/visual-changes" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    if (session.value.activeApplyCommentId) return applyLockedResponse()
    return handleVisualChanges(req, session.value)
  }

  if (url.pathname === "/api/assets/search" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleAssetSearch(url, session.value)
  }

  if (url.pathname === "/api/assets/save" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    if (session.value.activeApplyCommentId) return applyLockedResponse()
    return handleAssetSave(req, session.value)
  }

  if (url.pathname === "/api/assets/list" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleAssetList(session.value)
  }

  return textResponse("Not found", 404)
}

function applyLockedResponse(): Response {
  return jsonResponse({
    ok: false,
    code: "apply_locked",
    error: "Wait for the current apply to finish before making another change.",
  }, 409)
}

async function handleAssetSearch(url: URL, session: EditSession): Promise<Response> {
  const query = (url.searchParams.get("query") || "").trim()
  if (!query) return jsonResponse({ ok: false, error: "query is required" }, 400)
  const purpose = normalizeMediaPurpose(url.searchParams.get("purpose"))
  const limit = Number(url.searchParams.get("limit") || 12)
  const page = Number(url.searchParams.get("page") || 1)
  try {
    const candidates = await searchRemoteImages({ query, purpose, limit, page })
    session.lastActiveAt = Date.now()
    scheduleIdleStop()
    return jsonResponse({ ok: true, candidates })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse({ ok: false, error: message }, 502)
  }
}

async function handleAssetSave(req: Request, session: EditSession): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const candidate = normalizeImageCandidate(body?.candidate ?? body)
  if (!candidate) return jsonResponse({ ok: false, error: "Valid image candidate is required" }, 400)
  const purpose = normalizeMediaPurpose(body?.purpose) || candidate.purpose || "illustration"
  const brief = body?.brief || `Saved from ${candidate.provider} for Review asset placement.`
  const saved = await saveAssetCandidateUrls({
    session,
    candidate,
    id: body?.id || candidate.candidateId,
    purpose,
    brief,
    alt: body?.alt || candidate.alt || candidate.title,
    notes: body?.notes,
  })

  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  const result = saved.result
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400)
  if (result.status !== "success" || !result.path) {
    return jsonResponse({ ok: false, error: failedAssetSaveMessage(result.status, saved.failures) }, 400)
  }
  const asset = savedAssetForResult(session, result.assetId)
    ?? savedAssetFallback(session, {
      id: result.assetId,
      path: result.path,
      sourceUrl: saved.sourceUrl,
      purpose,
      brief,
      candidate,
    })
  if (!asset) return jsonResponse({ ok: false, error: "Saved asset was not found in workspace assets." }, 500)
  return jsonResponse({ ok: true, asset, result })
}

async function saveAssetCandidateUrls(input: {
  session: EditSession
  candidate: ImageCandidate
  id: string
  purpose: MediaPurpose
  brief: string
  alt?: string
  notes?: string
}): Promise<{
  result: Awaited<ReturnType<typeof saveMediaAsset>>
  sourceUrl?: string
  failures: Array<{ url: string; status: string }>
}> {
  const urls = uniqueAssetUrls([input.candidate.imageUrl, input.candidate.thumbnailUrl])
  const failures: Array<{ url: string; status: string }> = []
  let lastResult: Awaited<ReturnType<typeof saveMediaAsset>> | undefined

  for (const sourceUrl of urls) {
    const result = await saveMediaAsset({
      topic: input.session.deck,
      id: input.id,
      type: "image",
      purpose: input.purpose,
      brief: input.brief,
      status: "success",
      sourceUrl,
      alt: input.alt,
      notes: input.notes,
      provider: input.candidate.provider,
      sourcePageUrl: input.candidate.sourcePageUrl,
      license: input.candidate.license,
      attribution: input.candidate.attribution,
      width: input.candidate.width,
      height: input.candidate.height,
    }, input.session.workspaceRoot)
    lastResult = result
    if (result.ok && result.status === "success" && result.path) return { result, sourceUrl, failures }
    failures.push({ url: sourceUrl, status: result.ok ? result.failureReason ?? result.status : result.error })
  }

  return {
    result: lastResult ?? { ok: false, error: "No downloadable image URL was provided" },
    failures,
  }
}

function uniqueAssetUrls(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const url = value?.trim()
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [url]
  })
}

function failedAssetSaveMessage(status: string, failures: Array<{ url: string; status: string }>): string {
  if (!failures.length) return `Failed to save asset: ${status}`
  const details = failures
    .map((failure) => `${shortUrl(failure.url)}: ${failure.status}`)
    .join("; ")
  return `Failed to save asset: ${status} (${details})`
}

function shortUrl(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 93)}...`
}

function handleAssetList(session: EditSession): Response {
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  return jsonResponse({ ok: true, assets: listSavedAssets(session) })
}

function savedAssetForResult(session: EditSession, assetId: string): (MediaAssetRecord & { previewUrl?: string; deckPath?: string }) | null {
  return listSavedAssets(session).find((asset) => asset.id === assetId) ?? null
}

function savedAssetFallback(
  session: EditSession,
  input: {
    id: string
    path: string | null
    sourceUrl?: string
    purpose: MediaPurpose
    brief: string
    candidate: ImageCandidate
  },
): (MediaAssetRecord & { previewUrl?: string; deckPath?: string }) | null {
  if (!input.path) return null
  return {
    id: input.id,
    type: "image",
    purpose: input.purpose,
    brief: input.brief,
    status: "success",
    path: input.path,
    sourceUrl: input.sourceUrl ?? input.candidate.imageUrl,
    alt: input.candidate.alt || input.candidate.title,
    provider: input.candidate.provider,
    sourcePageUrl: input.candidate.sourcePageUrl,
    license: input.candidate.license,
    attribution: input.candidate.attribution,
    width: input.candidate.width,
    height: input.candidate.height,
    savedAt: new Date().toISOString(),
    previewUrl: assetUrlForRef(input.path, session, session.workspaceRoot) ?? undefined,
    deckPath: relative(dirname(session.absoluteFile), resolve(session.workspaceRoot, input.path)).replace(/\\/g, "/"),
  }
}

function listSavedAssets(session: EditSession): Array<MediaAssetRecord & { previewUrl?: string; deckPath?: string }> {
  const manifestPath = resolve(session.workspaceRoot, "assets", slugify(session.deck), "media-manifest.json")
  if (!existsSync(manifestPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as { assets?: MediaAssetRecord[] }
    return (Array.isArray(parsed.assets) ? parsed.assets : [])
      .filter((asset) => asset.status === "success" && asset.path)
      .map((asset) => ({
        ...asset,
        previewUrl: asset.path ? assetUrlForRef(asset.path, session, session.workspaceRoot) ?? undefined : undefined,
        deckPath: asset.path ? relative(dirname(session.absoluteFile), resolve(session.workspaceRoot, asset.path)).replace(/\\/g, "/") : undefined,
      }))
  } catch {
    return []
  }
}

function normalizeImageCandidate(input: any): ImageCandidate | null {
  if (!input || typeof input !== "object") return null
  const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : ""
  const provider = typeof input.provider === "string" ? input.provider.trim() : ""
  const title = typeof input.title === "string" ? input.title.trim() : ""
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : ""
  const thumbnailUrl = typeof input.thumbnailUrl === "string" ? input.thumbnailUrl.trim() : imageUrl
  if (!candidateId || !provider || !title || !imageUrl) return null
  return {
    candidateId,
    provider,
    title,
    thumbnailUrl,
    imageUrl,
    sourcePageUrl: typeof input.sourcePageUrl === "string" ? input.sourcePageUrl : undefined,
    width: typeof input.width === "number" ? input.width : undefined,
    height: typeof input.height === "number" ? input.height : undefined,
    alt: typeof input.alt === "string" ? input.alt : undefined,
    license: typeof input.license === "string" ? input.license : undefined,
    attribution: typeof input.attribution === "string" ? input.attribution : undefined,
    purpose: normalizeMediaPurpose(input.purpose),
  }
}

function normalizeMediaPurpose(input: unknown): MediaPurpose | undefined {
  return input === "hero" || input === "illustration" || input === "portrait" || input === "logo" || input === "screenshot"
    ? input
    : undefined
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function handleDeck(session: EditSession): Response {
  session.assets.clear()
  session.assetKeys.clear()
  session.nextAssetId = 1
  const annotated = refreshVisualTargets(session)
  return htmlResponse(rewriteLocalAssetRefs(annotated.html, {
    session,
    sourceFile: session.absoluteFile,
    contentType: "html",
  }))
}

function refreshVisualTargets(session: EditSession): { html: string; version: string } {
  const sourceHtml = readFileSync(session.absoluteFile, "utf-8")
  const version = readDeckVersion(session).version
  const annotated = annotateVisualEditTargets(sourceHtml)
  session.visualTargets = annotated.targets
  session.visualTargetDeckVersion = version
  return { html: annotated.html, version }
}

function handleAsset(session: EditSession, id: string | null, method: string): Response {
  if (!id) return textResponse("Missing asset id", 400)
  const asset = session.assets.get(id)
  if (!asset) return textResponse("Asset not found", 404)
  if (!existsSync(asset.absoluteFile)) return textResponse("Asset file not found", 404)
  if (!statSync(asset.absoluteFile).isFile()) return textResponse("Asset is not a file", 404)

  const mime = mimeTypeForPath(asset.absoluteFile)
  const headers = {
    "content-type": mime,
    "cache-control": "no-store, max-age=0",
  }
  if (method === "HEAD") return new Response(null, { status: 200, headers })

  if (mime === "text/css") {
    const css = readFileSync(asset.absoluteFile, "utf-8")
    return new Response(rewriteLocalAssetRefs(css, {
      session,
      sourceFile: asset.absoluteFile,
      contentType: "css",
    }), { status: 200, headers })
  }

  return new Response(new Uint8Array(readFileSync(asset.absoluteFile)), { status: 200, headers })
}

function handleReviewUiAsset(pathname: string, method: string): Response {
  const assetPath = pathname.slice(REVIEW_UI_ASSET_ROUTE.length)
  const absoluteFile = REVIEW_UI_ASSETS.get(assetPath)
  if (!absoluteFile || !existsSync(absoluteFile) || !statSync(absoluteFile).isFile()) {
    return textResponse("Asset not found", 404)
  }

  const headers = {
    "content-type": mimeTypeForPath(absoluteFile),
    "cache-control": "no-store, max-age=0",
  }
  if (method === "HEAD") return new Response(null, { status: 200, headers })
  return new Response(new Uint8Array(readFileSync(absoluteFile)), { status: 200, headers })
}

function rewriteLocalAssetRefs(content: string, input: { session: EditSession; sourceFile: string; contentType: "html" | "css" }): string {
  const baseDir = dirname(input.sourceFile)
  let rewritten = rewriteCssUrls(content, input.session, baseDir)
  if (input.contentType === "css") return rewritten

  rewritten = rewriteHtmlAssetAttributes(rewritten, input.session, baseDir)
  rewritten = rewriteSrcsetAttributes(rewritten, input.session, baseDir)
  return rewritten
}

function rewriteHtmlAssetAttributes(html: string, session: EditSession, baseDir: string): string {
  const attrPattern = /\b(src|href|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
  return html.replace(attrPattern, (match, name: string, raw: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? ""
    const assetUrl = assetUrlForRef(value, session, baseDir)
    if (!assetUrl) return match
    const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : ""
    const escaped = quote ? assetUrl.replace(/&/g, "&amp;") : assetUrl
    return `${name}=${quote}${escaped}${quote}`
  })
}

function rewriteSrcsetAttributes(html: string, session: EditSession, baseDir: string): string {
  const srcsetPattern = /\bsrcset\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
  return html.replace(srcsetPattern, (match, raw: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? ""
    const rewritten = rewriteSrcset(value, session, baseDir)
    if (rewritten === value) return match
    const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : ""
    const escaped = quote ? rewritten.replace(/&/g, "&amp;") : rewritten
    return `srcset=${quote}${escaped}${quote}`
  })
}

function rewriteSrcset(value: string, session: EditSession, baseDir: string): string {
  return value.split(",").map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part
    const pieces = trimmed.split(/\s+/)
    const assetUrl = assetUrlForRef(pieces[0], session, baseDir)
    if (!assetUrl) return part
    return [assetUrl, ...pieces.slice(1)].join(" ")
  }).join(", ")
}

function rewriteCssUrls(content: string, session: EditSession, baseDir: string): string {
  const cssUrlPattern = /url\(\s*("([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi
  return content.replace(cssUrlPattern, (match, raw: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? ""
    const assetUrl = assetUrlForRef(value, session, baseDir)
    if (!assetUrl) return match
    return `url("${assetUrl.replace(/"/g, "%22")}")`
  })
}

function assetUrlForRef(ref: string, session: EditSession, baseDir: string): string | null {
  const absoluteFile = resolveLocalAssetRef(ref, session.workspaceRoot, baseDir)
  if (!absoluteFile || !existsSync(absoluteFile) || !statSync(absoluteFile).isFile()) return null
  const key = resolve(absoluteFile)
  let id = session.assetKeys.get(key)
  if (!id) {
    id = String(session.nextAssetId++)
    session.assetKeys.set(key, id)
    session.assets.set(id, { id, absoluteFile: key })
  }
  return `/__revela_asset?token=${encodeURIComponent(session.token)}&id=${encodeURIComponent(id)}`
}

function resolveLocalAssetRef(ref: string, workspaceRoot: string, baseDir: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed || isSkippedAssetRef(trimmed)) return null

  const pathPart = stripQueryAndHash(trimmed)
  if (!pathPart) return null

  if (pathPart.startsWith("file://")) {
    try {
      return resolve(fileURLToPath(pathPart))
    } catch {
      return null
    }
  }

  const decodedPath = safeDecodeUri(pathPart)
  if (isWindowsAbsolutePath(decodedPath)) return resolve(decodedPath)

  if (isAbsolute(decodedPath)) {
    const absolute = resolve(decodedPath)
    if (existsSync(absolute)) return absolute
    return resolve(workspaceRoot, `.${decodedPath}`)
  }

  return resolve(baseDir, decodedPath)
}

function stripQueryAndHash(ref: string): string {
  const hashIndex = ref.indexOf("#")
  const withoutHash = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref
  const queryIndex = withoutHash.indexOf("?")
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

function isSkippedAssetRef(ref: string): boolean {
  return /^(?:https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(ref) || ref.startsWith("//")
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value)
}

function mimeTypeForPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8"
    case ".css":
      return "text/css"
    case ".js":
      return "application/javascript"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".png":
      return "image/png"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    case ".svg":
      return "image/svg+xml"
    case ".woff":
      return "font/woff"
    case ".woff2":
      return "font/woff2"
    case ".ttf":
      return "font/ttf"
    case ".otf":
      return "font/otf"
    case ".mp4":
      return "video/mp4"
    case ".webm":
      return "video/webm"
    case ".mp3":
      return "audio/mpeg"
    case ".wav":
      return "audio/wav"
    default:
      return "application/octet-stream"
  }
}

function handleDeckVersion(session: EditSession): Response {
  try {
    const version = readDeckVersion(session)
    session.lastActiveAt = Date.now()
    scheduleIdleStop()
    return jsonResponse({ ok: true, ...version })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse({ ok: false, error: message }, 404)
  }
}

function readDeckVersion(session: EditSession): { mtimeMs: number; size: number; version: string } {
  const stat = statSync(session.absoluteFile)
  const version = `${stat.mtimeMs}:${stat.size}`
  return { mtimeMs: stat.mtimeMs, size: stat.size, version }
}

async function handleVisualChanges(req: Request, session: EditSession): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const changes = Array.isArray(body?.changes) ? body.changes : []
  if (!changes.length) return jsonResponse({ ok: false, error: "No visual changes to save." }, 400)
  try {
    const result = applyVisualTargetChanges({
      file: session.absoluteFile,
      deckVersion: typeof body?.deckVersion === "string" ? body.deckVersion : undefined,
      targetDeckVersion: session.visualTargetDeckVersion,
      targets: session.visualTargets,
      changes,
    })
    const refreshed = refreshVisualTargets(session)
    session.lastActiveAt = Date.now()
    scheduleIdleStop()
    return jsonResponse({ ok: true, deckVersion: refreshed.version, changeCount: result.changeCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse({ ok: false, error: message }, 400)
  }
}

async function handleComment(req: Request, session: EditSession): Promise<Response> {
  let body: Partial<EditCommentPayload>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  return applyCommentPayload(body, session)
}

function handleReviewCommentsList(session: EditSession): Response {
  const deckVersion = readDeckVersion(session).version
  const comments = listReviewComments(session.workspaceRoot, session.file)
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  return jsonResponse({ ok: true, deckVersion, comments })
}

async function handleReviewCommentCreate(req: Request, session: EditSession): Promise<Response> {
  let body: Partial<EditCommentPayload>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const comment = typeof body.comment === "string" ? body.comment.trim() : ""
  const elements = Array.isArray(body.elements) ? body.elements : []
  if (!comment) return jsonResponse({ ok: false, error: "Comment is required" }, 400)
  try {
    const deckVersion = readDeckVersion(session).version
    const saved = createReviewComment(session.workspaceRoot, {
      deckFile: session.file,
      deckVersion,
      comment,
      elements,
      asset: (body as any).asset,
      drop: (body as any).drop,
    })
    session.lastActiveAt = Date.now()
    scheduleIdleStop()
    if ((body as any).applyNow === true) {
      return enqueueOrStartPersistedReviewCommentApply(session, saved, {})
    }
    return jsonResponse({ ok: true, comment: saved, deckVersion })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse({ ok: false, error: message }, 400)
  }
}

async function handleReviewCommentApply(commentId: string, req: Request, session: EditSession): Promise<Response> {
  let body: any = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const comment = readReviewComment(session.workspaceRoot, commentId)
  if (!comment || comment.deckFile !== session.file) return jsonResponse({ ok: false, error: "Review comment not found" }, 404)
  return enqueueOrStartPersistedReviewCommentApply(session, comment, body)
}

function handleReviewCommentStop(commentId: string, session: EditSession): Response {
  const comment = readReviewComment(session.workspaceRoot, commentId)
  if (!comment || comment.deckFile !== session.file) return jsonResponse({ ok: false, error: "Review comment not found" }, 404)
  session.applyQueue = (session.applyQueue ?? []).filter((id) => id !== comment.id)
  const wasActive = session.activeApplyCommentId === comment.id
  if (wasActive) {
    session.activeApplyController?.abort()
    if (session.activeApplyRequestId) stopCommentRequest(session.activeApplyRequestId)
    session.activeApplyCommentId = undefined
    session.activeApplyRequestId = undefined
    session.activeApplyController = undefined
  } else if (comment.lastApplyRequestId) {
    stopCommentRequest(comment.lastApplyRequestId)
  }
  const stopped = markReviewCommentStopped(session.workspaceRoot, comment.id) ?? comment
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  if (comment.status === "queued" || wasActive) drainPersistedReviewCommentApplyQueue(session)
  return jsonResponse({ ok: true, status: "stopped", comment: stopped, deckVersion: readDeckVersion(session).version })
}

function handleReviewCommentDelete(commentId: string, session: EditSession): Response {
  const comment = readReviewComment(session.workspaceRoot, commentId)
  if (!comment || comment.deckFile !== session.file) return jsonResponse({ ok: false, error: "Review comment not found" }, 404)
  if (comment.status === "applying") return jsonResponse({ ok: false, error: "Stop the applying comment before deleting it." }, 409)
  session.applyQueue = (session.applyQueue ?? []).filter((id) => id !== comment.id)
  const deleted = deleteReviewComment(session.workspaceRoot, comment.id)
  if (!deleted) return jsonResponse({ ok: false, error: "Review comment not found" }, 404)
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  return jsonResponse({ ok: true, deleted: true, commentId: comment.id, deckVersion: readDeckVersion(session).version })
}

async function enqueueOrStartPersistedReviewCommentApply(session: EditSession, comment: ReviewCommentRecord, body: any = {}): Promise<Response> {
  session.applyQueue = session.applyQueue ?? []
  if (session.activeApplyCommentId) {
    if (!session.applyQueue.includes(comment.id)) session.applyQueue.push(comment.id)
    const queued = markReviewCommentQueued(session.workspaceRoot, comment.id) ?? comment
    return jsonResponse({
      ok: true,
      deckVersion: readDeckVersion(session).version,
      status: "queued",
      queuePosition: session.applyQueue.indexOf(comment.id) + 1,
      comment: queued,
    })
  }

  const queuedIndex = session.applyQueue.indexOf(comment.id)
  if (queuedIndex >= 0) {
    const queued = markReviewCommentQueued(session.workspaceRoot, comment.id) ?? comment
    return jsonResponse({
      ok: true,
      deckVersion: readDeckVersion(session).version,
      status: "queued",
      queuePosition: queuedIndex + 1,
      comment: queued,
    })
  }

  return startPersistedReviewCommentApply(session, comment, body)
}

async function startPersistedReviewCommentApply(session: EditSession, comment: ReviewCommentRecord, body: any = {}): Promise<Response> {
  session.activeApplyCommentId = comment.id
  const requestId = typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim() : randomBytes(10).toString("base64url")
  const controller = new AbortController()
  session.activeApplyRequestId = requestId
  session.activeApplyController = controller
  try {
    const response = await applyCommentPayload({
      ...body,
      comment: comment.comment,
      elements: comment.elements,
      asset: comment.asset,
      drop: comment.drop,
      requestId,
    }, session, {
      persistedCommentId: comment.id,
      signal: controller.signal,
      onSettled: () => settlePersistedReviewCommentApply(session, comment.id),
    })
    if (!response.ok) settlePersistedReviewCommentApply(session, comment.id)
    return response
  } catch (error) {
    settlePersistedReviewCommentApply(session, comment.id)
    throw error
  }
}

function settlePersistedReviewCommentApply(session: EditSession, commentId: string): void {
  if (session.activeApplyCommentId === commentId) session.activeApplyCommentId = undefined
  if (session.activeApplyCommentId === undefined) {
    session.activeApplyRequestId = undefined
    session.activeApplyController = undefined
  }
  drainPersistedReviewCommentApplyQueue(session)
}

function drainPersistedReviewCommentApplyQueue(session: EditSession): void {
  if (session.activeApplyCommentId) return
  session.applyQueue = session.applyQueue ?? []
  while (session.applyQueue.length) {
    const nextId = session.applyQueue.shift()
    if (!nextId) continue
    const next = readReviewComment(session.workspaceRoot, nextId)
    if (!next || next.deckFile !== session.file) continue
    void startPersistedReviewCommentApply(session, next)
    return
  }
}

async function applyCommentPayload(
  body: Partial<EditCommentPayload>,
  session: EditSession,
  options: { persistedCommentId?: string; signal?: AbortSignal; onSettled?: () => void } = {},
): Promise<Response> {
  const { persistedCommentId, signal, onSettled } = options
  const comments = Array.isArray(body.comments)
    ? body.comments
      .map((draft: any) => ({
        comment: typeof draft?.comment === "string" ? draft.comment.trim() : "",
        elements: Array.isArray(draft?.elements) ? draft.elements : [],
      }))
      .filter((draft) => draft.comment && draft.elements.length > 0)
    : []
  const comment = typeof body.comment === "string" ? body.comment.trim() : ""
  const elements = Array.isArray(body.elements) ? body.elements : []
  if (!comment && comments.length === 0) return jsonResponse({ ok: false, error: "Comment is required" }, 400)

  ctx.enabled = true
  buildPrompt({ mode: "deck-render" })

  const prompt = buildEditPrompt({
    ...body,
    deck: session.deck,
    file: session.file,
    comment,
    elements,
    comments,
    suppressAutomaticArtifactQa: true,
  })
  const deckVersion = readDeckVersion(session).version
  const requestId = typeof (body as any).requestId === "string" && (body as any).requestId.trim()
    ? (body as any).requestId.trim()
    : randomBytes(10).toString("base64url")
  createCommentRequest({ requestId, deckVersion })
  if (persistedCommentId) markReviewCommentApplying(session.workspaceRoot, persistedCommentId, requestId)
  suppressReviewApplyFixArtifactQa({
    workspaceRoot: session.workspaceRoot,
    file: session.file,
    sessionID: session.sessionID,
  })

  void session.promptBridge.send({
    action: "comment",
    prompt,
    workspaceRoot: session.workspaceRoot,
    file: session.file,
    requestId,
    signal,
    onEvent: (event) => addCommentRequestEvent(requestId, event),
  }).then((result) => {
    if (result.ok) {
      completeCommentRequest(requestId)
      if (persistedCommentId && readReviewComment(session.workspaceRoot, persistedCommentId)?.status === "applying") markReviewCommentApplied(session.workspaceRoot, persistedCommentId)
    } else if (result.status === "stopped") {
      stopCommentRequest(requestId)
      if (persistedCommentId && readReviewComment(session.workspaceRoot, persistedCommentId)?.status === "applying") markReviewCommentStopped(session.workspaceRoot, persistedCommentId)
    } else {
      failCommentRequest(requestId, result.error, result.raw)
      if (persistedCommentId && readReviewComment(session.workspaceRoot, persistedCommentId)?.status === "applying") markReviewCommentFailed(session.workspaceRoot, persistedCommentId, result.error, result.raw)
    }
    onSettled?.()
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (signal?.aborted) {
      stopCommentRequest(requestId)
      if (persistedCommentId && readReviewComment(session.workspaceRoot, persistedCommentId)?.status === "applying") markReviewCommentStopped(session.workspaceRoot, persistedCommentId)
    } else {
      failCommentRequest(requestId, message)
      if (persistedCommentId && readReviewComment(session.workspaceRoot, persistedCommentId)?.status === "applying") markReviewCommentFailed(session.workspaceRoot, persistedCommentId, message)
    }
    onSettled?.()
  })

  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  const persistedComment = persistedCommentId ? readReviewComment(session.workspaceRoot, persistedCommentId) : undefined
  return jsonResponse({ ok: true, requestId, commentRequestId: requestId, deckVersion, status: "pending", ...(persistedComment ? { comment: persistedComment } : {}) })
}

function handleCommentEvents(requestId: string | null, session: EditSession): Response {
  if (!requestId) return jsonResponse({ ok: false, error: "Missing requestId" }, 400)
  const request = getCommentRequest(requestId)
  if (!request) return jsonResponse({ ok: false, requestId, error: "Comment request not found" }, 404)
  session.lastActiveAt = Date.now()
  scheduleIdleStop()

  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify(event)}\n\n`))
      }
      for (const event of request.events) send(event)
      if (request.status !== "pending") {
        controller.close()
        return
      }
      unsubscribe = subscribeCommentRequestEvents(requestId, (event) => {
        send(event)
        if (event.type === "completed" || event.type === "failed" || event.type === "timeout" || event.type === "stopped") {
          unsubscribe()
          controller.close()
        }
      })
    },
    cancel() {
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  })
}

function handleInspectEvents(requestId: string | null, session: EditSession): Response {
  if (!requestId) return jsonResponse({ ok: false, error: "Missing requestId" }, 400)
  const request = getInspectRequest(requestId)
  if (!request) return jsonResponse({ ok: false, requestId, error: "Inspection request not found" }, 404)
  session.lastActiveAt = Date.now()
  scheduleIdleStop()

  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify(event)}\n\n`))
      }
      for (const event of request.events) send(event)
      if (request.status !== "pending") {
        controller.close()
        return
      }
      unsubscribe = subscribeInspectRequestEvents(requestId, (event) => {
        send(event)
        if (event.type === "completed" || event.type === "failed" || event.type === "timeout") {
          unsubscribe()
          controller.close()
        }
      })
    },
    cancel() {
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  })
}

function handleCommentResult(requestId: string | null, session: EditSession): Response {
  if (!requestId) return jsonResponse({ ok: false, error: "Missing requestId" }, 400)
  const request = getCommentRequest(requestId)
  if (!request) return jsonResponse({ ok: false, requestId, error: "Comment request not found" }, 404)
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  if (request.status === "failed" || request.status === "expired" || request.status === "stopped") {
    return jsonResponse({
      ok: true,
      requestId,
      status: request.status,
      deckVersion: request.deckVersion,
      error: request.error || "Review agent failed",
      raw: request.raw,
    })
  }
  return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion })
}

async function handleInspect(req: Request, session: EditSession): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const snapshot = normalizeSnapshot(body?.snapshot ?? body)
  const language = normalizeInspectLanguage(body?.language)
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 2000) : ""
  const requestId = typeof body?.requestId === "string" && body.requestId.trim() ? body.requestId.trim() : randomBytes(10).toString("base64url")
  const version = readDeckVersion(session).version
  const staleReason = typeof body?.deckVersion === "string" && body.deckVersion !== version
    ? "Deck changed after the browser captured this selection. Re-select the element for the freshest inspection."
    : undefined

  try {
    const { projection, preprocess } = projectWorkspaceElement(session.workspaceRoot, snapshot, { requestId })
    createInspectRequest({ requestId, projection, deckVersion: version })

    session.lastActiveAt = Date.now()
    scheduleIdleStop()

    const prompt = buildInspectionPrompt({
      requestId,
      file: session.file,
      language,
      comment,
      delivery: session.promptBridge.kind === "codex-exec" ? "json" : "tool",
      projection: staleReason
        ? { ...projection, stale: { stale: true, reason: staleReason } } as any
        : projection,
    })

    void session.promptBridge.send({
      action: "inspect",
      prompt,
      workspaceRoot: session.workspaceRoot,
      file: session.file,
      requestId,
      onEvent: (event) => addInspectRequestEvent(requestId, event),
    }).then((result) => {
      if (result.ok && result.result) {
        completeInspectRequest(requestId, result.result)
      } else if (!result.ok) {
        failInspectRequest(requestId, result.error, result.raw)
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      failInspectRequest(requestId, message)
    })

    return jsonResponse({ ok: true, requestId, deckVersion: version, status: "pending", language, preprocess })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failInspectRequest(requestId, message)
    return jsonResponse({ ok: false, requestId, deckVersion: version, error: message }, 400)
  }
}

function handleInspectResult(requestId: string | null, session: EditSession): Response {
  if (!requestId) return jsonResponse({ ok: false, error: "Missing requestId" }, 400)
  const request = getInspectRequest(requestId)
  if (!request) return jsonResponse({ ok: false, requestId, error: "Inspection request not found" }, 404)
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  if (request.status === "completed") return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion, result: request.result })
  if (request.status === "failed" || request.status === "expired") return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion, error: request.error || "Insight failed", raw: request.raw })
  return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion })
}

function normalizeInspectLanguage(input: unknown): string {
  const value = typeof input === "string" ? input.trim() : ""
  return value || "Auto"
}

function normalizeSnapshot(input: any): InspectionElementSnapshot {
  return {
    scope: input?.scope === "selection" || input?.scope === "slide" || input?.scope === "element" ? input.scope : undefined,
    slideIndex: typeof input?.slideIndex === "number" ? input.slideIndex : undefined,
    text: typeof input?.text === "string" ? input.text : undefined,
    selectedText: typeof input?.selectedText === "string" ? input.selectedText : undefined,
    tagName: typeof input?.tagName === "string" ? input.tagName : undefined,
    slideTitle: typeof input?.slideTitle === "string" ? input.slideTitle : undefined,
    selector: typeof input?.selector === "string" ? input.selector : undefined,
    domPath: typeof input?.domPath === "string" ? input.domPath : undefined,
    id: typeof input?.id === "string" ? input.id : undefined,
    classList: Array.isArray(input?.classList) ? input.classList.filter((item: unknown) => typeof item === "string") : [],
    role: typeof input?.role === "string" ? input.role : undefined,
    outerHTMLExcerpt: typeof input?.outerHTMLExcerpt === "string" ? input.outerHTMLExcerpt : undefined,
    nearbyText: typeof input?.nearbyText === "string" ? input.nearbyText : undefined,
    elements: Array.isArray(input?.elements) ? input.elements.map((item: any) => ({
      text: typeof item?.text === "string" ? item.text : undefined,
      tagName: typeof item?.tagName === "string" ? item.tagName : undefined,
      slideIndex: typeof item?.slideIndex === "number" ? item.slideIndex : undefined,
      slideTitle: typeof item?.slideTitle === "string" ? item.slideTitle : undefined,
      selector: typeof item?.selector === "string" ? item.selector : undefined,
      domPath: typeof item?.domPath === "string" ? item.domPath : undefined,
      id: typeof item?.id === "string" ? item.id : undefined,
      classList: Array.isArray(item?.classList) ? item.classList.filter((className: unknown) => typeof className === "string") : [],
      role: typeof item?.role === "string" ? item.role : undefined,
      outerHTMLExcerpt: typeof item?.outerHTMLExcerpt === "string" ? item.outerHTMLExcerpt : undefined,
      nearbyText: typeof item?.nearbyText === "string" ? item.nearbyText : undefined,
      boundingBox: item?.boundingBox && typeof item.boundingBox === "object" ? item.boundingBox : undefined,
      viewport: item?.viewport && typeof item.viewport === "object" ? item.viewport : undefined,
    })) : undefined,
    boundingBox: input?.boundingBox && typeof input.boundingBox === "object" ? input.boundingBox : undefined,
    viewport: input?.viewport && typeof input.viewport === "object" ? input.viewport : undefined,
  }
}

function validateSession(token: string | null): { ok: true; value: EditSession } | { ok: false; response: Response } {
  if (!token) return { ok: false, response: textResponse("Missing token", 401) }
  const session = sessions.get(token)
  if (!session) return { ok: false, response: textResponse("Invalid or expired token", 401) }
  if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
    sessions.delete(token)
    return { ok: false, response: textResponse("Expired token", 401) }
  }
  session.lastActiveAt = Date.now()
  return { ok: true, value: session }
}

function cleanupExpiredSessions(): void {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now - session.lastActiveAt > SESSION_TTL_MS) sessions.delete(token)
  }
}

function scheduleIdleStop(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const now = Date.now()
    const active = [...sessions.values()].some((session) => now - session.lastActiveAt < IDLE_STOP_MS)
    if (active) {
      scheduleIdleStop()
      return
    }
    sessions.clear()
    server?.stop()
    server = undefined
    baseUrl = ""
    idleTimer = undefined
  }, IDLE_STOP_MS)
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}

export function renderCodexReviewShell(token: string, defaultMode: RefineMode = "edit"): string {
  return renderRefineShell(token, defaultMode, "codex")
}

export function renderRefineShell(token: string, defaultMode: RefineMode = "edit", surface: ReviewShellSurface = "legacy"): string {
  const encodedToken = JSON.stringify(token)
  const encodedDefaultMode = JSON.stringify(defaultMode)
  const encodedSurface = JSON.stringify(surface)
  const sendButtonHtml = `${lucideIcon("send")}<span class="sr-only">Apply</span>`
  const encodedSendButtonHtml = JSON.stringify(sendButtonHtml)
  const activityLabel = "Comments"
  const bodyClass = surface === "codex" ? "codex-review" : "legacy-review"
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Revela Review</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f8fafc; color: #111827; height: 100vh; overflow: hidden; }
    body.resizing { cursor: col-resize; user-select: none; }
    body.resizing iframe, body.resizing .hitbox { pointer-events: none; }
    .app { --editor-width: 620px; position: relative; display: grid; grid-template-columns: minmax(0, 1fr) var(--editor-width); height: 100vh; }
    .preview { position: relative; min-width: 0; background: #eef2f7; }
    .resize-handle { position: absolute; top: 0; bottom: 0; right: calc(var(--editor-width) - 7px); width: 14px; z-index: 5; cursor: col-resize; background: transparent; }
    .resize-handle::before { content: ""; position: absolute; left: 50%; top: 50%; width: 4px; height: 44px; border-radius: 999px; transform: translate(-50%, -50%); background: rgba(148,163,184,.34); box-shadow: 0 1px 2px rgba(15,23,42,.06); transition: background .16s ease, height .16s ease, box-shadow .16s ease; }
    .resize-handle:hover::before, body.resizing .resize-handle::before { height: 52px; background: #94a3b8; box-shadow: 0 0 0 4px rgba(148,163,184,.16); }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    .comment-highlight-layer { position: absolute; inset: 0; z-index: 6; pointer-events: none; overflow: hidden; }
    .comment-highlight-box { position: absolute; display: none; border: 2px solid #2563eb; border-radius: 6px; background: rgba(37,99,235,.12); box-shadow: 0 0 0 3px rgba(255,255,255,.74), 0 10px 28px rgba(15,23,42,.14); }
    .hitbox { position: absolute; inset: 0; z-index: 2; cursor: crosshair; background: transparent; }
    .visual-move-handle { position: absolute; z-index: 4; width: 16px; height: 16px; border: 2px solid #111827; border-radius: 999px; background: #ffffff; box-shadow: 0 6px 16px rgba(15,23,42,.18); transform: translate(-50%, -50%); pointer-events: none; display: none; }
    .visual-move-handle::before { content: ""; position: absolute; inset: 4px; border-top: 2px solid #111827; border-left: 2px solid #111827; transform: rotate(45deg); }
    .visual-resize-handle { position: absolute; z-index: 3; width: 14px; height: 14px; border: 2px solid #111827; border-radius: 4px; background: #ffffff; box-shadow: 0 6px 16px rgba(15,23,42,.18); transform: translate(-50%, -50%); pointer-events: none; display: none; }
    .visual-resize-handle[data-mode="text-width"] { width: 10px; height: 28px; border-radius: 999px; cursor: ew-resize; }
    .visual-edit-toolbar { position: absolute; top: 14px; left: 50%; z-index: 6; display: inline-flex; align-items: center; gap: 8px; transform: translateX(-50%); padding: 8px 10px; border: 1px solid rgba(148,163,184,.42); border-radius: 999px; background: rgba(15,23,42,.78); color: #ffffff; box-shadow: 0 16px 40px rgba(15,23,42,.2); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); font-size: 12px; font-weight: 800; }
    .visual-edit-toolbar.active { background: rgba(15,23,42,.9); box-shadow: 0 16px 40px rgba(15,23,42,.24); }
    .visual-edit-toolbar button { width: auto; min-width: 0; padding: 7px 10px; border-radius: 999px; border-color: rgba(255,255,255,.2); background: rgba(255,255,255,.12); color: #fff; box-shadow: none; font-size: 12px; }
    .visual-edit-toolbar .save-visual { background: #ffffff; color: #111827; }
    .deck-nav { position: absolute; left: 50%; bottom: 18px; z-index: 4; display: inline-flex; align-items: center; gap: 8px; transform: translateX(-50%); padding: 7px; border: 1px solid rgba(148,163,184,.42); border-radius: 999px; background: rgba(15,23,42,.76); box-shadow: 0 16px 44px rgba(15,23,42,.24); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); pointer-events: auto; }
    .deck-nav button { width: auto; min-width: 84px; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; box-shadow: none; font-size: 12px; font-weight: 900; }
    .deck-nav button:hover:not(:disabled) { background: rgba(255,255,255,.22); }
    .deck-nav button:disabled { opacity: .38; }
    .deck-nav-status { min-width: 76px; color: #e2e8f0; font-size: 12px; font-weight: 900; text-align: center; font-variant-numeric: tabular-nums; }
    aside { position: relative; display: flex; flex-direction: column; gap: 16px; padding: 18px; background: #ffffff; overflow: hidden; border-left: 1px solid #e2e8f0; box-shadow: -10px 0 28px rgba(15,23,42,.06); }
    aside button, aside input, aside select, aside textarea, aside .comment-editor { font-family: inherit; }
    h1 { margin: 0; font-size: 17px; line-height: 1.2; letter-spacing: 0; color: #0f172a; }
    .review-brand { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; }
    .wordmark-logo { display: block; width: auto; height: 30px; max-width: min(210px, 82%); object-fit: contain; flex: 0 1 auto; }
    .panel { display: flex; flex-direction: column; gap: 10px; }
    .tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid #e2e8f0; border-radius: 999px; background: #f8fafc; }
    .tab { width: auto; min-width: 112px; padding: 8px 16px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: #64748b; box-shadow: none; font-weight: 750; }
    .tab:hover:not(:disabled) { background: #eef2f7; color: #334155; }
    .tab.active { position: relative; top: 0; background: #ffffff; border-color: #e2e8f0; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
    .tab-panel { display: none; flex-direction: column; gap: 12px; min-height: 0; padding-top: 12px; }
    .tab-panel.active { display: flex; }
    #editPanel { flex: 1 1 auto; min-height: 0; }
    #inspectTab, #inspectPanel { display: none !important; }
    .sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
    .selection-summary { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; color: #334155; font-size: 13px; line-height: 1.45; box-shadow: none; }
    .selection-summary strong { display: block; margin-bottom: 7px; color: #64748b; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
    .selection-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .label { color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .comment-composer { position: relative; display: flex; flex-direction: column; gap: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
    .comment-input-box { position: relative; display: flex; flex-direction: column; min-height: 166px; border: 1px solid #dbe3ef; border-radius: 18px; background: #ffffff; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
    .comment-input-box:focus-within { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,.12), 0 8px 22px rgba(15,23,42,.06); }
    .comment-editor { width: 100%; min-height: 132px; max-height: 30vh; overflow: auto; padding: 13px 14px; border: 1px solid #dbe3ef; border-radius: 14px; background: #ffffff; color: #111827; font: inherit; line-height: 1.5; outline: none; white-space: pre-wrap; box-shadow: none; }
    .comment-editor:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
    .comment-input-box .comment-editor { min-height: 116px; padding: 14px 56px 8px 14px; border: 0; border-radius: 18px 18px 0 0; background: transparent; box-shadow: none; }
    .comment-input-box .comment-editor:focus { outline: none; box-shadow: none; }
    .comment-editor:empty::before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
    .ref-chip { display: inline-flex; align-items: center; max-width: 32ch; overflow: hidden; text-overflow: ellipsis; margin: 0 2px; padding: 1px 7px; border-radius: 999px; background: var(--ref-bg, #eff6ff); color: var(--ref-text, #1d4ed8); border: 1px solid var(--ref-border, #bfdbfe); font-weight: 800; white-space: nowrap; }
    .activity-panel { display: flex; flex: 1 1 auto; flex-direction: column; gap: 8px; min-height: 0; padding-top: 2px; }
    .comment-thread { display: flex; flex: 1 1 auto; flex-direction: column; gap: 16px; min-height: 160px; overflow-y: auto; overflow-x: hidden; padding: 12px 14px; }
    .comment-thread:empty::before { content: "No activity yet. Apply a change to start."; display: block; padding: 14px; border: 1px dashed #cbd5e1; border-radius: 16px; color: #64748b; font-size: 12px; line-height: 1.45; background: #f8fafc; box-shadow: none; }
    .comment-bubble { position: relative; display: flex; flex: 0 0 150px; flex-direction: column; min-height: 150px; max-height: 150px; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 15px; padding: 14px 15px 13px 16px; background: #ffffff; color: #334155; font-size: 13px; line-height: 1.45; box-shadow: 0 1px 2px rgba(15,23,42,.04); transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; cursor: pointer; }
    .comment-bubble:hover { transform: translateY(-1px); border-color: #cbd5e1; box-shadow: 0 8px 20px rgba(15,23,42,.07); }
    .comment-bubble.active { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,.12), 0 8px 20px rgba(15,23,42,.08); }
    .comment-bubble.sending { border-color: #bfdbfe; background: #f8fbff; }
    .comment-bubble.open { border-color: #e2e8f0; background: #ffffff; }
    .comment-bubble.queued { border-color: #fde68a; background: #fffdf4; }
    .comment-bubble.applying { border: 2px solid transparent; padding: 13px 14px 12px 15px; background: linear-gradient(#f8fbff, #f8fbff) padding-box, conic-gradient(from var(--comment-aurora-angle), #10b981, #14b8a6, #22d3ee, #2563eb, #7c3aed, #d946ef, #10b981) border-box; box-shadow: 0 0 0 1px rgba(20,184,166,.14), 0 0 18px rgba(6,182,212,.26), 0 0 28px rgba(124,58,237,.18), 0 8px 22px rgba(15,23,42,.08); animation: comment-aurora-flow 2.8s linear infinite; }
    .comment-bubble.applying.active { border-color: transparent; box-shadow: 0 0 0 3px rgba(6,182,212,.16), 0 0 22px rgba(20,184,166,.26), 0 0 32px rgba(124,58,237,.2), 0 8px 22px rgba(15,23,42,.09); }
    .comment-bubble.applied { border-color: #bbf7d0; background: #f8fefb; }
    .comment-bubble.updated { border-color: #bbf7d0; background: #f7fef9; }
    .comment-bubble.stale { border-color: #fed7aa; background: #fffaf0; }
    .comment-bubble.failed { border-color: #fecaca; background: #fffafa; }
    .comment-bubble.stopped { border-color: #fed7aa; background: #fffaf0; }
    .comment-bubble-text { flex: 1 1 auto; min-height: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
    .comment-bubble-state { margin-top: 8px; align-self: flex-start; padding: 0; background: transparent; color: #475569; font-size: 11px; font-weight: 800; }
    .comment-bubble-meta { margin-bottom: 6px; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    .comment-actions { position: absolute; right: 11px; bottom: 11px; display: flex; gap: 6px; }
    .comment-action-button { display: inline-flex; align-items: center; justify-content: center; width: 30px; min-width: 30px; height: 30px; min-height: 30px; padding: 0; border-radius: 999px; border-color: #e2e8f0; background: rgba(255,255,255,.92); color: #475569; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
    .comment-action-button:hover:not(:disabled) { background: #f1f5f9; color: #111827; transform: translateY(-1px); }
    .comment-action-button.danger { color: #dc2626; }
    .comment-action-button.stop { color: #b45309; }
    .comment-action-icon { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .comment-progress { margin-top: 7px; display: flex; flex-direction: column; gap: 4px; color: #475569; font-size: 12px; }
    .comment-progress-line { display: flex; gap: 8px; align-items: flex-start; padding: 0; border: 0; background: transparent; }
    .comment-raw { margin-top: 8px; color: #b91c1c; font-size: 12px; }
    .comment-raw summary { cursor: pointer; font-weight: 800; }
    .comment-raw pre { margin: 6px 0 0; max-height: 160px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: #f8fafc; border: 1px solid #fecaca; border-radius: 8px; padding: 8px; }
    .codex-log { margin-top: 8px; color: #475569; font-size: 12px; }
    .codex-log summary { cursor: pointer; font-weight: 900; }
    .codex-log-list { margin-top: 7px; display: flex; flex-direction: column; gap: 0; max-height: 240px; overflow: auto; }
    .codex-log-entry { position: relative; padding: 9px 10px 9px 18px; border: 0; border-left: 1px solid #dbe3ef; border-radius: 0; background: transparent; }
    .codex-log-entry::before { content: ""; position: absolute; left: -4px; top: 15px; width: 7px; height: 7px; border-radius: 999px; background: #94a3b8; box-shadow: 0 0 0 3px #ffffff; }
    .codex-log-meta { display: flex; justify-content: space-between; gap: 8px; color: #94a3b8; font-size: 11px; font-weight: 750; text-transform: uppercase; }
    .codex-log-message { margin-top: 4px; color: #334155; white-space: pre-wrap; overflow-wrap: anywhere; }
    .codex-log-detail { margin: 6px 0 0; max-height: 120px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: #e2e8f0; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .codex-log-modal { position: fixed; inset: 0; z-index: 80; display: none; align-items: center; justify-content: center; padding: 24px; }
    .codex-log-modal.open { display: flex; }
    .codex-log-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.42); }
    .codex-log-dialog { position: relative; z-index: 1; display: flex; flex-direction: column; width: min(860px, calc(100vw - 48px)); max-height: min(720px, calc(100vh - 48px)); overflow: hidden; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; box-shadow: 0 28px 70px rgba(15,23,42,.28); }
    .codex-log-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
    .codex-log-title { margin: 0; color: #111827; font-size: 15px; line-height: 1.25; font-weight: 900; }
    .codex-log-close { display: inline-flex; align-items: center; justify-content: center; width: 32px; min-width: 32px; height: 32px; padding: 0; border-radius: 999px; box-shadow: none; }
    .codex-log-modal .codex-log-list { margin: 0; padding: 14px; max-height: none; overflow: auto; }
    .codex-log-modal .codex-log-entry { background: transparent; }
    .codex-log-modal .codex-log-detail { max-height: 260px; }
    .comment-bubble.updated .comment-bubble-state { color: #166534; }
    .comment-bubble.applied .comment-bubble-state { color: #166534; }
    .comment-bubble.applying .comment-bubble-state { color: #0f766e; }
    .comment-bubble.queued .comment-bubble-state { color: #92400e; }
    .comment-bubble.stale .comment-bubble-state { color: #9a3412; }
    .comment-bubble.failed .comment-bubble-state { color: #991b1b; }
    .comment-bubble.stopped .comment-bubble-state { color: #92400e; }
    .inspect-actions { display: flex; flex-direction: column; gap: 8px; }
    .inspect-options { display: flex; flex-direction: column; gap: 5px; }
    .inspect-options label { color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    .inspect-select { width: 100%; padding: 10px 11px; border: 1px solid #dbe3ef; border-radius: 12px; background: #ffffff; color: #111827; font-weight: 700; }
    .inspect-cards { display: flex; flex-direction: column; gap: 12px; }
    .inspect-card { border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; padding: 13px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
    .inspect-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .inspect-card h2 { margin: 0; font-size: 13px; color: #0f172a; }
    .badge { border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; background: #f1f5f9; color: #475569; }
    .badge.supported, .badge.found, .badge.present, .badge.known, .badge.suggested { background: #dcfce7; color: #166534; }
    .badge.weak, .badge.missing { background: #fef3c7; color: #92400e; }
    .badge.unsupported { background: #fee2e2; color: #991b1b; }
    .inspect-card p, .inspect-empty, .inspect-loading { margin: 0; color: #475569; font-size: 12px; line-height: 1.5; }
    .inspect-item { margin-top: 7px; padding: 8px; border-radius: 10px; background: #f8fafc; color: #334155; font-size: 12px; line-height: 1.45; }
    .inspect-warning, .inspect-stale { margin-top: 8px; padding: 8px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 12px; line-height: 1.45; }
    .loading-row { display: inline-flex; align-items: center; gap: 8px; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(59,130,246,.22); border-top-color: currentColor; border-radius: 999px; animation: spin .8s linear infinite; }
    button .spinner { width: 15px; height: 15px; border-color: rgba(255,255,255,.36); border-top-color: #fff; }
    .skeleton-card { border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; padding: 13px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
    .skeleton-line { height: 10px; margin: 8px 0; border-radius: 999px; background: linear-gradient(90deg, #e2e8f0 0%, #f8fafc 48%, #e2e8f0 100%); background-size: 200% 100%; animation: shimmer 1.2s ease-in-out infinite; }
    .skeleton-line.short { width: 42%; }
    .skeleton-line.medium { width: 68%; }
    .skeleton-line.long { width: 92%; }
    .asset-card.is-saving::after { content: ""; position: absolute; inset: 0; background: rgba(15,23,42,.32); }
    .asset-card.is-saving .asset-save { z-index: 1; }
    .asset-card.is-saved-candidate .asset-thumb { opacity: .72; }
    @property --comment-aurora-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes comment-aurora-flow { to { --comment-aurora-angle: 360deg; } }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .comment-bubble, .skeleton-line, .spinner { animation: none !important; transition: none !important; } .comment-bubble:hover { transform: none; } }
    .asset-search { display: grid; grid-template-columns: minmax(0, 1fr) 118px; gap: 8px; }
    .asset-search input, .asset-search select { min-width: 0; padding: 10px 11px; border: 1px solid #dbe3ef; border-radius: 12px; background: #ffffff; color: #111827; font: inherit; font-size: 12px; font-weight: 700; outline: none; }
    .asset-search input:focus, .asset-search select:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
    .asset-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
    .asset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .asset-card { position: relative; min-width: 0; aspect-ratio: 1 / 1; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
    .asset-card.saved { width: 64px; height: 64px; aspect-ratio: auto; border-radius: 12px; }
    .asset-card[draggable="true"] { cursor: grab; }
    .asset-card[draggable="true"]:active { cursor: grabbing; }
    .asset-thumb { width: 100%; height: 100%; display: block; background: #f1f5f9; object-fit: contain; }
    .composer-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 50px; padding: 8px 10px 10px 10px; }
    .asset-menu-wrap { position: static; min-width: 0; }
    .asset-menu-toggle { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; min-width: 42px; padding: 0; border-radius: 999px; background: transparent; box-shadow: none; color: #64748b; }
    .asset-menu-toggle:hover:not(:disabled) { background: #f1f5f9; color: #111827; }
    .local-assets-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 10px); z-index: 11; display: none; width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; box-shadow: 0 18px 44px rgba(15,23,42,.12); }
    .local-assets-menu.open { display: block; }
    .local-assets-menu-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .asset-search-toggle { display: inline-flex; align-items: center; justify-content: center; width: 32px; min-width: 32px; height: 32px; padding: 0; border-radius: 999px; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
    .asset-search-view { position: absolute; inset: 0; z-index: 12; display: flex; flex-direction: column; gap: 14px; padding: 20px; background: #ffffff; overflow: auto; transform: translateX(105%); transition: transform .2s ease; box-shadow: -18px 0 44px rgba(15,23,42,.12); }
    .asset-search-view.open { transform: translateX(0); }
    .asset-search-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .asset-search-title { display: flex; flex-direction: column; gap: 2px; }
    .asset-search-title h2 { margin: 0; color: #0f172a; font-size: 16px; letter-spacing: 0; }
    .asset-search-title span { color: #64748b; font-size: 12px; line-height: 1.35; }
    .asset-back { width: auto; padding: 9px 11px; border-radius: 999px; background: #f1f5f9; color: #111827; box-shadow: none; }
    .asset-save { position: absolute; left: 7px; right: 7px; bottom: 7px; width: auto; padding: 7px 8px; border-radius: 10px; font-size: 11px; background: rgba(15,23,42,.9); color: #ffffff; box-shadow: 0 8px 16px rgba(15,23,42,.18); opacity: .96; }
    .asset-save.saved { background: rgba(22,101,52,.94); color: #ffffff; cursor: default; }
    .asset-empty { grid-column: 1 / -1; margin: 0; color: #64748b; font-size: 12px; line-height: 1.45; }
    .local-assets-menu .asset-grid { grid-template-columns: repeat(auto-fill, 64px); align-items: start; max-height: 220px; overflow: auto; }
    .local-assets-menu .asset-thumb { width: 64px; height: 64px; }
    .drop-active .hitbox { background: rgba(37,99,235,.08); outline: 2px dashed rgba(37,99,235,.38); outline-offset: -10px; }
    button { width: 100%; padding: 12px 14px; border: 1px solid #dbe3ef; border-radius: 12px; background: #f8fafc; color: #111827; font-weight: 800; cursor: pointer; box-shadow: none; }
    button:hover:not(:disabled) { background: #f1f5f9; }
    button:disabled { cursor: not-allowed; opacity: .5; }
    .primary-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; border-radius: 14px; border-color: #1d4ed8; background: #2563eb; color: #ffffff; font-size: 14px; letter-spacing: 0; box-shadow: 0 8px 18px rgba(37,99,235,.22); transition: transform .14s ease, box-shadow .14s ease, background .14s ease; }
    .primary-action:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 12px 24px rgba(37,99,235,.26); }
    .primary-action:active:not(:disabled) { transform: translateY(0); box-shadow: 0 6px 14px rgba(37,99,235,.22); }
    .composer-send { position: absolute; right: 10px; bottom: 10px; width: 42px; min-width: 42px; height: 42px; min-height: 42px; padding: 0; border-radius: 999px; }
    .composer-send:disabled { opacity: .44; }
    .composer-send .spinner + span { display: none; }
    .composer-icon { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .status { min-height: 20px; color: #64748b; font-size: 13px; line-height: 1.45; }
    .apply-lock-overlay { position: absolute; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 24px; background: rgba(248,250,252,.52); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); pointer-events: auto; }
    .apply-lock-overlay.open { display: flex; }
    .apply-lock-card { width: min(320px, calc(100% - 48px)); padding: 16px 18px; border: 1px solid rgba(20,184,166,.26); border-radius: 16px; background: rgba(255,255,255,.94); color: #0f172a; box-shadow: 0 24px 70px rgba(15,23,42,.2), 0 0 36px rgba(6,182,212,.16); text-align: center; }
    .apply-lock-card strong { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 900; }
    .apply-lock-card span { color: #64748b; font-size: 12px; line-height: 1.4; }
    @media (max-width: 900px) { .app { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; } .resize-handle { display: none; } aside { max-height: 48vh; min-width: 0; border-left: 0; border-top: 1px solid #e2e8f0; } .deck-nav { bottom: 10px; } .asset-search { grid-template-columns: 1fr; } }
  </style>
</head>
<body class="${bodyClass}">
  <main class="app">
    <section class="preview"><iframe id="deck" src="/deck?token=${encodeURIComponent(token)}"></iframe><div id="commentHighlightLayer" class="comment-highlight-layer" aria-hidden="true"></div><div id="hitbox" class="hitbox" aria-label="Deck element selection layer"></div><div id="visualMoveHandle" class="visual-move-handle" aria-hidden="true"></div><div id="visualResizeHandle" class="visual-resize-handle" aria-hidden="true"></div><div id="visualEditToolbar" class="visual-edit-toolbar" aria-live="polite"><span id="visualEditCount">No unsaved visual changes</span><button id="visualUndo" type="button">Undo</button><button id="visualReset" type="button">Reset</button><button id="visualSave" class="save-visual" type="button">Save Changes</button></div><nav class="deck-nav" aria-label="Deck navigation"><button id="deckPrev" type="button" title="Previous slide (ArrowLeft / ArrowUp / PageUp)">Previous</button><div id="deckCounter" class="deck-nav-status" aria-live="polite">-- / --</div><button id="deckNext" type="button" title="Next slide (ArrowRight / ArrowDown / Space / PageDown)">Next</button></nav><div id="applyLockOverlay" class="apply-lock-overlay" aria-hidden="true"><div class="apply-lock-card"><strong>Applying deck edit...</strong><span>Preview is locked until Codex finishes.</span></div></div></section>
    <div id="resizeHandle" class="resize-handle" role="separator" aria-label="Resize editor panel" aria-orientation="vertical" title="Drag to resize editor. Double-click to reset."></div>
    <aside>
      <div>
        <h1 class="review-brand" aria-label="Revela Review"><img class="wordmark-logo" src="${REVIEW_UI_ASSET_ROUTE}/logo-wordmark.png" alt="Revela" /></h1>
      </div>
      <div id="selectionSummary" class="selection-summary sr-only" aria-live="polite"><strong>Selection</strong><span>No references selected.</span><div id="selectionChips" class="selection-chips"></div></div>
      <div class="tabs" role="tablist" aria-label="Review mode">
        <button id="editTab" class="tab" type="button" role="tab">Comment</button>
        <button id="inspectTab" class="tab" type="button" role="tab">Insight</button>
      </div>
      <div id="editPanel" class="tab-panel">
        <div class="activity-panel"><div class="label">${activityLabel}</div><div id="commentThread" class="comment-thread" aria-live="polite"></div></div>
        <div class="comment-composer">
          <div class="label">Describe the change</div>
          <div class="comment-input-box">
            <div id="comment" class="comment-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Cmd/Ctrl-click slide elements to add @refs, then describe the exact edit."></div>
            <div class="composer-actions">
              <div class="asset-menu-wrap">
                <button id="localAssetToggle" class="asset-menu-toggle" type="button" aria-label="Local Assets" title="Local Assets" aria-expanded="false" aria-controls="localAssetMenu">${lucideIcon("image")}</button>
                <div id="localAssetMenu" class="local-assets-menu" aria-hidden="true">
                  <div class="local-assets-menu-head"><div class="label">Local Assets</div><button id="assetSearchToggle" class="asset-search-toggle" type="button" aria-label="Search assets" aria-expanded="false" aria-controls="assetSearchView" title="Search assets">${lucideIcon("plus")}</button></div>
                  <div id="editSavedAssets" class="asset-grid"><p class="asset-empty">No local assets yet. Click + to search assets.</p></div>
                </div>
              </div>
            </div>
            <button id="send" class="primary-action composer-send" type="button" aria-label="Apply" title="Apply" disabled>${sendButtonHtml}</button>
          </div>
        </div>
      </div>
      <div id="inspectPanel" class="tab-panel">
        <div class="panel">
          <label class="label" for="inspectComment">Insight comment</label>
          <div id="inspectComment" class="comment-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Cmd/Ctrl-click slide elements to add @refs, then ask about purpose or source."></div>
        </div>
        <div class="inspect-actions">
          <div class="inspect-options"><label for="inspectLanguage">Display Language</label><select id="inspectLanguage" class="inspect-select"><option>Auto</option><option>English</option><option>简体中文</option><option>繁體中文</option><option>日本語</option><option>Deutsch</option><option>Français</option><option>Español</option><option>Português</option><option>Arabic</option></select></div>
          <button id="inspectButton" disabled>Get Insight</button>
          <div id="inspectStale"></div>
        </div>
        <div id="inspectCards" class="inspect-cards"><div class="inspect-empty">Select a deck element to create an @ref, optionally ask a question, then get insight. This does not edit the deck.</div></div>
      </div>
      <div id="assetSearchView" class="asset-search-view" aria-hidden="true">
        <div class="asset-search-head">
          <button id="assetSearchBack" class="asset-back" type="button">← Back</button>
          <div class="asset-search-title"><h2>Search Assets</h2><span>Save images to Local Assets, then use them from Comment.</span></div>
        </div>
        <div class="panel">
          <div class="asset-search"><input id="assetQuery" type="search" placeholder="Company logo, product photo, portrait..." /><select id="assetPurpose"><option value="logo" selected>logo</option><option value="illustration">photo</option><option value="hero">hero</option><option value="portrait">portrait</option><option value="screenshot">screenshot</option></select></div>
          <div class="asset-actions"><button id="assetSearchButton" type="button">Search Assets</button><button id="assetShuffleButton" type="button" disabled>Refresh</button></div>
          <div id="assetResults" class="asset-grid"><p class="asset-empty">Search image candidates, then save one to the workspace.</p></div>
        </div>
      </div>
      <div id="status" class="status"></div>
    </aside>
  </main>
  <div id="codexLogModal" class="codex-log-modal" aria-hidden="true">
    <div id="codexLogBackdrop" class="codex-log-backdrop"></div>
    <section class="codex-log-dialog" role="dialog" aria-modal="true" aria-labelledby="codexLogTitle">
      <div class="codex-log-head">
        <h2 id="codexLogTitle" class="codex-log-title">Codex execution log</h2>
        <button id="codexLogClose" class="codex-log-close" type="button" aria-label="Close execution log">×</button>
      </div>
      <div id="codexLogBody" class="codex-log-list"></div>
    </section>
  </div>
  <script>
    (() => {
      const token = ${encodedToken};
      const defaultMode = ${encodedDefaultMode};
      const reviewSurface = ${encodedSurface};
      const sendButtonHtml = ${encodedSendButtonHtml};
      const codexReview = reviewSurface === 'codex';
      const COMMENT_STALE_MS = 60000;
      const EDITOR_WIDTH_KEY = 'revela-edit-editor-width';
      const DEFAULT_EDITOR_WIDTH = 620;
      const MIN_EDITOR_WIDTH = 320;
      const MAX_EDITOR_WIDTH = 620;
      const REFERENCE_COLORS = [
        { border: '#7aa6d8', fill: 'rgba(122,166,216,.18)', bg: '#eaf2fb', text: '#244f78' },
        { border: '#a99bd9', fill: 'rgba(169,155,217,.18)', bg: '#f1eefb', text: '#574985' },
        { border: '#83b99a', fill: 'rgba(131,185,154,.18)', bg: '#edf7f1', text: '#2f6848' },
        { border: '#d7a775', fill: 'rgba(215,167,117,.18)', bg: '#fbf1e7', text: '#7a4d22' },
        { border: '#d493b0', fill: 'rgba(212,147,176,.18)', bg: '#faedf3', text: '#7b3f5b' },
        { border: '#73b8bd', fill: 'rgba(115,184,189,.18)', bg: '#e8f6f7', text: '#285f64' },
        { border: '#c7b46e', fill: 'rgba(199,180,110,.18)', bg: '#f8f3df', text: '#6b5b1e' },
        { border: '#9eb27e', fill: 'rgba(158,178,126,.18)', bg: '#f1f6e9', text: '#4f642e' },
        { border: '#c08fc8', fill: 'rgba(192,143,200,.18)', bg: '#f7edf8', text: '#6b3f73' },
        { border: '#8fa7c9', fill: 'rgba(143,167,201,.18)', bg: '#eef3fa', text: '#405a7b' },
      ];
      const state = {
        references: [],
        pendingComments: [],
        queuedCommentPolls: new Set(),
        hoverEl: null,
        hoverOutline: null,
        referenceOutlines: [],
        activeCommentId: '',
        activeCommentElements: [],
        commentHighlightOutlines: [],
        nextReferenceId: 1,
        nextCommentId: 1,
        initializedDoc: null,
        deckVersion: null,
        pendingRefreshMessage: false,
        bound: false,
        commentRange: null,
        resizeDrag: null,
        deckSlideIndex: 0,
        deckSlideCount: 0,
        pendingDeckSlideRestore: null,
        mode: defaultMode === 'inspect' ? 'inspect' : 'edit',
        inspecting: false,
        activeInspectRequestId: '',
        inspectEventLog: [],
        inspectLanguage: 'Auto',
        inspectFallback: null,
        sendingEdit: false,
        assetCandidates: [],
        savedAssets: [],
        selectedAsset: null,
        draggingAsset: null,
        assetDropTarget: null,
        assetDropOutline: null,
        assetSearchBusy: false,
        assetSavingIndex: -1,
        assetSearchPage: 1,
        assetSearchKey: '',
        assetVisibleCount: 0,
        assetPendingCount: 0,
        visualChanges: [],
        activeVisualMove: null,
        activeVisualResize: null,
        hoverVisualTarget: null,
        savingVisualChanges: false,
      };
      const els = {
        frame: null,
        commentHighlightLayer: null,
        hitbox: null,
        resizeHandle: null,
        visualMoveHandle: null,
        visualResizeHandle: null,
        visualEditToolbar: null,
        visualEditCount: null,
        visualUndo: null,
        visualReset: null,
        visualSave: null,
        deckPrev: null,
        deckNext: null,
        deckCounter: null,
        selectionSummary: null,
        selectionChips: null,
        editTab: null,
        inspectTab: null,
        editPanel: null,
        inspectPanel: null,
        comment: null,
        commentThread: null,
        send: null,
        inspectComment: null,
        inspectButton: null,
        inspectLanguage: null,
        inspectCards: null,
        inspectStale: null,
        localAssetToggle: null,
        localAssetMenu: null,
        assetSearchToggle: null,
        assetSearchBack: null,
        assetSearchView: null,
        assetQuery: null,
        assetPurpose: null,
        assetSearchButton: null,
        assetShuffleButton: null,
        assetResults: null,
        editSavedAssets: null,
        applyLockOverlay: null,
        codexLogModal: null,
        codexLogBackdrop: null,
        codexLogClose: null,
        codexLogTitle: null,
        codexLogBody: null,
        status: null,
      };

      window.addEventListener('error', (event) => reportError(event.error || event.message));
      window.addEventListener('unhandledrejection', (event) => reportError(event.reason));

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
      } else {
        boot();
      }

      function boot() {
        try {
          els.frame = document.getElementById('deck');
          els.commentHighlightLayer = document.getElementById('commentHighlightLayer');
          els.hitbox = document.getElementById('hitbox');
          els.resizeHandle = document.getElementById('resizeHandle');
          els.visualMoveHandle = document.getElementById('visualMoveHandle');
          els.visualResizeHandle = document.getElementById('visualResizeHandle');
          els.visualEditToolbar = document.getElementById('visualEditToolbar');
          els.visualEditCount = document.getElementById('visualEditCount');
          els.visualUndo = document.getElementById('visualUndo');
          els.visualReset = document.getElementById('visualReset');
          els.visualSave = document.getElementById('visualSave');
          els.deckPrev = document.getElementById('deckPrev');
          els.deckNext = document.getElementById('deckNext');
          els.deckCounter = document.getElementById('deckCounter');
          els.selectionSummary = document.getElementById('selectionSummary');
          els.selectionChips = document.getElementById('selectionChips');
          els.editTab = document.getElementById('editTab');
          els.inspectTab = document.getElementById('inspectTab');
          els.editPanel = document.getElementById('editPanel');
          els.inspectPanel = document.getElementById('inspectPanel');
          els.comment = document.getElementById('comment');
          els.commentThread = document.getElementById('commentThread');
          els.send = document.getElementById('send');
          els.inspectComment = document.getElementById('inspectComment');
          els.inspectButton = document.getElementById('inspectButton');
          els.inspectCards = document.getElementById('inspectCards');
          els.inspectStale = document.getElementById('inspectStale');
          els.localAssetToggle = document.getElementById('localAssetToggle');
          els.localAssetMenu = document.getElementById('localAssetMenu');
          els.assetSearchToggle = document.getElementById('assetSearchToggle');
          els.assetSearchBack = document.getElementById('assetSearchBack');
          els.assetSearchView = document.getElementById('assetSearchView');
          els.assetQuery = document.getElementById('assetQuery');
          els.assetPurpose = document.getElementById('assetPurpose');
          els.assetSearchButton = document.getElementById('assetSearchButton');
          els.assetShuffleButton = document.getElementById('assetShuffleButton');
          els.assetResults = document.getElementById('assetResults');
          els.editSavedAssets = document.getElementById('editSavedAssets');
          els.applyLockOverlay = document.getElementById('applyLockOverlay');
          els.codexLogModal = document.getElementById('codexLogModal');
          els.codexLogBackdrop = document.getElementById('codexLogBackdrop');
          els.codexLogClose = document.getElementById('codexLogClose');
          els.codexLogTitle = document.getElementById('codexLogTitle');
          els.codexLogBody = document.getElementById('codexLogBody');
          els.status = document.getElementById('status');

          els.inspectLanguage = document.getElementById('inspectLanguage');

          if (!els.frame || !els.commentHighlightLayer || !els.hitbox || !els.resizeHandle || !els.visualMoveHandle || !els.visualResizeHandle || !els.visualEditToolbar || !els.visualEditCount || !els.visualUndo || !els.visualReset || !els.visualSave || !els.deckPrev || !els.deckNext || !els.deckCounter || !els.selectionSummary || !els.selectionChips || !els.editTab || !els.inspectTab || !els.editPanel || !els.inspectPanel || !els.comment || !els.commentThread || !els.send || !els.inspectComment || !els.inspectButton || !els.inspectLanguage || !els.inspectCards || !els.inspectStale || !els.localAssetToggle || !els.localAssetMenu || !els.assetSearchToggle || !els.assetSearchBack || !els.assetSearchView || !els.assetQuery || !els.assetPurpose || !els.assetSearchButton || !els.assetShuffleButton || !els.assetResults || !els.editSavedAssets || !els.applyLockOverlay || !els.codexLogModal || !els.codexLogBackdrop || !els.codexLogClose || !els.codexLogTitle || !els.codexLogBody || !els.status) {
            throw new Error('Editor boot failed: required DOM nodes are missing.');
          }

          restoreEditorWidth();
          bindEvents();
          setMode(state.mode);
          updateVisualToolbar();
          setStatus('Review ready. Ctrl/Cmd + click deck elements to reference them.');
          initFrame();
          loadReviewComments();
          loadSavedAssets();
          startDeckVersionPolling();
        } catch (error) {
          reportError(error);
        }
      }

      function bindEvents() {
        if (state.bound) return;
        state.bound = true;
        els.frame.addEventListener('load', initFrame);
        window.addEventListener('resize', renderActiveCommentHighlights);
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            if (els.codexLogModal.classList.contains('open')) {
              closeCodexLogModal();
              return;
            }
            if (isApplyLocked()) {
              event.preventDefault();
              setStatus(applyLockStatus());
              return;
            }
            closeLocalAssetMenu();
            clearHover();
            return;
          }
          if (isApplyLocked() && !isTextInputTarget(event.target)) {
            event.preventDefault();
            return;
          }
          if (isTextInputTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
          if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(event.key)) {
            event.preventDefault();
            nextDeckSlide();
          } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) {
            event.preventDefault();
            prevDeckSlide();
          }
        });
        document.addEventListener('click', (event) => {
          if (!els.localAssetMenu.classList.contains('open')) return;
          const target = event.target;
          if (target instanceof Node && (els.localAssetMenu.contains(target) || els.localAssetToggle.contains(target))) return;
          closeLocalAssetMenu();
        });
        els.comment.addEventListener('input', () => {
          saveCommentRange();
          syncReferencesFromComment(false, els.comment);
          syncSelectedAssetFromComment();
          updateSendState();
        });
        els.comment.addEventListener('keyup', saveCommentRange);
        els.comment.addEventListener('mouseup', saveCommentRange);
        els.inspectComment.addEventListener('input', () => {
          saveCommentRange();
          syncReferencesFromComment(false, els.inspectComment);
          updateSendState();
        });
        els.inspectComment.addEventListener('keyup', saveCommentRange);
        els.inspectComment.addEventListener('mouseup', saveCommentRange);
        document.addEventListener('selectionchange', saveCommentRange);
        els.hitbox.addEventListener('pointermove', onHover);
        els.hitbox.addEventListener('pointerleave', clearHoverSilently);
        els.hitbox.addEventListener('pointerdown', onPointerDown);
        els.hitbox.addEventListener('click', onClick);
        els.hitbox.addEventListener('contextmenu', (event) => {
          if (event.ctrlKey || event.metaKey) event.preventDefault();
        });
        els.hitbox.addEventListener('wheel', (event) => {
          if (isApplyLocked()) {
            event.preventDefault();
            return;
          }
          const win = els.frame.contentWindow;
          if (!win) return;
          event.preventDefault();
          win.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
          renderHoverOutline(state.hoverEl);
          renderReferenceOutlines();
          renderActiveCommentHighlights();
        }, { passive: false });
        els.resizeHandle.addEventListener('pointerdown', startEditorResize);
        els.resizeHandle.addEventListener('dblclick', resetEditorWidth);
        els.visualUndo.addEventListener('click', undoVisualChange);
        els.visualReset.addEventListener('click', resetVisualChanges);
        els.visualSave.addEventListener('click', saveVisualChanges);
        els.deckPrev.addEventListener('click', prevDeckSlide);
        els.deckNext.addEventListener('click', nextDeckSlide);
        els.send.addEventListener('click', sendComment);
        els.inspectButton.addEventListener('click', inspectCurrentSelection);
        els.localAssetToggle.addEventListener('click', toggleLocalAssetMenu);
        els.assetSearchToggle.addEventListener('click', toggleAssetSearchPanel);
        els.assetSearchBack.addEventListener('click', closeAssetSearchPanel);
        els.assetSearchButton.addEventListener('click', () => searchAssets(false));
        els.assetShuffleButton.addEventListener('click', () => searchAssets(true));
        els.codexLogBackdrop.addEventListener('click', closeCodexLogModal);
        els.codexLogClose.addEventListener('click', closeCodexLogModal);
        els.assetQuery.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            searchAssets(false);
          }
        });
        els.assetPurpose.addEventListener('change', () => resetAssetSearchBatch());
        els.inspectLanguage.addEventListener('change', () => {
          state.inspectLanguage = els.inspectLanguage.value || 'Auto';
        });
        els.editTab.addEventListener('click', () => setMode('edit'));
        els.inspectTab.addEventListener('click', () => setMode('inspect'));
        els.hitbox.addEventListener('dragover', onAssetDragOver);
        els.hitbox.addEventListener('dragleave', onAssetDragLeave);
        els.hitbox.addEventListener('drop', onAssetDrop);
      }

      function setMode(mode) {
        state.mode = mode === 'inspect' ? 'inspect' : 'edit';
        els.editTab.classList.toggle('active', state.mode === 'edit');
        els.inspectTab.classList.toggle('active', state.mode === 'inspect');
        els.editPanel.classList.toggle('active', state.mode === 'edit');
        els.inspectPanel.classList.toggle('active', state.mode === 'inspect');
        saveCommentRange();
        updateSendState();
      }

      function activeCommentEditor() {
        return state.mode === 'inspect' ? els.inspectComment : els.comment;
      }

      function isApplyLocked() {
        return state.pendingComments.some((comment) => comment && comment.status === 'applying');
      }

      function applyLockStatus() {
        return 'Wait for the current apply to finish before making another change.';
      }

      function updateApplyLockUi() {
        const locked = isApplyLocked();
        els.applyLockOverlay.classList.toggle('open', locked);
        els.applyLockOverlay.setAttribute('aria-hidden', locked ? 'false' : 'true');
        els.comment.setAttribute('contenteditable', 'true');
        els.inspectComment.setAttribute('contenteditable', 'true');
        els.localAssetToggle.disabled = locked;
        els.assetSearchToggle.disabled = locked;
        els.assetSearchBack.disabled = locked;
        els.assetQuery.disabled = locked;
        els.assetPurpose.disabled = locked;
        if (locked) {
          closeLocalAssetMenu();
          closeAssetSearchPanel();
          clearHoverSilently();
        }
        updateDeckNavControls();
        updateVisualToolbar();
        updateAssetShuffleState();
        updateSendState();
      }

      function toggleLocalAssetMenu() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        setLocalAssetMenuOpen(!els.localAssetMenu.classList.contains('open'));
      }

      function closeLocalAssetMenu() {
        setLocalAssetMenuOpen(false);
      }

      function setLocalAssetMenuOpen(open) {
        els.localAssetMenu.classList.toggle('open', open);
        els.localAssetMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
        els.localAssetToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      function toggleAssetSearchPanel() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const open = !els.assetSearchView.classList.contains('open');
        setAssetSearchOpen(open);
      }

      function closeAssetSearchPanel() {
        setAssetSearchOpen(false);
      }

      function setAssetSearchOpen(open) {
        if (open) closeLocalAssetMenu();
        els.assetSearchView.classList.toggle('open', open);
        els.assetSearchView.setAttribute('aria-hidden', open ? 'false' : 'true');
        els.assetSearchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        els.assetSearchToggle.innerHTML = '${lucideIcon("plus")}';
        if (open) els.assetQuery.focus();
      }

      function restoreEditorWidth() {
        try {
          const saved = Number(window.localStorage.getItem(EDITOR_WIDTH_KEY));
          setEditorWidth(Number.isFinite(saved) ? saved : DEFAULT_EDITOR_WIDTH, false);
        } catch {
          setEditorWidth(DEFAULT_EDITOR_WIDTH, false);
        }
      }

      function startEditorResize(event) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        event.preventDefault();
        const currentWidth = Number.parseFloat(getComputedStyle(document.querySelector('.app')).getPropertyValue('--editor-width')) || DEFAULT_EDITOR_WIDTH;
        state.resizeDrag = { startX: event.clientX, startWidth: currentWidth };
        document.body.classList.add('resizing');
        els.resizeHandle.setPointerCapture?.(event.pointerId);
        window.addEventListener('pointermove', resizeEditor);
        window.addEventListener('pointerup', stopEditorResize, { once: true });
      }

      function resizeEditor(event) {
        if (!state.resizeDrag) return;
        const nextWidth = state.resizeDrag.startWidth + state.resizeDrag.startX - event.clientX;
        setEditorWidth(nextWidth, true);
      }

      function stopEditorResize() {
        state.resizeDrag = null;
        document.body.classList.remove('resizing');
        window.removeEventListener('pointermove', resizeEditor);
      }

      function resetEditorWidth() {
        setEditorWidth(DEFAULT_EDITOR_WIDTH, true);
      }

      function isDirectResizable(target) {
        if (!target || !target.dataset || !target.dataset.revelaEditId || !target.dataset.revelaEditKind) return false;
        if (target.dataset.revelaEditKind === 'image') return target.tagName?.toLowerCase() === 'img';
        if (target.dataset.revelaEditKind === 'box') {
          const computed = els.frame.contentWindow?.getComputedStyle(target);
          return computed ? computed.display !== 'inline' : true;
        }
        if (target.dataset.revelaEditKind === 'text-width') {
          const computed = els.frame.contentWindow?.getComputedStyle(target);
          return computed ? computed.display !== 'inline' : true;
        }
        return false;
      }

      function isDirectMovable(target) {
        return isDirectResizable(target);
      }

      function visualResizeMode(target) {
        if (target?.dataset?.revelaEditKind === 'text-width') return 'text-width';
        if (target?.dataset?.revelaEditKind === 'image') return 'image';
        return 'box';
      }

      function visualChangeKey(payload) {
        return (payload?.type || '') + ':' + (payload?.editId || '');
      }

      function upsertVisualChange(change) {
        const key = visualChangeKey(change);
        const existing = state.visualChanges.find((item) => visualChangeKey(item) === key);
        if (existing) {
          existing.after = change.after;
          return;
        }
        state.visualChanges.push(change);
      }

      function currentTranslate(target) {
        const computed = els.frame.contentWindow?.getComputedStyle(target);
        return simpleTranslateFromTranslate(target.style.translate)
          || simpleTranslateFromTranslate(computed?.translate)
          || simpleTranslateFromTransform(target.style.transform)
          || simpleTranslateFromTransform(computed?.transform)
          || { x: 0, y: 0 };
      }

      function simpleTranslateFromTranslate(translate) {
        const normalized = String(translate || '').trim();
        if (!normalized || normalized === 'none') return null;
        const match = /^(-?\d+(?:\.\d+)?)px(?:\s+|\s*,\s*)(-?\d+(?:\.\d+)?)px$/.exec(normalized);
        return match ? finitePoint(Number(match[1]), Number(match[2])) : null;
      }

      function simpleTranslateFromTransform(transform) {
        const normalized = String(transform || '').trim();
        if (!normalized || normalized === 'none') return { x: 0, y: 0 };
        const translate = /^translate\(\s*(-?\d+(?:\.\d+)?)px(?:\s*,\s*|\s+)(-?\d+(?:\.\d+)?)px\s*\)$/.exec(normalized);
        if (translate) return finitePoint(Number(translate[1]), Number(translate[2]));
        const matrix = /^matrix\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/.exec(normalized);
        if (!matrix) return null;
        const a = Number(matrix[1]);
        const b = Number(matrix[2]);
        const c = Number(matrix[3]);
        const d = Number(matrix[4]);
        if (a !== 1 || b !== 0 || c !== 0 || d !== 1) return null;
        return finitePoint(Number(matrix[5]), Number(matrix[6]));
      }

      function finitePoint(x, y) {
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      }

      function renderVisualMoveHandle(target) {
        if (!els.visualMoveHandle) return;
        if (!target || !isDirectMovable(target) || state.activeVisualMove) {
          els.visualMoveHandle.style.display = 'none';
          return;
        }
        const rect = target.getBoundingClientRect();
        els.visualMoveHandle.style.display = 'block';
        els.visualMoveHandle.style.left = rect.left + 'px';
        els.visualMoveHandle.style.top = rect.top + 'px';
      }

      function boundedImageSize(active, event) {
        const dx = event.clientX - active.startX;
        const dy = event.clientY - active.startY;
        const width = Math.max(24, Math.round(active.startWidth + dx));
        if (event.shiftKey) return { width, height: Math.max(24, Math.round(active.startHeight + dy)) };
        const ratio = active.startHeight && active.startWidth ? active.startHeight / active.startWidth : 1;
        return { width, height: Math.max(24, Math.round(width * ratio)) };
      }

      function boundedBoxSize(active, event) {
        return {
          width: Math.max(40, Math.round(active.startWidth + event.clientX - active.startX)),
          height: Math.max(24, Math.round(active.startHeight + event.clientY - active.startY)),
        };
      }

      function boundedTextWidth(active, event) {
        return Math.max(80, Math.round(active.startWidth + event.clientX - active.startX));
      }

      function renderVisualResizeHandle(target) {
        if (!els.visualResizeHandle) return;
        if (!target || !isDirectResizable(target) || state.activeVisualResize) {
          els.visualResizeHandle.style.display = 'none';
          return;
        }
        const rect = target.getBoundingClientRect();
        const mode = visualResizeMode(target);
        els.visualResizeHandle.dataset.mode = mode;
        els.visualResizeHandle.style.display = 'block';
        els.visualResizeHandle.style.left = rect.right + 'px';
        els.visualResizeHandle.style.top = (mode === 'text-width' ? rect.top + rect.height / 2 : rect.bottom) + 'px';
      }

      function renderVisualHandles(target) {
        if (isApplyLocked()) {
          state.hoverVisualTarget = null;
          renderVisualMoveHandle(null);
          renderVisualResizeHandle(null);
          return;
        }
        state.hoverVisualTarget = target && (isDirectResizable(target) || isDirectMovable(target)) ? target : null;
        renderVisualMoveHandle(state.hoverVisualTarget);
        renderVisualResizeHandle(state.hoverVisualTarget);
      }

      function pointerIsOnVisualMoveHandle(event) {
        if (!state.hoverVisualTarget || !els.visualMoveHandle || els.visualMoveHandle.style.display === 'none') return false;
        const rect = els.visualMoveHandle.getBoundingClientRect();
        return event.clientX >= rect.left - 6 && event.clientX <= rect.right + 6 && event.clientY >= rect.top - 6 && event.clientY <= rect.bottom + 6;
      }

      function pointerIsOnVisualResizeHandle(event) {
        if (!state.hoverVisualTarget || !els.visualResizeHandle || els.visualResizeHandle.style.display === 'none') return false;
        const rect = els.visualResizeHandle.getBoundingClientRect();
        return event.clientX >= rect.left - 6 && event.clientX <= rect.right + 6 && event.clientY >= rect.top - 6 && event.clientY <= rect.bottom + 6;
      }

      function startVisualMove(event) {
        if (isApplyLocked()) return false;
        const target = state.hoverVisualTarget;
        if (!target || !isDirectMovable(target)) return false;
        event.preventDefault();
        event.stopPropagation();
        const beforeStyle = target.getAttribute('style') || '';
        const startTranslate = currentTranslate(target);
        state.activeVisualMove = {
          target,
          payload: { editId: target.dataset.revelaEditId, kind: target.dataset.revelaEditKind },
          startX: event.clientX,
          startY: event.clientY,
          beforeStyle,
          startTranslate,
        };
        setStatus('Moving preview only. Click Save Changes to write the deck.');
        window.addEventListener('pointermove', updateVisualMove);
        window.addEventListener('pointerup', finishVisualMove, { once: true });
        return true;
      }

      function updateVisualMove(event) {
        const active = state.activeVisualMove;
        if (!active) return;
        let dx = Math.round(event.clientX - active.startX);
        let dy = Math.round(event.clientY - active.startY);
        if (event.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const nextX = active.startTranslate.x + dx;
        const nextY = active.startTranslate.y + dy;
        active.target.style.translate = nextX + 'px ' + nextY + 'px';
        renderHoverOutline(active.target);
        renderVisualMoveHandle(active.target);
        renderVisualResizeHandle(active.target);
      }

      function finishVisualMove() {
        const active = state.activeVisualMove;
        state.activeVisualMove = null;
        window.removeEventListener('pointermove', updateVisualMove);
        if (!active) return;
        const translate = active.target.style.translate || 'none';
        if (translate !== 'none') {
          upsertVisualChange({
            type: 'move',
            editId: active.payload.editId,
            kind: active.payload.kind,
            before: { style: active.beforeStyle },
            after: { stylePatch: { translate } },
          });
        }
        updateVisualToolbar();
        renderVisualMoveHandle(active.target);
        renderVisualResizeHandle(active.target);
      }

      function startVisualResize(event) {
        if (isApplyLocked()) return false;
        const target = state.hoverVisualTarget;
        if (!target || !isDirectResizable(target)) return false;
        event.preventDefault();
        event.stopPropagation();
        const rect = target.getBoundingClientRect();
        const tag = target.tagName.toLowerCase();
        const beforeStyle = target.getAttribute('style') || '';
        state.activeVisualResize = {
          target,
          payload: { editId: target.dataset.revelaEditId, kind: target.dataset.revelaEditKind },
          tag,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: rect.width,
          startHeight: rect.height,
          beforeStyle,
          mode: visualResizeMode(target),
          before: { width: rect.width, height: rect.height },
        };
        setStatus('Resizing preview only. Click Save Changes to write the deck.');
        window.addEventListener('pointermove', updateVisualResize);
        window.addEventListener('pointerup', finishVisualResize, { once: true });
        return true;
      }

      function updateVisualResize(event) {
        const active = state.activeVisualResize;
        if (!active) return;
        if (active.mode === 'text-width') {
          const width = boundedTextWidth(active, event);
          active.target.style.width = width + 'px';
          active.target.style.maxWidth = width + 'px';
        } else if (active.mode === 'image') {
          const size = boundedImageSize(active, event);
          const width = size.width;
          const height = size.height;
          active.target.style.width = width + 'px';
          active.target.style.height = height + 'px';
        } else {
          const size = boundedBoxSize(active, event);
          active.target.style.width = size.width + 'px';
          active.target.style.height = size.height + 'px';
        }
        renderHoverOutline(active.target);
        renderVisualMoveHandle(active.target);
        renderVisualResizeHandle(active.target);
      }

      function finishVisualResize() {
        const active = state.activeVisualResize;
        state.activeVisualResize = null;
        window.removeEventListener('pointermove', updateVisualResize);
        if (!active) return;
        const rect = active.target.getBoundingClientRect();
        const stylePatch = active.mode === 'text-width'
          ? { width: Math.round(rect.width) + 'px', 'max-width': Math.round(rect.width) + 'px' }
          : { width: Math.round(rect.width) + 'px', height: Math.round(rect.height) + 'px' };
        upsertVisualChange({
          type: 'resize',
          editId: active.payload.editId,
          kind: active.payload.kind,
          before: { style: active.beforeStyle, width: active.before.width, height: active.before.height },
          after: { stylePatch, width: rect.width, height: rect.height },
        });
        updateVisualToolbar();
        renderVisualMoveHandle(active.target);
        renderVisualResizeHandle(active.target);
      }

      function undoVisualChange() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const change = state.visualChanges.pop();
        if (!change) return;
        const target = elementFromVisualChange(change);
        if (target) target.setAttribute('style', change.before.style || '');
        updateVisualToolbar();
        renderHoverOutline(state.hoverEl);
        renderVisualHandles(state.hoverEl);
        setStatus('Undid last visual change.');
      }

      function resetVisualChanges() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        while (state.visualChanges.length) {
          const change = state.visualChanges.pop();
          const target = change ? elementFromVisualChange(change) : null;
          if (target) target.setAttribute('style', change.before.style || '');
        }
        updateVisualToolbar();
        renderHoverOutline(state.hoverEl);
        renderVisualHandles(state.hoverEl);
        setStatus('Reset unsaved visual changes.');
      }

      function updateVisualToolbar() {
        const count = state.visualChanges.length;
        const locked = isApplyLocked();
        els.visualEditToolbar.classList.toggle('active', count > 0);
        els.visualEditCount.textContent = count === 0 ? 'No unsaved visual changes' : count + ' unsaved visual change' + (count === 1 ? '' : 's');
        els.visualUndo.disabled = locked || count === 0 || state.savingVisualChanges;
        els.visualReset.disabled = locked || count === 0 || state.savingVisualChanges;
        els.visualSave.disabled = locked || count === 0 || state.savingVisualChanges;
      }

      async function saveVisualChanges() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        if (!state.visualChanges.length || state.savingVisualChanges) return;
        state.savingVisualChanges = true;
        updateVisualToolbar();
        setStatus('Saving visual changes...');
        try {
          const res = await fetch('/api/visual-changes?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ deckVersion: state.deckVersion, changes: state.visualChanges }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Could not save visual changes.');
          state.visualChanges = [];
          state.deckVersion = body.deckVersion || state.deckVersion;
          updateVisualToolbar();
          refreshDeckPreview(Date.now());
          setStatus('Visual changes saved. Refreshing preview...');
        } catch (error) {
          reportError(error);
        } finally {
          state.savingVisualChanges = false;
          updateVisualToolbar();
        }
      }

      function setEditorWidth(width, persist) {
        const nextWidth = clampEditorWidth(width);
        document.querySelector('.app')?.style.setProperty('--editor-width', nextWidth + 'px');
        if (!persist) return;
        try {
          window.localStorage.setItem(EDITOR_WIDTH_KEY, String(nextWidth));
        } catch {}
      }

      function clampEditorWidth(width) {
        return Math.min(MAX_EDITOR_WIDTH, Math.max(MIN_EDITOR_WIDTH, Math.round(width)));
      }

      function initFrame() {
        try {
          const doc = els.frame.contentDocument;
          if (!doc) {
            setStatus('Unable to access deck iframe.');
            return;
          }
          if (doc === state.initializedDoc) return;
          if (doc.location.href === 'about:blank') return;
          if (doc.readyState === 'loading') return;
          state.initializedDoc = doc;
          clearReferences(false);
          state.hoverEl = null;
          state.hoverOutline = createOutline(doc, '#38bdf8', 'rgba(56,189,248,.12)');
          state.assetDropTarget = null;
          state.assetDropOutline = createOutline(doc, '#2563eb', 'rgba(37,99,235,.12)');
          state.referenceOutlines = [];
          state.commentHighlightOutlines.forEach((outline) => outline.remove());
          state.commentHighlightOutlines = [];
          doc.addEventListener('scroll', () => {
            renderHoverOutline(state.hoverEl);
            renderVisualHandles(state.hoverEl);
            renderReferenceOutlines();
            renderActiveCommentHighlights();
          }, true);
          const slides = getSlides(doc);
          syncDeckNavigation();
          restoreDeckSlideAfterRefresh();
          updateSendState();
          renderActiveCommentHighlights();
          if (state.pendingRefreshMessage) {
            state.pendingRefreshMessage = false;
            setStatus('Deck updated. Preview refreshed. Element references were cleared.');
          } else {
            setStatus(slides.length > 0 ? 'Review ready. Found ' + slides.length + ' slides. Ctrl/Cmd + click to reference elements.' : 'Review ready, but no .slide elements were found. Ctrl/Cmd + click to reference elements.');
          }
        } catch (error) {
          reportError(error);
        }
      }

      function isTextInputTarget(target) {
        if (!target || !(target instanceof Element)) return false;
        const tag = target.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
      }

      function syncDeckNavigation() {
        try {
          const doc = els.frame.contentDocument;
          const slides = doc ? getSlides(doc) : [];
          state.deckSlideCount = slides.length;
          state.deckSlideIndex = Math.max(0, Math.min(state.deckSlideIndex, Math.max(0, slides.length - 1)));
          updateDeckNavControls();
        } catch {
          state.deckSlideCount = 0;
          state.deckSlideIndex = 0;
          updateDeckNavControls();
        }
      }

      function updateDeckNavControls() {
        const total = state.deckSlideCount;
        const current = total > 0 ? state.deckSlideIndex + 1 : 0;
        const locked = isApplyLocked();
        els.deckCounter.textContent = total > 0 ? current + ' / ' + total : '-- / --';
        els.deckPrev.disabled = locked || total <= 1 || state.deckSlideIndex <= 0;
        els.deckNext.disabled = locked || total <= 1 || state.deckSlideIndex >= total - 1;
      }

      function prevDeckSlide() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        goToDeckSlide(state.deckSlideIndex - 1);
      }

      function nextDeckSlide() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        goToDeckSlide(state.deckSlideIndex + 1);
      }

      function goToDeckSlide(index) {
        try {
          const doc = els.frame.contentDocument;
          const win = els.frame.contentWindow;
          if (!doc || !win) return;
          const slides = getSlides(doc);
          if (!slides.length) {
            syncDeckNavigation();
            return;
          }
          const clamped = Math.max(0, Math.min(slides.length - 1, index));
          const nav = win.RevelaDeckNav;
          let handled = false;
          if (nav && typeof nav.goTo === 'function') {
            try {
              nav.goTo(clamped);
              handled = true;
            } catch {}
          } else if (nav && clamped > state.deckSlideIndex && typeof nav.next === 'function') {
            try {
              nav.next();
              handled = true;
            } catch {}
          } else if (nav && clamped < state.deckSlideIndex && typeof nav.prev === 'function') {
            try {
              nav.prev();
              handled = true;
            } catch {}
          }
          if (!handled) applyFallbackDeckNavigation(win, doc, slides, clamped);
          const changed = clamped !== state.deckSlideIndex;
          state.deckSlideIndex = clamped;
          updateDeckNavControls();
          if (changed) clearHoverSilently();
          else renderHoverOutline(state.hoverEl);
          renderVisualHandles(state.hoverEl);
          renderReferenceOutlines();
          renderActiveCommentHighlights();
        } catch (error) {
          reportError(error);
        }
      }

      function restoreDeckSlideAfterRefresh() {
        if (state.pendingDeckSlideRestore === null || state.pendingDeckSlideRestore === undefined) return;
        const targetIndex = state.pendingDeckSlideRestore;
        state.pendingDeckSlideRestore = null;
        restoreDeckSlide(targetIndex);
      }

      function restoreDeckSlide(index) {
        try {
          const doc = els.frame.contentDocument;
          const win = els.frame.contentWindow;
          if (!doc || !win) return;
          const slides = getSlides(doc);
          if (!slides.length) {
            syncDeckNavigation();
            return;
          }
          const clamped = Math.max(0, Math.min(slides.length - 1, index));
          const nav = win.RevelaDeckNav;
          let handled = false;
          if (nav && typeof nav.goTo === 'function') {
            try {
              nav.goTo(clamped);
              handled = true;
            } catch {}
          }
          if (!handled) applyFallbackDeckNavigation(win, doc, slides, clamped);
          state.deckSlideIndex = clamped;
          updateDeckNavControls();
        } catch (error) {
          reportError(error);
        }
      }

      function applyFallbackDeckNavigation(win, doc, slides, index) {
        const target = slides[index];
        const usesOverlaySlides = slides.some((slide) => {
          const style = win.getComputedStyle(slide);
          return style.position === 'absolute' || style.position === 'fixed' || style.opacity === '0' || slide.style.opacity !== '';
        });
        if (usesOverlaySlides) {
          slides.forEach((slide, i) => {
            slide.style.opacity = i === index ? '1' : '0';
            slide.style.pointerEvents = i === index ? 'auto' : 'none';
          });
          win.scrollTo?.(0, 0);
          return;
        }
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
          return;
        }
        doc.defaultView?.scrollTo?.(0, index * win.innerHeight);
      }

      function startDeckVersionPolling() {
        pollDeckVersion();
        window.setInterval(pollDeckVersion, 2000);
      }

      async function fetchDeckVersion() {
        const res = await fetch('/api/deck-version?token=' + encodeURIComponent(token), { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to check deck version');
        return {
          body,
          version: body.version || (String(body.mtimeMs) + ':' + String(body.size)),
        };
      }

      async function pollDeckVersion() {
        try {
          const { body, version: nextVersion } = await fetchDeckVersion();
          if (!state.deckVersion) {
            state.deckVersion = nextVersion;
            return;
          }
          if (state.deckVersion === nextVersion) {
            return;
          }
          state.deckVersion = nextVersion;
          refreshDeckPreview(body.mtimeMs);
        } catch (error) {
          reportError(error);
        }
      }

      function refreshDeckPreview(version) {
        state.pendingRefreshMessage = true;
        state.pendingDeckSlideRestore = state.deckSlideIndex;
        state.initializedDoc = null;
        state.visualChanges = [];
        updateVisualToolbar();
        clearReferences(true);
        state.hoverEl = null;
        if (state.hoverOutline) state.hoverOutline.style.display = 'none';
        if (els.visualMoveHandle) els.visualMoveHandle.style.display = 'none';
        if (els.visualResizeHandle) els.visualResizeHandle.style.display = 'none';
        state.hoverVisualTarget = null;
        state.assetDropTarget = null;
        if (state.assetDropOutline) state.assetDropOutline.style.display = 'none';
        state.referenceOutlines.forEach((outline) => outline.style.display = 'none');
        state.referenceOutlines = [];
        state.commentHighlightOutlines.forEach((outline) => outline.remove());
        state.commentHighlightOutlines = [];
        updateSendState();
        els.frame.src = '/deck?token=' + encodeURIComponent(token) + '&v=' + encodeURIComponent(String(version));
        setStatus('Deck changed. Refreshing preview...');
      }

      function onHover(event) {
        if (isApplyLocked()) return clearHoverSilently();
        try {
          initFrame();
          const directTarget = visualTargetFromPointer(event);
          const target = directTarget || selectable(targetFromPointer(event));
          if (!target || isReferenced(target)) {
            state.hoverEl = null;
            renderHoverOutline(null);
            renderVisualHandles(null);
            return;
          }
          state.hoverEl = target;
          renderHoverOutline(target);
          renderVisualHandles(target);
        } catch (error) {
          reportError(error);
        }
      }

      function onClick(event) {
        if (isApplyLocked()) return;
        try {
          initFrame();
          const target = selectable(targetFromPointer(event));
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            return;
          } else if (target) {
            setStatus('Use Ctrl/Cmd + click to reference this element in your comment.');
          }
        } catch (error) {
          reportError(error);
        }
      }

      function onPointerDown(event) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        if (!event.ctrlKey && !event.metaKey && pointerIsOnVisualMoveHandle(event)) {
          if (startVisualMove(event)) return;
        }
        if (!event.ctrlKey && !event.metaKey && pointerIsOnVisualResizeHandle(event)) {
          if (startVisualResize(event)) return;
        }
        if (!event.ctrlKey && !event.metaKey) return;
        try {
          initFrame();
          event.preventDefault();
          event.stopPropagation();
          toggleReference(selectable(targetFromPointer(event)));
        } catch (error) {
          reportError(error);
        }
      }

      async function sendComment() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        syncReferencesFromComment(false, els.comment);
        syncSelectedAssetFromComment();
        const text = getCommentText().trim();
        if (!text) return;
        const elements = state.references.map((reference) => reference.payload);
        const asset = state.selectedAsset || undefined;
        state.sendingEdit = true;
        updateSendState();
        setStatus('Applying comment...');
        try {
          const res = await fetch('/api/comments?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ comment: text, elements, asset, applyNow: true }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to apply comment');
          upsertPersistedComment(body.comment);
          clearReferences(false);
          state.selectedAsset = null;
          els.comment.textContent = '';
          renderReferenceOutlines();
          if (body.status === 'queued') {
            updatePendingCommentStatus(body.comment.id, 'queued', { requestId: '', progressEvent: null, failureRaw: '', failureMessage: '' });
            setStatus('Comment queued. It will apply after the current edit finishes.');
            pollQueuedComment(body.comment.id);
          } else {
            updatePendingCommentStatus(body.comment.id, 'applying', { requestId: body.commentRequestId || body.requestId || '', baseDeckVersion: body.deckVersion || state.deckVersion });
            setStatus('Applying comment with Codex...');
            if (body.commentRequestId || body.requestId) watchCommentProgress(body.comment.id, body.commentRequestId || body.requestId);
          }
        } catch (error) {
          reportError(error);
        } finally {
          state.sendingEdit = false;
          updateSendState();
        }
      }

      async function loadReviewComments() {
        try {
          const res = await fetch('/api/comments?token=' + encodeURIComponent(token), { cache: 'no-store' });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to load comments');
          state.pendingComments = Array.isArray(body.comments) ? body.comments.map(commentFromRecord) : [];
          renderCommentThread();
          state.pendingComments.forEach((comment) => {
            if (comment.status === 'queued') pollQueuedComment(comment.id);
            else if (comment.status === 'applying' && comment.requestId) watchCommentProgress(comment.id, comment.requestId);
          });
        } catch (error) {
          reportError(error);
        }
      }

      function upsertPersistedComment(record) {
        if (!record || !record.id) return;
        const next = commentFromRecord(record);
        const index = state.pendingComments.findIndex((item) => item.id === next.id);
        if (index >= 0) state.pendingComments[index] = { ...state.pendingComments[index], ...next };
        else state.pendingComments.push(next);
        if (state.activeCommentId === next.id) state.activeCommentElements = Array.isArray(next.elements) ? next.elements : [];
        state.pendingComments.sort((a, b) => (a.slideIndex || 0) - (b.slideIndex || 0) || (a.createdAt || 0) - (b.createdAt || 0));
        renderCommentThread();
      }

      function commentFromRecord(record) {
        const createdAt = Date.parse(record.createdAt || '') || Date.now();
        return {
          id: record.id,
          persisted: true,
          text: record.comment || '',
          elements: Array.isArray(record.elements) ? record.elements : [],
          slideIndex: record.slideIndex,
          status: record.status || 'open',
          createdAt,
          baseDeckVersion: record.deckVersion || state.deckVersion,
          updatedVersion: null,
          requestId: record.lastApplyRequestId || '',
          progressEvent: null,
          eventLog: [],
          failureRaw: record.lastApplyRaw || '',
          failureMessage: record.lastApplyError || '',
          stopped: record.status === 'stopped',
        };
      }

      async function applyPersistedComment(commentId) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const comment = state.pendingComments.find((item) => item.id === commentId);
        if (!comment || comment.status === 'applying' || comment.status === 'queued') return;
        updatePendingCommentStatus(commentId, 'applying', { stopped: false, baseDeckVersion: state.deckVersion || comment.baseDeckVersion, progressEvent: null, eventLog: [], failureRaw: '', failureMessage: '' });
        setStatus(comment.status === 'applied' || comment.status === 'updated' || comment.status === 'stale' ? 'Re-applying saved comment...' : 'Applying saved comment...');
        try {
          const res = await fetch('/api/comments/' + encodeURIComponent(commentId) + '/apply?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to apply comment');
          if (body.comment) upsertPersistedComment(body.comment);
          if (body.status === 'queued') {
            updatePendingCommentStatus(commentId, 'queued', { requestId: '', progressEvent: null, failureRaw: '', failureMessage: '' });
            setStatus('Comment queued. It will apply after the current edit finishes.');
            pollQueuedComment(commentId);
            return;
          }
          updatePendingCommentStatus(commentId, 'applying', { requestId: body.commentRequestId || body.requestId || '', baseDeckVersion: body.deckVersion || state.deckVersion });
          if (body.commentRequestId || body.requestId) watchCommentProgress(commentId, body.commentRequestId || body.requestId);
        } catch (error) {
          updatePendingCommentStatus(commentId, 'failed', { failureMessage: error instanceof Error ? error.message : String(error) });
          reportError(error);
        }
      }

      async function stopPersistedComment(commentId) {
        const comment = state.pendingComments.find((item) => item.id === commentId);
        if (!comment || !canStopPersistedComment(comment.status)) return;
        try {
          const res = await fetch('/api/comments/' + encodeURIComponent(commentId) + '/stop?token=' + encodeURIComponent(token), { method: 'POST' });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to stop comment');
          if (body.comment) upsertPersistedComment(body.comment);
          updatePendingCommentStatus(commentId, 'stopped', { stopped: true, requestId: '', progressEvent: null, failureRaw: 'Stopped by user.', failureMessage: 'Stopped by user.' });
          setStatus('Stopped comment apply.');
        } catch (error) {
          reportError(error);
        }
      }

      async function deletePersistedComment(commentId) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const comment = state.pendingComments.find((item) => item.id === commentId);
        if (!comment || !canDeletePersistedComment(comment.status)) return;
        try {
          const res = await fetch('/api/comments/' + encodeURIComponent(commentId) + '?token=' + encodeURIComponent(token), { method: 'DELETE' });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to delete comment');
          state.pendingComments = state.pendingComments.filter((item) => item.id !== commentId);
          if (state.activeCommentId === commentId) {
            state.activeCommentId = '';
            state.activeCommentElements = [];
            state.commentHighlightOutlines.forEach((outline) => renderParentBox(outline, null));
          }
          renderCommentThread();
          setStatus('Deleted comment.');
        } catch (error) {
          reportError(error);
        }
      }

      function pollQueuedComment(commentId) {
        if (state.queuedCommentPolls.has(commentId)) return;
        state.queuedCommentPolls.add(commentId);
        const tick = async () => {
          const current = state.pendingComments.find((item) => item.id === commentId);
          if (!current || current.status !== 'queued') {
            state.queuedCommentPolls.delete(commentId);
            return;
          }
          try {
            const res = await fetch('/api/comments?token=' + encodeURIComponent(token), { cache: 'no-store' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to refresh comments');
            const records = Array.isArray(body.comments) ? body.comments : [];
            records.forEach(upsertPersistedComment);
            const record = records.find((item) => item && item.id === commentId);
            if (record && record.status === 'applying' && record.lastApplyRequestId) {
              state.queuedCommentPolls.delete(commentId);
              watchCommentProgress(commentId, record.lastApplyRequestId);
              return;
            }
            if (record && record.status !== 'queued') {
              state.queuedCommentPolls.delete(commentId);
              return;
            }
          } catch (error) {
            // Keep polling: queued comments become actionable only when the server starts them.
          }
          setTimeout(tick, 1500);
        };
        setTimeout(tick, 750);
      }

      async function searchAssets(nextBatch) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const query = (els.assetQuery.value || '').trim();
        if (!query || state.assetSearchBusy) return;
        const key = query + '\u0000' + (els.assetPurpose.value || 'illustration');
        if (!nextBatch || state.assetSearchKey !== key) {
          state.assetSearchPage = 1;
          state.assetSearchKey = key;
        } else {
          state.assetSearchPage += 1;
        }
        state.assetSearchBusy = true;
        els.assetSearchButton.disabled = true;
        els.assetShuffleButton.disabled = true;
        renderAssetSearchLoading(nextBatch ? 'Searching another batch...' : 'Searching remote image sources...');
        setButtonLoading(els.assetSearchButton, true, 'Searching...');
        setStatus(nextBatch ? 'Searching another asset batch...' : 'Searching assets...');
        try {
          const params = new URLSearchParams({ query, purpose: els.assetPurpose.value || 'illustration', limit: '24', page: String(state.assetSearchPage) });
          const res = await fetch('/api/assets/search?token=' + encodeURIComponent(token) + '&' + params.toString(), { cache: 'no-store' });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Asset search failed');
          state.assetCandidates = Array.isArray(body.candidates) ? body.candidates : [];
          renderAssetCandidates();
          setStatus(state.assetCandidates.length ? 'Asset search complete. Click + to save an asset to the workspace.' : (nextBatch ? 'No more assets found. Try another query or purpose.' : 'No assets found. Try another query or purpose.'));
        } catch (error) {
          if (nextBatch) state.assetSearchPage = Math.max(1, state.assetSearchPage - 1);
          els.assetResults.innerHTML = '<p class="asset-empty">' + escapeHtml(error && error.message ? error.message : String(error)) + '</p>';
          reportError(error);
        } finally {
          state.assetSearchBusy = false;
          setButtonLoading(els.assetSearchButton, false, 'Search Assets');
          updateAssetShuffleState();
        }
      }

      function renderAssetSearchLoading(message) {
        els.assetResults.innerHTML = '<p class="asset-empty"><span class="loading-row"><span class="spinner" aria-hidden="true"></span>' + escapeHtml(message) + '</span></p>'
          + Array.from({ length: 8 }, () => '<div class="skeleton-card asset-skeleton"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div>').join('');
      }

      function resetAssetSearchBatch() {
        state.assetSearchPage = 1;
        state.assetSearchKey = '';
        updateAssetShuffleState();
      }

      function updateAssetShuffleState() {
        els.assetSearchButton.disabled = isApplyLocked() || state.assetSearchBusy;
        els.assetShuffleButton.disabled = isApplyLocked() || state.assetSearchBusy || !state.assetCandidates.length;
      }

      function renderAssetCandidates() {
        els.assetResults.textContent = '';
        state.assetVisibleCount = 0;
        state.assetPendingCount = state.assetCandidates.length;
        if (!state.assetCandidates.length) {
          els.assetResults.innerHTML = '<p class="asset-empty">No assets found. Try another query or purpose.</p>';
          return;
        }
        state.assetCandidates.forEach((candidate, index) => {
          const card = assetCard(candidate, false, index);
          const savedAsset = savedAssetForCandidate(candidate);
          if (state.assetSavingIndex === index) {
            card.classList.add('is-saving');
            appendAssetSaveButton(card, 'Saving...', 'Saving to workspace', () => {}, true);
          } else if (savedAsset) {
            card.classList.add('is-saved-candidate');
            appendAssetSaveButton(card, '✅ Saved', 'Asset already saved to Local Assets', () => {}, false, 'saved');
          } else {
            appendAssetSaveButton(card, 'Save', 'Save to workspace', () => saveCandidate(index));
          }
          els.assetResults.appendChild(card);
        });
        updateAssetShuffleState();
      }

      async function saveCandidate(index) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const candidate = state.assetCandidates[index];
        if (!candidate) return;
        state.assetSavingIndex = index;
        renderAssetCandidates();
        setStatus('Saving asset to workspace...');
        try {
          const res = await fetch('/api/assets/save?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ candidate, purpose: els.assetPurpose.value || candidate.purpose || 'illustration' }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to save asset');
          const listed = await loadSavedAssets();
          if (body.asset && (!listed || !findSavedAsset(body.asset.id))) {
            mergeSavedAsset(body.asset);
            renderSavedAssets();
          }
          const path = body.asset && (body.asset.path || body.asset.deckPath);
          setStatus(path ? 'Saved to ' + path + '. Use it from Local Assets.' : 'Asset saved. Use it from Local Assets.');
        } catch (error) {
          reportError(error);
        } finally {
          state.assetSavingIndex = -1;
          renderAssetCandidates();
        }
      }

      async function loadSavedAssets() {
        try {
          const res = await fetch('/api/assets/list?token=' + encodeURIComponent(token), { cache: 'no-store' });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to list assets');
          state.savedAssets = Array.isArray(body.assets) ? body.assets : [];
          renderSavedAssets();
          return true;
        } catch (error) {
          if (!state.savedAssets.length) {
            const message = '<p class="asset-empty">' + escapeHtml(error && error.message ? error.message : String(error)) + '</p>';
            els.editSavedAssets.innerHTML = message;
          }
          return false;
        }
      }

      function mergeSavedAsset(asset) {
        if (!asset || !asset.id) return;
        const next = state.savedAssets.filter((existing) => existing.id !== asset.id);
        next.unshift(asset);
        state.savedAssets = next;
      }

      function savedAssetForCandidate(candidate) {
        const id = slugifyAssetId(candidate && candidate.candidateId);
        if (!id) return null;
        return state.savedAssets.find((asset) => asset.id === id) || null;
      }

      function slugifyAssetId(value) {
        return String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      function renderSavedAssets() {
        renderSavedAssetGrid(els.editSavedAssets, 'No local assets yet. Click + to search assets.');
      }

      function renderSavedAssetGrid(container, emptyMessage) {
        container.textContent = '';
        if (!state.savedAssets.length) {
          container.innerHTML = '<p class="asset-empty">' + escapeHtml(emptyMessage) + '</p>';
          return;
        }
        state.savedAssets.forEach((asset) => {
          const card = assetCard(asset, true, 0);
          card.draggable = true;
          card.addEventListener('click', () => {
            addAssetToComment(asset);
            closeLocalAssetMenu();
          });
          card.addEventListener('dragstart', (event) => {
            state.draggingAsset = asset;
            event.dataTransfer?.setData('application/revela-asset-id', asset.id || '');
            event.dataTransfer?.setData('text/plain', asset.path || asset.id || '');
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
          });
          card.addEventListener('dragend', () => {
            state.draggingAsset = null;
            document.body.classList.remove('drop-active');
          });
          container.appendChild(card);
        });
      }

      function assetCard(asset, saved, index) {
        const card = document.createElement('div');
        card.className = saved ? 'asset-card saved' : 'asset-card';
        const image = document.createElement('img');
        image.className = 'asset-thumb';
        image.loading = !saved && index < 8 ? 'eager' : 'lazy';
        image.decoding = 'async';
        image.alt = asset.alt || asset.title || asset.id || 'Image asset';
        if (!saved) {
          image.addEventListener('load', () => markAssetImageLoaded());
          image.addEventListener('error', () => hideBrokenAssetCard(card));
        }
        image.src = saved ? (asset.previewUrl || '') : (asset.thumbnailUrl || asset.imageUrl || '');
        card.title = asset.title || asset.id || asset.alt || 'Image asset';
        card.appendChild(image);
        return card;
      }

      function markAssetImageLoaded() {
        state.assetVisibleCount += 1;
        state.assetPendingCount = Math.max(0, state.assetPendingCount - 1);
      }

      function hideBrokenAssetCard(card) {
        card.remove();
        state.assetPendingCount = Math.max(0, state.assetPendingCount - 1);
        if (!state.assetVisibleCount && !state.assetPendingCount) {
          els.assetResults.innerHTML = '<p class="asset-empty">No displayable images found. Try Refresh or another purpose.</p>';
        }
      }

      function appendAssetSaveButton(card, text, label, onClick, loading, variant) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = variant ? 'asset-save ' + variant : 'asset-save';
        button.innerHTML = loading ? '<span class="spinner" aria-hidden="true"></span><span>' + escapeHtml(text) + '</span>' : escapeHtml(text);
        button.disabled = !!loading || variant === 'saved';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.addEventListener('click', onClick);
        card.appendChild(button);
      }

      function addAssetToComment(asset) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        if (!asset) return;
        state.selectedAsset = asset;
        removeAssetChip();
        const intro = els.comment.textContent && !/\s$/.test(els.comment.textContent) ? ' Use asset ' : 'Use asset ';
        insertPlainText(intro);
        insertAssetChip(asset);
        insertPlainText(' ');
        setMode('edit');
        updateSendState();
        closeLocalAssetMenu();
        setStatus('Asset added to the Edit comment. Describe where or how to use it, then Apply.');
      }

      function onAssetDragOver(event) {
        if (isApplyLocked()) return;
        if (!state.draggingAsset) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('drop-active');
        const placement = collectAssetPlacement(event, state.draggingAsset);
        renderAssetDropTarget(placement);
      }

      function onAssetDragLeave() {
        document.body.classList.remove('drop-active');
        renderAssetDropTarget(null);
      }

      async function onAssetDrop(event) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const asset = state.draggingAsset || findSavedAsset(event.dataTransfer?.getData('application/revela-asset-id'));
        if (!asset) return;
        event.preventDefault();
        document.body.classList.remove('drop-active');
        renderAssetDropTarget(null);
        const placement = collectAssetPlacement(event, asset);
        if (!placement) {
          setStatus('Drop the asset onto a deck slide.');
          return;
        }
        await sendAssetPlacement(asset, placement);
      }

      function findSavedAsset(id) {
        return state.savedAssets.find((asset) => asset.id === id) || null;
      }

      function collectAssetPlacement(event, asset) {
        initFrame();
        const doc = els.frame.contentDocument;
        const win = els.frame.contentWindow;
        if (!doc || !win) return null;
        const frameRect = els.frame.getBoundingClientRect();
        const frameX = event.clientX - frameRect.left;
        const frameY = event.clientY - frameRect.top;
        const rawTarget = doc.elementFromPoint(frameX, frameY);
        const target = selectable(rawTarget);
        const slide = findSlide(target) || findSlide(rawTarget);
        if (!slide) return null;
        const slides = getSlides(doc);
        const explicitSlideIndex = Number(slide.getAttribute('data-slide-index'));
        const slideIndex = Number.isFinite(explicitSlideIndex) && explicitSlideIndex > 0 ? explicitSlideIndex : slides.indexOf(slide) + 1;
        const slideRect = slide.getBoundingClientRect();
        const x = slideRect.width ? Math.max(0, Math.min(1, (frameX - slideRect.left) / slideRect.width)) : 0;
        const y = slideRect.height ? Math.max(0, Math.min(1, (frameY - slideRect.top) / slideRect.height)) : 0;
        const targetPayload = target && target !== slide ? collectPayload(target) : null;
        const targetMode = targetPayload
          ? (target && target.tagName && target.tagName.toLowerCase() === 'img' ? 'replace' : 'insert-into')
          : 'add';
        return {
          slideIndex,
          x,
          y,
          viewport: { width: win.innerWidth, height: win.innerHeight },
          nearbyText: (slide.innerText || slide.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 1000),
          targetMode,
          target: targetPayload,
          targetLabel: targetMode === 'replace' ? 'Replace image' : targetMode === 'insert-into' ? 'Insert into this element' : 'Add near here',
          targetTagName: target?.tagName?.toLowerCase(),
        };
      }

      function renderAssetDropTarget(placement) {
        if (!state.assetDropOutline) return;
        const target = placement?.target ? elementFromPayload(placement.target) : null;
        state.assetDropTarget = target;
        renderBox(state.assetDropOutline, target);
        if (placement?.targetLabel) setStatus(placement.targetLabel + '. Drop to apply an asset placement edit.');
      }

      function elementFromPayload(payload) {
        const resolved = resolveElementFromPayload(payload);
        return resolved.target;
      }

      function resolveElementFromPayload(payload) {
        const doc = els.frame.contentDocument;
        if (!doc || !payload) return { target: null, matchedSelector: false, strategy: 'none' };
        const slides = getSlides(doc);
        const slide = slides.find((item, index) => {
          const explicit = Number(item.getAttribute('data-slide-index'));
          const slideIndex = Number.isFinite(explicit) && explicit > 0 ? explicit : index + 1;
          return slideIndex === payload.slideIndex;
        });
        if (!slide) return { target: null, matchedSelector: false, strategy: 'none' };
        if (payload.selector) {
          try {
            const selected = doc.querySelector(payload.selector);
            if (selected && (selected === slide || slide.contains(selected))) return { target: selected, matchedSelector: true, strategy: 'selector' };
          } catch {}
          try {
            const selected = slide.querySelector(payload.selector);
            if (selected) return { target: selected, matchedSelector: true, strategy: 'selector' };
          } catch {}
        }
        const fallback = resolveElementByFingerprint(slide, payload);
        if (fallback) return { target: fallback.target, matchedSelector: false, strategy: fallback.strategy, score: fallback.score };
        return { target: null, matchedSelector: false, strategy: 'missing' };
      }

      function resolveElementByFingerprint(slide, payload) {
        const candidates = Array.from(slide.querySelectorAll('*'));
        if (payload.tagName && String(payload.tagName).toLowerCase() === slide.tagName.toLowerCase()) candidates.unshift(slide);
        let best = null;
        candidates.forEach((candidate) => {
          const match = scoreTargetCandidate(candidate, slide, payload);
          if (!match) return;
          if (!best || match.score > best.score) best = match;
        });
        return best && best.score >= 55 ? best : null;
      }

      function scoreTargetCandidate(candidate, slide, payload) {
        const candidatePayload = targetIdentityPayload(candidate, slide);
        let score = 0;
        let strategy = '';
        const payloadFingerprint = payload.fingerprint || {};
        const candidateFingerprint = candidatePayload.fingerprint || {};
        if (payloadFingerprint.contentHash && payloadFingerprint.contentHash === candidateFingerprint.contentHash) {
          score += 120;
          strategy = 'fingerprint';
        }
        if (payloadFingerprint.textHash && payloadFingerprint.textHash === candidateFingerprint.textHash) {
          score += 80;
          strategy = strategy || 'fingerprint';
        }
        if (payloadFingerprint.structureHash && payloadFingerprint.structureHash === candidateFingerprint.structureHash) {
          score += 40;
          strategy = strategy || 'structure';
        }
        if (payloadFingerprint.contextHash && payloadFingerprint.contextHash === candidateFingerprint.contextHash) {
          score += 20;
          strategy = strategy || 'fingerprint';
        }
        const payloadTag = String(payload.tagName || '').toLowerCase();
        if (payloadTag && payloadTag === candidatePayload.tagName) score += 32;
        const payloadText = payload.textNormalized || normalizeTargetText(payload.text);
        if (payloadText && payloadText === candidatePayload.textNormalized) {
          score += 72;
          strategy = strategy || 'text';
        } else if (payloadText && candidatePayload.textNormalized && (payloadText.includes(candidatePayload.textNormalized) || candidatePayload.textNormalized.includes(payloadText))) {
          score += 34;
          strategy = strategy || 'text';
        }
        if (payload.semanticKind && payload.semanticKind === candidatePayload.semanticKind) score += 18;
        const classOverlap = overlapCount(payload.classList, candidatePayload.classList);
        score += Math.min(24, classOverlap * 8);
        if (payloadFingerprint.structureHash && payloadFingerprint.structureHash === candidateFingerprint.structureHash && (classOverlap > 0 || partialTextOverlap(payloadText, candidatePayload.textNormalized))) {
          score += 32;
          strategy = strategy || 'structure';
        }
        const distance = relativeBoxDistance(payload.slideRelativeBox, candidatePayload.slideRelativeBox);
        if (Number.isFinite(distance)) {
          const positionScore = Math.max(0, 36 - distance * 72);
          score += positionScore;
          if (!strategy && positionScore > 20) strategy = 'relativeBox';
        }
        if (payloadTag && payloadTag !== candidatePayload.tagName) score -= 20;
        return score > 0 ? { target: candidate, score, strategy: strategy || 'relativeBox' } : null;
      }

      function targetIdentityPayload(el, slide) {
        const semanticKind = semanticKindForElement(el);
        const tagName = el.tagName.toLowerCase();
        const classList = Array.from(el.classList || []);
        const textNormalized = normalizeTargetText(el.innerText || el.textContent || '');
        const slideTitle = slide ? ((slide.querySelector('h1,h2,h3,[data-title]') || {}).textContent || '').trim().slice(0, 160) : '';
        const nearbyText = slide ? (slide.innerText || slide.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 1200) : '';
        return {
          tagName,
          semanticKind,
          classList,
          textNormalized,
          slideRelativeBox: slideRelativeBox(el, slide),
          fingerprint: fingerprintForTarget({ tagName, semanticKind, classList, textNormalized, slideTitle, nearbyText }),
        };
      }

      function elementFromVisualChange(change) {
        const editId = change?.editId;
        const doc = els.frame.contentDocument;
        if (!editId || !doc) return null;
        try {
          return doc.querySelector('[data-revela-edit-id="' + cssEscape(editId) + '"]');
        } catch {
          return null;
        }
      }

      async function sendAssetPlacement(asset, placement) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        const modeText = placement.targetMode === 'replace'
          ? 'replace the image at the drop target'
          : placement.targetMode === 'insert-into'
            ? 'insert it into the target element'
            : 'add it near the drop point';
        const comment = 'Place workspace asset ' + asset.path + ' on slide ' + placement.slideIndex + ' as a ' + (asset.purpose || 'visual asset') + '; ' + modeText + '. Preserve the current layout and do not cover existing text, charts, tables, or evidence.';
        const elements = placement.target ? [placement.target] : [];
        setStatus('Applying asset placement edit...');
        try {
          const res = await fetch('/api/comments?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ comment, elements, asset, drop: placement, applyNow: true }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to apply asset placement');
          upsertPersistedComment(body.comment);
          if (body.status === 'queued') {
            updatePendingCommentStatus(body.comment.id, 'queued', { requestId: '', progressEvent: null, failureRaw: '', failureMessage: '' });
            setStatus('Asset placement queued. It will apply after the current edit finishes.');
            pollQueuedComment(body.comment.id);
          } else {
            updatePendingCommentStatus(body.comment.id, 'applying', { requestId: body.commentRequestId || body.requestId || '', baseDeckVersion: body.deckVersion || state.deckVersion });
            setStatus('Applying asset placement with Codex...');
            if (body.commentRequestId || body.requestId) watchCommentProgress(body.comment.id, body.commentRequestId || body.requestId);
          }
        } catch (error) {
          reportError(error);
        }
      }

      function selectable(node) {
        if (!node || node.nodeType !== 1) return null;
        if (node === state.hoverOutline || node === state.assetDropOutline || state.referenceOutlines.includes(node)) return null;
        return findSlide(node) ? node : null;
      }

      function toggleReference(target) {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        if (!target) {
          setStatus('No selectable deck element found under pointer.');
          return;
        }
        const existing = findReferenceIndex(target);
        if (existing >= 0) {
          const label = state.references[existing].label;
          removeReferenceAt(existing, true);
          setStatus('Removed @' + label + '.');
          return;
        }
        const payload = collectPayload(target);
        const color = REFERENCE_COLORS[(state.nextReferenceId - 1) % REFERENCE_COLORS.length];
        const id = 'ref-' + state.nextReferenceId++;
        const label = nextReferenceLabel(payload);
        const reference = { id, target, label, payload, color };
        state.references.push(reference);
        insertReferenceChip(reference);
        renderReferenceOutlines();
        updateSendState();
        renderSelectionSummary();
        resetInspectCards('References ready. Open Insight and click Get Insight for concise Purpose and Source context.');
        setStatus('Inserted @' + label + '. ' + state.references.length + ' reference' + (state.references.length === 1 ? '' : 's') + ' will be sent.');
      }

      function isReferenced(target) {
        return findReferenceIndex(target) >= 0;
      }

      function findReferenceIndex(target) {
        return state.references.findIndex((reference) => reference.target === target);
      }

      function removeReferenceAt(index, removeToken) {
        const reference = state.references[index];
        if (!reference) return;
        state.references.splice(index, 1);
        if (removeToken) removeReferenceChip(reference.id);
        renderReferenceOutlines();
        renderSelectionSummary();
        updateSendState();
      }

      function syncReferencesFromComment(showStatus, editor) {
        const source = editor || activeCommentEditor();
        const activeIds = new Set(Array.from(source.querySelectorAll('.ref-chip[data-ref-id]')).map((chip) => chip.getAttribute('data-ref-id')));
        const before = state.references.length;
        state.references = state.references.filter((reference) => activeIds.has(reference.id));
        if (state.references.length !== before) {
          renderReferenceOutlines();
          renderSelectionSummary();
          if (showStatus) setStatus('References synced with comment text.');
        }
      }

      function syncSelectedAssetFromComment() {
        if (els.comment.querySelector('.asset-ref-chip[data-asset-id]')) return;
        state.selectedAsset = null;
      }

      function addPendingComment(text, elements, status) {
        const id = 'comment-' + state.nextCommentId++;
        state.pendingComments.push({
          id,
          text,
          elements,
          status,
          createdAt: Date.now(),
          baseDeckVersion: state.deckVersion,
          updatedVersion: null,
          requestId: '',
          progressEvent: null,
          eventLog: [],
          failureRaw: '',
        });
        renderCommentThread();
        return id;
      }

      function updatePendingCommentStatus(id, status, updates) {
        const comment = state.pendingComments.find((item) => item.id === id);
        if (!comment) return;
        if (comment.status === 'updated' && status !== 'failed' && status !== 'stopped') return;
        comment.status = status;
        if (updates) Object.assign(comment, updates);
        if (status === 'updated' || status === 'failed' || status === 'applied' || status === 'stopped') comment.progressEvent = null;
        renderCommentThread();
      }

      function pendingCommentStatus(id) {
        return state.pendingComments.find((comment) => comment.id === id)?.status || '';
      }

      async function pollCommentResult(commentId, requestId) {
        if (!requestId) return;
        for (let attempt = 0; attempt < 140; attempt++) {
          await delay(1000);
          if (pendingCommentStatus(commentId) === 'updated' || pendingCommentStatus(commentId) === 'stopped') return;
          try {
            const res = await fetch('/api/comment-result?token=' + encodeURIComponent(token) + '&requestId=' + encodeURIComponent(requestId), { cache: 'no-store' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.ok) throw new Error(body.error || 'Comment result failed');
            if (body.status === 'failed' || body.status === 'expired') {
              updatePendingCommentStatus(commentId, 'failed', { failureRaw: body.raw || '' });
              setStatus(body.error || 'Review agent failed to apply the comment.');
              return;
            }
            if (body.status === 'stopped') {
              updatePendingCommentStatus(commentId, 'stopped', { stopped: true, failureRaw: body.raw || 'Stopped by user.', failureMessage: body.error || 'Stopped by user.' });
              setStatus(body.error || 'Stopped comment apply.');
              return;
            }
            if (body.status === 'completed') {
              if (pendingCommentStatus(commentId) === 'applying') {
                updatePendingCommentStatus(commentId, 'applied', { progressEvent: null });
              }
              setStatus('Codex completed.');
              return;
            }
          } catch (error) {
            reportError(error);
            return;
          }
        }
        if (pendingCommentStatus(commentId) !== 'updated' && pendingCommentStatus(commentId) !== 'stopped') {
          updatePendingCommentStatus(commentId, 'failed');
          setStatus('Review agent timed out before applying the comment.');
        }
      }

      function watchCommentProgress(commentId, requestId) {
        if (!requestId) return;
        if (!('EventSource' in window)) {
          pollCommentResult(commentId, requestId);
          return;
        }
        let closed = false;
        let fallbackStarted = false;
        const startFallback = () => {
          if (fallbackStarted) return;
          fallbackStarted = true;
          pollCommentResult(commentId, requestId);
        };
        let source;
        try {
          source = new EventSource('/api/comment-events?token=' + encodeURIComponent(token) + '&requestId=' + encodeURIComponent(requestId));
        } catch {
          startFallback();
          return;
        }
        source.addEventListener('progress', (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data || '{}');
          } catch {
            return;
          }
          recordCommentProgress(commentId, payload);
          if (payload.type === 'failed' || payload.type === 'timeout') {
            closed = true;
            source.close();
            updatePendingCommentStatus(commentId, 'failed', { failureRaw: payload.detail || '' });
            setStatus(payload.message || 'Review agent failed to apply the comment.');
          } else if (payload.type === 'stopped') {
            closed = true;
            source.close();
            updatePendingCommentStatus(commentId, 'stopped', { stopped: true, failureRaw: payload.detail || 'Stopped by user.', failureMessage: payload.message || 'Stopped by user.' });
            setStatus(payload.message || 'Stopped comment apply.');
          } else if (payload.type === 'completed') {
            closed = true;
            source.close();
            setStatus(payload.message || 'Codex completed.');
          } else if (payload.message) {
            setStatus(payload.message);
          }
        });
        source.onerror = () => {
          source.close();
          if (!closed && pendingCommentStatus(commentId) !== 'updated' && pendingCommentStatus(commentId) !== 'failed' && pendingCommentStatus(commentId) !== 'stopped') {
            startFallback();
          }
        };
      }

      function recordCommentProgress(commentId, event) {
        const comment = state.pendingComments.find((item) => item.id === commentId);
        if (!comment || !event || !event.message) return;
        if (comment.stopped || comment.status === 'stopped') return;
        if (codexReview) {
          appendCodexEventLog(comment, event);
        }
        if (event.type === 'completed') {
          comment.progressEvent = null;
          if (comment.persisted && comment.status === 'applying') comment.status = 'applied';
          if (codexReview) renderCommentThread();
          return;
        }
        const nextEvent = {
          type: event.type || 'codex_event',
          message: String(event.message).slice(0, 240),
          detail: typeof event.detail === 'string' ? event.detail.slice(-4096) : '',
        };
        const duplicate = comment.progressEvent;
        if (duplicate && duplicate.type === nextEvent.type && duplicate.message === nextEvent.message && duplicate.detail === nextEvent.detail) return;
        comment.progressEvent = nextEvent;
        if (event.type === 'failed' || event.type === 'timeout') comment.failureRaw = typeof event.detail === 'string' ? event.detail.slice(-4096) : '';
        renderCommentThread();
      }

      function appendCodexEventLog(target, event) {
        if (!target.eventLog) target.eventLog = [];
        const next = {
          type: event.type || 'codex_event',
          message: String(event.message || '').slice(0, 500),
          detail: typeof event.detail === 'string' ? event.detail.slice(-12000) : '',
          timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
        };
        const previous = target.eventLog[target.eventLog.length - 1];
        if (previous && previous.type === next.type && previous.message === next.message && previous.detail === next.detail) return;
        target.eventLog.push(next);
        if (target.eventLog.length > 250) target.eventLog.splice(0, target.eventLog.length - 250);
      }

      function codexLogSummary(log) {
        const count = Array.isArray(log) ? log.length : 0;
        return count === 1 ? 'Codex execution log (1 event)' : 'Codex execution log (' + count + ' events)';
      }

      function renderCodexLog(log) {
        if (!codexReview || !Array.isArray(log) || !log.length) return null;
        const details = document.createElement('details');
        details.className = 'codex-log';
        const summary = document.createElement('summary');
        summary.textContent = codexLogSummary(log);
        const list = renderCodexLogEntries(log);
        details.appendChild(summary);
        details.appendChild(list);
        return details;
      }

      function renderCodexLogEntries(log) {
        const list = document.createElement('div');
        list.className = 'codex-log-list';
        log.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'codex-log-entry';
          const meta = document.createElement('div');
          meta.className = 'codex-log-meta';
          const type = document.createElement('span');
          type.textContent = item.type || 'event';
          const time = document.createElement('span');
          time.textContent = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';
          meta.appendChild(type);
          meta.appendChild(time);
          const message = document.createElement('div');
          message.className = 'codex-log-message';
          message.textContent = item.message || '';
          row.appendChild(meta);
          row.appendChild(message);
          if (item.detail) {
            const detail = document.createElement('pre');
            detail.className = 'codex-log-detail';
            detail.textContent = item.detail;
            row.appendChild(detail);
          }
          list.appendChild(row);
        });
        return list;
      }

      function openCodexLogModal(log) {
        if (!codexReview || !Array.isArray(log) || !log.length) return;
        els.codexLogTitle.textContent = codexLogSummary(log);
        els.codexLogBody.replaceChildren(...Array.from(renderCodexLogEntries(log).children));
        els.codexLogModal.classList.add('open');
        els.codexLogModal.setAttribute('aria-hidden', 'false');
        els.codexLogClose.focus();
      }

      function closeCodexLogModal() {
        els.codexLogModal.classList.remove('open');
        els.codexLogModal.setAttribute('aria-hidden', 'true');
        els.codexLogBody.textContent = '';
      }

      function renderCommentThread(scrollToBottom = true) {
        els.commentThread.textContent = '';
        const locked = isApplyLocked();
        state.pendingComments.forEach((comment) => {
          const bubble = document.createElement('div');
          bubble.className = 'comment-bubble ' + comment.status + (comment.id === state.activeCommentId ? ' active' : '');
          bubble.tabIndex = 0;
          bubble.setAttribute('role', 'button');
          bubble.setAttribute('aria-pressed', comment.id === state.activeCommentId ? 'true' : 'false');
          bubble.addEventListener('click', () => selectPersistedComment(comment.id));
          bubble.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectPersistedComment(comment.id);
            }
          });

          const meta = document.createElement('div');
          meta.className = 'comment-bubble-meta';
          meta.textContent = 'Slide ' + (comment.slideIndex || slideIndexFromElements(comment.elements) || '?') + (comment.baseDeckVersion && state.deckVersion && comment.baseDeckVersion !== state.deckVersion && comment.status === 'open' ? ' · stale deck version' : '');

          const text = document.createElement('div');
          text.className = 'comment-bubble-text';
          text.textContent = comment.text;

          const refs = renderCommentReferenceChips(comment.elements);

          const status = document.createElement('div');
          status.className = 'comment-bubble-state';
          status.textContent = commentStatusLabel(comment.status);

          bubble.appendChild(meta);
          if (refs) bubble.appendChild(refs);
          bubble.appendChild(text);
          bubble.appendChild(status);
          if (!locked && comment.persisted && canApplyPersistedComment(comment.status)) {
            const actions = document.createElement('div');
            actions.className = 'comment-actions';
            const apply = commentActionButton(isReapplyStatus(comment.status) ? 'Re-apply' : 'Apply', isReapplyStatus(comment.status) ? '${lucideIcon("refresh-cw", "comment-action-icon")}' : '${lucideIcon("play", "comment-action-icon")}');
            apply.addEventListener('click', () => applyPersistedComment(comment.id));
            actions.appendChild(apply);
            bubble.appendChild(actions);
          }
          if (comment.persisted && canStopPersistedComment(comment.status)) {
            const actions = bubble.querySelector('.comment-actions') || document.createElement('div');
            actions.className = 'comment-actions';
            const stop = commentActionButton('Stop', '${lucideIcon("square", "comment-action-icon")}', 'stop');
            stop.addEventListener('click', () => stopPersistedComment(comment.id));
            actions.appendChild(stop);
            if (!actions.parentElement) bubble.appendChild(actions);
          }
          if (!locked && comment.persisted && canDeletePersistedComment(comment.status)) {
            const actions = bubble.querySelector('.comment-actions') || document.createElement('div');
            actions.className = 'comment-actions';
            const remove = commentActionButton('Delete', '${lucideIcon("trash-2", "comment-action-icon")}', 'danger');
            remove.addEventListener('click', () => deletePersistedComment(comment.id));
            actions.appendChild(remove);
            if (!actions.parentElement) bubble.appendChild(actions);
          }
          if (codexReview && Array.isArray(comment.eventLog) && comment.eventLog.length) {
            const actions = bubble.querySelector('.comment-actions') || document.createElement('div');
            actions.className = 'comment-actions';
            const log = commentActionButton('Execution Log', '${lucideIcon("list", "comment-action-icon")}', 'log');
            log.addEventListener('click', () => openCodexLogModal(comment.eventLog));
            actions.appendChild(log);
            if (!actions.parentElement) bubble.appendChild(actions);
          }
          if (comment.progressEvent) {
            const progress = document.createElement('div');
            progress.className = 'comment-progress';
            const line = document.createElement('div');
            line.className = 'comment-progress-line';
            line.textContent = comment.progressEvent.message;
            progress.appendChild(line);
            bubble.appendChild(progress);
          }
          if (comment.status === 'failed' && comment.failureRaw) {
            const details = document.createElement('details');
            details.className = 'comment-raw';
            const summary = document.createElement('summary');
            summary.textContent = 'Details';
            const pre = document.createElement('pre');
            pre.textContent = comment.failureRaw;
            details.appendChild(summary);
            details.appendChild(pre);
            bubble.appendChild(details);
          }
          els.commentThread.appendChild(bubble);
        });
        updateApplyLockUi();
        if (scrollToBottom) scrollCommentThreadToBottom();
      }

      function commentActionButton(label, iconHtml, variant) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'comment-action-button' + (variant ? ' ' + variant : '');
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = iconHtml;
        button.addEventListener('click', (event) => event.stopPropagation());
        return button;
      }

      function renderCommentReferenceChips(elements) {
        if (!Array.isArray(elements) || !elements.length) return null;
        const wrap = document.createElement('div');
        wrap.className = 'selection-chips';
        elements.slice(0, 4).forEach((payload) => {
          const label = elementDisplayLabel(payload);
          const chip = document.createElement('span');
          chip.className = 'ref-chip';
          chip.title = label;
          chip.textContent = displayReferenceLabel(label);
          wrap.appendChild(chip);
        });
        if (elements.length > 4) {
          const more = document.createElement('span');
          more.className = 'ref-chip';
          more.textContent = '+' + (elements.length - 4) + ' more';
          more.title = more.textContent;
          wrap.appendChild(more);
        }
        return wrap;
      }

      function selectPersistedComment(commentId) {
        const comment = state.pendingComments.find((item) => item.id === commentId);
        if (!comment) return;
        state.activeCommentId = comment.id;
        state.activeCommentElements = Array.isArray(comment.elements) ? comment.elements : [];
        if (!state.activeCommentElements.length) setStatus('Comment has no saved deck target.');
        const slideIndex = comment.slideIndex || slideIndexFromElements(comment.elements);
        if (Number.isInteger(slideIndex) && slideIndex > 0 && slideIndex !== currentDeckSlideIndex()) {
          goToDeckSlide(slideIndex - 1);
        }
        renderCommentThread(false);
        requestAnimationFrame(renderActiveCommentHighlights);
      }

      function scrollCommentThreadToBottom() {
        requestAnimationFrame(() => {
          els.commentThread.scrollTop = els.commentThread.scrollHeight;
        });
      }

      function commentStatusLabel(status) {
        if (status === 'open') return 'Saved comment';
        if (status === 'queued') return 'Queued for apply';
        if (status === 'applying') return 'Applying with Codex...';
        if (status === 'applied' || status === 'updated' || status === 'stale') return 'Codex completed';
        if (status === 'failed') return 'Failed to apply';
        if (status === 'stopped') return 'Stopped';
        if (status === 'sending') return 'Sending to Review agent...';
        return 'Sent to Review agent';
      }

      function canApplyPersistedComment(status) {
        return status === 'open' || status === 'failed' || status === 'stopped' || isReapplyStatus(status);
      }

      function canStopPersistedComment(status) {
        return status === 'applying' || status === 'queued';
      }

      function canDeletePersistedComment(status) {
        return status !== 'applying';
      }

      function isReapplyStatus(status) {
        return status === 'applied' || status === 'updated' || status === 'stale';
      }

      function slideIndexFromElements(elements) {
        if (!Array.isArray(elements)) return null;
        const found = elements.map((item) => item && item.slideIndex).find((value) => Number.isInteger(value) && value > 0);
        return found || null;
      }

      function currentDeckSlideIndex() {
        const doc = els.frame.contentDocument;
        const slides = doc ? getSlides(doc) : [];
        const currentSlide = slides[state.deckSlideIndex];
        const explicitSlideIndex = Number(currentSlide?.getAttribute('data-slide-index'));
        return Number.isFinite(explicitSlideIndex) && explicitSlideIndex > 0 ? explicitSlideIndex : state.deckSlideIndex + 1;
      }

      function targetFromPointer(event) {
        const doc = els.frame.contentDocument;
        if (!doc || doc.location.href === 'about:blank') return null;
        const frameRect = els.frame.getBoundingClientRect();
        const x = event.clientX - frameRect.left;
        const y = event.clientY - frameRect.top;
        if (x < 0 || y < 0 || x > frameRect.width || y > frameRect.height) return null;
        return doc.elementFromPoint(x, y);
      }

      function visualTargetFromPointer(event) {
        const raw = targetFromPointer(event);
        const target = raw?.closest?.('[data-revela-edit-id]') || null;
        return isDirectResizable(target) || isDirectMovable(target) ? target : null;
      }

      function createOutline(doc, border, fill) {
        const outline = doc.createElement('div');
        outline.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid ' + border + ';background:' + fill + ';border-radius:6px;display:none;';
        doc.body.appendChild(outline);
        return outline;
      }

      function setOutlineColor(outline, color) {
        if (!outline || !color) return;
        outline.style.borderColor = color.border;
        outline.style.background = color.fill;
      }

      function renderBox(outline, target) {
        if (!outline || !target || !target.getBoundingClientRect) {
          if (outline) outline.style.display = 'none';
          return;
        }
        const rect = target.getBoundingClientRect();
        outline.style.display = 'block';
        outline.style.left = rect.left + 'px';
        outline.style.top = rect.top + 'px';
        outline.style.width = rect.width + 'px';
        outline.style.height = rect.height + 'px';
      }

      function createCommentHighlightBox() {
        const box = document.createElement('div');
        box.className = 'comment-highlight-box';
        els.commentHighlightLayer.appendChild(box);
        return box;
      }

      function renderParentBox(box, target) {
        if (!box || !target || !target.getBoundingClientRect) {
          if (box) box.style.display = 'none';
          return;
        }
        const frameRect = els.frame.getBoundingClientRect();
        const previewRect = els.commentHighlightLayer.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        box.style.display = 'block';
        box.style.left = (frameRect.left - previewRect.left + rect.left) + 'px';
        box.style.top = (frameRect.top - previewRect.top + rect.top) + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';
      }

      function renderHoverOutline(target) {
        renderBox(state.hoverOutline, target);
      }

      function renderReferenceOutlines() {
        const doc = els.frame.contentDocument;
        if (!doc || doc.location.href === 'about:blank') return;
        const currentSlideIndex = currentDeckSlideIndex();
        while (state.referenceOutlines.length < state.references.length) state.referenceOutlines.push(createOutline(doc, '#7aa6d8', 'rgba(122,166,216,.18)'));
        state.referenceOutlines.forEach((outline, index) => {
          const reference = state.references[index];
          setOutlineColor(outline, reference?.color);
          if (!reference || reference.payload?.slideIndex !== currentSlideIndex) {
            renderBox(outline, null);
            return;
          }
          renderBox(outline, reference?.target);
        });
      }

      function renderActiveCommentHighlights() {
        const doc = els.frame.contentDocument;
        if (!doc || doc.location.href === 'about:blank') return;
        const elements = Array.isArray(state.activeCommentElements) ? state.activeCommentElements : [];
        while (state.commentHighlightOutlines.length < elements.length) state.commentHighlightOutlines.push(createCommentHighlightBox());
        let visible = 0;
        let missing = 0;
        const currentSlideIndex = currentDeckSlideIndex();
        state.commentHighlightOutlines.forEach((outline, index) => {
          const payload = elements[index];
          if (!payload || payload.slideIndex !== currentSlideIndex) {
            renderParentBox(outline, null);
            return;
          }
          const resolved = resolveElementFromPayload(payload);
          const target = resolved.target;
          if (!target) {
            missing += 1;
            renderParentBox(outline, null);
            return;
          }
          visible += 1;
          renderParentBox(outline, target);
        });
        for (let i = elements.length; i < state.commentHighlightOutlines.length; i++) renderParentBox(state.commentHighlightOutlines[i], null);
        if (!state.activeCommentId) return;
        if (visible > 0) setStatus('Highlighted ' + visible + ' comment target' + (visible === 1 ? '' : 's') + '.');
        else if (missing > 0) setStatus('Comment target is no longer available on this deck version.');
      }

      function clearHoverSilently() {
        state.hoverEl = null;
        if (state.hoverOutline) state.hoverOutline.style.display = 'none';
        renderVisualHandles(null);
      }

      function clearHover() {
        state.hoverEl = null;
        setStatus('Hover cleared. Existing references are kept.');
        if (state.hoverOutline) state.hoverOutline.style.display = 'none';
        renderVisualHandles(null);
      }

      function updateSendState() {
        const locked = isApplyLocked();
        if (state.sendingEdit) setButtonLoading(els.send, true, 'Sending...');
        else setButtonLoading(els.send, false, sendButtonHtml, true);
        els.send.disabled = locked || state.sendingEdit || !getCommentText().trim();
        if (state.inspecting) setButtonLoading(els.inspectButton, true, 'Getting insight...');
        else setButtonLoading(els.inspectButton, false, 'Get Insight');
        els.inspectButton.disabled = locked || state.inspecting || state.references.length === 0;
      }

      function setButtonLoading(button, loading, label, html) {
        if (!button) return;
        button.innerHTML = loading ? '<span class="spinner" aria-hidden="true"></span><span>' + escapeHtml(label) + '</span>' : (html ? label : escapeHtml(label));
        button.disabled = !!loading;
      }

      function renderSelectionSummary() {
        const label = state.references.length
          ? state.references.length + ' referenced element' + (state.references.length === 1 ? '' : 's') + ' selected.'
          : 'No references selected.';
        els.selectionSummary.querySelector('span').textContent = label;
        els.selectionChips.textContent = '';
        state.references.forEach((reference) => {
          const chip = document.createElement('span');
          chip.className = 'ref-chip';
          chip.style.setProperty('--ref-bg', reference.color.bg);
          chip.style.setProperty('--ref-border', reference.color.border);
          chip.style.setProperty('--ref-text', reference.color.text);
          const label = '@' + reference.label;
          chip.title = label;
          chip.textContent = displayReferenceLabel(label);
          els.selectionChips.appendChild(chip);
        });
      }

      function resetInspectCards(message) {
        if (!els.inspectCards) return;
        els.inspectStale.innerHTML = '';
        els.inspectCards.innerHTML = '<div class="inspect-empty">' + escapeHtml(message) + '</div>';
      }

      function renderInspectLoading(message) {
        els.inspectCards.innerHTML = '<div class="inspect-loading"><span class="loading-row"><span class="spinner" aria-hidden="true"></span><b>' + escapeHtml(message) + '</b></span><br>Preparing concise Purpose and Source context.</div>'
          + '<div class="skeleton-card"><div class="skeleton-line short"></div><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div>'
          + '<div class="skeleton-card"><div class="skeleton-line short"></div><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div>';
        renderInspectCodexLog();
      }

      function getInspectComment() {
        syncReferencesFromComment(false, els.inspectComment);
        return getCommentText(els.inspectComment).trim().slice(0, 2000);
      }

      async function inspectCurrentSelection() {
        if (isApplyLocked()) return setStatus(applyLockStatus());
        if (!state.references.length || state.inspecting) return;
        const snapshot = collectReferenceSnapshot();
        const comment = getInspectComment();
        state.inspecting = true;
        updateSendState();
        setMode('inspect');
        els.inspectStale.innerHTML = '';
        state.inspectFallback = null;
        state.inspectEventLog = [];
        renderInspectLoading('Reading selection...');
        try {
          const res = await fetch('/api/inspect?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ snapshot, deckVersion: state.deckVersion, language: state.inspectLanguage, comment }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Insight failed');
          state.deckVersion = body.deckVersion || state.deckVersion;
          state.activeInspectRequestId = body.requestId;
          state.inspectFallback = body.preprocess || null;
          renderInspectLoading('Waiting for Purpose and Source...');
          await watchInspectProgress(body.requestId);
        } catch (error) {
          if (state.inspectFallback) {
            renderInspectResult(state.inspectFallback, 'Deterministic fallback');
            els.inspectCards.insertAdjacentHTML('afterbegin', '<div class="inspect-warning">Generated insight failed or timed out. Showing deterministic fallback context only.</div>');
          } else {
            resetInspectCards(error && error.message ? error.message : String(error));
          }
        } finally {
          state.inspecting = false;
          updateSendState();
        }
      }

      async function pollInspectResult(requestId) {
        for (let attempt = 0; attempt < 80; attempt++) {
          await delay(900);
          const res = await fetch('/api/inspect-result?token=' + encodeURIComponent(token) + '&requestId=' + encodeURIComponent(requestId));
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Insight result failed');
          if (body.status === 'completed') {
            state.deckVersion = body.deckVersion || state.deckVersion;
            renderInspectResult(body.result, 'Generated');
            return;
          }
          if (body.status === 'failed' || body.status === 'expired') throw new Error(body.error || 'Insight failed');
        }
        throw new Error('Insight timed out while waiting for Review agent result');
      }

      async function fetchInspectResultOnce(requestId) {
        const res = await fetch('/api/inspect-result?token=' + encodeURIComponent(token) + '&requestId=' + encodeURIComponent(requestId), { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(body.error || 'Insight result failed');
        if (body.status === 'completed') {
          state.deckVersion = body.deckVersion || state.deckVersion;
          renderInspectResult(body.result, 'Generated');
          renderInspectCodexLog();
          return true;
        }
        if (body.status === 'failed' || body.status === 'expired') {
          const error = new Error(body.error || 'Insight failed');
          error.raw = body.raw || '';
          throw error;
        }
        return false;
      }

      async function watchInspectProgress(requestId) {
        if (!requestId) return;
        if (!codexReview || !('EventSource' in window)) {
          await pollInspectResult(requestId);
          renderInspectCodexLog();
          return;
        }
        await new Promise((resolve, reject) => {
          let settled = false;
          let source;
          const finish = (ok, error) => {
            if (settled) return;
            settled = true;
            if (source) source.close();
            if (ok) resolve();
            else reject(error);
          };
          try {
            source = new EventSource('/api/inspect-events?token=' + encodeURIComponent(token) + '&requestId=' + encodeURIComponent(requestId));
          } catch (error) {
            pollInspectResult(requestId).then(resolve, reject);
            return;
          }
          source.addEventListener('progress', (event) => {
            let payload;
            try {
              payload = JSON.parse(event.data || '{}');
            } catch {
              return;
            }
            recordInspectProgress(payload);
            if (payload.type === 'failed' || payload.type === 'timeout') {
              const error = new Error(payload.message || 'Insight failed');
              error.raw = payload.detail || '';
              finish(false, error);
            } else if (payload.type === 'completed') {
              fetchInspectResultOnce(requestId).then((ready) => {
                if (ready) finish(true);
                else pollInspectResult(requestId).then(() => finish(true), (error) => finish(false, error));
              }, (error) => finish(false, error));
            }
          });
          source.onerror = () => {
            if (!settled) {
              source.close();
              pollInspectResult(requestId).then(() => finish(true), (error) => finish(false, error));
            }
          };
        });
      }

      function recordInspectProgress(event) {
        if (!event || !event.message) return;
        const inspectLog = { eventLog: state.inspectEventLog };
        appendCodexEventLog(inspectLog, event);
        state.inspectEventLog = inspectLog.eventLog;
        if (event.type !== 'completed') {
          renderInspectLoading(event.message);
        } else {
          renderInspectCodexLog();
        }
      }

      function renderInspectCodexLog() {
        const codexLog = renderCodexLog(state.inspectEventLog);
        if (codexLog) els.inspectCards.appendChild(codexLog);
      }

      function collectReferenceSnapshot() {
        const elements = state.references.map((reference) => reference.payload);
        const first = elements[0] || {};
        return {
          scope: elements.length > 1 ? 'selection' : 'element',
          slideIndex: first.slideIndex,
          slideTitle: first.slideTitle,
          text: elements.map((item) => item.text).filter(Boolean).join(' | ').slice(0, 1200),
          selectedText: elements.map((item) => item.text).filter(Boolean).join(String.fromCharCode(10)).slice(0, 1600),
          tagName: elements.length === 1 ? first.tagName : undefined,
          selector: elements.length === 1 ? first.selector : undefined,
          domPath: elements.length === 1 ? first.domPath : undefined,
          id: elements.length === 1 ? first.id : undefined,
          classList: elements.length === 1 ? first.classList : [],
          role: elements.length === 1 ? humanElementName(first) : 'Selection',
          outerHTMLExcerpt: elements.length === 1 ? first.outerHTMLExcerpt : undefined,
          nearbyText: first.nearbyText,
          elements,
          boundingBox: first.boundingBox,
          viewport: first.viewport,
        };
      }

      function renderInspectResult(result, phase) {
        if (result.stale?.stale) els.inspectStale.innerHTML = '<div class="inspect-stale">' + escapeHtml(result.stale.reason || 'Insight may be stale.') + '</div>';
        else els.inspectStale.innerHTML = '';
        els.inspectCards.innerHTML = [
          '<div class="status">' + escapeHtml(phase || 'Insight') + '</div>',
          renderInspectCard('Purpose', result.cards.purpose.status, result.cards.purpose.rationale, renderPurpose(result.cards.purpose)),
          renderInspectCard('Source', result.cards.source.status, result.cards.source.rationale, renderSource(result.cards.source)),
        ].join('');
      }

      function renderInspectCard(title, status, rationale, body) {
        return '<section class="inspect-card"><div class="inspect-card-head"><h2>' + escapeHtml(title) + '</h2><span class="badge ' + escapeHtml(status) + '">' + escapeHtml(status) + '</span></div><p>' + escapeHtml(rationale || '') + '</p>' + (body || '') + '</section>';
      }

      function renderPurpose(card) {
        return '<div class="inspect-item">' + field('Role', card.role) + field('Why it matters', card.whyItMatters) + '</div>';
      }

      function renderReading(card) {
        return '<div class="inspect-item">'
          + field('Claim ID', card.claimId)
          + field('Canonical claim ID', card.canonicalClaimId)
          + field('Claim', card.claimText)
          + field('Evidence status', card.evidenceStatus)
          + field('Evidence bindings', card.evidenceBindingIds && card.evidenceBindingIds.length ? card.evidenceBindingIds.join(', ') : '')
          + field('Supported scope', card.supportedScope)
          + field('Unsupported scope', card.unsupportedScope)
          + '</div>'
          + renderSectionList('Caveats', card.caveats)
          + renderSectionList('Objections', card.relatedObjections)
          + renderSectionList('Risks', card.relatedRisks)
          + renderArtifactCoverage(card.artifactCoverage);
      }

      function renderArtifactCoverage(items) {
        if (!items || !items.length) return '';
        return '<div class="label">Artifact Coverage</div>' + items.map((item) => {
          const title = (item.type || 'artifact') + (item.outputPath ? ' · ' + item.outputPath : '');
          const status = (item.coverageStatus || 'unknown') + (item.containsClaim ? ' · contains claim' : ' · claim not rendered');
          return '<div class="inspect-item"><b>' + escapeHtml(title) + '</b>'
            + field('Coverage', status)
            + field('Stale', item.stale ? (item.staleReason || 'stale') : '')
            + field('Note', item.note)
            + renderSectionList('Locations', item.locations)
            + '</div>';
        }).join('');
      }

      function renderExploratory(card) {
        return '<div class="inspect-item"><b>Non-official reading aid</b>'
          + field('Official artifact content', card.official === false ? 'No' : '')
          + field('Audience', card.audience)
          + field('Claim focus', card.claimFocus)
          + field('Audience reframe boundary', card.audienceReframe)
          + '</div>'
          + renderSectionList('Objection Prep', card.objectionPrompts)
          + renderSectionList('Appendix Leads', card.appendixLeads)
          + renderSectionList('Meeting Prep', card.meetingPrep)
          + renderSectionList('Boundaries', card.boundaries);
      }

      function renderSource(card) {
        return renderSources(card.sources) + renderWarnings(card.warnings) + renderSectionList('Gaps', card.gaps) + renderSectionList('Caveats', card.caveats);
      }

      function renderSources(items) {
        if (!items || !items.length) return '';
        return items.map((item) => '<div class="inspect-item"><b>' + escapeHtml(item.source || 'Source') + '</b>' + field('Path', item.sourcePath || item.findingsFile) + field('Location', item.location || item.page) + field('Quote', item.quote) + field('URL', item.url) + field('Caveat', item.caveat) + '</div>').join('');
      }

      function renderWarnings(items) { return items && items.length ? items.map((item) => '<div class="inspect-warning">' + escapeHtml(item) + '</div>').join('') : ''; }
      function renderList(items) { return items && items.length ? items.map((item) => '<div class="inspect-item">' + escapeHtml(item) + '</div>').join('') : ''; }
      function renderSectionList(title, items) { return items && items.length ? '<div class="label">' + escapeHtml(title) + '</div>' + renderList(items) : ''; }
      function field(label, value) { return value ? '<br><b>' + escapeHtml(label) + ':</b> ' + escapeHtml(value) : ''; }
      function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
      function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

      function nextReferenceLabel(payload) {
        return elementDisplayLabel(payload);
      }

      const REF_LABEL_MAX_DISPLAY_CHARS = ${REVIEW_REF_LABEL_MAX_DISPLAY_CHARS};

      function displayReferenceLabel(label) {
        const text = String(label || '');
        return text.length > REF_LABEL_MAX_DISPLAY_CHARS ? text.slice(0, REF_LABEL_MAX_DISPLAY_CHARS - 1) + '…' : text;
      }

      function insertReferenceChip(reference) {
        const editor = activeCommentEditor();
        const chip = document.createElement('span');
        chip.className = 'ref-chip';
        chip.contentEditable = 'false';
        chip.dataset.refId = reference.id;
        chip.style.setProperty('--ref-bg', reference.color.bg);
        chip.style.setProperty('--ref-border', reference.color.border);
        chip.style.setProperty('--ref-text', reference.color.text);
        const label = '@' + reference.label;
        chip.title = label;
        chip.textContent = displayReferenceLabel(label);
        const trailingSpace = document.createTextNode(' ');
        const range = getCommentInsertRange();
        if (range) {
          range.insertNode(trailingSpace);
          range.insertNode(chip);
          range.setStartAfter(trailingSpace);
          range.collapse(true);
          applyCommentRange(range);
        } else {
          if (editor.textContent && !/\\s$/.test(editor.textContent)) editor.appendChild(document.createTextNode(' '));
          editor.appendChild(chip);
          editor.appendChild(trailingSpace);
          placeCaretAfter(trailingSpace);
        }
        editor.focus();
      }

      function insertAssetChip(asset) {
        const chip = document.createElement('span');
        chip.className = 'ref-chip asset-ref-chip';
        chip.contentEditable = 'false';
        chip.dataset.assetId = asset.id || '';
        chip.style.setProperty('--ref-bg', '#dcfce7');
        chip.style.setProperty('--ref-border', '#86efac');
        chip.style.setProperty('--ref-text', '#166534');
        const label = '@Asset ' + (asset.id || asset.deckPath || asset.path || 'image');
        chip.title = label;
        chip.textContent = displayReferenceLabel(label);
        const range = getCommentInsertRange();
        if (range) {
          range.insertNode(chip);
          range.setStartAfter(chip);
          range.collapse(true);
          applyCommentRange(range);
        } else {
          els.comment.appendChild(chip);
          placeCaretAfter(chip);
        }
        els.comment.focus();
      }

      function insertPlainText(text) {
        const node = document.createTextNode(text);
        const range = getCommentInsertRange();
        if (range) {
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          applyCommentRange(range);
        } else {
          els.comment.appendChild(node);
          placeCaretAfter(node);
        }
      }

      function removeAssetChip() {
        els.comment.querySelectorAll('.asset-ref-chip').forEach((chip) => {
          const next = chip.nextSibling;
          chip.remove();
          if (next && next.nodeType === Node.TEXT_NODE && next.textContent === ' ') next.remove();
        });
      }

      function removeReferenceChip(id) {
        const chip = activeCommentEditor().querySelector('.ref-chip[data-ref-id="' + cssEscape(id) + '"]');
        if (!chip) return;
        const next = chip.nextSibling;
        chip.remove();
        if (next && next.nodeType === Node.TEXT_NODE && next.textContent === ' ') next.remove();
      }

      function clearReferences(removeChips) {
        state.references = [];
        if (removeChips) {
          activeCommentEditor().querySelectorAll('.ref-chip[data-ref-id]').forEach((chip) => chip.remove());
          state.selectedAsset = null;
          removeAssetChip();
        }
        renderSelectionSummary();
        resetInspectCards('Select a deck element to create an @ref, optionally ask a question, then get insight. This does not edit the deck.');
      }

      function getCommentText(editor) {
        const source = editor || els.comment;
        const clone = source.cloneNode(true);
        clone.querySelectorAll('.ref-chip[title]').forEach((chip) => {
          chip.textContent = chip.getAttribute('title') || chip.textContent || '';
        });
        return (clone.innerText || clone.textContent || '').replace(/\\u00a0/g, ' ');
      }

      function placeCaretAfter(node) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        applyCommentRange(range);
      }

      function saveCommentRange() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const editor = activeCommentEditor();
        if (!editor || !editor.contains(selection.anchorNode)) return;
        state.commentRange = selection.getRangeAt(0).cloneRange();
      }

      function getCommentInsertRange() {
        const editor = activeCommentEditor();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0).cloneRange();
          range.deleteContents();
          return range;
        }
        if (state.commentRange && editor.contains(state.commentRange.commonAncestorContainer)) {
          const range = state.commentRange.cloneRange();
          range.deleteContents();
          return range;
        }
        return null;
      }

      function applyCommentRange(range) {
        const selection = window.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(range);
        state.commentRange = range.cloneRange();
      }

      function humanElementName(payload) {
        const tag = payload.tagName || 'element';
        const classes = payload.classList || [];
        if (payload.semanticKind === 'heading' || /^h[1-6]$/.test(tag)) return 'Heading';
        if (payload.semanticKind === 'text' || tag === 'p') return 'Text';
        if (payload.semanticKind === 'source-note') return 'Source';
        if (classes.some((name) => /card/i.test(name))) return 'Card';
        if (payload.semanticKind === 'metric' || classes.some((name) => /stat|metric|value/i.test(name))) return 'Metric';
        if (payload.semanticKind === 'visual' || tag === 'img' || tag === 'svg') return 'Visual';
        return 'Element';
      }

      function elementDisplayLabel(payload) {
        if (!payload) return 'Element';
        if (payload.displayLabel) return payload.displayLabel;
        const kind = humanElementName(payload);
        const text = String(payload.text || payload.textNormalized || '').replace(/\\s+/g, ' ').trim().slice(0, 56);
        return text ? kind + ': ' + text : kind;
      }

      function collectPayload(el) {
        const doc = els.frame.contentDocument;
        const slides = getSlides(doc);
        const slide = findSlide(el);
        const rect = el.getBoundingClientRect();
        const explicitSlideIndex = slide ? Number(slide.getAttribute('data-slide-index')) : Number.NaN;
        const slideIndex = slide && Number.isFinite(explicitSlideIndex) && explicitSlideIndex > 0 ? explicitSlideIndex : slide ? slides.indexOf(slide) + 1 : undefined;
        const win = els.frame.contentWindow;
        const tagName = el.tagName.toLowerCase();
        const classList = Array.from(el.classList || []);
        const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 600);
        const textNormalized = normalizeTargetText(text);
        const semanticKind = semanticKindForElement(el);
        const slideTitle = slide ? ((slide.querySelector('h1,h2,h3,[data-title]') || {}).textContent || '').trim().slice(0, 160) : undefined;
        const nearbyText = slide ? (slide.innerText || slide.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 1200) : undefined;
        const identity = { tagName, semanticKind, classList, textNormalized, slideTitle, nearbyText };
        const displayLabel = elementDisplayLabel({ ...identity, text });
        return {
          slideIndex,
          slideTitle,
          selector: buildSelector(el, slide),
          domPath: buildDomPath(el, slide),
          tagName,
          id: el.id || undefined,
          classList,
          semanticKind,
          displayLabel,
          text,
          textNormalized,
          outerHTMLExcerpt: (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 1200),
          nearbyText,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          slideRelativeBox: slideRelativeBox(el, slide),
          fingerprint: fingerprintForTarget(identity),
          viewport: { width: win ? win.innerWidth : undefined, height: win ? win.innerHeight : undefined },
        };
      }

      function semanticKindForElement(el) {
        const tag = el?.tagName ? el.tagName.toLowerCase() : '';
        const classes = Array.from(el?.classList || []);
        if (/^h[1-6]$/.test(tag) || el?.matches?.('[data-title]')) return 'heading';
        if (tag === 'img' || tag === 'svg' || tag === 'canvas' || tag === 'video' || classes.some((name) => /image|media|visual|chart|figure|logo/i.test(name))) return 'visual';
        if (classes.some((name) => /source|citation|footnote|note/i.test(name))) return 'source-note';
        if (classes.some((name) => /stat|metric|kpi|value|number/i.test(name))) return 'metric';
        if (classes.some((name) => /card|box|panel|tile/i.test(name))) return 'card';
        if (tag === 'p' || tag === 'li' || tag === 'blockquote' || tag === 'span') return 'text';
        return 'element';
      }

      function normalizeTargetText(value) {
        return String(value || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim().toLowerCase().slice(0, 600);
      }

      function fingerprintForTarget(input) {
        const tagName = String(input.tagName || '').toLowerCase();
        const textNormalized = normalizeTargetText(input.textNormalized);
        const classList = Array.isArray(input.classList) ? input.classList.map(String).sort() : [];
        const semanticKind = input.semanticKind || 'element';
        const context = normalizeTargetText(String(input.slideTitle || '') + ' ' + String(input.nearbyText || '').slice(0, 400));
        return {
          textHash: textNormalized ? stableHash(textNormalized) : undefined,
          contentHash: stableHash(tagName + '|' + textNormalized),
          structureHash: stableHash(tagName + '|' + semanticKind + '|' + classList.join('.')),
          contextHash: context ? stableHash(context) : undefined,
        };
      }

      function stableHash(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
      }

      function slideRelativeBox(el, slide) {
        if (!el || !slide || !el.getBoundingClientRect || !slide.getBoundingClientRect) return undefined;
        const rect = el.getBoundingClientRect();
        const slideRect = slide.getBoundingClientRect();
        if (!slideRect.width || !slideRect.height) return undefined;
        return {
          x: roundRatio((rect.left - slideRect.left) / slideRect.width),
          y: roundRatio((rect.top - slideRect.top) / slideRect.height),
          width: roundRatio(rect.width / slideRect.width),
          height: roundRatio(rect.height / slideRect.height),
        };
      }

      function roundRatio(value) {
        return Math.round(Math.max(-2, Math.min(2, Number(value) || 0)) * 10000) / 10000;
      }

      function overlapCount(left, right) {
        const rightSet = new Set(Array.isArray(right) ? right.map(String) : []);
        return (Array.isArray(left) ? left : []).map(String).filter((item) => rightSet.has(item)).length;
      }

      function partialTextOverlap(left, right) {
        if (!left || !right) return false;
        if (left.includes(right) || right.includes(left)) return true;
        const leftWords = new Set(String(left).split(' ').filter((word) => word.length > 3));
        const rightWords = String(right).split(' ').filter((word) => word.length > 3);
        return rightWords.some((word) => leftWords.has(word));
      }

      function relativeBoxDistance(left, right) {
        if (!left || !right) return Number.NaN;
        const dx = Number(left.x) - Number(right.x);
        const dy = Number(left.y) - Number(right.y);
        const dw = Number(left.width) - Number(right.width);
        const dh = Number(left.height) - Number(right.height);
        if (![dx, dy, dw, dh].every(Number.isFinite)) return Number.NaN;
        return Math.sqrt(dx * dx + dy * dy + dw * dw * .35 + dh * dh * .35);
      }

      function buildSelector(el, slide) {
        if (el.id) return '#' + cssEscape(el.id);
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node !== slide) {
          let part = node.tagName.toLowerCase();
          const stable = Array.from(node.attributes || []).find((attr) => attr.name.startsWith('data-'));
          if (stable) {
            part += '[' + stable.name + '="' + stable.value.replace(/"/g, '\\"') + '"]';
            parts.unshift(part);
            break;
          }
          const classes = Array.from(node.classList || []).slice(0, 2).map(cssEscape);
          if (classes.length) part += '.' + classes.join('.');
          const siblings = Array.from(node.parentElement ? node.parentElement.children : []).filter((child) => child.tagName === node.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
          parts.unshift(part);
          node = node.parentElement;
        }
        const slidePart = slide ? slideSelector(slide) : '.slide';
        return [slidePart].concat(parts).join(' > ');
      }

      function findSlide(node) {
        if (!node || !node.closest) return null;
        return node.closest('.slide[data-slide-index]')
          || node.closest('.slide')
          || node.closest('[slide-qa]')
          || node.closest('.slide-canvas')
          || node.closest('.page');
      }

      function getSlides(doc) {
        const canonicalSlides = Array.from(doc.querySelectorAll('.slide[data-slide-index]'));
        if (canonicalSlides.length) return canonicalSlides;
        const slides = Array.from(doc.querySelectorAll('.slide'));
        if (slides.length) return slides;
        const qaSlides = Array.from(doc.querySelectorAll('[slide-qa]'));
        if (qaSlides.length) return qaSlides;
        const canvases = Array.from(doc.querySelectorAll('.slide-canvas'));
        if (canvases.length) return canvases;
        return Array.from(doc.querySelectorAll('.page'));
      }

      function slideSelector(slide) {
        if (slide.id) return '#' + cssEscape(slide.id);
        const doc = els.frame.contentDocument;
        const slides = getSlides(doc);
        const index = slides.indexOf(slide) + 1;
        if (slide.classList && slide.classList.contains('slide')) return '.slide:nth-of-type(' + index + ')';
        if (slide.hasAttribute && slide.hasAttribute('slide-qa')) return '[slide-qa]:nth-of-type(' + index + ')';
        if (slide.classList && slide.classList.contains('slide-canvas')) return '.slide-canvas:nth-of-type(' + index + ')';
        return '.page:nth-of-type(' + index + ')';
      }

      function buildDomPath(el, stop) {
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node !== stop) {
          const siblings = Array.from(node.parentElement ? node.parentElement.children : []);
          parts.unshift(node.tagName.toLowerCase() + '[' + (siblings.indexOf(node) + 1) + ']');
          node = node.parentElement;
        }
        return parts.join(' > ');
      }

      function cssEscape(value) {
        if (window.CSS && CSS.escape) return CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      }

      function setStatus(message) {
        if (els.status) els.status.textContent = message;
      }

      function reportError(error) {
        const message = error && error.message ? error.message : String(error);
        setStatus('Editor error: ' + message);
        console.error('[Revela edit]', error);
      }
    })();
  </script>
</body>
</html>`
}
