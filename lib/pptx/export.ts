/**
 * lib/pptx/export.ts
 *
 * HTML -> PPTX export using Puppeteer + dom-to-pptx.
 *
 * Export strategy:
 * 1. Open the HTML in Chrome at a fixed 1920x1080 viewport
 * 2. Normalize reveal state and rasterize ECharts into <img>
 * 3. Export each .slide-canvas as an isolated single-slide PPTX
 * 4. Merge the single-slide PPTX packages into one editable deck
 *
 * This avoids the unstable whole-deck batch export path while keeping slides
 * editable whenever dom-to-pptx can represent them.
 */

import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { DOMParser, XMLSerializer } from "@xmldom/xmldom"
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { createRequire } from "module"
import { basename, dirname, extname, join, posix as pathPosix, resolve } from "path"
import { randomBytes } from "crypto"
import { pathToFileURL } from "url"

const CANVAS_W = 1920
const CANVAS_H = 1080
const PPT_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const requireFromExportModule = createRequire(import.meta.url)

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
]

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".bmp"])
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
}
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

type ZipFiles = Record<string, Uint8Array>
type XmlDoc = ReturnType<typeof parseXml>

interface SlideMeta {
  index: number
  pageNo: string | null
  title: string | null
}

interface ExportedSlide extends SlideMeta {
  bytes: Uint8Array
}

interface SlideFailure extends SlideMeta {
  error: string
  diagnostics: string[]
}

interface ExportAttemptOptions {
  autoEmbedFonts: boolean
}

interface PreparedPage {
  page: Page
  slideCount: number
  diagnostics: string[]
}

interface ContentTypesIndex {
  defaults: Map<string, string>
  overrides: Map<string, string>
}

export interface ExportPptxProgress {
  kind: "stage" | "slide"
  message: string
  current?: number
  total?: number
}

export interface ExportPptxOptions {
  onProgress?: (progress: ExportPptxProgress) => void | Promise<void>
}

export interface ExportPptxTimings {
  prepareMs: number
  pageSetupMs: number
  slideExportMs: number
  mergeMs: number
  writeMs: number
}

export interface ExportPptxResult {
  outputPath: string
  slideCount: number
  durationMs: number
  timingsMs: ExportPptxTimings
}

interface LocalizeExternalImagesResult {
  html: string
  foundCount: number
  localizedCount: number
}

function findChromePath(): string {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  throw new Error(
    "Could not find a Chrome/Chromium installation.\n" +
    "Tried:\n" + CHROME_PATHS.map((p) => `  ${p}`).join("\n")
  )
}

async function launchBrowser(executablePath: string): Promise<Browser> {
  return await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--allow-file-access-from-files",
      `--window-size=${CANVAS_W},${CANVAS_H}`,
    ],
  })
}

export function derivePptxPath(htmlFilePath: string): string {
  const abs = resolve(htmlFilePath)
  const dir = dirname(abs)
  const name = basename(abs).replace(/\.html?$/i, "")
  return join(dir, `${name}.pptx`)
}

export function resolveDomToPptxBundlePath(): string {
  const entryPath = requireFromExportModule.resolve("dom-to-pptx")
  const bundlePath = join(dirname(entryPath), "dom-to-pptx.bundle.js")

  if (!existsSync(bundlePath)) {
    throw new Error(`dom-to-pptx browser bundle not found: ${bundlePath}`)
  }

  return bundlePath
}

