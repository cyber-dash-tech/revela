import { existsSync, statSync } from "fs"
import { extname, resolve, sep } from "path"
import { openUrl as systemOpenUrl } from "../edit/open"
import { workspaceRelative } from "../workspace-state/rendered-artifacts"

export interface OpenDeckInput {
  workspaceRoot?: string
  file: string
  openBrowser?: boolean
  openUrl?: (url: string) => void
}

interface DirectDeckServer {
  server: ReturnType<typeof Bun.serve>
  baseUrl: string
  workspaceRoot: string
  idleTimer?: Timer
}

const servers = new Map<string, DirectDeckServer>()
const IDLE_STOP_MS = 30 * 60 * 1000
const FALLBACK_PORT_START = 8765
const FALLBACK_PORT_END = 8899

export function openDeck(input: OpenDeckInput): any {
  const workspaceRoot = resolve(input.workspaceRoot || process.cwd())
  const requestedFile = input.file?.trim()
  if (!requestedFile) {
    return {
      ok: false,
      file: "",
      error: "Missing required file.",
      diagnostics: [{ severity: "error", code: "missing_file", message: "Provide a workspace-relative or absolute deck HTML file." }],
    }
  }

  const absoluteFile = resolve(workspaceRoot, requestedFile)
  const file = workspaceRelative(workspaceRoot, absoluteFile)
  if (!isInside(workspaceRoot, absoluteFile)) {
    return {
      ok: false,
      file,
      error: `Deck HTML file is outside the workspace: ${file}`,
      diagnostics: [{ severity: "error", code: "file_outside_workspace", message: `Deck HTML file is outside the workspace: ${file}` }],
    }
  }
  if (!existsSync(absoluteFile) || !statSync(absoluteFile).isFile()) {
    return {
      ok: false,
      file,
      error: `Deck HTML file not found: ${file}`,
      diagnostics: [{ severity: "error", code: "file_not_found", message: `Deck HTML file not found: ${file}` }],
    }
  }
  if (!file.startsWith("decks/") || !file.endsWith(".html")) {
    return {
      ok: false,
      file,
      error: `Deck HTML file must be under decks/*.html: ${file}`,
      diagnostics: [{ severity: "error", code: "invalid_deck_path", message: `Deck HTML file must be under decks/*.html: ${file}` }],
    }
  }

  try {
    const deckServer = startDeckStaticServer(workspaceRoot)
    const url = `${deckServer.baseUrl}/${file.split("/").map(encodeURIComponent).join("/")}`
    const openedBrowser = input.openBrowser !== false
    if (openedBrowser) (input.openUrl ?? systemOpenUrl)(url)
    return {
      ok: true,
      file,
      url,
      serveRoot: workspaceRoot,
      openedBrowser,
      mode: "direct",
      readOnly: true,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      file,
      error: message,
      diagnostics: [{ severity: "error", code: "open_deck_failed", message }],
    }
  }
}

export function stopOpenDeckServers(): void {
  for (const item of servers.values()) {
    if (item.idleTimer) clearTimeout(item.idleTimer)
    item.server.stop()
  }
  servers.clear()
}

function startDeckStaticServer(workspaceRoot: string): DirectDeckServer {
  const existing = servers.get(workspaceRoot)
  if (existing) {
    scheduleIdleStop(existing)
    return existing
  }

  const server = serveWithFallback(workspaceRoot)
  const item: DirectDeckServer = {
    server,
    baseUrl: `http://127.0.0.1:${server.port}`,
    workspaceRoot,
  }
  ;(server as any).unref?.()
  servers.set(workspaceRoot, item)
  scheduleIdleStop(item)
  return item
}

function serveWithFallback(workspaceRoot: string): ReturnType<typeof Bun.serve> {
  const ports = [0, ...Array.from({ length: FALLBACK_PORT_END - FALLBACK_PORT_START + 1 }, (_, index) => FALLBACK_PORT_START + index)]
  const failures: string[] = []
  for (const port of ports) {
    try {
      return Bun.serve({
        hostname: "127.0.0.1",
        port,
        fetch: (req) => handleStaticRequest(workspaceRoot, req),
      })
    } catch (e) {
      failures.push(`port ${port}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(`Failed to start direct deck server. ${failures.slice(0, 3).join(" ")}`)
}

async function handleStaticRequest(workspaceRoot: string, req: Request): Promise<Response> {
  const url = new URL(req.url)
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 })
  if (url.pathname === "/health") return new Response("ok", { status: 200 })
  const pathPart = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
  if (!pathPart) return new Response("Not found", { status: 404 })
  const absolutePath = resolve(workspaceRoot, pathPart)
  if (!isInside(workspaceRoot, absolutePath)) return new Response("Forbidden", { status: 403 })
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return new Response("Not found", { status: 404 })
  const file = Bun.file(absolutePath)
  const headers = new Headers({ "content-type": contentType(absolutePath) })
  if (req.method === "HEAD") return new Response(null, { status: 200, headers })
  return new Response(file, { headers })
}

function scheduleIdleStop(item: DirectDeckServer): void {
  if (item.idleTimer) clearTimeout(item.idleTimer)
  item.idleTimer = setTimeout(() => {
    item.server.stop()
    servers.delete(item.workspaceRoot)
  }, IDLE_STOP_MS)
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root)
  const normalizedCandidate = resolve(candidate)
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep)
}

function contentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8"
    case ".css":
      return "text/css; charset=utf-8"
    case ".js":
      return "application/javascript; charset=utf-8"
    case ".json":
      return "application/json; charset=utf-8"
    case ".svg":
      return "image/svg+xml"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    case ".gif":
      return "image/gif"
    case ".woff":
      return "font/woff"
    case ".woff2":
      return "font/woff2"
    default:
      return "application/octet-stream"
  }
}
