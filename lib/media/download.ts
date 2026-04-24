import { extname } from "path"

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
}

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])

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

  const response = await fetch(parsed, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  })

  if (!response.ok) {
    throw new Error(`DOWNLOAD_FAILED:${response.status}`)
  }

  const contentType = response.headers.get("content-type")
  const extension = inferImageExtension(contentType, parsed.pathname)
  if (!extension) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE")
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType,
    extension,
  }
}