function isLocalImageRef(ref: string): boolean {
  const pathPart = ref.split(/[?#]/)[0]
  return IMAGE_EXTS.has(extname(pathPart).toLowerCase())
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

async function inlineImageAssets(htmlContent: string, htmlFilePath: string): Promise<string> {
  const baseDir = dirname(resolve(htmlFilePath))
  const urlPattern = /(?:src=["']|url\(["']?)([^"')>\s]+)/g
  const refs = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = urlPattern.exec(htmlContent)) !== null) {
    refs.add(match[1])
  }

  if (refs.size === 0) return htmlContent

  const replacements = new Map<string, string>()
  await Promise.allSettled(
    Array.from(refs).map(async (ref) => {
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

async function localizeExternalImages(htmlContent: string, tmpDir: string): Promise<LocalizeExternalImagesResult> {
  const urlPattern = /(?:src=["']|url\(["']?)(https?:\/\/[^"')>\s]+)/g
  const uniqueUrls = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = urlPattern.exec(htmlContent)) !== null) {
    uniqueUrls.add(match[1])
  }

  if (uniqueUrls.size === 0) {
    return {
      html: htmlContent,
      foundCount: 0,
      localizedCount: 0,
    }
  }

  const urlToLocal = new Map<string, string>()

  await Promise.allSettled(
    Array.from(uniqueUrls).map(async (url, i) => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          },
        })
        clearTimeout(timer)

        if (!res.ok) return

        const contentType = res.headers.get("content-type") ?? ""
        const mimeBase = contentType.split(";")[0].trim().toLowerCase()

        let ext = extname(new URL(url).pathname).toLowerCase()
        if (!ext || ext.length > 6) {
          ext = MIME_TO_EXT[mimeBase] ?? ".bin"
        }

        const localPath = join(tmpDir, `img-${i}${ext}`)
        const buf = new Uint8Array(await res.arrayBuffer())
        writeFileSync(localPath, buf)
        urlToLocal.set(url, pathToFileURL(localPath).href)
      } catch {
        // Preserve original URL on per-image failure.
      }
    })
  )

  let patched = htmlContent
  for (const [original, local] of urlToLocal) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    patched = patched.replace(new RegExp(escaped, "g"), local)
  }

  return {
    html: patched,
    foundCount: uniqueUrls.size,
    localizedCount: urlToLocal.size,
  }
}

async function emitProgress(
  options: ExportPptxOptions | undefined,
  progress: ExportPptxProgress,
): Promise<void> {
  await options?.onProgress?.(progress)
}

function attachDiagnostics(page: Page, diagnostics: string[]): void {
  page.on("pageerror", (error) => {
    const message = error instanceof Error ? error.message : String(error)
    diagnostics.push(`pageerror: ${message}`)
  })
  page.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error)
    diagnostics.push(`error: ${message}`)
  })
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warn") {
      diagnostics.push(`console.${msg.type()}: ${msg.text()}`)
    }
  })
}

async function preparePage(
  browser: Browser,
  htmlPath: string,
  domToPptxBundlePath: string,
): Promise<PreparedPage> {
  const page = await browser.newPage()
  const diagnostics: string[] = []
  attachDiagnostics(page, diagnostics)

  await page.setViewport({ width: CANVAS_W, height: CANVAS_H })
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForSelector(".slide", { timeout: 30000 })
  await page.addScriptTag({ path: domToPptxBundlePath })

  const slideCount = await page.evaluate(async () => {
    await document.fonts.ready

    document.documentElement.style.scrollSnapType = "none"
    document.documentElement.style.overflow = "visible"
    document.body.style.overflow = "visible"

    const slides = Array.from(document.querySelectorAll(".slide")) as HTMLElement[]
    if (slides.length === 0) {
      throw new Error(
        "No .slide elements found in the HTML file.\nMake sure this is a revela-generated slide deck."
      )
    }

    slides.forEach((slide, index) => {
      slide.setAttribute("data-export-slide-index", String(index))
      slide.querySelectorAll(".reveal").forEach((el) => {
        const htmlEl = el as HTMLElement
        htmlEl.dataset.exportOriginalVisible = htmlEl.classList.contains("visible") ? "1" : "0"
      })
    })

    const canvases = Array.from(document.querySelectorAll(".slide-canvas")) as HTMLElement[]
    let exportStyle = document.getElementById("revela-pptx-export-style") as HTMLStyleElement | null
    if (!exportStyle) {
      exportStyle = document.createElement("style")
      exportStyle.id = "revela-pptx-export-style"
      exportStyle.textContent = `
        .slide-canvas {
          transform: none !important;
          transform-origin: top left !important;
          transition: none !important;
          animation: none !important;
        }
        .slide-canvas * {
          transition: none !important;
          animation: none !important;
        }
      `
      document.head.appendChild(exportStyle)
    }

    canvases.forEach((canvas, index) => {
      canvas.setAttribute("data-export-canvas-index", String(index))
    })

    const rasterizeNodeAsImage = (node: HTMLElement, dataUrl: string) => {
      const img = document.createElement("img")
      img.src = dataUrl
      img.alt = "Rasterized chart"
      img.width = node.clientWidth || node.scrollWidth || 1
      img.height = node.clientHeight || node.scrollHeight || 1
      img.style.width = "100%"
      img.style.height = "100%"
      img.style.display = "block"
      img.style.objectFit = "contain"
      node.replaceChildren(img)
    }

    const echartsApi = (window as any).echarts
    const chartNodes = Array.from(document.querySelectorAll(".echart-container")) as HTMLElement[]
    for (const node of chartNodes) {
      let dataUrl: string | null = null
      if (echartsApi?.getInstanceByDom) {
        const chart = echartsApi.getInstanceByDom(node)
        if (chart?.getDataURL) {
          try {
            dataUrl = chart.getDataURL({
              type: "png",
              pixelRatio: 2,
              backgroundColor: "transparent",
              excludeComponents: ["toolbox"],
            })
          } catch {
            dataUrl = null
          }
        }
      }

      if (!dataUrl) {
        const fallbackCanvas = node.querySelector("canvas") as HTMLCanvasElement | null
        if (fallbackCanvas) {
          try {
            dataUrl = fallbackCanvas.toDataURL("image/png")
          } catch {
            dataUrl = null
          }
        }
      }

      if (dataUrl) rasterizeNodeAsImage(node, dataUrl)
    }

    return canvases.length
  })

  return { page, slideCount, diagnostics }
}

