import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { saveMediaAsset } from "../lib/media/save"

let workspaceDir = ""
const originalFetch = globalThis.fetch

function validPngBuffer(): Uint8Array {
  return new Uint8Array(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1EAAAAASUVORK5CYII=",
    "base64",
  ))
}

function mockFetchWith(responseFactory: () => Promise<Response> | Response): typeof fetch {
  return Object.assign(
    async (..._args: Parameters<typeof fetch>) => await responseFactory(),
    { preconnect: originalFetch.preconnect.bind(originalFetch) },
  ) as typeof fetch
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "revela-media-save-"))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  rmSync(workspaceDir, { recursive: true, force: true })
})

describe("saveMediaAsset", () => {
  it("saves a local image file and writes the manifest", async () => {
    const logoPath = join(workspaceDir, "logo.png")
    writeFileSync(logoPath, validPngBuffer())

    const result = await saveMediaAsset({
      topic: "EV Market",
      id: "Tesla Logo 01",
      type: "image",
      purpose: "logo",
      brief: "Tesla corporate logo for company overview",
      status: "success",
      sourcePath: "logo.png",
      alt: "Tesla logo",
    }, workspaceDir)

    expect(result).toMatchObject({
      ok: true,
      assetId: "tesla-logo-01",
      status: "success",
      path: "assets/ev-market/media/tesla-logo-01.png",
      manifestPath: "assets/ev-market/media-manifest.json",
    })
    expect(existsSync(join(workspaceDir, "assets/ev-market/media/tesla-logo-01.png"))).toBe(true)
    expect(JSON.parse(readFileSync(join(workspaceDir, "assets/ev-market/media-manifest.json"), "utf-8"))).toMatchObject({
      topic: "ev-market",
      assets: [
        expect.objectContaining({
          id: "tesla-logo-01",
          status: "success",
          path: "assets/ev-market/media/tesla-logo-01.png",
          sourcePath: "logo.png",
          alt: "Tesla logo",
        }),
      ],
    })
  })

  it("downloads a remote image and writes the manifest", async () => {
    globalThis.fetch = mockFetchWith(() => new Response("png-bytes", {
      status: 200,
      headers: { "content-type": "image/png" },
    }))

    const result = await saveMediaAsset({
      topic: "EV Market",
      id: "Hero 01",
      type: "image",
      purpose: "hero",
      brief: "EV charging hero image",
      status: "success",
      sourceUrl: "https://example.com/hero.png",
    }, workspaceDir)

    expect(result).toMatchObject({
      ok: true,
      assetId: "hero-01",
      status: "success",
      path: "assets/ev-market/media/hero-01.png",
    })
    expect(existsSync(join(workspaceDir, "assets/ev-market/media/hero-01.png"))).toBe(true)
  })

  it("records invalid-url failures in the manifest", async () => {
    const result = await saveMediaAsset({
      topic: "EV Market",
      id: "Hero 01",
      type: "image",
      purpose: "hero",
      brief: "EV charging hero image",
      status: "success",
      sourceUrl: "not-a-url",
    }, workspaceDir)

    expect(result).toMatchObject({
      ok: true,
      assetId: "hero-01",
      status: "invalid-url",
      path: null,
    })
    expect(JSON.parse(readFileSync(join(workspaceDir, "assets/ev-market/media-manifest.json"), "utf-8"))).toMatchObject({
      assets: [
        expect.objectContaining({
          id: "hero-01",
          status: "invalid-url",
          path: null,
          failureReason: "Invalid image URL",
        }),
      ],
    })
  })

  it("records cannot-download failures for non-image responses", async () => {
    globalThis.fetch = mockFetchWith(() => new Response("<html>not an image</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }))

    const result = await saveMediaAsset({
      topic: "EV Market",
      id: "Hero 01",
      type: "image",
      purpose: "hero",
      brief: "EV charging hero image",
      status: "success",
      sourceUrl: "https://example.com/page",
    }, workspaceDir)

    expect(result).toMatchObject({
      ok: true,
      assetId: "hero-01",
      status: "cannot-download",
      path: null,
    })
  })

  it("upserts an existing asset id and removes the old file when the extension changes", async () => {
    const pngPath = join(workspaceDir, "logo.png")
    const jpgPath = join(workspaceDir, "logo.jpg")
    writeFileSync(pngPath, validPngBuffer())
    writeFileSync(jpgPath, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))

    await saveMediaAsset({
      topic: "EV Market",
      id: "Tesla Logo 01",
      type: "image",
      purpose: "logo",
      brief: "Tesla corporate logo",
      status: "success",
      sourcePath: "logo.png",
    }, workspaceDir)

    const result = await saveMediaAsset({
      topic: "EV Market",
      id: "Tesla Logo 01",
      type: "image",
      purpose: "logo",
      brief: "Tesla corporate logo updated",
      status: "success",
      sourcePath: "logo.jpg",
    }, workspaceDir)

    expect(result).toMatchObject({
      ok: true,
      path: "assets/ev-market/media/tesla-logo-01.jpg",
    })
    expect(existsSync(join(workspaceDir, "assets/ev-market/media/tesla-logo-01.jpg"))).toBe(true)
    expect(existsSync(join(workspaceDir, "assets/ev-market/media/tesla-logo-01.png"))).toBe(false)
  })

  it("rejects sourcePath values outside the workspace", async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "revela-media-outside-"))
    const outsidePath = join(outsideDir, "logo.png")
    writeFileSync(outsidePath, validPngBuffer())

    try {
      const result = await saveMediaAsset({
        topic: "EV Market",
        id: "Tesla Logo 01",
        type: "image",
        purpose: "logo",
        brief: "Tesla corporate logo",
        status: "success",
        sourcePath: outsidePath,
      }, workspaceDir)

      expect(result).toEqual({ ok: false, error: "sourcePath must be within workspace" })
    } finally {
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it("requires failureReason for explicit failure statuses", async () => {
    const result = await saveMediaAsset({
      topic: "EV Market",
      id: "Hero 01",
      type: "image",
      purpose: "hero",
      brief: "EV charging hero image",
      status: "cannot-generate",
    }, workspaceDir)

    expect(result).toEqual({
      ok: false,
      error: "failureReason is required when status is not 'success'",
    })
  })

  it("preserves an existing successful asset when a later refresh attempt fails", async () => {
    globalThis.fetch = mockFetchWith(() => new Response("png-bytes", {
      status: 200,
      headers: { "content-type": "image/png" },
    }))

    const first = await saveMediaAsset({
      topic: "EV Market",
      id: "Hero 01",
      type: "image",
      purpose: "hero",
      brief: "EV charging hero image",
      status: "success",
      sourceUrl: "https://example.com/hero.png",
    }, workspaceDir)

    expect(first).toMatchObject({
      ok: true,
      path: "assets/ev-market/media/hero-01.png",
      status: "success",
    })
    expect(existsSync(join(workspaceDir, "assets/ev-market/media/hero-01.png"))).toBe(true)

    const failed = await saveMediaAsset({
      topic: "EV Market",
      id: "Hero 01",
      type: "image",
      purpose: "hero",
      brief: "EV charging hero image",
      status: "success",
      sourceUrl: "not-a-url",
    }, workspaceDir)

    expect(failed).toMatchObject({
      ok: true,
      assetId: "hero-01",
      status: "invalid-url",
      path: null,
    })
    expect(existsSync(join(workspaceDir, "assets/ev-market/media/hero-01.png"))).toBe(true)
    expect(JSON.parse(readFileSync(join(workspaceDir, "assets/ev-market/media-manifest.json"), "utf-8"))).toMatchObject({
      assets: [
        expect.objectContaining({
          id: "hero-01",
          status: "success",
          path: "assets/ev-market/media/hero-01.png",
          failureReason: "Invalid image URL",
        }),
      ],
    })
  })
})
