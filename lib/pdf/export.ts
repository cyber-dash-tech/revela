/**
 * lib/pdf/export.ts
 *
 * HTML → PDF export using Puppeteer (screenshot each slide) + pdf-lib (assemble PDF).
 *
 * Algorithm:
 * 1. Launch headless Chrome at 1920×1080 (canvas size)
 * 2. Scan HTML for external http(s) image URLs, download them to a temp dir,
 *    rewrite the HTML to use file:// local paths — avoids CDN/CORS/headless issues
 * 3. Navigate to the patched HTML file
 * 4. For each .slide: force .reveal.visible, wait 800ms, screenshot .slide-canvas
 *    or slide-as-canvas fallback using offsetParent-chain absolute coordinates
 * 5. Assemble screenshots into a multi-page PDF (16:9, 1920×1080pt per page) via pdf-lib
 * 6. Write PDF alongside the HTML file (same directory, .html → .pdf)
 * 7. Clean up temp dir
 *
 * Output path: replaces the .html extension with .pdf, same directory as input.
 */

import { PDFDocument } from "pdf-lib"
import {
  existsSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "fs"
import { resolve, dirname, basename, join, extname } from "path"
import { pathToFileURL } from "url"
import { randomBytes } from "crypto"
import { launchChrome } from "../browser/chrome"
import { detectDeckHtml } from "../html-export/deck-detect"
import { exportSinglePageHtmlPdf } from "../html-export"
import { withExportBaseHref } from "../export/html"

// ── Constants ────────────────────────────────────────────────────────────────

/** Canonical slide canvas dimensions — must match the design system */
const CANVAS_W = 1920
const CANVAS_H = 1080

/** Mime type → file extension mapping for downloaded images */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".bmp"])
const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Derive output PDF path from input HTML path (same dir, .html → .pdf) */
export function derivePdfPath(htmlFilePath: string): string {
  const abs = resolve(htmlFilePath)
  const dir = dirname(abs)
  const name = basename(abs).replace(/\.html?$/i, "")
  return join(dir, `${name}.pdf`)
}

/**
 * Download all external http(s) images found in the HTML to a temp directory,
 * rewrite their URLs to file:// local paths, and return the patched HTML + temp dir.
 *
 * On any per-image failure (network error, non-200, timeout) the original URL is
 * preserved so the export degrades gracefully (blank image area) rather than failing.
 */
async function localizeExternalImages(
  htmlContent: string,
  tmpDir: string
): Promise<string> {
  // Extract all unique http(s) URLs that appear in src="..." or url("...") contexts
  const urlPattern = /(?:src=["']|url\(["']?)(https?:\/\/[^"')>\s]+)/g
  const uniqueUrls = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = urlPattern.exec(htmlContent)) !== null) {
    uniqueUrls.add(match[1])
  }

  if (uniqueUrls.size === 0) return htmlContent

  // Download each URL in parallel (10s timeout per image)
  const urlToLocal = new Map<string, string>()

  await Promise.allSettled(
    Array.from(uniqueUrls).map(async (url, i) => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            // Use a real browser UA to avoid CDN blocking headless/bot requests
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          },
        })
        clearTimeout(timer)

        if (!res.ok) return // non-200 → keep original URL

        const contentType = res.headers.get("content-type") ?? ""
        const mimeBase = contentType.split(";")[0].trim().toLowerCase()

        // Derive extension: prefer from URL, fall back to Content-Type
        let ext = extname(new URL(url).pathname).toLowerCase()
        if (!ext || ext.length > 6) {
          ext = MIME_TO_EXT[mimeBase] ?? ".bin"
        }

        const localPath = join(tmpDir, `img-${i}${ext}`)
        const buf = new Uint8Array(await res.arrayBuffer())
        writeFileSync(localPath, buf)
        urlToLocal.set(url, pathToFileURL(localPath).href)
      } catch {
        // Network error or timeout — leave original URL, Chrome will show broken image
      }
    })
  )

  // Replace all occurrences of each downloaded URL in the HTML
  let patched = htmlContent
  for (const [original, local] of urlToLocal) {
    // Escape special regex chars in the URL
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    patched = patched.replace(new RegExp(escaped, "g"), local)
  }

  return patched
}

function isLocalImageRef(ref: string): boolean {
  const pathPart = ref.split(/[?#]/)[0]
  return IMAGE_EXTS.has(extname(pathPart).toLowerCase())
}

export function extractImageAssetRefsForPdf(htmlContent: string): string[] {
  const assetRefPattern = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))|url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/g
  const refs = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = assetRefPattern.exec(htmlContent)) !== null) {
    const ref = match.slice(1).find((value): value is string => value !== undefined)
    if (ref) refs.add(ref.trim())
  }

  return Array.from(refs)
}

