import type { MediaPurpose } from "./types"

export interface ImageCandidate {
  candidateId: string
  provider: string
  title: string
  thumbnailUrl: string
  imageUrl: string
  sourcePageUrl?: string
  width?: number
  height?: number
  alt?: string
  license?: string
  attribution?: string
  purpose?: MediaPurpose
}

export interface ImageSearchInput {
  query: string
  purpose?: MediaPurpose
  limit?: number
  page?: number
  signal?: AbortSignal
  providerTimeoutMs?: number
}

export interface ImageSearchProvider {
  name: string
  search(input: ImageSearchInput): Promise<ImageCandidate[]>
}

const PROVIDER_TIMEOUT_MS: Record<string, number> = {
  "website-metadata": 3000,
  unsplash: 6000,
  "wikimedia-commons": 7000,
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? Number.NaN)) return 12
  return Math.max(1, Math.min(48, Math.floor(limit!)))
}

function normalizePage(page: number | undefined): number {
  if (!Number.isFinite(page ?? Number.NaN)) return 1
  return Math.max(1, Math.floor(page!))
}

function domainFromQuery(query: string): string | null {
  const value = query.trim().toLowerCase()
  if (!value) return null
  const withoutProtocol = value.replace(/^https?:\/\//, "").replace(/^www\./, "")
  const first = withoutProtocol.split(/[\s/]+/)[0]
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(first)) return first
  const compact = value.replace(/\b(logo|company|brand)\b/g, "").replace(/[^a-z0-9]+/g, "")
  if (!compact) return null
  return `${compact}.com`
}

function textFromMetadata(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = (value as { value?: unknown }).value
  return typeof raw === "string" && raw.trim() ? raw.replace(/<[^>]+>/g, "").trim() : undefined
}

function compactBrandName(query: string): string | null {
  const value = query
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[\s/]+/)[0]
    .replace(/\.[a-z]{2,}$/, "")
    .replace(/\b(logo|company|brand)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
  return value || null
}

function absoluteUrl(value: string, base: string): string | undefined {
  try {
    return new URL(value, base).toString()
  } catch {
    return undefined
  }
}

function uniqueValues(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    if (!value || seen.has(value)) return []
    seen.add(value)
    return [value]
  })
}

function htmlAttr(tag: string, attr: string): string | undefined {
  const pattern = new RegExp(`${attr}=["']([^"']+)["']`, "i")
  return tag.match(pattern)?.[1]
}

function htmlMetaContent(html: string, property: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  const needle = property.toLowerCase()
  for (const tag of tags) {
    const key = htmlAttr(tag, "property") || htmlAttr(tag, "name")
    if (key?.toLowerCase() === needle) return htmlAttr(tag, "content")
  }
  return undefined
}

function htmlIconLinks(html: string): string[] {
  const tags = html.match(/<link\b[^>]*>/gi) ?? []
  return tags.flatMap((tag) => {
    const rel = htmlAttr(tag, "rel")?.toLowerCase() ?? ""
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon")) return []
    return htmlAttr(tag, "href") ?? []
  })
}

function queryForPurpose(query: string, purpose: MediaPurpose | undefined): string {
  const value = query.trim()
  if (!value) return value
  if (purpose === "hero") return `${value} hero background professional photography`
  if (purpose === "portrait") return `${value} portrait headshot`
  if (purpose === "screenshot") return `${value} screenshot interface product`
  if (purpose === "illustration") return `${value} professional photo concept visual`
  return value
}

function wikimediaQueryForPurpose(query: string, purpose: MediaPurpose | undefined): string {
  const value = query.trim()
  if (!value) return value
  if (purpose === "portrait") return `${value} portrait`
  if (purpose === "screenshot") return `${value} screenshot`
  return value
}

export const clearbitLogoProvider: ImageSearchProvider = {
  name: "clearbit-logo",
  async search(input) {
    if (normalizePage(input.page) > 1) return []
    if (input.purpose && input.purpose !== "logo") return []
    const domain = domainFromQuery(input.query)
    if (!domain) return []
    const title = `${domain} logo`
    return [{
      candidateId: `clearbit-${slugify(domain)}`,
      provider: this.name,
      title,
      thumbnailUrl: `https://logo.clearbit.com/${encodeURIComponent(domain)}`,
      imageUrl: `https://logo.clearbit.com/${encodeURIComponent(domain)}`,
      sourcePageUrl: `https://${domain}`,
      alt: title,
      purpose: "logo",
    }]
  },
}

