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

import { pathToFileURL } from "url"
import { launchChrome } from "../browser/chrome"

// ── Constants ────────────────────────────────────────────────────────────────

/** The canonical slide canvas size (matches the design system). */
export const CANVAS_W = 1920
export const CANVAS_H = 1080

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
  /** all CSS class names on this element */
  classList: string[]
  /** visible text excerpt for text overflow diagnostics */
  text?: string
  /** whether text content is clipped inside this element */
  textOverflow?: boolean
}

export interface SlideContentStats {
  /** Non-title effective text points: English words + CJK characters. */
  bodyTextPoints: number
  /** Recognizable semantic content units such as boxes, cards, evidence, charts, tables, media, metrics, bullets. */
  contentUnits: number
  /** Evidence/source/caveat-like references visible on the slide. */
  supportReferences: number
}

export interface ScrollbarMetrics {
  documentHorizontal: boolean
  documentVertical: boolean
  bodyHorizontal: boolean
  bodyVertical: boolean
  slideHorizontal: boolean
  slideVertical: boolean
}

export interface SlideNavigationMetrics {
  totalSlides: number
  initialTop: number
  initialLeft: number
  position: string
  visibility: string
  display: string
  ariaHidden: string | null
  bodyOverflowY: string
  documentOverflowY: string
  documentScrollHeight: number
  viewportHeight: number
}

export interface SlideMetrics {
  /** 0-based slide index */
  index: number
  /** slide title extracted from the first h1/h2 inside the slide */
  title: string
  /**
   * Whether this slide is marked as QA-relevant deck metadata.
   * Read from the `slide-qa` attribute on `<section class="slide">`.
   * Defaults to `false` when the attribute is absent.
   * Content-heavy layouts set `slide-qa="true"`; structural/sparse slides omit or use `"false"`.
   */
  slideQa: boolean
  /** bounding box of the slide-canvas element itself (post-scale) */
  canvasRect: Rect
  /** bounding box of the .slide element itself (post-scale) */
  slideRect: Rect
  /** whether document/body/slide has scrollbars at 1920x1080 */
  hasScrollbars: boolean
  /** detailed scrollbar source signals for document/body/slide */
  scrollbars?: ScrollbarMetrics
  /** deck navigation model signals captured before per-slide scrolling */
  navigation?: SlideNavigationMetrics
  /** top-level visible children of .slide-canvas */
  elements: ElementInfo[]
  /** union bounding box of all visible leaf elements */
  contentRect: Rect
  /** text/content-density signals for content slides */
  contentStats: SlideContentStats
}

/**
 * Result returned by measureSlides().
 * Contains per-slide geometry data and CSS class names defined in <style> blocks.
 */
export interface MeasurementResult {
  slides: SlideMetrics[]
  /** All CSS class names defined in <style> blocks of the HTML (deduplicated). */
  cssDefinedClasses: string[]
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Open `htmlFilePath` in a headless Chrome at 1920×1080, measure each slide,
 * and return slide geometry + CSS class names defined in <style> blocks.
 */
export async function measureSlides(htmlFilePath: string): Promise<MeasurementResult> {
  const fileUrl = pathToFileURL(htmlFilePath).href

  const browser = await launchChrome({ width: CANVAS_W, height: CANVAS_H })

  try {
    const page = await browser.newPage()

    // Block all external (http/https) requests — fonts, CDN scripts, images.
    // QA checks are purely geometry-based and do not require network resources.
    // This makes measurement fast and reliable regardless of network conditions.
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const url = req.url()
      if (url.startsWith("https://") || url.startsWith("http://")) {
        req.abort()
      } else {
        req.continue()
      }
    })

