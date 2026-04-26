import { describe, expect, it } from "bun:test"
import { existsSync } from "fs"
import { basename } from "path"
import { resolveDomToPptxBundlePath } from "../lib/pptx/export"

describe("resolveDomToPptxBundlePath", () => {
  it("resolves the browser bundle through package resolution", () => {
    const bundlePath = resolveDomToPptxBundlePath()

    expect(basename(bundlePath)).toBe("dom-to-pptx.bundle.js")
    expect(existsSync(bundlePath)).toBe(true)
  })
})