export const simpleIconsProvider: ImageSearchProvider = {
  name: "simple-icons",
  async search(input) {
    if (normalizePage(input.page) > 1) return []
    if (input.purpose && input.purpose !== "logo") return []
    const brand = compactBrandName(input.query)
    if (!brand) return []
    const title = `${brand} logo`
    const cdnUrl = `https://cdn.simpleicons.org/${encodeURIComponent(brand)}`
    const imageUrl = `https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/${encodeURIComponent(brand)}.svg`
    return [{
      candidateId: `simple-icons-${slugify(brand)}`,
      provider: this.name,
      title,
      thumbnailUrl: cdnUrl,
      imageUrl,
      sourcePageUrl: `https://simpleicons.org/?q=${encodeURIComponent(brand)}`,
      alt: title,
      license: "See Simple Icons source license",
      attribution: "Simple Icons",
      purpose: "logo",
    }]
  },
}

export const websiteMetadataProvider: ImageSearchProvider = {
  name: "website-metadata",
  async search(input) {
    if (normalizePage(input.page) > 1) return []
    const domain = domainFromQuery(input.query)
    if (!domain) return []
    const homepage = `https://${domain}`
    const response = await fetch(homepage, {
      headers: { "user-agent": "Revela/0.15 asset search" },
      signal: input.signal,
    })
    if (!response.ok) throw new Error(`Website metadata fetch failed: ${response.status}`)
    const html = await response.text()
    const title = htmlMetaContent(html, "og:site_name") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || domain
    const socialImages = [htmlMetaContent(html, "og:image"), htmlMetaContent(html, "twitter:image")]
    const icons = [...htmlIconLinks(html), "/favicon.ico"]
    const sourceUrls = input.purpose === "logo"
      ? icons
      : input.purpose === "screenshot"
        ? socialImages
        : socialImages
    const urls = uniqueValues(sourceUrls.map((value) => value ? absoluteUrl(value, homepage) : undefined))
    return urls.slice(0, normalizeLimit(input.limit)).map((imageUrl, index) => ({
      candidateId: `website-${slugify(domain)}-${index + 1}`,
      provider: this.name,
      title: index === 0 ? `${title} image` : `${title} icon ${index}`,
      thumbnailUrl: imageUrl,
      imageUrl,
      sourcePageUrl: homepage,
      alt: `${title} image`,
      purpose: input.purpose,
    }))
  },
}

export const unsplashProvider: ImageSearchProvider = {
  name: "unsplash",
  async search(input) {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim()
    if (!accessKey) return []
    if (input.purpose === "logo" || input.purpose === "screenshot") return []
    const limit = normalizeLimit(input.limit)
    const page = normalizePage(input.page)
    const url = new URL("https://api.unsplash.com/search/photos")
    url.searchParams.set("query", input.query)
    url.searchParams.set("per_page", String(Math.min(30, limit)))
    url.searchParams.set("page", String(page))
    url.searchParams.set("orientation", input.purpose === "portrait" ? "portrait" : "landscape")
    const response = await fetch(url, {
      headers: {
        authorization: `Client-ID ${accessKey}`,
        "accept-version": "v1",
        "user-agent": "Revela/0.15 asset search",
      },
      signal: input.signal,
    })
    if (!response.ok) throw new Error(`Unsplash search failed: ${response.status}`)
    const body = await response.json() as any
    const results = Array.isArray(body?.results) ? body.results : []
    return results.flatMap((item: any) => {
      const imageUrl = typeof item?.urls?.regular === "string" ? item.urls.regular : ""
      if (!imageUrl) return []
      const title = item.description || item.alt_description || "Unsplash photo"
      const author = item.user?.name ? String(item.user.name) : undefined
      return [{
        candidateId: `unsplash-${slugify(String(item.id || title))}`,
        provider: this.name,
        title,
        thumbnailUrl: typeof item.urls?.small === "string" ? item.urls.small : imageUrl,
        imageUrl,
        sourcePageUrl: typeof item.links?.html === "string" ? item.links.html : undefined,
        width: typeof item.width === "number" ? item.width : undefined,
        height: typeof item.height === "number" ? item.height : undefined,
        alt: item.alt_description || title,
        license: "Unsplash License",
        attribution: author ? `Photo by ${author} on Unsplash` : "Unsplash",
        purpose: input.purpose,
      }]
    }).slice(0, limit)
  },
}

