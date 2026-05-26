import type { Browser } from "puppeteer-core"
import { pathToFileURL } from "url"
import { launchChrome } from "../browser/chrome"

export interface DeckDetectionResult {
  isDeck: boolean
  slideCount: number
  reason: string
}

export async function detectDeckHtml(htmlFilePath: string): Promise<DeckDetectionResult> {
  const browser = await launchChrome({ allowFileAccess: true })
  try {
    return await detectDeckHtmlWithBrowser(browser, htmlFilePath)
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export async function detectDeckHtmlWithBrowser(browser: Browser, htmlFilePath: string): Promise<DeckDetectionResult> {
  const page = await browser.newPage()
  try {
    await page.goto(pathToFileURL(htmlFilePath).href, { waitUntil: "domcontentloaded", timeout: 15000 })
    return await page.evaluate(() => {
      const CANVAS_WIDTH = 1920
      const CANVAS_HEIGHT = 1080
      const DIMENSION_TOLERANCE = 2
      const isDeckCanvasSize = (el: HTMLElement): boolean => {
        const rect = el.getBoundingClientRect()
        return (
          Math.abs(rect.width - CANVAS_WIDTH) <= DIMENSION_TOLERANCE &&
          Math.abs(rect.height - CANVAS_HEIGHT) <= DIMENSION_TOLERANCE
        )
      }

      const slides = Array.from(document.querySelectorAll(".slide")) as HTMLElement[]
      if (slides.length === 0) {
        return { isDeck: false, slideCount: 0, reason: "no .slide elements found" }
      }

      const indexValues = slides.map((slide) => slide.getAttribute("data-slide-index"))
      const seen = new Set<number>()
      for (let i = 0; i < indexValues.length; i++) {
        const raw = indexValues[i]
        if (raw === null || raw.trim() === "") {
          return {
            isDeck: false,
            slideCount: slides.length,
            reason: `slide ${i + 1} is missing data-slide-index`,
          }
        }

        const parsed = Number(raw)
        if (!Number.isInteger(parsed) || parsed < 1) {
          return {
            isDeck: false,
            slideCount: slides.length,
            reason: `slide ${i + 1} has invalid data-slide-index "${raw}"`,
          }
        }
        if (seen.has(parsed)) {
          return {
            isDeck: false,
            slideCount: slides.length,
            reason: `duplicate data-slide-index "${parsed}"`,
          }
        }
        if (parsed !== i + 1) {
          return {
            isDeck: false,
            slideCount: slides.length,
            reason: `slide ${i + 1} has data-slide-index "${parsed}", expected "${i + 1}"`,
          }
        }
        seen.add(parsed)
      }

      let usedSlideAsCanvas = false
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]
        if (slide.querySelector(".slide-canvas")) continue
        if (isDeckCanvasSize(slide)) {
          usedSlideAsCanvas = true
          continue
        }
        return {
          isDeck: false,
          slideCount: slides.length,
          reason: `.slide ${i + 1} has no .slide-canvas and is not 1920x1080`,
        }
      }

      return {
        isDeck: true,
        slideCount: slides.length,
        reason: usedSlideAsCanvas
          ? "valid deck contract: slide-as-canvas"
          : "valid deck contract: slide-canvas",
      }
    })
  } finally {
    await page.close().catch(() => undefined)
  }
}
