import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { batchSaveMediaAssets } from "../lib/media/batch-save"

let workspaceDir = ""
const originalFetch = globalThis.fetch

function mockFetchWith(
  responseFactory: (...args: Parameters<typeof fetch>) => Promise<Response> | Response,
): typeof fetch {
  return Object.assign(
    async (...args: Parameters<typeof fetch>) => await responseFactory(...args),
    { preconnect: originalFetch.preconnect.bind(originalFetch) },
  ) as typeof fetch
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "revela-media-batch-"))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  rmSync(workspaceDir, { recursive: true, force: true })
})

describe("batchSaveMediaAssets", () => {
  it("batch-saves selected image leads and deduplicates repeated urls", async () => {
    let fetchCount = 0
    globalThis.fetch = mockFetchWith(() => {
      fetchCount += 1
      return new Response("png-bytes", {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    })

    const result = await batchSaveMediaAssets({
      topic: "EV Market",
      intendedSection: "company-overview",
      items: [
        {
          candidateId: "tesla-profile:1",
          description: "Tesla logo",
          url: "https://example.com/tesla.png",
          alt: "Tesla corporate logo",
          use: "logo",
          sourceFile: "researches/ev-market/tesla-profile.md",
        },
        {
          candidateId: "tesla-profile:2",
          description: "Tesla logo duplicate",
          url: "https://example.com/tesla.png",
          alt: "Tesla logo duplicate",
          use: "logo",
          sourceFile: "researches/ev-market/tesla-profile.md",
        },
        {
          candidateId: "tesla-profile:3",
          description: "Elon Musk portrait",
          url: "https://example.com/elon.jpg",
          alt: "Elon Musk headshot",
          use: "portrait",
          sourceFile: "researches/ev-market/tesla-profile.md",
        },
      ],
    }, workspaceDir)

    expect(fetchCount).toBe(2)
    expect(result.ok).toBe(true)
    expect(result.saved).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.manifestPath).toBe("assets/ev-market/media-manifest.json")
    expect(result.results).toHaveLength(3)
    expect(result.results[0]).toEqual(expect.objectContaining({
      candidateId: "tesla-profile:1",
      status: "success",
      path: "assets/ev-market/media/tesla-logo-01.png",
    }))
    expect(result.results[1]).toEqual(expect.objectContaining({
      candidateId: "tesla-profile:2",
      assetId: result.results[0]?.assetId,
      path: result.results[0]?.path,
    }))
    expect(result.results[2]).toEqual(expect.objectContaining({
      candidateId: "tesla-profile:3",
      status: "success",
    }))
    expect(existsSync(join(workspaceDir, "assets/ev-market/media/tesla-logo-01.png"))).toBe(true)
    expect(JSON.parse(readFileSync(join(workspaceDir, "assets/ev-market/media-manifest.json"), "utf-8"))).toMatchObject({
      topic: "ev-market",
      assets: [
        expect.objectContaining({ id: "tesla-logo-01" }),
        expect.objectContaining({ id: "elon-musk-portrait-01" }),
      ],
    })

    const reordered = await batchSaveMediaAssets({
      topic: "EV Market",
      items: [
        {
          candidateId: "tesla-profile:3",
          description: "Elon Musk portrait",
          url: "https://example.com/elon.jpg",
          alt: "Elon Musk headshot",
          use: "portrait",
          sourceFile: "researches/ev-market/tesla-profile.md",
        },
        {
          candidateId: "tesla-profile:1",
          description: "Tesla logo",
          url: "https://example.com/tesla.png",
          alt: "Tesla corporate logo",
          use: "logo",
          sourceFile: "researches/ev-market/tesla-profile.md",
        },
      ],
    }, workspaceDir)

    expect(reordered.results).toEqual([
      expect.objectContaining({ candidateId: "tesla-profile:3", assetId: "elon-musk-portrait-01" }),
      expect.objectContaining({ candidateId: "tesla-profile:1", assetId: "tesla-logo-01" }),
    ])
  })

  it("returns mixed success and failure results", async () => {
    globalThis.fetch = mockFetchWith((...args) => {
      const url = String(args[0])
      if (url.includes("good")) {
        return new Response("png-bytes", {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      }
      return new Response("<html>nope</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    })

    const result = await batchSaveMediaAssets({
      topic: "EV Market",
      items: [
        {
          candidateId: "tesla-profile:1",
          description: "Tesla logo",
          url: "https://example.com/good.png",
          use: "logo",
        },
        {
          candidateId: "tesla-profile:2",
          description: "Broken screenshot",
          url: "https://example.com/bad",
          use: "screenshot",
        },
        {
          candidateId: "tesla-profile:3",
          description: "Invalid portrait",
          url: "not-a-url",
          use: "portrait",
        },
      ],
    }, workspaceDir)

    expect(result.saved).toBe(1)
    expect(result.failed).toBe(2)
    expect(result.results).toEqual([
      expect.objectContaining({ status: "success", path: "assets/ev-market/media/tesla-logo-01.png" }),
      expect.objectContaining({ status: "cannot-download", path: null }),
      expect.objectContaining({ status: "invalid-url", path: null }),
    ])
  })
})
