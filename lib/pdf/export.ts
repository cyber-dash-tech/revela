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
 *    using offsetParent-chain absolute coordinates
 * 5. Assemble screenshots into a multi-page PDF (16:9, 1920×1080pt per page) via pdf-lib
 * 6. Write PDF alongside the HTML file (same directory, .html → .pdf)
 * 7. Clean up temp dir
 *
 * Output path: replaces the .html extension with .pdf, same directory as input.
 */

import puppeteer from "puppeteer-core"
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

// ── Constants ────────────────────────────────────────────────────────────────

/** Canonical slide canvas dimensions — must match the design system */
const CANVAS_W = 1920
const CANVAS_H = 1080

/** Path to system Chrome on macOS and Linux — same as measure.ts */
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
]

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function findChromePath(): string {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  throw new Error(
    "Could not find a Chrome/Chromium installation.\n" +
    "Tried:\n" + CHROME_PATHS.map((p) => `  ${p}`).join("\n")
  )
}

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

// ── Main export ──────────────────────────────────────────────────────────────

export interface ExportResult {
  outputPath: string
  slideCount: number
  durationMs: number
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

  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }

  if (!/\.html?$/i.test(abs)) {
    throw new Error(`Not an HTML file: ${abs}`)
  }

  const outputPath = derivePdfPath(abs)
  const executablePath = findChromePath()

  // ── Step 1: Download external images and rewrite HTML ─────────────────────
  const tmpDir = join("/tmp", `revela-pdf-${randomBytes(6).toString("hex")}`)
  mkdirSync(tmpDir, { recursive: true })

  let tmpHtmlPath: string
  try {
    const originalHtml = readFileSync(abs, "utf-8")
    const patchedHtml = await localizeExternalImages(originalHtml, tmpDir)
    tmpHtmlPath = join(tmpDir, "index.html")
    writeFileSync(tmpHtmlPath, patchedHtml, "utf-8")
  } catch (err) {
    // If patching fails for any reason, fall back to original file
    tmpHtmlPath = abs
  }

  const fileUrl = pathToFileURL(tmpHtmlPath).href

  // ── Step 2: Launch Puppeteer and screenshot each slide ────────────────────
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      // Allow file:// pages to load other local file:// resources (downloaded images)
      "--allow-file-access-from-files",
      `--window-size=${CANVAS_W},${CANVAS_H}`,
    ],
  })

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

    // Disable scroll-snap so offsetParent-based clip coords are accurate.
    // Also ensure html/body are tall enough to contain all slides without clipping.
    await page.evaluate(() => {
      document.documentElement.style.scrollSnapType = "none"
      document.documentElement.style.overflow = "visible"
      document.body.style.overflow = "visible"
    })

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

      // Compute .slide-canvas absolute position by walking the offsetParent chain.
      // getBoundingClientRect() returns viewport-relative coords (always near 0,0) —
      // unusable as screenshot clip coordinates without adding scrollY.
      // offsetParent walk gives document-absolute coords that Puppeteer clip expects.
      const clipRect = await page.evaluate((i: number) => {
        const slide = document.querySelectorAll(".slide")[i] as HTMLElement | null
        if (!slide) return null
        const canvas = slide.querySelector(".slide-canvas") as HTMLElement | null
        if (!canvas) return null
        let top = 0
        let left = 0
        let el: HTMLElement | null = canvas
        while (el) {
          top += el.offsetTop
          left += el.offsetLeft
          el = el.offsetParent as HTMLElement | null
        }
        return { x: left, y: top, width: canvas.offsetWidth, height: canvas.offsetHeight }
      }, idx)

      if (clipRect && clipRect.width > 0 && clipRect.height > 0) {
        const buf = await page.screenshot({ type: "png", clip: clipRect })
        screenshots.push(buf as Buffer)
      } else {
        // Fallback: screenshot full viewport
        const buf = await page.screenshot({ type: "png" })
        screenshots.push(buf as Buffer)
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
