import { afterEach, describe, expect, it } from "bun:test"
import { downloadImageFromUrl } from "../lib/media/download"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("media remote image download", () => {
  it("sends browser-like image headers for CDN image downloads", async () => {
    globalThis.fetch = Object.assign(
      async (_url: URL | RequestInfo, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        expect(headers.get("accept")).toContain("image/svg+xml")
        expect(headers.get("accept")).toContain("image/*")
        expect(headers.get("user-agent")).toContain("Mozilla/5.0")
        return new Response("<svg />", {
          status: 200,
          headers: { "content-type": "image/svg+xml" },
        })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const result = await downloadImageFromUrl("https://cdn.simpleicons.org/claude")

    expect(result.extension).toBe(".svg")
    expect(result.contentType).toBe("image/svg+xml")
    expect(result.buffer.toString()).toBe("<svg />")
  })

  it("fails with DOWNLOAD_TIMEOUT when the image request hangs", async () => {
    globalThis.fetch = Object.assign(
      async (_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
      }),
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    await expect(downloadImageFromUrl("https://cdn.simpleicons.org/claude", { timeoutMs: 1 })).rejects.toThrow("DOWNLOAD_TIMEOUT")
  })
})
