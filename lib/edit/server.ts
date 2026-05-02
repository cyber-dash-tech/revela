import { randomBytes } from "crypto"
import { readFileSync, statSync } from "fs"
import { resolve, sep } from "path"
import type { EditableDeck } from "./resolve-deck"
import { buildEditPrompt, type EditCommentPayload } from "./prompt"

const TOKEN_BYTES = 24
const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const IDLE_STOP_MS = 30 * 60 * 1000
export const LIVE_EDITOR_IDLE_MS = 10 * 1000

interface EditSession {
  token: string
  client: any
  sessionID: string
  deck: string
  file: string
  absoluteFile: string
  createdAt: number
  lastActiveAt: number
}

export interface EditServerHandle {
  baseUrl: string
  getOrCreateSession(input: { client: any; sessionID: string; deck: EditableDeck }): EditServerSessionResult
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

export function startEditServer(): EditServerHandle {
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
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
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

export function stopEditServer(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = undefined
  sessions.clear()
  server?.stop()
  server = undefined
  baseUrl = ""
}

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

  if (url.pathname === "/edit" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return htmlResponse(renderEditorShell(session.value.token))
  }

  if (url.pathname === "/deck" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return htmlResponse(readFileSync(session.value.absoluteFile, "utf-8"))
  }

  if (url.pathname === "/api/comment" && req.method === "POST") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleComment(req, session.value)
  }

  if (url.pathname === "/api/deck-version" && req.method === "GET") {
    const session = validateSession(url.searchParams.get("token"))
    if (!session.ok) return session.response
    return handleDeckVersion(session.value)
  }