async function toDataUrlFromRef(ref: string, baseDir: string): Promise<string | null> {
  if (!ref || ref.startsWith("data:") || ref.startsWith("blob:") || ref.startsWith("#")) {
    return null
  }

  try {
    if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("//") || ref.startsWith("file://")) {
      return null
    }

    let filePath: string | null = null
    if (isLocalImageRef(ref)) {
      filePath = resolve(baseDir, decodeURI(ref.split(/[?#]/)[0]))
    }

    if (!filePath || !existsSync(filePath)) return null
    const ext = extname(filePath).toLowerCase()
    const mime = EXT_TO_MIME[ext]
    if (!mime) return null
    const buf = readFileSync(filePath)
    return `data:${mime};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

async function prepareSlidesForExport(page: any): Promise<void> {
  await page.evaluate((canvasWidth: number, canvasHeight: number) => {
    document.documentElement.style.scrollSnapType = "none"
    document.documentElement.style.overflow = "visible"
    document.body.style.overflow = "visible"
    document.body.style.margin = "0"

    const style = document.createElement("style")
    style.setAttribute("data-revela-export-style", "true")
    style.textContent = `
      html, body { scroll-snap-type: none !important; overflow: visible !important; }
      .slide {
        width: ${canvasWidth}px !important;
        min-width: ${canvasWidth}px !important;
        height: ${canvasHeight}px !important;
        min-height: ${canvasHeight}px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        scroll-snap-align: none !important;
      }
      .slide-canvas {
        width: ${canvasWidth}px !important;
        height: ${canvasHeight}px !important;
        transform: none !important;
        transform-origin: center center !important;
      }
    `
    document.head.appendChild(style)

    document.querySelectorAll<HTMLElement>(".slide-canvas").forEach((canvas) => {
      canvas.style.transform = "none"
      canvas.style.transformOrigin = "center center"
    })
  }, CANVAS_W, CANVAS_H)
}

export async function inlineImageAssetsForPdf(htmlContent: string, htmlFilePath: string): Promise<string> {
  const baseDir = dirname(resolve(htmlFilePath))
  const refs = extractImageAssetRefsForPdf(htmlContent)

  if (refs.length === 0) return htmlContent

  const replacements = new Map<string, string>()
  await Promise.allSettled(
    refs.map(async (ref) => {
      const dataUrl = await toDataUrlFromRef(ref, baseDir)
      if (dataUrl) replacements.set(ref, dataUrl)
    })
  )

  let patched = htmlContent
  for (const [original, replacement] of replacements) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    patched = patched.replace(new RegExp(escaped, "g"), replacement)
  }
  return patched
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface ExportResult {
  outputPath: string
  slideCount: number
  durationMs: number
  exportMode: "deck" | "single-page-html"
  deckDetection?: {
    isDeck: boolean
    slideCount: number
    reason: string
  }
  selector?: string
  pngPath?: string
  warnings?: string[]
}

export interface ExportPngResult {
  outputDir: string
  files: string[]
  slideCount: number
  durationMs: number
  exportMode: "deck"
}

export interface ExportPngOptions {
  outputDir?: string
}

/**
 * Export an HTML slide deck to PDF.
 *
 * @param htmlFilePath - Absolute or relative path to the HTML file.
 * @returns ExportResult with output path, slide count, and duration.
 */
export async function exportToPdf(htmlFilePath: string): Promise<ExportResult> {
  const startMs = Date.now()
  const abs = resolve(htmlFilePath)
  const detection = await detectDeckHtml(abs)
  if (detection.isDeck) {
    const result = await exportDeckToPdf(abs)
    return { ...result, exportMode: "deck", deckDetection: detection, durationMs: Date.now() - startMs }
  }

  const result = await exportSinglePageHtmlPdf(abs, { outputPath: derivePdfPath(abs) })
  return {
    outputPath: result.outputPath,
    slideCount: 1,
    durationMs: Date.now() - startMs,
    exportMode: "single-page-html",
    deckDetection: detection,
    selector: result.selector,
    pngPath: result.pngPath,
    warnings: result.warnings,
  }
}

export async function exportDeckToPdf(htmlFilePath: string): Promise<Omit<ExportResult, "exportMode">> {
  const startMs = Date.now()
  const abs = resolve(htmlFilePath)

  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }

  if (!/\.html?$/i.test(abs)) {
    throw new Error(`Not an HTML file: ${abs}`)
  }

  const outputPath = derivePdfPath(abs)

  const screenshots = await screenshotDeckSlides(abs, "pdf")

  // ── Step 3: Assemble PDF with pdf-lib ─────────────────────────────────────
  const pdfDoc = await PDFDocument.create()

  for (const pngBuf of screenshots) {
    const pngImage = await pdfDoc.embedPng(new Uint8Array(pngBuf))
    // Each page is exactly the canvas size (points = pixels at 1:1 for screen PDF)
    const page = pdfDoc.addPage([CANVAS_W, CANVAS_H])
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: CANVAS_W,
      height: CANVAS_H,
    })
  }

  const pdfBytes = await pdfDoc.save()
  writeFileSync(outputPath, pdfBytes)

  return {
    outputPath,
    slideCount: screenshots.length,
    durationMs: Date.now() - startMs,
  }
}

export async function exportDeckToPng(htmlFilePath: string, options: ExportPngOptions = {}): Promise<ExportPngResult> {
  const startMs = Date.now()
  const abs = resolve(htmlFilePath)

  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }

  if (!/\.html?$/i.test(abs)) {
    throw new Error(`Not an HTML file: ${abs}`)
  }

  const outputDir = options.outputDir ?? join(dirname(abs), `${basename(abs).replace(/\.html?$/i, "")}-png`)
  mkdirSync(outputDir, { recursive: true })
  const screenshots = await screenshotDeckSlides(abs, "png")
  const files: string[] = []

  screenshots.forEach((pngBuf, index) => {
    const outputPath = join(outputDir, `slide-${String(index + 1).padStart(3, "0")}.png`)
    writeFileSync(outputPath, new Uint8Array(pngBuf))
    files.push(outputPath)
  })

  return {
    outputDir,
    files,
    slideCount: screenshots.length,
    durationMs: Date.now() - startMs,
    exportMode: "deck",
  }
}

async function screenshotDeckSlides(htmlFilePath: string, label: "pdf" | "png"): Promise<Buffer[]> {
  const abs = resolve(htmlFilePath)

  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }

  if (!/\.html?$/i.test(abs)) {
    throw new Error(`Not an HTML file: ${abs}`)
  }

  // ── Step 1: Download external images and rewrite HTML ─────────────────────
  const tmpDir = join("/tmp", `revela-${label}-${randomBytes(6).toString("hex")}`)
  mkdirSync(tmpDir, { recursive: true })

  let tmpHtmlPath: string
  try {
    const originalHtml = readFileSync(abs, "utf-8")
    const localizedHtml = await localizeExternalImages(originalHtml, tmpDir)
    const patchedHtml = withExportBaseHref(await inlineImageAssetsForPdf(localizedHtml, abs), abs)
    tmpHtmlPath = join(tmpDir, "index.html")
    writeFileSync(tmpHtmlPath, patchedHtml, "utf-8")
  } catch (err) {
    // If patching fails for any reason, fall back to original file
    tmpHtmlPath = abs
  }

  const fileUrl = pathToFileURL(tmpHtmlPath).href

  // ── Step 2: Launch Puppeteer and screenshot each slide ────────────────────
  const browser = await launchChrome({ width: CANVAS_W, height: CANVAS_H, allowFileAccess: true })

  let screenshots: Buffer[] = []

  try {
    const page = await browser.newPage()

    // Set exact canvas viewport so scale === 1
    await page.setViewport({ width: CANVAS_W, height: CANVAS_H })

    // All images are now local file:// — no external requests needed.
    // domcontentloaded is sufficient; networkidle2 would waste time.
    await page.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 30000 })

    // Wait for fonts (Google Fonts may still be external) and CSS animations to settle
    await new Promise((r) => setTimeout(r, 2000))

    await prepareSlidesForExport(page)

    const slideCount: number = await page.evaluate(
      () => document.querySelectorAll(".slide").length
    )

    if (slideCount === 0) {
      throw new Error(
        "No .slide elements found in the HTML file.\n" +
        "Make sure this is a revela-generated slide deck."
      )
    }

    // Screenshot each slide individually
    for (let idx = 0; idx < slideCount; idx++) {
      // Force reveal animations (no scrollIntoView — we use absolute coords)
      await page.evaluate((i: number) => {
        const slide = document.querySelectorAll(".slide")[i] as HTMLElement | null
        if (!slide) return
        slide.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"))
      }, idx)

      // Wait for CSS transitions and JS rendering (ECharts animations, etc.)
      await new Promise((r) => setTimeout(r, 800))

      const target = await page.$(`.slide:nth-of-type(${idx + 1}) > .slide-canvas`)
        ?? await page.$(`.slide:nth-of-type(${idx + 1})`)
      const box = target ? await target.boundingBox() : null

      if (target && box && box.width > 0 && box.height > 0) {
        const buf = await target.screenshot({ type: "png" })
        screenshots.push(Buffer.from(buf as Uint8Array))
      } else {
        const buf = await page.screenshot({ type: "png" })
        screenshots.push(Buffer.from(buf as Uint8Array))
      }
    }
  } finally {
    await browser.close()
    // Clean up temp dir (downloaded images + patched HTML)
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Non-fatal — /tmp will be cleaned by OS eventually
    }
  }

  return screenshots
}
