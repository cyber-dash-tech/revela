import { randomBytes } from "crypto"
import { existsSync, readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, extname, isAbsolute, relative, resolve, sep } from "path"
import type { EditableDeck } from "../edit/resolve-deck"
import { buildEditPrompt, type EditCommentPayload } from "../edit/prompt"
import type { InspectionElementSnapshot } from "../inspection-context/match"
import { buildInspectionPrompt } from "../inspect/prompt"
import { projectWorkspaceElement } from "../inspect/request"
import { createInspectRequest, failInspectRequest, getInspectRequest } from "../inspect/requests"
import { saveMediaAsset } from "../media/save"
import { searchRemoteImages, type ImageCandidate } from "../media/search"
import type { MediaAssetRecord, MediaPurpose } from "../media/types"

const TOKEN_BYTES = 24
const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const IDLE_STOP_MS = 30 * 60 * 1000
export const LIVE_EDITOR_IDLE_MS = 10 * 1000

interface EditAsset {
  id: string
  absoluteFile: string
}

interface EditSession {
  token: string
  client: any
  sessionID: string
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
}

export type RefineMode = "edit" | "inspect"

export interface RefineServerHandle {
  baseUrl: string
  getOrCreateSession(input: { client: any; sessionID: string; workspaceRoot: string; deck: EditableDeck; mode?: RefineMode }): EditServerSessionResult
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
        existing.session.deck = input.deck.slug
        existing.session.file = input.deck.file
        existing.session.workspaceRoot = resolve(input.workspaceRoot)
        existing.session.defaultMode = input.mode ?? "edit"
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

  if (url.pathname === "/refine" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return htmlResponse(renderRefineShell(session.value.token, session.value.defaultMode))
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
    return handleComment(req, session.value)
  }

  if (url.pathname === "/api/inspect" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleInspect(req, session.value)
  }

  if (url.pathname === "/api/inspect-result" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleInspectResult(url.searchParams.get("requestId"), session.value)
  }

  if (url.pathname === "/api/deck-version" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleDeckVersion(session.value)
  }

  if (url.pathname === "/api/assets/search" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleAssetSearch(url, session.value)
  }

  if (url.pathname === "/api/assets/save" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleAssetSave(req, session.value)
  }

  if (url.pathname === "/api/assets/list" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleAssetList(session.value)
  }

  return textResponse("Not found", 404)
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
  const result = await saveMediaAsset({
    topic: session.deck,
    id: body?.id || candidate.candidateId,
    type: "image",
    purpose,
    brief: body?.brief || `Saved from ${candidate.provider} for Refine asset placement.`,
    status: "success",
    sourceUrl: candidate.imageUrl,
    alt: body?.alt || candidate.alt || candidate.title,
    notes: body?.notes,
    provider: candidate.provider,
    sourcePageUrl: candidate.sourcePageUrl,
    license: candidate.license,
    attribution: candidate.attribution,
    width: candidate.width,
    height: candidate.height,
  }, session.workspaceRoot)

  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400)
  if (result.status !== "success" || !result.path) {
    return jsonResponse({ ok: false, error: `Failed to save asset: ${result.status}` }, 400)
  }
  const asset = savedAssetForResult(session, result.assetId)
  if (!asset) return jsonResponse({ ok: false, error: "Saved asset was not found in workspace assets." }, 500)
  return jsonResponse({ ok: true, asset, result })
}

function handleAssetList(session: EditSession): Response {
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  return jsonResponse({ ok: true, assets: listSavedAssets(session) })
}