  return textResponse("Not found", 404)
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

export function renderEditorShell(token: string): string {
  const encodedToken = JSON.stringify(token)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Revela Edit</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f6f8fb; color: #172033; height: 100vh; overflow: hidden; }
    body.resizing { cursor: col-resize; user-select: none; }
    body.resizing iframe, body.resizing .hitbox { pointer-events: none; }
    .app { --editor-width: 376px; position: relative; display: grid; grid-template-columns: minmax(0, 1fr) var(--editor-width); height: 100vh; }
    .preview { position: relative; min-width: 0; background: #eef3f8; }
    .resize-handle { position: absolute; top: 0; bottom: 0; right: calc(var(--editor-width) - 7px); width: 14px; z-index: 5; cursor: col-resize; background: transparent; }
    .resize-handle::before { content: ""; position: absolute; left: 50%; top: 50%; width: 4px; height: 44px; border-radius: 999px; transform: translate(-50%, -50%); background: rgba(148,163,184,.34); box-shadow: 0 1px 2px rgba(15,23,42,.06); transition: background .16s ease, height .16s ease, box-shadow .16s ease; }
    .resize-handle:hover::before, body.resizing .resize-handle::before { height: 52px; background: #94a3b8; box-shadow: 0 0 0 4px rgba(148,163,184,.16); }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    .hitbox { position: absolute; inset: 0; z-index: 2; cursor: crosshair; background: transparent; }
    aside { display: flex; flex-direction: column; gap: 16px; padding: 20px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); }
    h1 { margin: 0; font-size: 18px; line-height: 1.2; letter-spacing: -.01em; color: #0f172a; }
    .wordmark { font-family: Garamond, "Iowan Old Style", Georgia, serif; font-size: 21px; letter-spacing: .08em; font-weight: 600; }
    .hint { margin: 0; color: #64748b; font-size: 13px; line-height: 1.5; }
    .panel { display: flex; flex-direction: column; gap: 10px; }
    .label { color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    .comment-editor { width: 100%; min-height: 164px; max-height: 42vh; overflow: auto; padding: 13px 14px; border: 1px solid #d7e0ea; border-radius: 14px; background: #ffffff; color: #0f172a; font: inherit; line-height: 1.5; outline: none; white-space: pre-wrap; box-shadow: 0 10px 28px rgba(15,23,42,.06); }
    .comment-editor:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12), 0 10px 28px rgba(15,23,42,.06); }
    .comment-editor:empty::before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
    .ref-chip { display: inline-flex; align-items: center; margin: 0 2px; padding: 1px 7px; border-radius: 999px; background: var(--ref-bg, #e0f2fe); color: var(--ref-text, #075985); border: 1px solid var(--ref-border, #7dd3fc); font-weight: 800; white-space: nowrap; }
    .comment-thread { display: flex; flex-direction: column; gap: 10px; max-height: 30vh; overflow: auto; }
    .comment-bubble { border: 1px solid #dbe4ee; border-radius: 14px; padding: 10px 12px; background: #ffffff; color: #334155; font-size: 13px; line-height: 1.45; box-shadow: 0 8px 24px rgba(15,23,42,.05); }
    .comment-bubble.sending { border-color: #93c5fd; background: #eff6ff; }
    .comment-bubble.updated { border-color: #86efac; background: #f0fdf4; }
    .comment-bubble.stale { border-color: #facc15; background: #fefce8; }
    .comment-bubble.failed { border-color: #fca5a5; background: #fef2f2; }
    .comment-bubble-text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .comment-bubble-state { margin-top: 8px; color: #2563eb; font-size: 12px; font-weight: 800; }
    .comment-bubble.updated .comment-bubble-state { color: #15803d; }
    .comment-bubble.stale .comment-bubble-state { color: #a16207; }
    .comment-bubble.failed .comment-bubble-state { color: #b91c1c; }
    button { width: 100%; padding: 12px 14px; border: 0; border-radius: 12px; background: #2563eb; color: #ffffff; font-weight: 800; cursor: pointer; box-shadow: 0 10px 24px rgba(37,99,235,.22); }
    button:disabled { cursor: not-allowed; opacity: .5; }
    .status { min-height: 20px; color: #475569; font-size: 13px; line-height: 1.45; }
    @media (max-width: 900px) { .app { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; } .resize-handle { display: none; } aside { max-height: 48vh; } }
  </style>
</head>
<body>
  <main class="app">
    <section class="preview"><iframe id="deck" src="/deck?token=${encodeURIComponent(token)}"></iframe><div id="hitbox" class="hitbox" aria-label="Deck element selection layer"></div></section>
    <div id="resizeHandle" class="resize-handle" role="separator" aria-label="Resize editor panel" aria-orientation="vertical" title="Drag to resize editor. Double-click to reset."></div>
    <aside>
      <div>
        <h1><span class="wordmark">REVELA</span> Editor</h1>
        <p class="hint">Refine your deck with precise visual comments. Cmd/Ctrl-click any slide element to attach it as a reference, then describe the change you want.</p>
      </div>
      <div class="panel">
        <div class="label">Comment</div>
        <div id="comment" class="comment-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Example: Cmd/Ctrl-click to ref the chart title, then ask to make it shorter and align it with the KPI row."></div>
      </div>
      <div id="commentThread" class="comment-thread" aria-live="polite"></div>
      <button id="send" disabled>Send comments</button>
      <div id="status" class="status"></div>
    </aside>
  </main>
  <script>
    (() => {
      const token = ${encodedToken};
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
      };
      const els = {
        frame: null,
        hitbox: null,
        resizeHandle: null,
        comment: null,
        commentThread: null,
        send: null,
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
          els.comment = document.getElementById('comment');
          els.commentThread = document.getElementById('commentThread');
          els.send = document.getElementById('send');
          els.status = document.getElementById('status');

          if (!els.frame || !els.hitbox || !els.resizeHandle || !els.comment || !els.commentThread || !els.send || !els.status) {
            throw new Error('Editor boot failed: required DOM nodes are missing.');
          }

          restoreEditorWidth();
          bindEvents();
          setStatus('Editor ready. Ctrl/Cmd + click deck elements to reference them.');
          initFrame();
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
          if (event.key === 'Escape') clearHover();
        });
        els.comment.addEventListener('input', () => {
          saveCommentRange();
          syncReferencesFromComment(false);
          updateSendState();
        });
        els.comment.addEventListener('keyup', saveCommentRange);
        els.comment.addEventListener('mouseup', saveCommentRange);
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
        els.send.addEventListener('click', sendComment);
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
          state.referenceOutlines = [];
          doc.addEventListener('scroll', () => {
            renderHoverOutline(state.hoverEl);
            renderReferenceOutlines();
          }, true);
          const slides = getSlides(doc);
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
        syncReferencesFromComment(false);
        const text = getCommentText().trim();
        if (!text) return;
        const elements = state.references.map((reference) => reference.payload);
        const commentId = addPendingComment(text, elements, 'sending');
        clearReferences(false);
        els.comment.textContent = '';
        renderReferenceOutlines();
        els.send.disabled = true;
        setStatus('Sending...');
        try {
          const res = await fetch('/api/comment?token=' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ comment: text, elements }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to send comment');
          updatePendingCommentStatus(commentId, 'sent', { baseDeckVersion: body.deckVersion || state.deckVersion });
          if (pendingCommentStatus(commentId) !== 'updated') setStatus('Comment sent. Waiting for deck update...');
          updateSendState();
        } catch (error) {
          updatePendingCommentStatus(commentId, 'failed');
          reportError(error);
          updateSendState();
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
        updateSendState();
      }

      function syncReferencesFromComment(showStatus) {
        const activeIds = new Set(Array.from(els.comment.querySelectorAll('.ref-chip[data-ref-id]')).map((chip) => chip.getAttribute('data-ref-id')));
        const before = state.references.length;
        state.references = state.references.filter((reference) => activeIds.has(reference.id));
        if (state.references.length !== before) {
          renderReferenceOutlines();
          if (showStatus) setStatus('References synced with comment text.');
        }
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
        els.send.disabled = !getCommentText().trim();
      }

      function nextReferenceLabel(payload) {
        return humanElementName(payload) + ' ' + (state.references.length + 1);
      }

      function insertReferenceChip(reference) {
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
          if (els.comment.textContent && !/\\s$/.test(els.comment.textContent)) els.comment.appendChild(document.createTextNode(' '));
          els.comment.appendChild(chip);
          els.comment.appendChild(trailingSpace);
          placeCaretAfter(trailingSpace);
        }
        els.comment.focus();
      }

      function removeReferenceChip(id) {
        const chip = els.comment.querySelector('.ref-chip[data-ref-id="' + cssEscape(id) + '"]');
        if (!chip) return;
        const next = chip.nextSibling;
        chip.remove();
        if (next && next.nodeType === Node.TEXT_NODE && next.textContent === ' ') next.remove();
      }

      function clearReferences(removeChips) {
        state.references = [];
        if (removeChips) els.comment.querySelectorAll('.ref-chip').forEach((chip) => chip.remove());
      }

      function getCommentText() {
        return (els.comment.innerText || els.comment.textContent || '').replace(/\\u00a0/g, ' ');
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
        if (!els.comment || !els.comment.contains(selection.anchorNode)) return;
        state.commentRange = selection.getRangeAt(0).cloneRange();
      }

      function getCommentInsertRange() {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && els.comment.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0).cloneRange();
          range.deleteContents();
          return range;
        }
        if (state.commentRange && els.comment.contains(state.commentRange.commonAncestorContainer)) {
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
        const slideIndex = slide ? slides.indexOf(slide) + 1 : undefined;
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
        return node.closest('.slide, [slide-qa], .slide-canvas, .page');
      }

      function getSlides(doc) {
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
