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
      const slides = Array.from(document.querySelectorAll(".slide")) as HTMLElement[]
      if (slides.length === 0) {
        return { isDeck: false, slideCount: 0, reason: "no .slide elements found" }
      }

      const missingCanvas = slides.findIndex((slide) => !slide.querySelector(".slide-canvas"))
      if (missingCanvas >= 0) {
        return {
          isDeck: false,
          slideCount: slides.length,
          reason: `.slide ${missingCanvas + 1} has no .slide-canvas`,
        }
      }

      const indexValues = slides
        .map((slide) => slide.getAttribute("data-slide-index"))
        .filter((value): value is string => value !== null && value.trim() !== "")

      if (indexValues.length > 0) {
        if (indexValues.length !== slides.length) {
          return {
            isDeck: false,
            slideCount: slides.length,
            reason: "some slides have data-slide-index and some do not",
          }
        }

        const seen = new Set<number>()
        for (let i = 0; i < indexValues.length; i++) {
          const parsed = Number(indexValues[i])
          if (!Number.isInteger(parsed) || parsed < 1) {
            return {
              isDeck: false,
              slideCount: slides.length,
              reason: `slide ${i + 1} has invalid data-slide-index "${indexValues[i]}"`,
            }
          }
          if (seen.has(parsed)) {
            return {
              isDeck: false,
              slideCount: slides.length,
              reason: `duplicate data-slide-index "${parsed}"`,
            }
          }
          seen.add(parsed)
        }
      }

      return { isDeck: true, slideCount: slides.length, reason: "valid deck contract" }
    })
  } finally {
    await page.close().catch(() => undefined)
  }
}
