/**
 * lib/qa/measure.ts
 *
 * Puppeteer-based slide layout measurement.
 * Opens the HTML file with a headless Chrome, navigates to each slide,
 * and records the bounding boxes of all visible elements inside the
 * slide canvas (1920×1080).
 *
 * Returns raw per-slide geometry data consumed by checks.ts.
 */

import puppeteer from "puppeteer-core"
import { pathToFileURL } from "url"

// ── Constants ────────────────────────────────────────────────────────────────

/** The canonical slide canvas size (matches the design system). */
export const CANVAS_W = 1920
export const CANVAS_H = 1080

/** Path to system Chrome on macOS. Falls back to common Linux paths. */
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
]

// ── Types ────────────────────────────────────────────────────────────────────

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ElementInfo {
  /** CSS selector path (tag + nth-child chain), for human-readable reports */
  selector: string
  rect: Rect
  /** true if element is considered "visible" (non-zero size, not hidden) */
  visible: boolean
  /** direct children that are also visible */
  children: ElementInfo[]
}

export interface SlideMetrics {
  /** 0-based slide index */
  index: number
  /** slide title extracted from the first h1/h2 inside the slide */
  title: string
  /**
   * Whether this slide should be included in layout QA checks.
   * Read from the `slide-qa` attribute on `<section class="slide">`.
   * Defaults to `false` when the attribute is absent.
   * Content-heavy layouts set `slide-qa="true"`; structural/sparse slides omit or use `"false"`.
   */
  slideQa: boolean
  /** bounding box of the slide-canvas element itself (post-scale) */
  canvasRect: Rect
  /** top-level visible children of .slide-canvas */
  elements: ElementInfo[]
  /** union bounding box of all visible leaf elements */
  contentRect: Rect
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findChromePath(): string {
  const { existsSync } = require("fs") as typeof import("fs")
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  throw new Error(
    "Could not find a Chrome/Chromium installation. " +
    "Tried: " + CHROME_PATHS.join(", ")
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Open `htmlFilePath` in a headless Chrome at 1920×1080, measure each slide,
 * and return an array of SlideMetrics (one per .slide element).
 */
export async function measureSlides(htmlFilePath: string): Promise<SlideMetrics[]> {
  const executablePath = findChromePath()
  const fileUrl = pathToFileURL(htmlFilePath).href

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1920,1080",
    ],
  })

  try {
    const page = await browser.newPage()

    // Set viewport to exact canvas size so scale === 1 (no CSS transform needed).
    await page.setViewport({ width: CANVAS_W, height: CANVAS_H })
    await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 30000 })

    // Wait for any entrance animations / intersection observers to fire.
    await new Promise((r) => setTimeout(r, 600))

    // Measure slides one-by-one: scroll each into view, wait for animations,
    // then collect geometry relative to the canvas coordinate system.
    const slideCount: number = await page.evaluate(
      () => document.querySelectorAll(".slide").length
    )

    const metrics: SlideMetrics[] = []

    for (let idx = 0; idx < slideCount; idx++) {
      // Scroll the slide into view and wait for intersection observers / animations
      await page.evaluate((i: number) => {
        const slides = document.querySelectorAll(".slide")
        const slide = slides[i] as HTMLElement
        if (slide) {
          slide.scrollIntoView({ behavior: "instant" })
          // Force all .reveal elements visible (in case IO didn't fire)
          slide.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"))
        }
      }, idx)

      // Wait for CSS transitions + any JS rendering (ECharts, bar animations, etc.)
      await new Promise((r) => setTimeout(r, 800))

      const slideData = await page.evaluate(
        (slideIdx: number) => {
          // ── In-browser helpers ───────────────────────────────────────────

          function isVisible(el: Element): boolean {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) return false
            const style = window.getComputedStyle(el)
            if (style.visibility === "hidden") return false
            if (style.display === "none") return false
            if (parseFloat(style.opacity) < 0.01) return false
            return true
          }

          function toRectRelative(r: DOMRect, offsetTop: number, offsetLeft: number) {
            return {
              left: r.left - offsetLeft,
              top: r.top - offsetTop,
              right: r.right - offsetLeft,
              bottom: r.bottom - offsetTop,
              width: r.width,
              height: r.height,
            }
          }

          function selectorOf(el: Element): string {
            const parts: string[] = []
            let cur: Element | null = el
            while (cur && cur !== document.body) {
              const tag = cur.tagName.toLowerCase()
              const cls = Array.from(cur.classList)
                .slice(0, 2)
                .map((c) => "." + c)
                .join("")
              parts.unshift(tag + cls)
              cur = cur.parentElement
            }
            return parts.slice(-3).join(" > ")
          }

          type EI = {
            selector: string
            rect: ReturnType<typeof toRectRelative>
            visible: boolean
            children: EI[]
          }

          function collectChildren(
            el: Element,
            offsetTop: number,
            offsetLeft: number,
            depth = 0
          ): EI[] {
            if (depth > 4) return []
            const result: EI[] = []
            for (const child of Array.from(el.children)) {
              if (!isVisible(child)) continue
              const rawR = child.getBoundingClientRect()
              const cls = child.className || ""
              if (
                typeof cls === "string" &&
                (cls.includes("aurora") ||
                  cls.includes("stars") ||
                  cls.includes("progress") ||
                  cls.includes("nav-dot") ||
                  cls.includes("deco-blob"))
              ) continue
              const relR = toRectRelative(rawR, offsetTop, offsetLeft)
              result.push({
                selector: selectorOf(child),
                rect: relR,
                visible: true,
                children: collectChildren(child, offsetTop, offsetLeft, depth + 1),
              })
            }
            return result
          }

          function unionRect(els: EI[]): ReturnType<typeof toRectRelative> {
            let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
            function walk(list: EI[]) {
              for (const e of list) {
                if (!e.visible) continue
                if (e.children.length > 0) {
                  walk(e.children)
                } else {
                  left = Math.min(left, e.rect.left)
                  top = Math.min(top, e.rect.top)
                  right = Math.max(right, e.rect.right)
                  bottom = Math.max(bottom, e.rect.bottom)
                }
              }
            }
            walk(els)
            if (left === Infinity) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
            return { left, top, right, bottom, width: right - left, height: bottom - top }
          }

          // ── Per-slide measurement ────────────────────────────────────────

          const slide = document.querySelectorAll(".slide")[slideIdx]
          if (!slide) return null

          // Read the QA flag — true means this slide gets balance/rhythm checks
          const slideQa = (slide as HTMLElement).getAttribute("slide-qa") === "true"

          const canvas = slide.querySelector(".slide-canvas") as HTMLElement | null
          if (!canvas) return null

          const canvasRaw = canvas.getBoundingClientRect()
          // Use canvas top-left as the coordinate origin
          const offsetTop = canvasRaw.top
          const offsetLeft = canvasRaw.left

          const canvasRect = {
            left: 0,
            top: 0,
            right: canvasRaw.width,
            bottom: canvasRaw.height,
            width: canvasRaw.width,
            height: canvasRaw.height,
          }

          const elements = collectChildren(canvas, offsetTop, offsetLeft)

          const titleEl = canvas.querySelector("h1, h2")
          const title = titleEl
            ? (titleEl.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
            : `Slide ${slideIdx + 1}`

          return {
            index: slideIdx,
            title,
            slideQa,
            canvasRect,
            elements,
            contentRect: unionRect(elements),
          }
        },
        idx
      )

      if (slideData) metrics.push(slideData as SlideMetrics)
    }

    return metrics
  } finally {
    await browser.close()
  }
}
