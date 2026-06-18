import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { cleanupChromeUserDataDir, createChromeUserDataDir, findChromePath } from "../lib/browser/chrome"

const originalRevelaChromePath = process.env.REVELA_CHROME_PATH
const originalPuppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH

afterEach(() => {
  if (originalRevelaChromePath === undefined) delete process.env.REVELA_CHROME_PATH
  else process.env.REVELA_CHROME_PATH = originalRevelaChromePath

  if (originalPuppeteerExecutablePath === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH
  else process.env.PUPPETEER_EXECUTABLE_PATH = originalPuppeteerExecutablePath
})

describe("Chrome launcher", () => {
  it("prefers REVELA_CHROME_PATH over PUPPETEER_EXECUTABLE_PATH", () => {
    const root = mkdtempSync(join(tmpdir(), "revela-chrome-path-test-"))
    try {
      const revelaChrome = join(root, "revela-chrome")
      const puppeteerChrome = join(root, "puppeteer-chrome")
      writeFileSync(revelaChrome, "")
      writeFileSync(puppeteerChrome, "")

      process.env.REVELA_CHROME_PATH = revelaChrome
      process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerChrome

      expect(findChromePath()).toBe(revelaChrome)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("uses PUPPETEER_EXECUTABLE_PATH when REVELA_CHROME_PATH is unset", () => {
    const root = mkdtempSync(join(tmpdir(), "revela-chrome-path-test-"))
    try {
      const puppeteerChrome = join(root, "puppeteer-chrome")
      writeFileSync(puppeteerChrome, "")

      delete process.env.REVELA_CHROME_PATH
      process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerChrome

      expect(findChromePath()).toBe(puppeteerChrome)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("reports invalid configured Chrome paths with repair guidance", () => {
    delete process.env.REVELA_CHROME_PATH
    process.env.PUPPETEER_EXECUTABLE_PATH = "/definitely/missing/chrome"

    expect(() => findChromePath()).toThrow(/PUPPETEER_EXECUTABLE_PATH/)
    expect(() => findChromePath()).toThrow(/REVELA_CHROME_PATH/)
  })

  it("creates and cleans up isolated temporary Chrome profiles", () => {
    const userDataDir = createChromeUserDataDir()
    const marker = join(userDataDir, "marker")
    writeFileSync(marker, "profile")

    expect(existsSync(marker)).toBe(true)

    cleanupChromeUserDataDir(userDataDir)

    expect(existsSync(userDataDir)).toBe(false)
  })
})