export const wikimediaProvider: ImageSearchProvider = {
  name: "wikimedia-commons",
  async search(input) {
    const limit = normalizeLimit(input.limit)
    const page = normalizePage(input.page)
    const url = new URL("https://commons.wikimedia.org/w/api.php")
    url.searchParams.set("action", "query")
    url.searchParams.set("format", "json")
    url.searchParams.set("origin", "*")
    url.searchParams.set("generator", "search")
    url.searchParams.set("gsrnamespace", "6")
    url.searchParams.set("gsrlimit", String(limit))
    url.searchParams.set("gsroffset", String((page - 1) * limit))
    url.searchParams.set("gsrsearch", input.query)
    url.searchParams.set("prop", "imageinfo|info")
    url.searchParams.set("iiprop", "url|thumburl|mime|size|extmetadata")
    url.searchParams.set("iiurlwidth", "320")
    url.searchParams.set("inprop", "url")

    const response = await fetch(url, {
      headers: { "user-agent": "Revela/0.15 asset search" },
      signal: input.signal,
    })
    if (!response.ok) throw new Error(`Wikimedia search failed: ${response.status}`)
    const body = await response.json() as any
    const pages = Object.values(body?.query?.pages ?? {}) as any[]
    return pages.flatMap((page) => {
      const info = page?.imageinfo?.[0]
      const mime = typeof info?.mime === "string" ? info.mime : ""
      if (!mime.startsWith("image/")) return []
      const imageUrl = typeof info?.url === "string" ? info.url : ""
      if (!imageUrl) return []
      const thumbnailUrl = typeof info?.thumburl === "string" ? info.thumburl : imageUrl
      const metadata = info?.extmetadata ?? {}
      const title = String(page.title || "Wikimedia image").replace(/^File:/, "")
      return [{
        candidateId: `wikimedia-${slugify(title).slice(0, 80)}`,
        provider: this.name,
        title,
        thumbnailUrl,
        imageUrl,
        sourcePageUrl: typeof page.fullurl === "string" ? page.fullurl : undefined,
        width: typeof info.width === "number" ? info.width : undefined,
        height: typeof info.height === "number" ? info.height : undefined,
        alt: title,
        license: textFromMetadata(metadata.LicenseShortName) || textFromMetadata(metadata.UsageTerms),
        attribution: textFromMetadata(metadata.Artist) || textFromMetadata(metadata.Credit),
        purpose: input.purpose,
      }]
    }).slice(0, limit)
  },
}

export async function searchRemoteImages(input: ImageSearchInput): Promise<ImageCandidate[]> {
  const query = input.query.trim()
  if (!query) return []
  const limit = normalizeLimit(input.limit)
  const page = normalizePage(input.page)
  const mediaQuery = queryForPurpose(query, input.purpose)
  const wikimediaQuery = wikimediaQueryForPurpose(query, input.purpose)
  const searches: Array<Promise<ImageCandidate[]>> = input.purpose === "logo"
    ? [
      runProvider(clearbitLogoProvider, { ...input, query, limit, page }),
      runProvider(simpleIconsProvider, { ...input, query, limit, page }),
      runProvider(websiteMetadataProvider, { ...input, query, limit, page }),
    ]
    : input.purpose === "screenshot"
      ? [
        runProvider(websiteMetadataProvider, { ...input, query, limit, page }),
        runProvider(wikimediaProvider, { ...input, query: wikimediaQuery, limit, page }),
      ]
      : [
        runProvider(websiteMetadataProvider, { ...input, query, limit, page }),
        runProvider(unsplashProvider, { ...input, query: mediaQuery, limit, page }),
        runProvider(wikimediaProvider, { ...input, query: wikimediaQuery, limit, page }),
      ]
  const batches = await Promise.allSettled(searches)
  const candidates = batches.flatMap((result) => result.status === "fulfilled" ? result.value : [])
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = candidate.imageUrl || candidate.thumbnailUrl || candidate.candidateId
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit)
}

async function runProvider(provider: ImageSearchProvider, input: ImageSearchInput): Promise<ImageCandidate[]> {
  const timeoutMs = input.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS[provider.name]
  if (!timeoutMs) return provider.search(input).catch(() => [])

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const signal = input.signal ? anySignal([input.signal, controller.signal]) : controller.signal
  try {
    return await provider.search({ ...input, signal })
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener("abort", abort, { once: true })
  }
  return controller.signal
}