async function readSlideMeta(
  page: Page,
  slideCount: number,
): Promise<SlideMeta[]> {
  const meta = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".slide")).map((slide, index) => {
      const pageNo =
        Array.from(slide.querySelectorAll("div"))
          .map((el) => el.textContent?.trim() ?? "")
          .find((text) => /^\d{2}$/.test(text)) ?? null
      const title = slide.querySelector("h1,h2,h3")?.textContent?.trim()?.slice(0, 120) ?? null
      return { index, pageNo, title }
    })
  })

  return Array.from({ length: slideCount }, (_, index) => {
    return meta[index] ?? { index, pageNo: null, title: null }
  })
}

async function exportSlidePptx(
  page: Page,
  diagnostics: string[],
  slide: SlideMeta,
  options: ExportAttemptOptions,
): Promise<ExportedSlide> {
  const diagStart = diagnostics.length
  try {
    const pptxBytes = await page.evaluate(async ({ index, autoEmbedFonts }) => {
      const domToPptx = (window as any).domToPptx
      const slides = Array.from(document.querySelectorAll(".slide")) as HTMLElement[]
      const targetSlide = slides[index]
      const target = document.querySelectorAll(".slide-canvas")[index] as HTMLElement | undefined
      if (!domToPptx?.exportToPptx) {
        throw new Error("dom-to-pptx bundle did not initialize correctly.")
      }
      if (!targetSlide) {
        throw new Error(`Missing .slide for slide ${index + 1}`)
      }
      if (!target) {
        throw new Error(`Missing .slide-canvas for slide ${index + 1}`)
      }

      for (const slideEl of slides) {
        const isTargetSlide = slideEl === targetSlide
        slideEl.dataset.exportActive = isTargetSlide ? "1" : "0"
        slideEl.querySelectorAll(".reveal").forEach((el) => {
          const htmlEl = el as HTMLElement
          const wasVisible = htmlEl.dataset.exportOriginalVisible === "1"
          htmlEl.classList.toggle("visible", wasVisible || isTargetSlide)
        })
      }

      target.scrollIntoView({ block: "center", inline: "center" })
      target.style.transform = "none"
      target.style.transformOrigin = "top left"
      target.style.transition = "none"
      target.style.animation = "none"
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      await Promise.all(
        Array.from(target.querySelectorAll("img")).map(async (img) => {
          if (img.complete) return
          await new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true })
            img.addEventListener("error", resolve, { once: true })
          })
        })
      )

      const blob: Blob = await domToPptx.exportToPptx(target, {
        fileName: `slide-${index + 1}.pptx`,
        skipDownload: true,
        svgAsVector: false,
        autoEmbedFonts,
        width: 10,
        height: 5.625,
      })
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    }, { index: slide.index, autoEmbedFonts: options.autoEmbedFonts })

    return {
      ...slide,
      bytes: Uint8Array.from(pptxBytes),
    }
  } catch (error) {
    throw formatSlideFailure(error, diagnostics.slice(diagStart ?? 0), slide)
  }
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, "text/xml")
}

function xmlToBytes(doc: XmlDoc): Uint8Array {
  return strToU8(new XMLSerializer().serializeToString(doc))
}

function getFileText(files: ZipFiles, path: string): string {
  const file = files[path]
  if (!file) throw new Error(`Missing PPTX part: ${path}`)
  return strFromU8(file)
}

