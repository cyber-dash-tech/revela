import { afterEach, describe, expect, it } from "bun:test"
import {
  clearbitLogoProvider,
  searchRemoteImages,
  simpleIconsProvider,
  unsplashProvider,
  websiteMetadataProvider,
  wikimediaProvider,
} from "../lib/media/search"

const originalFetch = globalThis.fetch
const originalUnsplashKey = process.env.UNSPLASH_ACCESS_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalUnsplashKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY
  else process.env.UNSPLASH_ACCESS_KEY = originalUnsplashKey
})

describe("media image search", () => {
  it("builds a deterministic Clearbit logo candidate from a domain query", async () => {
    const candidates = await clearbitLogoProvider.search({
      query: "https://www.acme.com/about",
      purpose: "logo",
      limit: 12,
    })

    expect(candidates).toEqual([
      expect.objectContaining({
        candidateId: "clearbit-acme-com",
        provider: "clearbit-logo",
        title: "acme.com logo",
        imageUrl: "https://logo.clearbit.com/acme.com",
        thumbnailUrl: "https://logo.clearbit.com/acme.com",
        sourcePageUrl: "https://acme.com",
        alt: "acme.com logo",
        purpose: "logo",
      }),
    ])
  })

  it("returns deterministic logo and website metadata candidates only on the first page", async () => {
    expect(await clearbitLogoProvider.search({ query: "acme.com", purpose: "logo", page: 2 })).toEqual([])
    expect(await simpleIconsProvider.search({ query: "Acme logo", purpose: "logo", page: 2 })).toEqual([])
    expect(await websiteMetadataProvider.search({ query: "acme.com", purpose: "hero", page: 2 })).toEqual([])
  })

  it("returns logo candidates without requiring Wikimedia when Clearbit succeeds", async () => {
    const urls: string[] = []
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo) => {
        urls.push(String(url))
        return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "application/json" },
        })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    try {
      const candidates = await searchRemoteImages({ query: "Acme logo", purpose: "logo", limit: 1 })

      expect(candidates).toHaveLength(1)
      expect(candidates[0]).toMatchObject({
        provider: "clearbit-logo",
        imageUrl: "https://logo.clearbit.com/acme.com",
      })
      expect(urls.some((url) => url.includes("commons.wikimedia.org"))).toBe(false)
      expect(urls.some((url) => url.includes("api.unsplash.com"))).toBe(false)
    } finally {}
  })

  it("returns partial logo results when website metadata times out", async () => {
    globalThis.fetch = Object.assign(
      async (_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
      }),
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const candidates = await searchRemoteImages({ query: "Acme logo", purpose: "logo", limit: 12, providerTimeoutMs: 1 })

    expect(candidates.map((candidate) => candidate.provider)).toEqual(["clearbit-logo", "simple-icons"])
  })

  it("builds a Simple Icons logo candidate without an API key", async () => {
    const candidates = await simpleIconsProvider.search({ query: "Acme logo", purpose: "logo" })

    expect(candidates).toEqual([
      expect.objectContaining({
        candidateId: "simple-icons-acme",
        provider: "simple-icons",
        imageUrl: "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/acme.svg",
        thumbnailUrl: "https://cdn.simpleicons.org/acme",
        sourcePageUrl: "https://simpleicons.org/?q=acme",
        license: "See Simple Icons source license",
        attribution: "Simple Icons",
        purpose: "logo",
      }),
    ])
  })

  it("extracts Open Graph images and icons from website metadata", async () => {
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo) => {
        expect(String(url)).toBe("https://acme.com")
        return new Response(`
          <html><head>
            <title>Acme Inc.</title>
            <meta property="og:image" content="/og.png">
            <meta name="twitter:image" content="https://cdn.acme.com/twitter.jpg">
            <link rel="icon" href="/favicon.ico">
          </head></html>
        `, { status: 200, headers: { "content-type": "text/html" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const candidates = await websiteMetadataProvider.search({ query: "acme.com", purpose: "hero", limit: 4 })

    expect(candidates.map((candidate) => candidate.imageUrl)).toEqual([
      "https://acme.com/og.png",
      "https://cdn.acme.com/twitter.jpg",
    ])
    expect(candidates[0]).toMatchObject({
      provider: "website-metadata",
      title: "Acme Inc. image",
      sourcePageUrl: "https://acme.com",
      purpose: "hero",
    })
  })

  it("uses website icons for logo metadata candidates", async () => {
    globalThis.fetch = Object.assign(
      async () => new Response(`
        <html><head>
          <meta property="og:image" content="/og.png">
          <link rel="apple-touch-icon" href="/apple.png">
          <link rel="icon" href="/favicon.ico">
        </head></html>
      `, { status: 200, headers: { "content-type": "text/html" } }),
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const candidates = await websiteMetadataProvider.search({ query: "acme.com", purpose: "logo", limit: 4 })

    expect(candidates.map((candidate) => candidate.imageUrl)).toEqual([
      "https://acme.com/apple.png",
      "https://acme.com/favicon.ico",
    ])
  })

  it("rewrites hero and portrait queries for stock/photo providers", async () => {
    process.env.UNSPLASH_ACCESS_KEY = "test-key"
    const urls: string[] = []
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo) => {
        urls.push(String(url))
        if (String(url).includes("api.unsplash.com")) {
          return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } })
        }
        return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { "content-type": "application/json" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    await searchRemoteImages({ query: "factory", purpose: "hero", limit: 12 })
    await searchRemoteImages({ query: "executive", purpose: "portrait", limit: 12 })

    const unsplashUrls = urls.filter((url) => url.includes("api.unsplash.com"))
    const wikimediaUrls = urls.filter((url) => url.includes("commons.wikimedia.org"))
    expect(new URL(unsplashUrls[0]).searchParams.get("query")).toBe("factory hero background professional photography")
    expect(new URL(unsplashUrls[1]).searchParams.get("query")).toBe("executive portrait headshot")
    expect(new URL(unsplashUrls[1]).searchParams.get("orientation")).toBe("portrait")
    expect(new URL(wikimediaUrls[0]).searchParams.get("gsrsearch")).toBe("factory")
    expect(new URL(wikimediaUrls[1]).searchParams.get("gsrsearch")).toBe("executive portrait")
  })

  it("uses website metadata as a fallback for hero/photo domain queries", async () => {
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo) => {
        if (String(url) === "https://acme.com") {
          return new Response("<html><head><meta property=\"og:image\" content=\"/hero.png\"></head></html>", { status: 200 })
        }
        return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { "content-type": "application/json" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const candidates = await searchRemoteImages({ query: "acme.com", purpose: "hero", limit: 12 })

    expect(candidates).toContainEqual(expect.objectContaining({
      provider: "website-metadata",
      imageUrl: "https://acme.com/hero.png",
      purpose: "hero",
    }))
  })

  it("uses website metadata and screenshot fallback for screenshot purpose", async () => {
    const urls: string[] = []
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo) => {
        urls.push(String(url))
        if (String(url).includes("commons.wikimedia.org")) {
          return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { "content-type": "application/json" } })
        }
        return new Response("<html><head><meta property=\"og:image\" content=\"/screen.png\"></head></html>", { status: 200 })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const candidates = await searchRemoteImages({ query: "acme.com", purpose: "screenshot", limit: 12 })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ provider: "website-metadata", imageUrl: "https://acme.com/screen.png" })
    expect(urls.some((url) => url.includes("api.unsplash.com"))).toBe(false)
    const wikimediaUrl = urls.find((url) => url.includes("commons.wikimedia.org"))
    expect(wikimediaUrl).toBeTruthy()
    expect(new URL(wikimediaUrl!).searchParams.get("gsrsearch")).toBe("acme.com screenshot")
  })

  it("returns empty results instead of throwing when screenshot metadata times out", async () => {
    globalThis.fetch = Object.assign(
      async (_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
      }),
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    await expect(searchRemoteImages({ query: "acme.com", purpose: "screenshot", limit: 12, providerTimeoutMs: 1 })).resolves.toEqual([])
  })

  it("uses Unsplash only when an access key is configured", async () => {
    expect(await unsplashProvider.search({ query: "boardroom", purpose: "illustration" })).toEqual([])
    process.env.UNSPLASH_ACCESS_KEY = "test-key"
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo, init?: RequestInit) => {
        const parsed = new URL(String(url))
        expect(parsed.toString()).toContain("https://api.unsplash.com/search/photos")
        expect(parsed.searchParams.get("page")).toBe("3")
        expect((init?.headers as Record<string, string>).authorization).toBe("Client-ID test-key")
        return new Response(JSON.stringify({
          results: [{
            id: "photo-1",
            description: "Boardroom strategy session",
            alt_description: "People in a boardroom",
            width: 4000,
            height: 2600,
            urls: { small: "https://images.unsplash.com/small.jpg", regular: "https://images.unsplash.com/regular.jpg" },
            links: { html: "https://unsplash.com/photos/photo-1" },
            user: { name: "Jane Doe" },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const candidates = await unsplashProvider.search({ query: "boardroom", purpose: "illustration", page: 3 })

    expect(candidates).toEqual([
      expect.objectContaining({
        candidateId: "unsplash-photo-1",
        provider: "unsplash",
        title: "Boardroom strategy session",
        thumbnailUrl: "https://images.unsplash.com/small.jpg",
        imageUrl: "https://images.unsplash.com/regular.jpg",
        sourcePageUrl: "https://unsplash.com/photos/photo-1",
        license: "Unsplash License",
        attribution: "Photo by Jane Doe on Unsplash",
        purpose: "illustration",
      }),
    ])
  })

  it("passes a page offset to Wikimedia Commons", async () => {
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo) => {
        const parsed = new URL(String(url))
        expect(parsed.searchParams.get("gsrlimit")).toBe("10")
        expect(parsed.searchParams.get("gsroffset")).toBe("20")
        expect(parsed.searchParams.get("iiprop")).toContain("thumburl")
        expect(parsed.searchParams.get("iiurlwidth")).toBe("320")
        return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { "content-type": "application/json" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    await expect(wikimediaProvider.search({ query: "factory", purpose: "illustration", limit: 10, page: 3 })).resolves.toEqual([])
  })

  it("uses Wikimedia thumburl for search thumbnails while preserving the original image URL", async () => {
    globalThis.fetch = Object.assign(
      async () => new Response(JSON.stringify({
        query: {
          pages: {
            "1": {
              title: "File:Factory.jpg",
              fullurl: "https://commons.wikimedia.org/wiki/File:Factory.jpg",
              imageinfo: [{
                mime: "image/jpeg",
                url: "https://upload.wikimedia.org/factory-original.jpg",
                thumburl: "https://upload.wikimedia.org/factory-320.jpg",
                width: 2400,
                height: 1600,
                extmetadata: {},
              }],
            },
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } }),
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    const candidates = await wikimediaProvider.search({ query: "factory", purpose: "illustration", limit: 10 })

    expect(candidates[0]).toMatchObject({
      provider: "wikimedia-commons",
      imageUrl: "https://upload.wikimedia.org/factory-original.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/factory-320.jpg",
    })
  })
})
