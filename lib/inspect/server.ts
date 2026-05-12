import { randomBytes } from "crypto"
import { existsSync, readFileSync, statSync } from "fs"
import { dirname, extname, isAbsolute, resolve, sep } from "path"
import type { EditableDeck } from "../edit/resolve-deck"
import type { InspectionElementSnapshot } from "../inspection-context/match"
import { buildInspectionPrompt } from "./prompt"
import { projectWorkspaceElement } from "./request"
import { createInspectRequest, failInspectRequest, getInspectRequest } from "./requests"

const TOKEN_BYTES = 24
const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const IDLE_STOP_MS = 30 * 60 * 1000

interface InspectAsset {
  id: string
  absoluteFile: string
}

interface InspectSession {
  token: string
  client: any
  sessionID: string
  deck: string
  file: string
  absoluteFile: string
  workspaceRoot: string
  assets: Map<string, InspectAsset>
  assetKeys: Map<string, string>
  nextAssetId: number
  lastActiveAt: number
}

export interface InspectServerHandle {
  baseUrl: string
  getOrCreateSession(input: { client: any; sessionID: string; workspaceRoot: string; deck: EditableDeck }): InspectServerSessionResult
}

export interface InspectServerSessionResult {
  token: string
  reused: boolean
}

let server: ReturnType<typeof Bun.serve> | undefined
let baseUrl = ""
let idleTimer: Timer | undefined
const sessions = new Map<string, InspectSession>()

export function startInspectServer(): InspectServerHandle {
  if (!server) {
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handleRequest })
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
        return { token: existing.token, reused: true }
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
        lastActiveAt: Date.now(),
      })
      return { token, reused: false }
    },
  }
}

export function stopInspectServer(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = undefined
  sessions.clear()
  server?.stop()
  server = undefined
  baseUrl = ""
}

async function handleRequest(req: Request): Promise<Response> {
  cleanupExpiredSessions()
  const url = new URL(req.url)

  if (url.pathname === "/health") return textResponse("ok")

  if (url.pathname === "/inspect" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return htmlResponse(renderInspectorShell(session.value.token))
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
    return jsonResponse({ ok: true, ...readDeckVersion(session.value) })
  }

  return textResponse("Not found", 404)
}

function handleDeck(session: InspectSession): Response {
  session.assets.clear()
  session.assetKeys.clear()
  session.nextAssetId = 1
  const html = readFileSync(session.absoluteFile, "utf-8")
  return htmlResponse(rewriteLocalAssetRefs(html, session, session.absoluteFile, "html"))
}

function handleAsset(session: InspectSession, id: string | null, method: string): Response {
  if (!id) return textResponse("Missing asset id", 400)
  const asset = session.assets.get(id)
  if (!asset) return textResponse("Asset not found", 404)
  if (!existsSync(asset.absoluteFile)) return textResponse("Asset file not found", 404)
  if (!statSync(asset.absoluteFile).isFile()) return textResponse("Asset is not a file", 404)

  const mime = mimeTypeForPath(asset.absoluteFile)
  const headers = { "content-type": mime, "cache-control": "no-store, max-age=0" }
  if (method === "HEAD") return new Response(null, { status: 200, headers })

  if (mime === "text/css") {
    const css = readFileSync(asset.absoluteFile, "utf-8")
    return new Response(rewriteLocalAssetRefs(css, session, asset.absoluteFile, "css"), { status: 200, headers })
  }

  return new Response(new Uint8Array(readFileSync(asset.absoluteFile)), { status: 200, headers })
}

async function handleInspect(req: Request, session: InspectSession): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const snapshot = normalizeSnapshot(body?.snapshot ?? body)
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

    return jsonResponse({ ok: true, requestId, deckVersion: version, status: "pending", preprocess })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failInspectRequest(requestId, message)
    return jsonResponse({ ok: false, requestId, deckVersion: version, error: message }, 400)
  }
}

function handleInspectResult(requestId: string | null, session: InspectSession): Response {
  if (!requestId) return jsonResponse({ ok: false, error: "Missing requestId" }, 400)
  const request = getInspectRequest(requestId)
  if (!request) return jsonResponse({ ok: false, requestId, error: "Inspection request not found" }, 404)
  session.lastActiveAt = Date.now()
  scheduleIdleStop()
  if (request.status === "completed") {
    return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion, result: request.result })
  }
  if (request.status === "failed" || request.status === "expired") {
    return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion, error: request.error || "Inspection failed" })
  }
  return jsonResponse({ ok: true, requestId, status: request.status, deckVersion: request.deckVersion })
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