function readContentTypes(files: ZipFiles): ContentTypesIndex {
  const doc = parseXml(getFileText(files, "[Content_Types].xml"))
  const defaults = new Map<string, string>()
  const overrides = new Map<string, string>()

  for (const node of Array.from(doc.getElementsByTagName("Default"))) {
    const ext = node.getAttribute("Extension")
    const contentType = node.getAttribute("ContentType")
    if (ext && contentType) defaults.set(ext, contentType)
  }

  for (const node of Array.from(doc.getElementsByTagName("Override"))) {
    const partName = node.getAttribute("PartName")
    const contentType = node.getAttribute("ContentType")
    if (partName && contentType) overrides.set(partName, contentType)
  }

  return { defaults, overrides }
}

function upsertDefault(doc: XmlDoc, ext: string, contentType: string): void {
  const types = doc.getElementsByTagName("Types")[0]
  const existing = Array.from(doc.getElementsByTagName("Default")).find(
    (node) => node.getAttribute("Extension") === ext
  )
  if (existing) {
    existing.setAttribute("ContentType", contentType)
    return
  }

  const node = doc.createElement("Default")
  node.setAttribute("Extension", ext)
  node.setAttribute("ContentType", contentType)
  types.appendChild(node)
}

function upsertOverride(doc: XmlDoc, partName: string, contentType: string): void {
  const types = doc.getElementsByTagName("Types")[0]
  const existing = Array.from(doc.getElementsByTagName("Override")).find(
    (node) => node.getAttribute("PartName") === partName
  )
  if (existing) {
    existing.setAttribute("ContentType", contentType)
    return
  }

  const node = doc.createElement("Override")
  node.setAttribute("PartName", partName)
  node.setAttribute("ContentType", contentType)
  types.appendChild(node)
}

function relsPathForPart(partPath: string): string {
  const dir = pathPosix.dirname(partPath)
  const base = pathPosix.basename(partPath)
  return pathPosix.join(dir, "_rels", `${base}.rels`)
}