function savedAssetForResult(session: EditSession, assetId: string): (MediaAssetRecord & { previewUrl?: string; deckPath?: string }) | null {
  return listSavedAssets(session).find((asset) => asset.id === assetId) ?? null
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
  const html = readFileSync(session.absoluteFile, "utf-8")
  return htmlResponse(rewriteLocalAssetRefs(html, {
    session,
    sourceFile: session.absoluteFile,
    contentType: "html",
  }))
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

async function handleComment(req: Request, session: EditSession): Promise<Response> {
  let body: Partial<EditCommentPayload>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

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

  const prompt = buildEditPrompt({
    ...body,
    deck: session.deck,
    file: session.file,
    comment,
    elements,
    comments,
  })
  const deckVersion = readDeckVersion(session).version

  await session.client.session.prompt({
    path: { id: session.sessionID },
    body: {
      parts: [{ type: "text", text: prompt }],
    },
  })

  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  return jsonResponse({ ok: true, deckVersion })
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

    void session.client.session.prompt({
      path: { id: session.sessionID },
      body: {
        parts: [{
          type: "text",
          text: buildInspectionPrompt({
            requestId,
            file: session.file,
            language,
            comment,
            projection: staleReason
              ? { ...projection, stale: { stale: true, reason: staleReason } } as any
              : projection,
          }),
        }],
      },
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
  if (request.status === "failed" || request.status === "expired") return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion, error: request.error || "Inspection failed" })
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

export function renderRefineShell(token: string, defaultMode: RefineMode = "edit"): string {
  const encodedToken = JSON.stringify(token)
  const encodedDefaultMode = JSON.stringify(defaultMode)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Revela Refine</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eee8dc; color: #1f2933; height: 100vh; overflow: hidden; }
    body.resizing { cursor: col-resize; user-select: none; }
    body.resizing iframe, body.resizing .hitbox { pointer-events: none; }
    .app { --editor-width: 376px; position: relative; display: grid; grid-template-columns: minmax(0, 1fr) var(--editor-width); height: 100vh; }
    .preview { position: relative; min-width: 0; background: #e7dfd1; }
    .resize-handle { position: absolute; top: 0; bottom: 0; right: calc(var(--editor-width) - 7px); width: 14px; z-index: 5; cursor: col-resize; background: transparent; }
    .resize-handle::before { content: ""; position: absolute; left: 50%; top: 50%; width: 4px; height: 44px; border-radius: 999px; transform: translate(-50%, -50%); background: rgba(148,163,184,.34); box-shadow: 0 1px 2px rgba(15,23,42,.06); transition: background .16s ease, height .16s ease, box-shadow .16s ease; }
    .resize-handle:hover::before, body.resizing .resize-handle::before { height: 52px; background: #94a3b8; box-shadow: 0 0 0 4px rgba(148,163,184,.16); }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    .hitbox { position: absolute; inset: 0; z-index: 2; cursor: crosshair; background: transparent; }
    .deck-nav { position: absolute; left: 50%; bottom: 18px; z-index: 4; display: inline-flex; align-items: center; gap: 8px; transform: translateX(-50%); padding: 7px; border: 1px solid rgba(148,163,184,.42); border-radius: 999px; background: rgba(15,23,42,.76); box-shadow: 0 16px 44px rgba(15,23,42,.24); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); pointer-events: auto; }
    .deck-nav button { width: auto; min-width: 84px; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; box-shadow: none; font-size: 12px; font-weight: 900; }
    .deck-nav button:hover:not(:disabled) { background: rgba(255,255,255,.22); }
    .deck-nav button:disabled { opacity: .38; }
    .deck-nav-status { min-width: 76px; color: #e2e8f0; font-size: 12px; font-weight: 900; text-align: center; font-variant-numeric: tabular-nums; }
    aside { position: relative; display: flex; flex-direction: column; gap: 16px; padding: 20px; background: linear-gradient(180deg, #fbfaf7 0%, #f2eee6 100%); overflow: auto; border-left: 1px solid #d8d2c6; }
    h1 { margin: 0; font-size: 18px; line-height: 1.2; letter-spacing: -.01em; color: #0f172a; }
    .wordmark { font-family: Garamond, "Iowan Old Style", Georgia, serif; font-size: 21px; letter-spacing: .08em; font-weight: 600; }
    .hint { margin: 0; color: #756f66; font-size: 13px; line-height: 1.5; }
    .panel { display: flex; flex-direction: column; gap: 10px; }
    .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px; border: 1px solid #d8d2c6; border-radius: 14px; background: #ebe4d8; }
    .tab { padding: 9px 10px; border: 0; border-radius: 10px; background: transparent; color: #5f594f; box-shadow: none; font-weight: 900; }
    .tab.active { background: #fbfaf7; color: #111827; box-shadow: 0 6px 16px rgba(31,41,51,.1); }
    .tab-panel { display: none; flex-direction: column; gap: 12px; }
    .tab-panel.active { display: flex; }
    .sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
    .selection-summary { padding: 10px 12px; border: 1px solid #d8d2c6; border-radius: 14px; background: #fbfaf7; color: #3f3a33; font-size: 13px; line-height: 1.45; box-shadow: 0 8px 22px rgba(31,41,51,.05); }
    .selection-summary strong { display: block; margin-bottom: 7px; color: #756f66; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; }
    .selection-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .label { color: #756f66; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    .comment-editor { width: 100%; min-height: 164px; max-height: 42vh; overflow: auto; padding: 13px 14px; border: 1px solid #d8d2c6; border-radius: 14px; background: #fffdf8; color: #111827; font: inherit; line-height: 1.5; outline: none; white-space: pre-wrap; box-shadow: 0 10px 24px rgba(31,41,51,.06); }
    .comment-editor:focus { border-color: #a9793f; box-shadow: 0 0 0 3px rgba(169,121,63,.14), 0 10px 24px rgba(31,41,51,.07); }
    .comment-editor:empty::before { content: attr(data-placeholder); color: #a79d8e; pointer-events: none; }
    .ref-chip { display: inline-flex; align-items: center; margin: 0 2px; padding: 1px 7px; border-radius: 999px; background: var(--ref-bg, #e0f2fe); color: var(--ref-text, #075985); border: 1px solid var(--ref-border, #7dd3fc); font-weight: 800; white-space: nowrap; }
    .activity-panel { display: flex; flex-direction: column; gap: 8px; padding-top: 2px; }
    .comment-thread { display: flex; flex-direction: column; gap: 8px; max-height: 24vh; overflow: auto; }
    .comment-thread:empty { display: none; }
    .comment-bubble { border: 1px solid #d8d2c6; border-radius: 14px; padding: 10px 12px; background: #fffdf8; color: #3f3a33; font-size: 13px; line-height: 1.45; box-shadow: 0 8px 22px rgba(31,41,51,.05); }
    .comment-bubble.sending { border-color: #c8b88f; background: #f7f0df; }
    .comment-bubble.updated { border-color: #9dac8a; background: #f0f2e8; }
    .comment-bubble.stale { border-color: #c6a96a; background: #f8efd7; }
    .comment-bubble.failed { border-color: #c58f82; background: #f7eae5; }
    .comment-bubble-text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .comment-bubble-state { margin-top: 8px; color: #8a6231; font-size: 12px; font-weight: 800; }
    .comment-bubble.updated .comment-bubble-state { color: #556b3f; }
    .comment-bubble.stale .comment-bubble-state { color: #8a6231; }
    .comment-bubble.failed .comment-bubble-state { color: #8f4638; }
    .inspect-actions { display: flex; flex-direction: column; gap: 8px; }
    .inspect-options { display: flex; flex-direction: column; gap: 5px; }
    .inspect-options label { color: #756f66; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
    .inspect-select { width: 100%; padding: 10px 11px; border: 1px solid #d8d2c6; border-radius: 12px; background: #fffdf8; color: #111827; font-weight: 700; }
    .inspect-cards { display: flex; flex-direction: column; gap: 12px; }
    .inspect-card { border: 1px solid #d8d2c6; border-radius: 16px; background: #fffdf8; padding: 13px; box-shadow: 0 10px 22px rgba(31,41,51,.05); }
    .inspect-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .inspect-card h2 { margin: 0; font-size: 13px; color: #0f172a; }
    .badge { border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; background: #e8e1d4; color: #5f594f; }
    .badge.supported, .badge.found, .badge.present, .badge.known, .badge.suggested { background: #e7ecdc; color: #4d6138; }
    .badge.weak, .badge.missing { background: #f1e5c8; color: #765326; }
    .badge.unsupported { background: #f0d9d1; color: #7f3d31; }
    .inspect-card p, .inspect-empty, .inspect-loading { margin: 0; color: #5f594f; font-size: 12px; line-height: 1.5; }
    .inspect-item { margin-top: 7px; padding: 8px; border-radius: 10px; background: #f7f3ea; color: #3f3a33; font-size: 12px; line-height: 1.45; }
    .inspect-warning, .inspect-stale { margin-top: 8px; padding: 8px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 12px; line-height: 1.45; }
    .loading-row { display: inline-flex; align-items: center; gap: 8px; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(169,121,63,.22); border-top-color: currentColor; border-radius: 999px; animation: spin .8s linear infinite; }
    button .spinner { width: 15px; height: 15px; border-color: rgba(255,255,255,.36); border-top-color: #fff; }
    .skeleton-card { border: 1px solid #d8d2c6; border-radius: 16px; background: #fffdf8; padding: 13px; box-shadow: 0 10px 22px rgba(31,41,51,.05); }
    .skeleton-line { height: 10px; margin: 8px 0; border-radius: 999px; background: linear-gradient(90deg, #ded5c6 0%, #fbfaf7 48%, #ded5c6 100%); background-size: 200% 100%; animation: shimmer 1.2s ease-in-out infinite; }
    .skeleton-line.short { width: 42%; }
    .skeleton-line.medium { width: 68%; }
    .skeleton-line.long { width: 92%; }
    .asset-card.is-saving::after { content: ""; position: absolute; inset: 0; background: rgba(15,23,42,.32); }
    .asset-card.is-saving .asset-save { z-index: 1; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .asset-search { display: grid; grid-template-columns: minmax(0, 1fr) 118px; gap: 8px; }
    .asset-search input, .asset-search select { min-width: 0; padding: 10px 11px; border: 1px solid #d8d2c6; border-radius: 12px; background: #fffdf8; color: #111827; font: inherit; font-size: 12px; font-weight: 700; outline: none; }
    .asset-search input:focus, .asset-search select:focus { border-color: #a9793f; box-shadow: 0 0 0 3px rgba(169,121,63,.14); }
    .asset-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
    .asset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .asset-card { position: relative; min-width: 0; aspect-ratio: 1 / 1; overflow: hidden; border: 1px solid #d8d2c6; border-radius: 14px; background: #fffdf8; box-shadow: 0 8px 18px rgba(31,41,51,.05); }
    .asset-card.saved { width: 64px; height: 64px; aspect-ratio: auto; border-radius: 12px; }
    .asset-card[draggable="true"] { cursor: grab; }
    .asset-card[draggable="true"]:active { cursor: grabbing; }
    .asset-thumb { width: 100%; height: 100%; display: block; background: #eee8dc; object-fit: contain; }
    .asset-tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .asset-search-toggle { width: auto; min-width: 32px; height: 28px; padding: 0 9px; border-radius: 999px; box-shadow: 0 6px 14px rgba(31,41,51,.08); font-size: 16px; line-height: 1; }
    .asset-search-view { position: absolute; inset: 0; z-index: 12; display: flex; flex-direction: column; gap: 14px; padding: 20px; background: linear-gradient(180deg, #fbfaf7 0%, #f2eee6 100%); overflow: auto; transform: translateX(105%); transition: transform .2s ease; box-shadow: -18px 0 44px rgba(31,41,51,.16); }
    .asset-search-view.open { transform: translateX(0); }
    .asset-search-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .asset-search-title { display: flex; flex-direction: column; gap: 2px; }
    .asset-search-title h2 { margin: 0; color: #0f172a; font-size: 16px; letter-spacing: -.01em; }
    .asset-search-title span { color: #756f66; font-size: 12px; line-height: 1.35; }
    .asset-back { width: auto; padding: 9px 11px; border-radius: 999px; background: #ebe4d8; color: #111827; box-shadow: none; }
    .asset-save { position: absolute; left: 7px; right: 7px; bottom: 7px; width: auto; padding: 7px 8px; border-radius: 10px; font-size: 11px; background: rgba(17,24,39,.9); color: #fbfaf7; box-shadow: 0 8px 16px rgba(31,41,51,.2); opacity: .96; }
    .asset-empty { grid-column: 1 / -1; margin: 0; color: #756f66; font-size: 12px; line-height: 1.45; }
    .edit-assets { padding: 10px; border: 1px solid #d8d2c6; border-radius: 16px; background: #f7f3ea; }
    .edit-assets .panel { gap: 8px; }
    .edit-assets .asset-grid { grid-template-columns: repeat(auto-fill, 64px); align-items: start; max-height: 176px; overflow: auto; }
    .edit-assets .asset-thumb { width: 64px; height: 64px; }
    .drop-active .hitbox { background: rgba(169,121,63,.1); outline: 2px dashed rgba(169,121,63,.48); outline-offset: -10px; }
    button { width: 100%; padding: 12px 14px; border: 1px solid #d8d2c6; border-radius: 12px; background: #ebe4d8; color: #111827; font-weight: 800; cursor: pointer; box-shadow: 0 8px 16px rgba(31,41,51,.08); }
    button:hover:not(:disabled) { background: #e3dacb; }
    button:disabled { cursor: not-allowed; opacity: .5; }
    .primary-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; border-radius: 14px; border-color: #111827; background: linear-gradient(135deg, #111827 0%, #1f2937 100%); color: #fbfaf7; font-size: 14px; letter-spacing: .01em; box-shadow: 0 12px 24px rgba(31,41,51,.24); transition: transform .14s ease, box-shadow .14s ease, filter .14s ease; }
    .primary-action:hover:not(:disabled) { background: linear-gradient(135deg, #0f1720 0%, #283241 100%); transform: translateY(-1px); box-shadow: 0 16px 30px rgba(31,41,51,.28); filter: saturate(1.02); }
    .primary-action:active:not(:disabled) { transform: translateY(0); box-shadow: 0 9px 20px rgba(31,41,51,.22); }
    .send-icon { width: 17px; height: 17px; stroke: currentColor; fill: none; stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
    .status { min-height: 20px; color: #5f594f; font-size: 13px; line-height: 1.45; }
    @media (max-width: 900px) { .app { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; } .resize-handle { display: none; } aside { max-height: 48vh; } .deck-nav { bottom: 10px; } }
  </style>
</head>
<body>
  <main class="app">
    <section class="preview"><iframe id="deck" src="/deck?token=${encodeURIComponent(token)}"></iframe><div id="hitbox" class="hitbox" aria-label="Deck element selection layer"></div><nav class="deck-nav" aria-label="Deck navigation"><button id="deckPrev" type="button" title="Previous slide (ArrowLeft / ArrowUp / PageUp)">Previous</button><div id="deckCounter" class="deck-nav-status" aria-live="polite">-- / --</div><button id="deckNext" type="button" title="Next slide (ArrowRight / ArrowDown / Space / PageDown)">Next</button></nav></section>
    <div id="resizeHandle" class="resize-handle" role="separator" aria-label="Resize editor panel" aria-orientation="vertical" title="Drag to resize editor. Double-click to reset."></div>
    <aside>
      <div>
        <h1><span class="wordmark">REVELA</span> Refine</h1>
        <p class="hint">Select refs, describe the change, then send. Use Inspect only when you need source or purpose context.</p>
      </div>
      <div id="selectionSummary" class="selection-summary sr-only" aria-live="polite"><strong>Selection</strong><span>No references selected.</span><div id="selectionChips" class="selection-chips"></div></div>
      <div class="tabs" role="tablist" aria-label="Refine mode">
        <button id="editTab" class="tab" type="button" role="tab">Edit</button>
        <button id="inspectTab" class="tab" type="button" role="tab">Inspect</button>
      </div>
      <div id="editPanel" class="tab-panel">
        <div class="panel">
          <div class="label">Describe the change</div>
          <div id="comment" class="comment-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Cmd/Ctrl-click slide elements to add @refs, then describe the exact edit."></div>
        </div>
        <div class="edit-assets" aria-label="Edit assets">
          <div class="panel">
            <div class="asset-tools"><div class="label">Local Assets</div><button id="assetSearchToggle" class="asset-search-toggle" type="button" aria-expanded="false" aria-controls="assetSearchView" title="Search assets">+</button></div>
            <div id="editSavedAssets" class="asset-grid"><p class="asset-empty">No local assets yet. Click + to search assets.</p></div>
          </div>
        </div>
        <button id="send" class="primary-action" disabled><svg class="send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/><path d="m17.64 15 3.24-3.24a2 2 0 0 0 0-2.83l-5.66-5.66a2 2 0 0 0-2.83 0L9.15 6.5"/><path d="m14 7 3 3"/><path d="M5 19l3-3"/></svg><span>Send Edit</span></button>
        <div class="activity-panel"><div class="label">Activity</div><div id="commentThread" class="comment-thread" aria-live="polite"></div></div>
      </div>
      <div id="inspectPanel" class="tab-panel">
        <div class="panel">
          <label class="label" for="inspectComment">Inspect comment</label>
          <div id="inspectComment" class="comment-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Cmd/Ctrl-click slide elements to add @refs, then ask about purpose or source."></div>
        </div>
        <div class="inspect-actions">
          <div class="inspect-options"><label for="inspectLanguage">Display Language</label><select id="inspectLanguage" class="inspect-select"><option>Auto</option><option>English</option><option>简体中文</option><option>繁體中文</option><option>日本語</option><option>Deutsch</option><option>Français</option><option>Español</option><option>Português</option><option>Arabic</option></select></div>
          <button id="inspectButton" disabled>Inspect Reference</button>
          <div id="inspectStale"></div>
        </div>
        <div id="inspectCards" class="inspect-cards"><div class="inspect-empty">Select a deck element to create an @ref, optionally ask a question, then Inspect. This does not edit the deck.</div></div>
      </div>
      <div id="assetSearchView" class="asset-search-view" aria-hidden="true">
        <div class="asset-search-head">
          <button id="assetSearchBack" class="asset-back" type="button">← Back</button>
          <div class="asset-search-title"><h2>Search Assets</h2><span>Save images to Local Assets, then use them from Edit.</span></div>
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
  <script>
    (() => {
      const token = ${encodedToken};
      const defaultMode = ${encodedDefaultMode};
      const COMMENT_STALE_MS = 60000;
      const EDITOR_WIDTH_KEY = 'revela-edit-editor-width';
      const DEFAULT_EDITOR_WIDTH = 376;
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
        hoverEl: null,
        hoverOutline: null,
        referenceOutlines: [],
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
        mode: defaultMode === 'inspect' ? 'inspect' : 'edit',
        inspecting: false,
        activeInspectRequestId: '',
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
      };
      const els = {
        frame: null,
        hitbox: null,
        resizeHandle: null,
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
        assetSearchToggle: null,
        assetSearchBack: null,
        assetSearchView: null,
        assetQuery: null,
        assetPurpose: null,
        assetSearchButton: null,
        assetShuffleButton: null,
        assetResults: null,
        editSavedAssets: null,
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
          els.hitbox = document.getElementById('hitbox');
          els.resizeHandle = document.getElementById('resizeHandle');
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
          els.assetSearchToggle = document.getElementById('assetSearchToggle');
          els.assetSearchBack = document.getElementById('assetSearchBack');
          els.assetSearchView = document.getElementById('assetSearchView');
          els.assetQuery = document.getElementById('assetQuery');
          els.assetPurpose = document.getElementById('assetPurpose');
          els.assetSearchButton = document.getElementById('assetSearchButton');
          els.assetShuffleButton = document.getElementById('assetShuffleButton');
          els.assetResults = document.getElementById('assetResults');
          els.editSavedAssets = document.getElementById('editSavedAssets');
          els.status = document.getElementById('status');

          els.inspectLanguage = document.getElementById('inspectLanguage');

          if (!els.frame || !els.hitbox || !els.resizeHandle || !els.deckPrev || !els.deckNext || !els.deckCounter || !els.selectionSummary || !els.selectionChips || !els.editTab || !els.inspectTab || !els.editPanel || !els.inspectPanel || !els.comment || !els.commentThread || !els.send || !els.inspectComment || !els.inspectButton || !els.inspectLanguage || !els.inspectCards || !els.inspectStale || !els.assetSearchToggle || !els.assetSearchBack || !els.assetSearchView || !els.assetQuery || !els.assetPurpose || !els.assetSearchButton || !els.assetShuffleButton || !els.assetResults || !els.editSavedAssets || !els.status) {
            throw new Error('Editor boot failed: required DOM nodes are missing.');
          }

          restoreEditorWidth();
          bindEvents();
          setMode(state.mode);
          setStatus('Editor ready. Ctrl/Cmd + click deck elements to reference them.');
          initFrame();
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
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            clearHover();
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
        els.hitbox.addEventListener('pointerdown', onPointerDown);
        els.hitbox.addEventListener('click', onClick);
        els.hitbox.addEventListener('contextmenu', (event) => {
          if (event.ctrlKey || event.metaKey) event.preventDefault();
        });
        els.hitbox.addEventListener('wheel', (event) => {
          const win = els.frame.contentWindow;
          if (!win) return;
          event.preventDefault();
          win.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
          renderHoverOutline(state.hoverEl);
          renderReferenceOutlines();
        }, { passive: false });
        els.resizeHandle.addEventListener('pointerdown', startEditorResize);
        els.resizeHandle.addEventListener('dblclick', resetEditorWidth);
        els.deckPrev.addEventListener('click', prevDeckSlide);
        els.deckNext.addEventListener('click', nextDeckSlide);
        els.send.addEventListener('click', sendComment);
        els.inspectButton.addEventListener('click', inspectCurrentSelection);
        els.assetSearchToggle.addEventListener('click', toggleAssetSearchPanel);
        els.assetSearchBack.addEventListener('click', closeAssetSearchPanel);
        els.assetSearchButton.addEventListener('click', () => searchAssets(false));
        els.assetShuffleButton.addEventListener('click', () => searchAssets(true));
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

      function toggleAssetSearchPanel() {
        const open = !els.assetSearchView.classList.contains('open');
        setAssetSearchOpen(open);
      }

      function closeAssetSearchPanel() {
        setAssetSearchOpen(false);
      }

      function setAssetSearchOpen(open) {
        els.assetSearchView.classList.toggle('open', open);
        els.assetSearchView.setAttribute('aria-hidden', open ? 'false' : 'true');
        els.assetSearchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        els.assetSearchToggle.textContent = '+';
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
          state.assetDropOutline = createOutline(doc, '#a9793f', 'rgba(169,121,63,.16)');
          state.referenceOutlines = [];
          doc.addEventListener('scroll', () => {
            renderHoverOutline(state.hoverEl);
            renderReferenceOutlines();
          }, true);
          const slides = getSlides(doc);
          syncDeckNavigation();
          updateSendState();
          if (state.pendingRefreshMessage) {
            state.pendingRefreshMessage = false;
            setStatus('Deck updated. Preview refreshed. Element references were cleared.');
          } else {
            setStatus(slides.length > 0 ? 'Editor ready. Found ' + slides.length + ' slides. Ctrl/Cmd + click to reference elements.' : 'Editor ready, but no .slide elements were found. Ctrl/Cmd + click to reference elements.');
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
        els.deckCounter.textContent = total > 0 ? current + ' / ' + total : '-- / --';
        els.deckPrev.disabled = total <= 1 || state.deckSlideIndex <= 0;
        els.deckNext.disabled = total <= 1 || state.deckSlideIndex >= total - 1;
      }

      function prevDeckSlide() {
        goToDeckSlide(state.deckSlideIndex - 1);
      }

      function nextDeckSlide() {
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
          state.deckSlideIndex = clamped;
          updateDeckNavControls();
          renderHoverOutline(state.hoverEl);
          renderReferenceOutlines();
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

      async function pollDeckVersion() {
        try {
          const res = await fetch('/api/deck-version?token=' + encodeURIComponent(token), { cache: 'no-store' });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to check deck version');
          const nextVersion = body.version || (String(body.mtimeMs) + ':' + String(body.size));
          if (!state.deckVersion) {
            state.deckVersion = nextVersion;
            markCommentsUpdatedForVersion(nextVersion);
            markStaleComments();
            return;
          }
          if (state.deckVersion === nextVersion) {
            markStaleComments();
            return;
          }
          state.deckVersion = nextVersion;
          markCommentsUpdatedForVersion(nextVersion);
          refreshDeckPreview(body.mtimeMs);
        } catch (error) {
          reportError(error);
        }
      }

      function refreshDeckPreview(version) {
        state.pendingRefreshMessage = true;
        state.initializedDoc = null;
        clearReferences(true);
        state.hoverEl = null;
        if (state.hoverOutline) state.hoverOutline.style.display = 'none';
        state.assetDropTarget = null;
        if (state.assetDropOutline) state.assetDropOutline.style.display = 'none';
        state.referenceOutlines.forEach((outline) => outline.style.display = 'none');
        state.referenceOutlines = [];
        updateSendState();
        els.frame.src = '/deck?token=' + encodeURIComponent(token) + '&v=' + encodeURIComponent(String(version));
        setStatus('Deck changed. Refreshing preview...');
      }

      function onHover(event) {
        try {
          initFrame();
          const target = selectable(targetFromPointer(event));
          if (!target || isReferenced(target)) {
            renderHoverOutline(null);
            return;
          }
          state.hoverEl = target;
          renderHoverOutline(target);
        } catch (error) {
          reportError(error);
        }
      }

      function onClick(event) {
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
        syncReferencesFromComment(false, els.comment);
        syncSelectedAssetFromComment();
        const text = getCommentText().trim();
        if (!text) return;
        const elements = state.references.map((reference) => reference.payload);
        const asset = state.selectedAsset || undefined;
        const commentId = addPendingComment(text, elements, 'sending');
        clearReferences(false);
        state.selectedAsset = null;
        els.comment.textContent = '';
        renderReferenceOutlines();
        state.sendingEdit = true;
        updateSendState();
        setStatus('Sending...');
        try {
          const res = await fetch('/api/comment?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ comment: text, elements, asset }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to send comment');
          updatePendingCommentStatus(commentId, 'sent', { baseDeckVersion: body.deckVersion || state.deckVersion });
          if (pendingCommentStatus(commentId) !== 'updated') setStatus('Comment sent. Waiting for deck update...');
          state.sendingEdit = false;
          updateSendState();
        } catch (error) {
          updatePendingCommentStatus(commentId, 'failed');
          state.sendingEdit = false;
          reportError(error);
          updateSendState();
        }
      }

      async function searchAssets(nextBatch) {
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
        els.assetShuffleButton.disabled = state.assetSearchBusy || !state.assetCandidates.length;
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
          if (state.assetSavingIndex === index) {
            card.classList.add('is-saving');
            appendAssetSaveButton(card, 'Saving...', 'Saving to workspace', () => {}, true);
          } else {
            appendAssetSaveButton(card, 'Save', 'Save to workspace', () => saveCandidate(index));
          }
          els.assetResults.appendChild(card);
        });
        updateAssetShuffleState();
      }

      async function saveCandidate(index) {
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
          await loadSavedAssets();
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
        } catch (error) {
          const message = '<p class="asset-empty">' + escapeHtml(error && error.message ? error.message : String(error)) + '</p>';
          els.editSavedAssets.innerHTML = message;
        }
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
          card.addEventListener('click', () => addAssetToComment(asset));
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

      function appendAssetSaveButton(card, text, label, onClick, loading) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'asset-save';
        button.innerHTML = loading ? '<span class="spinner" aria-hidden="true"></span><span>' + escapeHtml(text) + '</span>' : escapeHtml(text);
        button.disabled = !!loading;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.addEventListener('click', onClick);
        card.appendChild(button);
      }

      function addAssetToComment(asset) {
        if (!asset) return;
        state.selectedAsset = asset;
        removeAssetChip();
        const intro = els.comment.textContent && !/\s$/.test(els.comment.textContent) ? ' Use asset ' : 'Use asset ';
        insertPlainText(intro);
        insertAssetChip(asset);
        insertPlainText(' ');
        setMode('edit');
        updateSendState();
        setStatus('Asset added to the Edit comment. Describe where or how to use it, then Send Edit.');
      }

      function onAssetDragOver(event) {
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
        if (placement?.targetLabel) setStatus(placement.targetLabel + '. Drop to send an asset placement comment.');
      }

      function elementFromPayload(payload) {
        const doc = els.frame.contentDocument;
        if (!doc || !payload) return null;
        const slides = getSlides(doc);
        const slide = slides.find((item, index) => {
          const explicit = Number(item.getAttribute('data-slide-index'));
          const slideIndex = Number.isFinite(explicit) && explicit > 0 ? explicit : index + 1;
          return slideIndex === payload.slideIndex;
        });
        if (!slide) return null;
        if (payload.selector) {
          try {
            const selected = slide.querySelector(payload.selector);
            if (selected) return selected;
          } catch {}
        }
        return slide;
      }

      async function sendAssetPlacement(asset, placement) {
        const modeText = placement.targetMode === 'replace'
          ? 'replace the image at the drop target'
          : placement.targetMode === 'insert-into'
            ? 'insert it into the target element'
            : 'add it near the drop point';
        const comment = 'Place workspace asset ' + asset.path + ' on slide ' + placement.slideIndex + ' as a ' + (asset.purpose || 'visual asset') + '; ' + modeText + '. Preserve the current layout and do not cover existing text, charts, tables, or evidence.';
        const elements = placement.target ? [placement.target] : [];
        const commentId = addPendingComment(comment, elements, 'sending');
        setStatus('Sending asset placement comment...');
        try {
          const res = await fetch('/api/comment?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ comment, elements, asset, drop: placement }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to send asset placement');
          updatePendingCommentStatus(commentId, 'sent', { baseDeckVersion: body.deckVersion || state.deckVersion });
          if (pendingCommentStatus(commentId) !== 'updated') setStatus('Asset placement sent. Waiting for deck update...');
        } catch (error) {
          updatePendingCommentStatus(commentId, 'failed');
          reportError(error);
        }
      }

      function selectable(node) {
        if (!node || node.nodeType !== 1) return null;
        if (node === state.hoverOutline || state.referenceOutlines.includes(node)) return null;
        return findSlide(node) ? node : null;
      }

      function toggleReference(target) {
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
        resetInspectCards('References ready. Open Inspect and click Inspect Reference for concise Purpose and Source context.');
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
        });
        renderCommentThread();
        return id;
      }

      function updatePendingCommentStatus(id, status, updates) {
        const comment = state.pendingComments.find((item) => item.id === id);
        if (!comment) return;
        if (comment.status === 'updated' && status !== 'failed') return;
        comment.status = status;
        if (updates) Object.assign(comment, updates);
        renderCommentThread();
      }

      function markCommentsUpdatedForVersion(version) {
        let changed = false;
        state.pendingComments.forEach((comment) => {
          if ((comment.status === 'sent' || comment.status === 'sending' || comment.status === 'stale') && comment.baseDeckVersion !== version) {
            comment.status = 'updated';
            comment.updatedVersion = version;
            changed = true;
          }
        });
        if (changed) {
          renderCommentThread();
          setStatus('Deck file updated. Preview will refresh automatically.');
        }
      }

      function markStaleComments() {
        const now = Date.now();
        let changed = false;
        state.pendingComments.forEach((comment) => {
          if (comment.status !== 'sent' && comment.status !== 'sending') return;
          if (now - comment.createdAt < COMMENT_STALE_MS) return;
          comment.status = 'stale';
          changed = true;
        });
        if (changed) {
          renderCommentThread();
          setStatus('Still waiting for deck file update. The preview will refresh automatically when the file changes.');
        }
      }

      function pendingCommentStatus(id) {
        return state.pendingComments.find((comment) => comment.id === id)?.status || '';
      }

      function renderCommentThread() {
        els.commentThread.textContent = '';
        state.pendingComments.forEach((comment) => {
          const bubble = document.createElement('div');
          bubble.className = 'comment-bubble ' + comment.status;

          const text = document.createElement('div');
          text.className = 'comment-bubble-text';
          text.textContent = comment.text;

          const status = document.createElement('div');
          status.className = 'comment-bubble-state';
          status.textContent = commentStatusLabel(comment.status);

          bubble.appendChild(text);
          bubble.appendChild(status);
          els.commentThread.appendChild(bubble);
        });
      }

      function commentStatusLabel(status) {
        if (status === 'updated') return 'Deck file updated';
        if (status === 'stale') return 'Still waiting for deck file update';
        if (status === 'failed') return 'Failed to send';
        if (status === 'sending') return 'Sending to OpenCode...';
        return '⏳ Sent to OpenCode';
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

      function renderHoverOutline(target) {
        renderBox(state.hoverOutline, target);
      }

      function renderReferenceOutlines() {
        const doc = els.frame.contentDocument;
        if (!doc || doc.location.href === 'about:blank') return;
        while (state.referenceOutlines.length < state.references.length) state.referenceOutlines.push(createOutline(doc, '#7aa6d8', 'rgba(122,166,216,.18)'));
        state.referenceOutlines.forEach((outline, index) => {
          const reference = state.references[index];
          setOutlineColor(outline, reference?.color);
          renderBox(outline, reference?.target);
        });
      }

      function clearHover() {
        state.hoverEl = null;
        setStatus('Hover cleared. Existing references are kept.');
        if (state.hoverOutline) state.hoverOutline.style.display = 'none';
      }

      function updateSendState() {
        if (state.sendingEdit) setButtonLoading(els.send, true, 'Sending...');
        else setButtonLoading(els.send, false, '<svg class="send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/><path d="m17.64 15 3.24-3.24a2 2 0 0 0 0-2.83l-5.66-5.66a2 2 0 0 0-2.83 0L9.15 6.5"/><path d="m14 7 3 3"/><path d="M5 19l3-3"/></svg><span>Send Edit</span>', true);
        els.send.disabled = state.sendingEdit || !getCommentText().trim();
        if (state.inspecting) setButtonLoading(els.inspectButton, true, 'Inspecting...');
        else setButtonLoading(els.inspectButton, false, 'Inspect Reference');
        els.inspectButton.disabled = state.inspecting || state.references.length === 0;
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
          chip.textContent = '@' + reference.label;
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
      }

      function getInspectComment() {
        syncReferencesFromComment(false, els.inspectComment);
        return getCommentText(els.inspectComment).trim().slice(0, 2000);
      }

      async function inspectCurrentSelection() {
        if (!state.references.length || state.inspecting) return;
        const snapshot = collectReferenceSnapshot();
        const comment = getInspectComment();
        state.inspecting = true;
        updateSendState();
        setMode('inspect');
        els.inspectStale.innerHTML = '';
        state.inspectFallback = null;
        renderInspectLoading('Reading selection...');
        try {
          const res = await fetch('/api/inspect?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ snapshot, deckVersion: state.deckVersion, language: state.inspectLanguage, comment }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Inspection failed');
          state.deckVersion = body.deckVersion || state.deckVersion;
          state.activeInspectRequestId = body.requestId;
          state.inspectFallback = body.preprocess || null;
          renderInspectLoading('Waiting for Purpose and Source...');
          await pollInspectResult(body.requestId);
        } catch (error) {
          if (state.inspectFallback) {
            renderInspectResult(state.inspectFallback, 'Deterministic fallback');
            els.inspectCards.insertAdjacentHTML('afterbegin', '<div class="inspect-warning">Generated inspection failed or timed out. Showing deterministic fallback context only.</div>');
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
          if (!res.ok || !body.ok) throw new Error(body.error || 'Inspection result failed');
          if (body.status === 'completed') {
            state.deckVersion = body.deckVersion || state.deckVersion;
            renderInspectResult(body.result, 'Generated');
            return;
          }
          if (body.status === 'failed' || body.status === 'expired') throw new Error(body.error || 'Inspection failed');
        }
        throw new Error('Inspection timed out while waiting for OpenCode result');
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
        if (result.stale?.stale) els.inspectStale.innerHTML = '<div class="inspect-stale">' + escapeHtml(result.stale.reason || 'Inspection may be stale.') + '</div>';
        else els.inspectStale.innerHTML = '';
        els.inspectCards.innerHTML = [
          '<div class="status">' + escapeHtml(phase || 'Inspection') + '</div>',
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
        return humanElementName(payload) + ' ' + (state.references.length + 1);
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
        chip.textContent = '@' + reference.label;
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
        chip.textContent = '@Asset ' + (asset.id || asset.deckPath || asset.path || 'image');
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
        resetInspectCards('Select a deck element to create an @ref, optionally ask a question, then Inspect. This does not edit the deck.');
      }

      function getCommentText(editor) {
        const source = editor || els.comment;
        return (source.innerText || source.textContent || '').replace(/\\u00a0/g, ' ');
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
        if (/^h[1-6]$/.test(tag)) return 'Heading';
        if (tag === 'p') return 'Text block';
        if (classes.some((name) => /card/i.test(name))) return 'Card';
        if (classes.some((name) => /stat|metric|value/i.test(name))) return 'Metric';
        if (tag === 'img' || tag === 'svg') return 'Visual';
        return 'Element';
      }

      function collectPayload(el) {
        const doc = els.frame.contentDocument;
        const slides = getSlides(doc);
        const slide = findSlide(el);
        const rect = el.getBoundingClientRect();
        const explicitSlideIndex = slide ? Number(slide.getAttribute('data-slide-index')) : Number.NaN;
        const slideIndex = slide && Number.isFinite(explicitSlideIndex) && explicitSlideIndex > 0 ? explicitSlideIndex : slide ? slides.indexOf(slide) + 1 : undefined;
        const win = els.frame.contentWindow;
        return {
          slideIndex,
          slideTitle: slide ? ((slide.querySelector('h1,h2,h3,[data-title]') || {}).textContent || '').trim().slice(0, 160) : undefined,
          selector: buildSelector(el, slide),
          domPath: buildDomPath(el, slide),
          tagName: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classList: Array.from(el.classList || []),
          text: (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 600),
          outerHTMLExcerpt: (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 1200),
          nearbyText: slide ? (slide.innerText || slide.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 1200) : undefined,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          viewport: { width: win ? win.innerWidth : undefined, height: win ? win.innerHeight : undefined },
        };
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