function readDeckVersion(session: InspectSession): { mtimeMs: number; size: number; version: string } {
  const stat = statSync(session.absoluteFile)
  return { mtimeMs: stat.mtimeMs, size: stat.size, version: `${stat.mtimeMs}:${stat.size}` }
}

function findSessionForDeck(absoluteFile: string): { token: string; session: InspectSession } | undefined {
  for (const [token, session] of sessions) {
    if (session.absoluteFile === absoluteFile) return { token, session }
  }
  return undefined
}

function validateSession(token: string | null): { ok: true; value: InspectSession } | { ok: false; response: Response } {
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
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0" } })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } })
}

function rewriteLocalAssetRefs(content: string, session: InspectSession, sourceFile: string, contentType: "html" | "css"): string {
  const baseDir = dirname(sourceFile)
  let rewritten = rewriteCssUrls(content, session, baseDir)
  if (contentType === "css") return rewritten
  rewritten = rewriteHtmlAssetAttributes(rewritten, session, baseDir)
  return rewriteSrcsetAttributes(rewritten, session, baseDir)
}

function rewriteHtmlAssetAttributes(html: string, session: InspectSession, baseDir: string): string {
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

function rewriteSrcsetAttributes(html: string, session: InspectSession, baseDir: string): string {
  const srcsetPattern = /\bsrcset\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
  return html.replace(srcsetPattern, (match, raw: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? ""
    const rewritten = value.split(",").map((part) => {
      const trimmed = part.trim()
      if (!trimmed) return part
      const pieces = trimmed.split(/\s+/)
      const assetUrl = assetUrlForRef(pieces[0], session, baseDir)
      return assetUrl ? [assetUrl, ...pieces.slice(1)].join(" ") : part
    }).join(", ")
    if (rewritten === value) return match
    const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : ""
    const escaped = quote ? rewritten.replace(/&/g, "&amp;") : rewritten
    return `srcset=${quote}${escaped}${quote}`
  })
}

function rewriteCssUrls(content: string, session: InspectSession, baseDir: string): string {
  const cssUrlPattern = /url\(\s*("([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi
  return content.replace(cssUrlPattern, (match, raw: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? ""
    const assetUrl = assetUrlForRef(value, session, baseDir)
    if (!assetUrl) return match
    const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : ""
    return `url(${quote}${assetUrl}${quote})`
  })
}

function assetUrlForRef(value: string, session: InspectSession, baseDir: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith("#") || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return undefined
  const [pathPart, suffix = ""] = splitAssetSuffix(trimmed)
  const absoluteFile = resolveAssetPath(pathPart, session.workspaceRoot, baseDir)
  if (!absoluteFile) return undefined
  const root = resolve(session.workspaceRoot)
  if (absoluteFile !== root && !absoluteFile.startsWith(root.endsWith(sep) ? root : root + sep)) return undefined
  if (!existsSync(absoluteFile) || !statSync(absoluteFile).isFile()) return undefined
  const key = absoluteFile
  let id = session.assetKeys.get(key)
  if (!id) {
    id = String(session.nextAssetId++)
    session.assetKeys.set(key, id)
    session.assets.set(id, { id, absoluteFile })
  }
  return `/__revela_asset?token=${encodeURIComponent(session.token)}&id=${encodeURIComponent(id)}${suffix}`
}

function splitAssetSuffix(value: string): [string, string] {
  const hashIndex = value.indexOf("#")
  const queryIndex = value.indexOf("?")
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0)
  if (indexes.length === 0) return [value, ""]
  const splitAt = Math.min(...indexes)
  return [value.slice(0, splitAt), value.slice(splitAt)]
}

function resolveAssetPath(value: string, workspaceRoot: string, baseDir: string): string | undefined {
  if (!value) return undefined
  if (value.startsWith("/")) return resolve(workspaceRoot, "." + value)
  return isAbsolute(value) ? resolve(value) : resolve(baseDir, value)
}

function mimeTypeForPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html": return "text/html"
    case ".css": return "text/css"
    case ".js": return "text/javascript"
    case ".json": return "application/json"
    case ".jpg":
    case ".jpeg": return "image/jpeg"
    case ".png": return "image/png"
    case ".gif": return "image/gif"
    case ".webp": return "image/webp"
    case ".svg": return "image/svg+xml"
    case ".woff": return "font/woff"
    case ".woff2": return "font/woff2"
    case ".ttf": return "font/ttf"
    case ".otf": return "font/otf"
    default: return "application/octet-stream"
  }
}

