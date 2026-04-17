/**
 * lib/pdf/export.ts
 *
 * HTML → PDF export using Puppeteer (screenshot each slide) + pdf-lib (assemble PDF).
 *
 * Algorithm:
 * 1. Launch headless Chrome at 1920×1080 (canvas size)
 * 2. Navigate to the HTML file — allow external resources (fonts, CDN icons, ECharts)
 * 3. For each .slide: scrollIntoView, force .reveal.visible, wait 800ms, screenshot .slide-canvas
 * 4. Assemble screenshots into a multi-page PDF (16:9, 1920×1080pt per page) via pdf-lib
 * 5. Write PDF alongside the HTML file (same directory, .html → .pdf)
 *
 * Output path: replaces the .html extension with .pdf, same directory as input.
 */

import puppeteer from "puppeteer-core"
import { PDFDocument } from "pdf-lib"
import { existsSync, writeFileSync } from "fs"
import { resolve, dirname, basename, join } from "path"
import { pathToFileURL } from "url"

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
  const fileUrl = pathToFileURL(abs).href
  const executablePath = findChromePath()

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${CANVAS_W},${CANVAS_H}`,
    ],
  })

  let screenshots: Buffer[] = []

  try {
    const page = await browser.newPage()

    // Set exact canvas viewport so scale === 1
    await page.setViewport({ width: CANVAS_W, height: CANVAS_H })

    // Override the default headless UA ("HeadlessChrome") with a real browser string.
    // Many CDNs (Wikimedia, Unsplash, etc.) return 403 or empty responses to headless UAs.
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    )

    // Allow all external resources (CDN fonts, ECharts, Lucide icons, etc.)
    // networkidle2 waits until no more than 2 in-flight requests for 500ms
    await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30000 })

    // Extra wait for CSS entrance animations to settle
    await new Promise((r) => setTimeout(r, 1000))

    // Disable scroll-snap so programmatic scrollIntoView works reliably.
    // With scroll-snap-type: mandatory, headless Chrome snaps the scroll position
    // back to the nearest snap point after each scrollIntoView, causing all slides
    // to screenshot the cover page.
    await page.evaluate(() => {
      document.documentElement.style.scrollSnapType = "none"
      document.documentElement.style.overflow = "visible"
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

    // Pre-load ALL images in the document before the per-slide loop.
    // A single large image (e.g. 5MB Wikimedia) won't block individual slides —
    // it loads in the background while we wait globally (max 15s).
    await Promise.race([
      page.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[]
        await Promise.allSettled(
          imgs.map((img) => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve()
            return new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true })
              img.addEventListener("error", () => resolve(), { once: true })
            })
          })
        )
      }),
      new Promise<void>((r) => setTimeout(r, 15000)),
    ])

    // Screenshot each slide individually
    for (let idx = 0; idx < slideCount; idx++) {
      // Force reveal animations — no scrollIntoView needed since we use absolute coords
      await page.evaluate((i: number) => {
        const slide = document.querySelectorAll(".slide")[i] as HTMLElement | null
        if (!slide) return
        slide.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"))
      }, idx)

      // Extra wait for CSS transitions and JS rendering (ECharts animations, etc.)
      await new Promise((r) => setTimeout(r, 800))

      // Compute the .slide-canvas absolute position by walking the offsetParent chain.
      // getBoundingClientRect() returns viewport-relative coords which are always (0,0)
      // for each slide after scrollIntoView — unusable as screenshot clip coordinates.
      // offsetTop/offsetLeft walk gives us document-absolute coords that match
      // Puppeteer's page.screenshot clip coordinate system directly.
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
        // Fallback: screenshot full page at slide's estimated position
        const buf = await page.screenshot({ type: "png" })
        screenshots.push(buf as Buffer)
      }
    }
  } finally {
    await browser.close()
  }

  // ── Assemble PDF with pdf-lib ─────────────────────────────────────────────
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