function ownerPartForRels(relsPath: string): string {
  return relsPath.replace(/\/_[Rr]els\//, "/").replace(/\.rels$/, "")
}

function resolveRelationshipTarget(ownerPartPath: string, target: string): string {
  const baseDir = pathPosix.dirname(ownerPartPath)
  return pathPosix.normalize(pathPosix.join(baseDir, target))
}

function relativeTarget(ownerPartPath: string, targetPartPath: string): string {
  const baseDir = pathPosix.dirname(ownerPartPath)
  return pathPosix.relative(baseDir, targetPartPath)
}

function isSharedPart(partPath: string): boolean {
  return (
    /^ppt\/(slideLayouts|slideMasters|theme|notesMasters)\//.test(partPath) ||
    partPath === "ppt/presProps.xml" ||
    partPath === "ppt/viewProps.xml" ||
    partPath === "ppt/tableStyles.xml"
  )
}

function maxIndexedFile(files: ZipFiles, pattern: RegExp): number {
  let max = 0
  for (const path of Object.keys(files)) {
    const match = path.match(pattern)
    if (!match) continue
    max = Math.max(max, Number(match[1]))
  }
  return max
}

function nextAvailablePath(files: ZipFiles, originalPath: string): string {
  const dir = pathPosix.dirname(originalPath)
  const ext = pathPosix.extname(originalPath)
  const base = pathPosix.basename(originalPath, ext)
  let counter = 1
  let candidate = originalPath

  while (files[candidate]) {
    candidate = pathPosix.join(dir, `${base}-import${counter}${ext}`)
    counter += 1
  }

  return candidate
}

function getMaxPresentationRelId(doc: XmlDoc): number {
  let max = 0
  for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id")
    const match = id?.match(/^rId(\d+)$/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max
}

function setSlideName(files: ZipFiles, slidePath: string, label: string): void {
  const doc = parseXml(getFileText(files, slidePath))
  const cSld = doc.getElementsByTagName("p:cSld")[0]
  if (cSld) cSld.setAttribute("name", label)
  files[slidePath] = xmlToBytes(doc)
}

function setNotesSlideNumber(files: ZipFiles, notesPath: string, number: number): void {
  const doc = parseXml(getFileText(files, notesPath))
  const fields = Array.from(doc.getElementsByTagName("a:fld"))
  for (const field of fields) {
    if (field.getAttribute("type") !== "slidenum") continue
    const textNode = Array.from(field.childNodes).find((node) => node.nodeName === "a:t")
    if (textNode) {
      textNode.textContent = String(number)
    }
  }
  files[notesPath] = xmlToBytes(doc)
}

function updateAppProperties(files: ZipFiles, slideCount: number): void {
  const doc = parseXml(getFileText(files, "docProps/app.xml"))
  const setText = (tag: string, value: string) => {
    const node = doc.getElementsByTagName(tag)[0]
    if (node) node.textContent = value
  }

  setText("Slides", String(slideCount))
  setText("Notes", String(slideCount))

  const titlesNode = doc.getElementsByTagName("TitlesOfParts")[0]
  const titlesVector = titlesNode?.getElementsByTagName("vt:vector")[0]
  if (titlesVector) {
    const preserved = Array.from(titlesVector.getElementsByTagName("vt:lpstr"))
      .map((node) => node.textContent ?? "")
      .filter((text) => !/^Slide \d+$/.test(text))

    while (titlesVector.firstChild) titlesVector.removeChild(titlesVector.firstChild)
    for (const text of [...preserved, ...Array.from({ length: slideCount }, (_, i) => `Slide ${i + 1}`)]) {
      const node = doc.createElement("vt:lpstr")
      node.appendChild(doc.createTextNode(text))
      titlesVector.appendChild(node)
    }
    titlesVector.setAttribute("size", String(preserved.length + slideCount))
  }

  const variants = Array.from(doc.getElementsByTagName("vt:variant"))
  for (let i = 0; i < variants.length - 1; i += 1) {
    const label = variants[i].textContent?.trim()
    if (label !== "Slide Titles") continue
    const countNode = variants[i + 1].getElementsByTagName("vt:i4")[0]
    if (countNode) countNode.textContent = String(slideCount)
    break
  }

  files["docProps/app.xml"] = xmlToBytes(doc)
}

function formatBrowserCrash(error: unknown, diagnostics: string[]): string {
  const message = error instanceof Error ? error.message : String(error)
  const detail = diagnostics.length > 0 ? ` [${diagnostics.join(" | ")}]` : ""

  if (/Target closed|Session closed|Target page, context or browser has been closed/i.test(message)) {
    return "Chrome page crashed during PPTX export." + detail
  }

  return `${message}${detail}`
}

function formatSlideFailure(error: unknown, diagnostics: string[], slide: SlideMeta): Error {
  const label = slide.pageNo ? `slide ${slide.pageNo}` : `slide #${slide.index + 1}`
  const title = slide.title ? ` (${slide.title})` : ""
  return new Error(`${label}${title}: ${formatBrowserCrash(error, diagnostics)}`)
}

function mergeSingleSlidePptx(slides: ExportedSlide[]): Uint8Array {
  if (slides.length === 0) {
    throw new Error("No slides were exported.")
  }

  const mergedFiles: ZipFiles = { ...unzipSync(slides[0].bytes) }
  const contentTypesDoc = parseXml(getFileText(mergedFiles, "[Content_Types].xml"))
  const presentationDoc = parseXml(getFileText(mergedFiles, "ppt/presentation.xml"))
  const presentationRelsDoc = parseXml(getFileText(mergedFiles, "ppt/_rels/presentation.xml.rels"))
  const contentTypes = readContentTypes(mergedFiles)

  const sldIdLst = presentationDoc.getElementsByTagName("p:sldIdLst")[0]
  const relRoot = presentationRelsDoc.getElementsByTagName("Relationships")[0]
  if (!sldIdLst || !relRoot) {
    throw new Error("PPTX merge failed: missing presentation slide list.")
  }

  let nextSlideNumber = maxIndexedFile(mergedFiles, /^ppt\/slides\/slide(\d+)\.xml$/) + 1
  let nextNotesNumber = maxIndexedFile(mergedFiles, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/) + 1
  let nextSlideId = Math.max(maxIndexedFile(mergedFiles, /^ppt\/slides\/slide(\d+)\.xml$/) + 255, 256)
  for (const node of Array.from(sldIdLst.getElementsByTagName("p:sldId"))) {
    const id = Number(node.getAttribute("id") ?? "0")
    nextSlideId = Math.max(nextSlideId, id + 1)
  }
  let nextPresentationRelId = getMaxPresentationRelId(presentationRelsDoc) + 1

  setSlideName(mergedFiles, "ppt/slides/slide1.xml", "Slide 1")
  setNotesSlideNumber(mergedFiles, "ppt/notesSlides/notesSlide1.xml", 1)

  for (let slideIdx = 1; slideIdx < slides.length; slideIdx += 1) {
    const sourceFiles: ZipFiles = { ...unzipSync(slides[slideIdx].bytes) }
    const sourceTypes = readContentTypes(sourceFiles)
    const pathMap = new Map<string, string>()

    const importPart = (sourcePartPath: string): string => {
      if (pathMap.has(sourcePartPath)) return pathMap.get(sourcePartPath)!
      if (isSharedPart(sourcePartPath)) return sourcePartPath

      let destPath: string
      if (sourcePartPath === "ppt/slides/slide1.xml") {
        destPath = `ppt/slides/slide${nextSlideNumber}.xml`
      } else if (sourcePartPath === "ppt/notesSlides/notesSlide1.xml") {
        destPath = `ppt/notesSlides/notesSlide${nextNotesNumber}.xml`
      } else {
        destPath = nextAvailablePath(mergedFiles, sourcePartPath)
      }

      pathMap.set(sourcePartPath, destPath)
      const file = sourceFiles[sourcePartPath]
      if (!file) {
        throw new Error(`PPTX merge failed: missing source part ${sourcePartPath}`)
      }
      mergedFiles[destPath] = file

      const overrideType = sourceTypes.overrides.get(`/${sourcePartPath}`)
      if (overrideType) {
        upsertOverride(contentTypesDoc, `/${destPath}`, overrideType)
      } else {
        const ext = pathPosix.extname(destPath).slice(1)
        if (ext) {
          const contentType = sourceTypes.defaults.get(ext) ?? contentTypes.defaults.get(ext)
          if (contentType) upsertDefault(contentTypesDoc, ext, contentType)
        }
      }

      const sourceRelsPath = relsPathForPart(sourcePartPath)
      if (sourceFiles[sourceRelsPath]) {
        const ownerDestPath = destPath
        const relsDoc = parseXml(getFileText(sourceFiles, sourceRelsPath))
        for (const rel of Array.from(relsDoc.getElementsByTagName("Relationship"))) {
          if (rel.getAttribute("TargetMode") === "External") continue
          const target = rel.getAttribute("Target")
          if (!target) continue
          const targetSourcePath = resolveRelationshipTarget(sourcePartPath, target)
          const targetDestPath = isSharedPart(targetSourcePath) ? targetSourcePath : importPart(targetSourcePath)
          rel.setAttribute("Target", relativeTarget(ownerDestPath, targetDestPath))
        }
        mergedFiles[relsPathForPart(destPath)] = xmlToBytes(relsDoc)
      }

      return destPath
    }

    const slidePath = importPart("ppt/slides/slide1.xml")
    const notesPath = pathMap.get("ppt/notesSlides/notesSlide1.xml") ?? null

    setSlideName(mergedFiles, slidePath, `Slide ${slideIdx + 1}`)
    if (notesPath && mergedFiles[notesPath]) {
      setNotesSlideNumber(mergedFiles, notesPath, slideIdx + 1)
    }

    const relId = `rId${nextPresentationRelId}`
    const relNode = presentationRelsDoc.createElement("Relationship")
    relNode.setAttribute("Id", relId)
    relNode.setAttribute("Type", `${PPT_REL_NS}/slide`)
    relNode.setAttribute("Target", pathPosix.relative("ppt", slidePath))
    relRoot.appendChild(relNode)

    const slideNode = presentationDoc.createElement("p:sldId")
    slideNode.setAttribute("id", String(nextSlideId))
    slideNode.setAttribute("r:id", relId)
    sldIdLst.appendChild(slideNode)

    nextSlideNumber += 1
    nextNotesNumber += notesPath ? 1 : 0
    nextSlideId += 1
    nextPresentationRelId += 1
  }

  mergedFiles["[Content_Types].xml"] = xmlToBytes(contentTypesDoc)
  mergedFiles["ppt/presentation.xml"] = xmlToBytes(presentationDoc)
  mergedFiles["ppt/_rels/presentation.xml.rels"] = xmlToBytes(presentationRelsDoc)
  updateAppProperties(mergedFiles, slides.length)

  return zipSync(mergedFiles, { level: 0 })
}

export async function exportToPptx(
  htmlFilePath: string,
  options?: ExportPptxOptions,
): Promise<ExportPptxResult> {
  const startMs = Date.now()
  const abs = resolve(htmlFilePath)
  const domToPptxBundlePath = resolveDomToPptxBundlePath()

  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }
  if (!/\.html?$/i.test(abs)) {
    throw new Error(`Not an HTML file: ${abs}`)
  }

  const outputPath = derivePptxPath(abs)
  const executablePath = findChromePath()
  const tmpDir = join("/tmp", `revela-pptx-${randomBytes(6).toString("hex")}`)
  mkdirSync(tmpDir, { recursive: true })
  const timingsMs: ExportPptxTimings = {
    prepareMs: 0,
    pageSetupMs: 0,
    slideExportMs: 0,
    mergeMs: 0,
    writeMs: 0,
  }

  let tmpHtmlPath = abs
  try {
    await emitProgress(options, {
      kind: "stage",
      message: "Preparing HTML and localizing remote assets...",
    })
    const prepareStart = Date.now()
    const originalHtml = readFileSync(abs, "utf-8")
    const localized = await localizeExternalImages(originalHtml, tmpDir)
    const patchedHtml = await inlineImageAssets(localized.html, abs)
    tmpHtmlPath = join(tmpDir, "index.html")
    writeFileSync(tmpHtmlPath, patchedHtml, "utf-8")
    timingsMs.prepareMs = Date.now() - prepareStart
    await emitProgress(options, {
      kind: "stage",
      message: localized.foundCount > 0
        ? `Prepared export HTML. Localized ${localized.localizedCount}/${localized.foundCount} remote image assets.`
        : "Prepared export HTML.",
    })
  } catch {
    tmpHtmlPath = abs
    timingsMs.prepareMs = 0
  }

  await emitProgress(options, {
    kind: "stage",
    message: "Launching Chrome and preparing slide DOM...",
  })
  const browser = await launchBrowser(executablePath)

  try {
    const pageSetupStart = Date.now()
    const { page, slideCount, diagnostics } = await preparePage(browser, tmpHtmlPath, domToPptxBundlePath)
    timingsMs.pageSetupMs = Date.now() - pageSetupStart
    const exported: ExportedSlide[] = []
    const failures: SlideFailure[] = []

    try {
      const slides = await readSlideMeta(page, slideCount)
      await emitProgress(options, {
        kind: "stage",
        message: `Deck ready. Exporting ${slides.length} slide(s) to editable PPTX parts...`,
      })

      const slideExportStart = Date.now()
      for (const slide of slides) {
        await emitProgress(options, {
          kind: "slide",
          message: `Exporting slide ${slide.index + 1}/${slides.length}${slide.title ? `: ${slide.title}` : ""}`,
          current: slide.index + 1,
          total: slides.length,
        })
        try {
          exported.push(
            await exportSlidePptx(page, diagnostics, slide, {
              autoEmbedFonts: false,
            })
          )
        } catch (error) {
          failures.push({
            ...slide,
            error: error instanceof Error ? error.message : String(error),
            diagnostics: [],
          })
        }
      }
      timingsMs.slideExportMs = Date.now() - slideExportStart

      if (failures.length > 0) {
        const summary = failures
          .map((slide) => `- ${slide.error}`)
          .join("\n")
        throw new Error(
          `Editable PPTX export failed on ${failures.length} slide(s):\n${summary}\n\n` +
          "No screenshot fallback was used. Fix the failing slide styles/resources and retry."
        )
      }

      await emitProgress(options, {
        kind: "stage",
        message: "Merging slide parts into final PPTX package...",
      })
      const mergeStart = Date.now()
      const pptxBytes = mergeSingleSlidePptx(exported)
      timingsMs.mergeMs = Date.now() - mergeStart

      await emitProgress(options, {
        kind: "stage",
        message: "Writing PPTX file to disk...",
      })
      const writeStart = Date.now()
      writeFileSync(outputPath, pptxBytes)
      timingsMs.writeMs = Date.now() - writeStart

      await emitProgress(options, {
        kind: "stage",
        message: `PPTX export complete: ${exported.length} slide(s) written.`,
      })

      return {
        outputPath,
        slideCount: exported.length,
        durationMs: Date.now() - startMs,
        timingsMs,
      }
    } finally {
      await page.close().catch(() => undefined)
    }
  } finally {
    await browser.close().catch(() => undefined)
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Non-fatal.
    }
  }
}