    // Set viewport to exact canvas size so scale === 1 (no CSS transform needed).
    await page.setViewport({ width: CANVAS_W, height: CANVAS_H })
    await page.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 15000 })

    // Wait for any entrance animations / intersection observers to fire.
    await new Promise((r) => setTimeout(r, 600))

    // Measure slides one-by-one: scroll each into view, wait for animations,
    // then collect geometry relative to the canvas coordinate system.
    const slideCount: number = await page.evaluate(
      () => document.querySelectorAll(".slide").length
    )

    const navigationData = await page.evaluate(() => {
      const doc = document.documentElement
      const body = document.body
      const docStyle = window.getComputedStyle(doc)
      const bodyStyle = window.getComputedStyle(body)
      const slides = Array.from(document.querySelectorAll(".slide")) as HTMLElement[]
      return slides.map((slide) => {
        const rect = slide.getBoundingClientRect()
        const style = window.getComputedStyle(slide)
        return {
          totalSlides: slides.length,
          initialTop: rect.top,
          initialLeft: rect.left,
          position: style.position,
          visibility: style.visibility,
          display: style.display,
          ariaHidden: slide.getAttribute("aria-hidden"),
          bodyOverflowY: bodyStyle.overflowY,
          documentOverflowY: docStyle.overflowY,
          documentScrollHeight: doc.scrollHeight,
          viewportHeight: window.innerHeight,
        }
      })
    })

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
            classList: string[]
            text?: string
            textOverflow?: boolean
          }

          function textPoints(text: string): number {
            const normalized = text.replace(/\s+/g, " ").trim()
            if (!normalized) return 0
            const cjk = (normalized.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
            const words = (normalized.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ").match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length
            return cjk + words
          }

          function isSemanticContentUnit(el: Element): boolean {
            const tag = el.tagName.toLowerCase()
            if (["li", "table", "figure", "img", "svg", "canvas", "blockquote"].includes(tag)) return true
            const cls = Array.from(el.classList).join(" ")
            return /\b(box|card|claim|evidence|source|caveat|metric|stat|quote|media|chart|echart|table|step|roadmap|toc-item|bullet)\b/i.test(cls)
          }

          function isSupportReference(el: Element): boolean {
            const text = (el.textContent || "").replace(/\s+/g, " ").trim()
            const cls = Array.from(el.classList).join(" ")
            return /\b(evidence|source|caveat|claim|support|citation|note)\b/i.test(cls) || /\b(source|evidence|caveat|claim|来源|证据|出处|风险|假设)\b/i.test(text)
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
              const text = (child.textContent || "").replace(/\s+/g, " ").trim()
              const textOverflow = textPoints(text) > 0 && (
                (child as HTMLElement).scrollHeight > (child as HTMLElement).clientHeight + 2 ||
                (child as HTMLElement).scrollWidth > (child as HTMLElement).clientWidth + 2
              )
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
                classList: Array.from(child.classList),
                text: text.slice(0, 160),
                textOverflow,
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

          // Read the QA flag for deck metadata; default checks do not branch on it.
          const slideQa = (slide as HTMLElement).getAttribute("slide-qa") === "true"

          const canvas = slide.querySelector(".slide-canvas") as HTMLElement | null
          if (!canvas) return null

          const canvasRaw = canvas.getBoundingClientRect()
          const slideRaw = (slide as HTMLElement).getBoundingClientRect()
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

          const slideRect = {
            left: 0,
            top: 0,
            right: slideRaw.width,
            bottom: slideRaw.height,
            width: slideRaw.width,
            height: slideRaw.height,
          }

          const elements = collectChildren(canvas, offsetTop, offsetLeft)

          let bodyTextPoints = 0
          let contentUnits = 0
          let supportReferences = 0
          for (const el of Array.from(canvas.querySelectorAll("*"))) {
            if (!isVisible(el)) continue
            if (/^H[1-2]$/.test(el.tagName)) continue
            const text = (el.textContent || "").replace(/\s+/g, " ").trim()
            if (text) bodyTextPoints += textPoints(text)
            if (isSemanticContentUnit(el)) contentUnits++
            if (isSupportReference(el)) supportReferences++
          }

          const doc = document.documentElement
          const body = document.body
          const slideEl = slide as HTMLElement
          const hasScrollbars =
            doc.scrollWidth > window.innerWidth + 2 ||
            doc.scrollHeight > window.innerHeight + 2 ||
            body.scrollWidth > window.innerWidth + 2 ||
            body.scrollHeight > window.innerHeight + 2 ||
            slideEl.scrollWidth > slideEl.clientWidth + 2 ||
            slideEl.scrollHeight > slideEl.clientHeight + 2

          const scrollbars = {
            documentHorizontal: doc.scrollWidth > window.innerWidth + 2,
            documentVertical: doc.scrollHeight > window.innerHeight + 2,
            bodyHorizontal: body.scrollWidth > window.innerWidth + 2,
            bodyVertical: body.scrollHeight > window.innerHeight + 2,
            slideHorizontal: slideEl.scrollWidth > slideEl.clientWidth + 2,
            slideVertical: slideEl.scrollHeight > slideEl.clientHeight + 2,
          }

          const titleEl = canvas.querySelector("h1, h2")
          const title = titleEl
            ? (titleEl.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
            : `Slide ${slideIdx + 1}`

          return {
            index: slideIdx,
            title,
            slideQa,
            canvasRect,
            slideRect,
            hasScrollbars,
            scrollbars,
            elements,
            contentRect: unionRect(elements),
            contentStats: { bodyTextPoints, contentUnits, supportReferences },
          }
        },
        idx
      )

      if (slideData) metrics.push({ ...(slideData as SlideMetrics), navigation: navigationData[idx] })
    }

    // Extract all CSS class names defined in <style> blocks.
    // Uses the browser's CSSStyleRule API for reliable selector parsing.
    const cssDefinedClasses = await page.evaluate((): string[] => {
      const classes: string[] = []
      const classRe = /\.([a-zA-Z_][\w-]*)/g
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSStyleRule) {
              let m: RegExpExecArray | null
              classRe.lastIndex = 0
              while ((m = classRe.exec(rule.selectorText)) !== null) {
                classes.push(m[1])
              }
            }
          }
        } catch {
          // Cross-origin or inaccessible sheets (e.g. external CDN) will throw
        }
      }
      return [...new Set(classes)]
    })

    return { slides: metrics, cssDefinedClasses }
  } finally {
    await browser.close()
  }
}
