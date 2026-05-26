import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { pathToFileURL } from "url"
import { randomBytes } from "crypto"
import { Jimp } from "jimp"
import type { Page } from "puppeteer-core"
import { launchChrome } from "../browser/chrome"
import { chooseSelector } from "./selectors"
import { findTrimmedHeight } from "./trim"
import { validatePngOutput } from "./validate"
import { writeSinglePagePdfFromPng } from "./pdf"

export interface ExportSinglePageHtmlPdfOptions {
  selector?: string
  outputPath?: string
  scale?: number
  trim?: boolean
  trimColor?: string
  trimThreshold?: number
  trimPadding?: number
  timeout?: number
  wait?: number
  background?: boolean
  maxSegmentHeight?: number
}

export interface ExportSinglePageHtmlPdfResult {
  outputPath: string
  pngPath: string
  width: number
  height: number
  segmentCount: number
  selector: string
  attemptedSelectors: string[]
  warnings: string[]
}

type Stage = "load" | "selector" | "screenshot" | "stitch" | "trim" | "validate" | "pdf"

export async function exportSinglePageHtmlPdf(
  htmlFilePath: string,
  options: ExportSinglePageHtmlPdfOptions = {},
): Promise<ExportSinglePageHtmlPdfResult> {
  const abs = resolve(htmlFilePath)
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`)
  if (!/\.html?$/i.test(abs)) throw new Error(`Not an HTML file: ${abs}`)

  const outputPath = options.outputPath ?? abs.replace(/\.html?$/i, ".pdf")
  const scale = normalizedNumber(options.scale, 2, 0.25, 4)
  const timeout = normalizedNumber(options.timeout, 60000, 1000, 300000)
  const wait = normalizedNumber(options.wait, 500, 0, 30000)
  const maxSegmentHeight = Math.floor(normalizedNumber(options.maxSegmentHeight, 1600, 256, 4096))
  const background = options.background ?? true
  const selectorChoice = chooseSelector(options.selector)
  const tmpDir = join(dirname(outputPath), `.revela-html-export-${randomBytes(6).toString("hex")}`)
  mkdirSync(tmpDir, { recursive: true })
  const tmpPng = join(tmpDir, "artifact.png")
  const finalPng = join(tmpDir, "artifact-final.png")
  const promotedPng = outputPath.replace(/\.pdf$/i, ".png")
  const warnings: string[] = []
  let stage: Stage = "load"

  const browser = await launchChrome({ allowFileAccess: true, width: 1200, height: maxSegmentHeight })
  try {
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1200, height: maxSegmentHeight, deviceScaleFactor: scale })
      await page.goto(pathToFileURL(abs).href, { waitUntil: "domcontentloaded", timeout })
      await waitForStablePage(page, timeout, wait, warnings)

      stage = "selector"
      const target = await resolveTarget(page, selectorChoice.attempted)
      if (!target) {
        throw new Error(`selector was not found. Attempted: ${selectorChoice.attempted.join(", ")}`)
      }

      const viewportWidth = Math.max(1, Math.ceil(target.box.width + target.box.x))
      await page.setViewport({ width: viewportWidth, height: maxSegmentHeight, deviceScaleFactor: scale })
      await waitForAnimationFrames(page)

      const segments: Array<{ buffer: Buffer; top: number; height: number }> = []
      const totalHeight = Math.ceil(target.box.height)
      const width = Math.ceil(target.box.width)
      const x = Math.max(0, Math.floor(target.box.x))
      const y = Math.max(0, Math.floor(target.box.y))

      stage = "screenshot"
      for (let top = 0; top < totalHeight; top += maxSegmentHeight) {
        const height = Math.min(maxSegmentHeight, totalHeight - top)
        const clip = { x, y: y + top, width, height }
        try {
          const buffer = await page.screenshot({ type: "png", clip, omitBackground: !background })
          segments.push({ buffer: Buffer.from(buffer), top, height })
        } catch {
          const buffer = await page.screenshot({ type: "png", clip, omitBackground: !background })
          segments.push({ buffer: Buffer.from(buffer), top, height })
        }
      }

      stage = "stitch"
      const stitched = new Jimp({
        width: Math.round(width * scale),
        height: Math.round(totalHeight * scale),
        color: background ? 0x000000ff : 0x00000000,
      })
      for (const segment of segments) {
        const image = await Jimp.read(segment.buffer)
        stitched.composite(image, 0, Math.round(segment.top * scale))
      }

      stage = "trim"
      const trimmedHeight = findTrimmedHeight(stitched, {
        enabled: options.trim ?? true,
        color: options.trimColor,
        threshold: options.trimThreshold,
        padding: options.trimPadding,
      })
      const finalImage = trimmedHeight < stitched.bitmap.height
        ? stitched.crop({ x: 0, y: 0, w: stitched.bitmap.width, h: trimmedHeight })
        : stitched

      const finalBuffer = await (finalImage.getBuffer as any)("image/png")
      writeFileSync(tmpPng, new Uint8Array(finalBuffer))
      renameSync(tmpPng, finalPng)

      stage = "validate"
      const validation = await validatePngOutput(finalPng)

      stage = "pdf"
      await writeSinglePagePdfFromPng(finalPng, outputPath, validation.width, validation.height)

      return {
        outputPath,
        pngPath: promotedPng,
        width: validation.width,
        height: validation.height,
        segmentCount: segments.length,
        selector: target.selector,
        attemptedSelectors: selectorChoice.attempted,
        warnings,
      }
    } finally {
      await page.close().catch(() => undefined)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Single-page HTML PDF export failed during ${stage}.\n` +
      `File: ${abs}\n` +
      `Attempted selector(s): ${selectorChoice.attempted.join(", ")}\n` +
      message
    )
  } finally {
    await browser.close().catch(() => undefined)
    if (existsSync(finalPng)) {
      try {
        if (statSync(finalPng).size > 0) renameSync(finalPng, promotedPng)
      } catch {
        // Non-fatal; the PDF is the requested artifact.
      }
    }
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

function normalizedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

async function waitForStablePage(page: Page, timeout: number, wait: number, warnings: string[]) {
  await page.evaluate(async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    const fonts = (document as any).fonts
    if (fonts?.ready) {
      await Promise.race([
        fonts.ready,
        new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()))),
      ])
    }
  }, Math.min(timeout, 10000)).catch(() => warnings.push("Timed out waiting for fonts."))

  await page.evaluate(async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    const images = Array.from(document.images)
    await Promise.all(images.map((img) => {
      if (img.complete) return undefined
      return new Promise<void>((resolve) => {
        const done = () => resolve()
        const remaining = Math.max(0, deadline - Date.now())
        const timer = setTimeout(done, remaining)
        img.addEventListener("load", () => { clearTimeout(timer); done() }, { once: true })
        img.addEventListener("error", () => { clearTimeout(timer); done() }, { once: true })
      })
    }))
  }, Math.min(timeout, 20000)).catch(() => warnings.push("Timed out waiting for images."))

  await waitForAnimationFrames(page)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

async function waitForAnimationFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function resolveTarget(
  page: Page,
  selectors: string[],
): Promise<{ selector: string; box: { x: number; y: number; width: number; height: number } } | null> {
  return await page.evaluate((candidates) => {
    for (const selector of candidates) {
      const el = document.querySelector(selector) as HTMLElement | null
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      return {
        selector,
        box: {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
      }
    }
    return null
  }, selectors)
}
