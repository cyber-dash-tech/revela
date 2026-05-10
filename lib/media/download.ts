import { extname } from "path"

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
}

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico"])
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 10_000

function normalizeExtension(ext: string): string {
  const value = ext.toLowerCase()
  if (value === ".jpeg") return ".jpg"
  return value
}

export function inferImageExtension(contentType: string | null, sourceName = ""): string | null {
  const mimeBase = contentType?.split(";")[0].trim().toLowerCase() ?? ""
  if (mimeBase) {
    const byMime = MIME_TO_EXT[mimeBase]
    if (byMime) return byMime
    if (!mimeBase.startsWith("image/")) return null
  }

  const ext = normalizeExtension(extname(sourceName))
  if (ALLOWED_EXTENSIONS.has(ext)) return ext
  return null
}

export async function downloadImageFromUrl(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<{ buffer: Buffer; contentType: string | null; extension: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("INVALID_URL")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("INVALID_URL")
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, Math.max(1, options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS))

  let response: Response
  let buffer: Buffer
  try {
    response = await fetch(parsed, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`DOWNLOAD_FAILED:${response.status}`)
    }

    buffer = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    if (timedOut) throw new Error("DOWNLOAD_TIMEOUT")
    throw error
  } finally {
    clearTimeout(timer)
  }

  const contentType = response.headers.get("content-type")
  const extension = inferImageExtension(contentType, parsed.pathname)
  if (!extension) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE")
  }

  return {
    buffer,
    contentType,
    extension,
  }
}
