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
    globalThis.fetch = Object.assign(
      async () => new Response(JSON.stringify({ query: { pages: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    try {
      const candidates = await searchRemoteImages({ query: "Acme logo", purpose: "logo", limit: 1 })

      expect(candidates).toHaveLength(1)
      expect(candidates[0]).toMatchObject({
        provider: "clearbit-logo",
        imageUrl: "https://logo.clearbit.com/acme.com",
      })
    } finally {}
  })

  it("builds a Simple Icons logo candidate without an API key", async () => {
    const candidates = await simpleIconsProvider.search({ query: "Acme logo", purpose: "logo" })

    expect(candidates).toEqual([
      expect.objectContaining({
        candidateId: "simple-icons-acme",
        provider: "simple-icons",
        imageUrl: "https://cdn.simpleicons.org/acme",
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
      "https://acme.com/favicon.ico",
    ])
    expect(candidates[0]).toMatchObject({
      provider: "website-metadata",
      title: "Acme Inc. image",
      sourcePageUrl: "https://acme.com",
      purpose: "hero",
    })
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
        return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { "content-type": "application/json" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    await expect(wikimediaProvider.search({ query: "factory", purpose: "illustration", limit: 10, page: 3 })).resolves.toEqual([])
  })
})