export function renderInspectorShell(token: string): string {
  const encodedToken = JSON.stringify(token)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Evidence Inspector</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; overflow: hidden; background: #eef3f8; color: #172033; }
    .app { display: grid; grid-template-columns: minmax(0, 1fr) 390px; height: 100vh; }
    .preview { position: relative; min-width: 0; background: #eef3f8; }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    .hitbox { position: absolute; inset: 0; z-index: 2; cursor: crosshair; background: transparent; }
    aside { display: flex; flex-direction: column; gap: 14px; padding: 18px; background: linear-gradient(180deg, #fff 0%, #f8fafc 100%); border-left: 1px solid #dbe4ee; overflow: auto; }
    h1 { margin: 0; font-size: 18px; line-height: 1.2; color: #0f172a; }
    .hint { margin: 0; color: #64748b; font-size: 13px; line-height: 1.5; }
    .selection { padding: 12px; border: 1px solid #d7e0ea; border-radius: 14px; background: #fff; box-shadow: 0 10px 24px rgba(15,23,42,.05); }
    .selection strong { display: block; margin-bottom: 5px; color: #334155; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    .selection p { margin: 0; color: #0f172a; font-size: 13px; line-height: 1.45; }
    .refs { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
    .ref-chip { display: inline-flex; align-items: center; width: fit-content; padding: 2px 8px; border-radius: 999px; background: var(--ref-bg, #e0f2fe); color: var(--ref-text, #075985); border: 1px solid var(--ref-border, #7dd3fc); font-size: 12px; font-weight: 800; }
    .inspect-btn { width: 100%; margin-top: 10px; padding: 10px 12px; border: 0; border-radius: 12px; background: #2563eb; color: #fff; font-weight: 800; cursor: pointer; box-shadow: 0 10px 24px rgba(37,99,235,.22); }
    .inspect-btn:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
    .cards { display: flex; flex-direction: column; gap: 12px; }
    .card { border: 1px solid #d7e0ea; border-radius: 16px; background: #fff; padding: 13px; box-shadow: 0 10px 24px rgba(15,23,42,.05); }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .card h2 { margin: 0; font-size: 13px; color: #0f172a; }
    .badge { border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; background: #e2e8f0; color: #475569; }
    .badge.supported, .badge.found, .badge.present, .badge.known, .badge.suggested { background: #dcfce7; color: #166534; }
    .badge.weak, .badge.missing { background: #fef3c7; color: #92400e; }
    .badge.unsupported { background: #fee2e2; color: #991b1b; }
    .card p { margin: 0; color: #475569; font-size: 12px; line-height: 1.5; }
    .items { margin-top: 8px; display: flex; flex-direction: column; gap: 7px; }
    .item { padding: 8px; border-radius: 10px; background: #f8fafc; color: #334155; font-size: 12px; line-height: 1.45; }
    .item b { color: #0f172a; }
    .warning { margin-top: 8px; padding: 8px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 12px; line-height: 1.45; }
    .stale { padding: 10px; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: 12px; line-height: 1.45; }
    .empty { padding: 24px 12px; text-align: center; color: #64748b; font-size: 13px; line-height: 1.5; }
    .loading { padding: 22px 12px; text-align: center; color: #334155; font-size: 13px; line-height: 1.5; border: 1px dashed #cbd5e1; border-radius: 16px; background: #f8fafc; }
    .loading b { display: block; margin-bottom: 4px; color: #0f172a; }
    .bind-status { padding: 8px 10px; border-radius: 10px; background: #f8fafc; color: #64748b; font-size: 11px; line-height: 1.35; }
    .bind-status.ready { background: #ecfdf5; color: #047857; }
    .bind-status.error { background: #fef2f2; color: #b91c1c; }
    .kbd { display: inline-block; padding: 1px 5px; border: 1px solid #cbd5e1; border-radius: 5px; background: #f8fafc; color: #334155; font-size: 11px; font-weight: 700; }
    @media (max-width: 900px) { .app { grid-template-columns: 1fr; grid-template-rows: 56vh 44vh; } aside { border-left: 0; border-top: 1px solid #dbe4ee; } }
  </style>
</head>
<body>
  <main class="app">
    <section class="preview"><iframe id="deck" src="/deck?token=${encodeURIComponent(token)}"></iframe><div id="hitbox" class="hitbox" aria-label="Deck element selection layer"></div></section>
    <aside>
      <div>
        <h1>Evidence Inspector</h1>
        <p class="hint">Cmd/Ctrl-click slide elements to attach them as references in /revela review --deck. Then click <b>Get Insight</b>. This is not chat.</p>
      </div>
      <div id="selection" class="selection">
        <strong>Selection</strong>
        <p>No references selected.</p>
        <div id="refs" class="refs"></div>
        <button id="inspectButton" class="inspect-btn" disabled>Inspect Selection</button>
      </div>
      <div id="bindingStatus" class="bind-status">Selection binding: starting...</div>
      <div id="stale"></div>
      <div id="cards" class="cards"><div class="empty">Cmd/Ctrl-click text, cards, charts, or slide objects to choose what to inspect.</div></div>
    </aside>
  </main>
  <script>
    (function initInspectErrorPrelude() {
      function statusEl() { return document.getElementById('bindingStatus'); }
      function showInspectShellError(error) {
        const el = statusEl();
        const message = error?.message || String(error || 'Unknown inspect shell error');
        if (el) {
          el.className = 'bind-status error';
          el.textContent = 'Inspect shell error: ' + message;
        }
        console.error('Revela inspect shell error', error);
      }
      window.__revelaInspectDebug = {
        ready: false,
        error: null,
        bindingState: function () {
          const iframe = document.getElementById('deck');
          const doc = iframe?.contentDocument;
          return {
            ready: false,
            hasIframe: !!iframe,
            hasDoc: !!doc,
            readyState: doc?.readyState,
            hasBody: !!doc?.body,
            bound: doc?.body?.getAttribute('data-revela-inspect-bound') || null,
            status: statusEl()?.textContent || '',
            error: window.__revelaInspectDebug?.error || null,
          };
        },
      };
      window.addEventListener('error', function (event) {
        window.__revelaInspectDebug.error = event.error?.message || event.message || 'Unknown script error';
        showInspectShellError(event.error || event.message);
      });
      window.addEventListener('unhandledrejection', function (event) {
        window.__revelaInspectDebug.error = event.reason?.message || String(event.reason || 'Unhandled promise rejection');
        showInspectShellError(event.reason);
      });
    })();
  </script>
  <script>
    const token = ${encodedToken};
    const iframe = document.getElementById('deck');
    const hitbox = document.getElementById('hitbox');
    const cards = document.getElementById('cards');
    const selection = document.getElementById('selection');
    const refs = document.getElementById('refs');
    const inspectButton = document.getElementById('inspectButton');
    const staleBox = document.getElementById('stale');
    const bindingStatus = document.getElementById('bindingStatus');
    const REFERENCE_COLORS = [
      { border: '#7aa6d8', fill: 'rgba(122,166,216,.18)', bg: '#eaf2fb', text: '#244f78' },
      { border: '#a99bd9', fill: 'rgba(169,155,217,.18)', bg: '#f1eefb', text: '#574985' },
      { border: '#83b99a', fill: 'rgba(131,185,154,.18)', bg: '#edf7f1', text: '#2f6848' },
      { border: '#d7a775', fill: 'rgba(215,167,117,.18)', bg: '#fbf1e7', text: '#7a4d22' },
      { border: '#d493b0', fill: 'rgba(212,147,176,.18)', bg: '#faedf3', text: '#7b3f5b' },
    ];
    let deckVersion = '';
    let locked = false;
    let activeRequestId = '';
    let hoverOutline = null;
    let hoverEl = null;
    let references = [];
    let referenceOutlines = [];
    let nextReferenceId = 1;
    let bindTimer = 0;
    let bindAttempts = 0;

    async function refreshDeckVersion() {
      try {
        const res = await fetch('/api/deck-version?token=' + encodeURIComponent(token));
        const data = await res.json();
        if (data.ok) deckVersion = data.version;
      } catch {}
    }

    function setBindingStatus(kind, message) {
      if (!bindingStatus) return;
      bindingStatus.className = 'bind-status' + (kind ? ' ' + kind : '');
      bindingStatus.textContent = message;
    }

    function attachDeckHandlers() {
      const doc = iframe.contentDocument;
      if (!doc?.body) return false;
      if (doc.body.getAttribute('data-revela-inspect-bound') === 'true') {
        setBindingStatus('ready', 'Selection ready: Cmd/Ctrl-click to reference elements.');
        return true;
      }
      try {
        doc.body.setAttribute('data-revela-inspect-bound', 'true');
        if (!hoverOutline || hoverOutline.ownerDocument !== doc) hoverOutline = createOutline(doc, '#38bdf8', 'rgba(56,189,248,.12)');
        doc.addEventListener('scroll', () => renderSelectionOutline(), true);
        hitbox.addEventListener('pointermove', onHover);
        hitbox.addEventListener('pointerdown', onPointerDown);
        hitbox.addEventListener('click', onClick);
        hitbox.addEventListener('contextmenu', (event) => { if (event.ctrlKey || event.metaKey) event.preventDefault(); });
        hitbox.addEventListener('wheel', (event) => {
          const win = iframe.contentWindow;
          if (!win) return;
          event.preventDefault();
          win.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
          renderSelectionOutline();
          renderReferenceOutlines();
        }, { passive: false });
        doc.body.style.cursor = 'default';
        setBindingStatus('ready', 'Selection ready: Ctrl/Cmd-click to reference elements.');
        return true;
      } catch (error) {
        doc.body.removeAttribute('data-revela-inspect-bound');
        console.error('Revela inspect selection binding failed', error);
        setBindingStatus('error', 'Selection binding failed: ' + (error?.message || String(error)));
        return false;
      }
    }

    function startBindingLoop() {
      bindAttempts = 0;
      setBindingStatus('', 'Selection binding: waiting for deck...');
      if (bindTimer) clearInterval(bindTimer);
      bindTimer = window.setInterval(() => {
        bindAttempts += 1;
        try {
          if (attachDeckHandlers()) {
            clearInterval(bindTimer);
            bindTimer = 0;
            return;
          }
        } catch (error) {
          console.error('Revela inspect binding loop failed', error);
          setBindingStatus('error', 'Selection binding failed: ' + (error?.message || String(error)));
        }
        if (bindAttempts >= 80) {
          clearInterval(bindTimer);
          bindTimer = 0;
          setBindingStatus('error', 'Selection binding timed out. Reopen /revela review --deck or reload this page.');
        }
      }, 150);
    }

    function retryAttachDeckHandlers() {
      startBindingLoop();
    }

    inspectButton.addEventListener('click', () => {
      if (!references.length || locked) return;
      inspectSnapshot(collectReferenceSnapshot());
    });

    document.addEventListener('keydown', handleSelectionKeydown);

    function handleSelectionKeydown(event) {
      if (locked) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        clearCurrentSelection();
      }
    }

    function onHover(event) {
      hoverEl = selectable(targetFromPointer(event));
      renderSelectionOutline();
    }

    function onClick(event) {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    }

    function onPointerDown(event) {
      if (locked || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleReference(selectable(targetFromPointer(event)));
    }

    function targetFromPointer(event) {
      const doc = iframe.contentDocument;
      if (!doc || doc.location.href === 'about:blank') return null;
      const frameRect = iframe.getBoundingClientRect();
      const x = event.clientX - frameRect.left;
      const y = event.clientY - frameRect.top;
      if (x < 0 || y < 0 || x > frameRect.width || y > frameRect.height) return null;
      return doc.elementFromPoint(x, y);
    }

    function selectable(node) {
      if (!node || node.nodeType !== 1) return null;
      if (node === hoverOutline || referenceOutlines.includes(node)) return null;
      return canonicalSlideRoot(node) ? node : null;
    }

    function toggleReference(target) {
      if (!target) {
        setBindingStatus('error', 'No selectable deck element found under pointer.');
        return;
      }
      const existing = references.findIndex((reference) => reference.target === target);
      if (existing >= 0) {
        references.splice(existing, 1);
        renderSelectionPreview();
        renderReferenceOutlines();
        return;
      }
      const payload = collectPayload(target);
      const color = REFERENCE_COLORS[(nextReferenceId - 1) % REFERENCE_COLORS.length];
      references.push({ id: 'ref-' + nextReferenceId++, target, label: nextReferenceLabel(payload), payload, color });
      renderSelectionPreview();
      renderReferenceOutlines();
      cards.innerHTML = '<div class="empty">References ready. Click Inspect Selection to show deterministic Source/Purpose first, then lazy generated cards.</div>';
    }

    function clearCurrentSelection() {
      references = [];
      renderSelectionPreview();
      if (hoverOutline) hoverOutline.style.display = 'none';
      referenceOutlines.forEach((outline) => outline.style.display = 'none');
      cards.innerHTML = '<div class="empty">Cmd/Ctrl-click text, cards, charts, or slide objects to choose what to inspect.</div>';
      bindSelectionControls();
    }

    function bindSelectionControls() {
      const button = document.getElementById('inspectButton');
      if (button) button.addEventListener('click', () => {
        if (!references.length || locked) return;
        inspectSnapshot(collectReferenceSnapshot());
      });
    }

    function renderSelectionPreview() {
      if (!references.length) {
        selection.innerHTML = '<strong>Selection</strong><p>No references selected.</p><div id="refs" class="refs"></div><button id="inspectButton" class="inspect-btn" disabled>Inspect Selection</button>';
        bindSelectionControls();
        return;
      }
      selection.innerHTML = '<strong>Selection</strong><p>' + references.length + ' referenced element' + (references.length === 1 ? '' : 's') + ' selected.</p><div id="refs" class="refs"></div><button id="inspectButton" class="inspect-btn">Inspect Selection</button>';
      const list = document.getElementById('refs');
      references.forEach((reference) => {
        const chip = document.createElement('span');
        chip.className = 'ref-chip';
        chip.style.setProperty('--ref-bg', reference.color.bg);
        chip.style.setProperty('--ref-border', reference.color.border);
        chip.style.setProperty('--ref-text', reference.color.text);
        chip.textContent = '@' + reference.label;
        list.appendChild(chip);
      });
      bindSelectionControls();
    }

    function renderSelectionOutline() {
      renderBox(hoverOutline, hoverEl);
    }

    function createOutline(doc, border, fill) {
      const outline = doc.createElement('div');
      outline.setAttribute('data-revela-inspect-outline', 'true');
      outline.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid ' + border + ';background:' + fill + ';border-radius:8px;display:none;';
      doc.body.appendChild(outline);
      return outline;
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

    function setOutlineColor(outline, color) {
      if (!outline || !color) return;
      outline.style.borderColor = color.border;
      outline.style.background = color.fill;
    }

    function renderReferenceOutlines() {
      const doc = iframe.contentDocument;
      if (!doc || doc.location.href === 'about:blank') return;
      while (referenceOutlines.length < references.length) referenceOutlines.push(createOutline(doc, '#7aa6d8', 'rgba(122,166,216,.18)'));
      referenceOutlines.forEach((outline, index) => {
        const reference = references[index];
        setOutlineColor(outline, reference?.color);
        renderBox(outline, reference?.target);
      });
    }

    function collectPayload(el) {
      const slide = canonicalSlideRoot(el);
      const box = el.getBoundingClientRect();
      const win = iframe.contentWindow;
      return {
        slideIndex: slideIndex(slide),
        slideTitle: slide ? cleanText((slide.querySelector('h1,h2,h3,[data-title]') || {}).textContent).slice(0, 160) : undefined,
        selector: buildSelector(el, slide),
        domPath: buildDomPath(el, slide),
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        classList: Array.from(el.classList || []).slice(0, 30),
        text: cleanText(el.innerText || el.textContent).slice(0, 700),
        outerHTMLExcerpt: cleanText(el.outerHTML).slice(0, 1200),
        nearbyText: slide ? cleanText(slide.innerText || slide.textContent).slice(0, 1200) : undefined,
        boundingBox: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        viewport: { width: win ? win.innerWidth : undefined, height: win ? win.innerHeight : undefined },
      };
    }

    function collectReferenceSnapshot() {
      const elements = references.map((reference) => reference.payload);
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

    function nextReferenceLabel(payload) {
      return humanElementName(payload) + ' ' + (references.length + 1);
    }

    function humanElementName(payload) {
      const tag = String(payload.tagName || '').toLowerCase();
      const classes = payload.classList || [];
      if (/^h[1-6]$/.test(tag)) return 'Heading';
      if (tag === 'p') return 'Text block';
      if (classes.some((name) => /card/i.test(name))) return 'Card';
      if (classes.some((name) => /stat|metric|value|kpi/i.test(name))) return 'Metric';
      if (tag === 'img' || tag === 'svg' || classes.some((name) => /chart|visual/i.test(name))) return 'Visual';
      return 'Element';
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
      return [slideSelector(slide)].concat(parts).filter(Boolean).join(' > ');
    }

    function slideSelector(slide) {
      if (!slide) return '.slide';
      if (slide.id) return '#' + cssEscape(slide.id);
      const slides = slideRoots();
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

    function canonicalSlideRoot(el) {
      if (!el) return undefined;
      const explicit = el.closest('[data-slide-index]');
      if (explicit && !explicit.closest('.slide, [slide-qa]')) return explicit;
      const slide = el.closest('.slide');
      if (slide) return slide;
      const qaSlide = el.closest('[slide-qa]');
      if (qaSlide) return qaSlide;
      const fallback = el.closest('.page, .slide-canvas');
      if (!fallback) return undefined;
      const parentSlide = fallback.parentElement?.closest('.slide, [slide-qa], [data-slide-index]');
      return parentSlide || fallback;
    }

    function slideRoots() {
      const doc = iframe.contentDocument;
      const roots = [];
      const candidates = Array.from(doc.querySelectorAll('.slide, [data-slide-index], [slide-qa], .page, .slide-canvas'));
      for (const candidate of candidates) {
        const root = canonicalSlideRoot(candidate);
        if (root && !roots.includes(root)) roots.push(root);
      }
      return roots;
    }

    function slideIndex(slide) {
      if (!slide) return undefined;
      const explicit = slide.getAttribute('data-slide-index');
      if (explicit && !Number.isNaN(Number(explicit))) return Number(explicit);
      // Legacy decks may still carry 0-based data-index. It is intentionally
      // ignored here; DECKS.json slide indexes are 1-based, so DOM order is the
      // safer fallback for matching inspector snapshots to slide specs.
      const slides = slideRoots();
      const index = slides.indexOf(slide);
      return index >= 0 ? index + 1 : undefined;
    }

    function cleanText(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }

    async function inspectSnapshot(snapshot) {
      setLocked(true);
      const summary = snapshot.scope === 'selection'
        ? 'Inspecting ' + (snapshot.elements?.length || 0) + ' selected elements' + (snapshot.slideIndex ? ' on Slide ' + snapshot.slideIndex : '')
        : (snapshot.text || '(slide area)');
      selection.innerHTML = '<strong>Selection</strong><p>' + escapeHtml(summary) + '</p>';
      staleBox.innerHTML = '';
      cards.innerHTML = '<div class="loading"><b>Preparing inspection...</b>Deterministic Source/Purpose will appear first; generated cards will update lazily.</div>';
      try {
        const res = await fetch('/api/inspect?token=' + encodeURIComponent(token), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ snapshot, deckVersion }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Inspection failed');
        deckVersion = data.deckVersion || deckVersion;
        activeRequestId = data.requestId;
        if (data.preprocess) renderResult(data.preprocess, 'Preprocessed');
        cards.insertAdjacentHTML('beforeend', '<div class="loading"><b>Generating lazy inspection...</b>The deck is locked until the LLM submits the structured result.</div>');
        await pollInspectionResult(activeRequestId);
      } catch (error) {
        cards.innerHTML = '<div class="empty">' + escapeHtml(error.message || String(error)) + '</div>';
        setLocked(false);
      }
    }

    async function pollInspectionResult(requestId) {
      for (;;) {
        await delay(900);
        const res = await fetch('/api/inspect-result?token=' + encodeURIComponent(token) + '&requestId=' + encodeURIComponent(requestId));
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Inspection result failed');
        if (data.status === 'completed') {
          deckVersion = data.deckVersion || deckVersion;
          renderResult(data.result, 'Generated');
          setLocked(false);
          return;
        }
        if (data.status === 'failed' || data.status === 'expired') {
          throw new Error(data.error || 'Inspection failed');
        }
      }
    }

    function setLocked(value) {
      locked = value;
      const doc = iframe.contentDocument;
      if (doc?.body) doc.body.style.cursor = value ? 'wait' : 'default';
      const button = document.getElementById('inspectButton');
      if (button) button.disabled = value || !references.length;
    }

    function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

    function renderResult(result, phase) {
      if (result.stale?.stale) staleBox.innerHTML = '<div class="stale">' + escapeHtml(result.stale.reason || 'Inspection may be stale.') + '</div>';
      else staleBox.innerHTML = '';
      cards.innerHTML = [
        '<div class="bind-status ready">' + escapeHtml(phase || 'Inspection') + '</div>',
        renderCard('Purpose', result.cards.purpose.status, result.cards.purpose.rationale, renderPurpose(result.cards.purpose)),
        renderCard('Source', result.cards.source.status, result.cards.source.rationale, renderSource(result.cards.source)),
      ].join('');
    }

    function renderCard(title, status, rationale, body) {
      return '<section class="card"><div class="card-head"><h2>' + escapeHtml(title) + '</h2><span class="badge ' + escapeHtml(status) + '">' + escapeHtml(status) + '</span></div><p>' + escapeHtml(rationale || '') + '</p>' + (body || '') + '</section>';
    }

    function renderSources(items) {
      if (!items || !items.length) return '';
      return '<div class="items">' + items.map((item) => '<div class="item"><b>' + escapeHtml(item.source || 'Source') + '</b>' + field('Path', item.sourcePath || item.findingsFile) + field('Location', item.location || item.page) + field('Quote', item.quote) + field('URL', item.url) + field('Caveat', item.caveat) + '</div>').join('') + '</div>';
    }

    function renderPurpose(card) {
      return '<div class="items"><div class="item">' + field('Role', card.role) + field('Why it matters', card.whyItMatters) + '</div></div>';
    }

    function renderSource(card) {
      return renderSources(card.sources) + renderWarnings(card.warnings) + renderSectionList('Gaps', card.gaps) + renderSectionList('Caveats', card.caveats);
    }

    function renderWarnings(items) { return items && items.length ? items.map((item) => '<div class="warning">' + escapeHtml(item) + '</div>').join('') : ''; }
    function renderList(items) { return items && items.length ? '<div class="items">' + items.map((item) => '<div class="item">' + escapeHtml(item) + '</div>').join('') + '</div>' : ''; }
    function renderSectionList(title, items) { return items && items.length ? '<h3>' + escapeHtml(title) + '</h3>' + renderList(items) : ''; }
    function field(label, value) { return value ? '<br><b>' + escapeHtml(label) + ':</b> ' + escapeHtml(value) : ''; }
    function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
    function cssEscape(value) { return window.CSS && CSS.escape ? CSS.escape(value) : String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }

    function initializeInspectShell() {
      try {
        window.__revelaInspectDebug.ready = true;
        window.__revelaInspectDebug.attachDeckHandlers = attachDeckHandlers;
        window.__revelaInspectDebug.startBindingLoop = startBindingLoop;
        window.__revelaInspectDebug.retryAttachDeckHandlers = retryAttachDeckHandlers;
        window.__revelaInspectDebug.bindingState = bindingState;
        refreshDeckVersion();
        iframe.addEventListener('load', startBindingLoop);
        startBindingLoop();
      } catch (error) {
        window.__revelaInspectDebug.error = error?.message || String(error);
        console.error('Revela inspect initialization failed', error);
        setBindingStatus('error', 'Inspect initialization failed: ' + (error?.message || String(error)));
      }
    }

    function bindingState() {
      const doc = iframe.contentDocument;
      return {
        ready: !!window.__revelaInspectDebug?.ready,
        hasIframe: !!iframe,
        hasDoc: !!doc,
        readyState: doc?.readyState,
        hasBody: !!doc?.body,
        bound: doc?.body?.getAttribute('data-revela-inspect-bound') || null,
        attempts: bindAttempts,
        status: bindingStatus?.textContent || '',
        error: window.__revelaInspectDebug?.error || null,
      };
    }

    window.__revelaInspectDebug = Object.assign(window.__revelaInspectDebug || {}, {
      attachDeckHandlers,
      startBindingLoop,
      retryAttachDeckHandlers,
      bindingState,
    });

    initializeInspectShell();
  </script>
</body>
</html>`
}
