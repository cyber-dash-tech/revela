import { readFileSync } from "fs"
import type { DesignClassVocabulary } from "../design/designs"
import type { LayoutIssue, QAReport, SlideReport } from "./checks"

interface ClassUse {
  className: string
  selector: string
  location: "html_class" | "style_rule"
  line: number
  tagName?: string
  classAttr?: string
  excerpt: string
}

interface SlideClassUses {
  title: string
  uses: ClassUse[]
}

function isExemptClass(cls: string, prefixExemptions: string[]): boolean {
  return prefixExemptions.some((prefix) => cls.startsWith(prefix))
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function extractTitle(html: string, index: number): string {
  const match = /<(?:h1|h2|h3|title)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|title)>/i.exec(html)
  const title = match ? stripTags(match[1]).slice(0, 80) : ""
  return title || `Slide ${index + 1}`
}

function lineNumberAt(value: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i++) {
    if (value.charCodeAt(i) === 10) line++
  }
  return line
}

function normalizeExcerpt(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function extractClassUses(html: string, fullHtml = html, baseOffset = 0): ClassUse[] {
  const uses: ClassUse[] = []
  const classAttrRe = /class\s*=\s*(["'])([\s\S]*?)\1/gi
  let match: RegExpExecArray | null

  while ((match = classAttrRe.exec(html)) !== null) {
    const raw = match[2] || ""
    const absoluteOffset = baseOffset + match.index
    const tagStart = html.lastIndexOf("<", match.index)
    const tagEnd = html.indexOf(">", match.index)
    const tag = tagStart >= 0 && tagEnd >= 0 ? html.slice(tagStart, tagEnd + 1) : match[0]
    const tagNameMatch = /^<\s*([\w:-]+)/.exec(tag)
    const tagName = tagNameMatch?.[1]
    const excerpt = normalizeExcerpt(tag)

    for (const cls of raw.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
      uses.push({
        className: cls,
        selector: `.${cls}`,
        location: "html_class",
        line: lineNumberAt(fullHtml, absoluteOffset),
        tagName,
        classAttr: raw,
        excerpt,
      })
    }
  }

  return uses
}

function extractSlideClassUses(html: string): SlideClassUses[] {
  const slides: SlideClassUses[] = []
  const sectionRe = /<section\b[\s\S]*?<\/section>/gi
  let match: RegExpExecArray | null
  let index = 0

  while ((match = sectionRe.exec(html)) !== null) {
    const chunk = match[0]
    slides.push({ title: extractTitle(chunk, index), uses: extractClassUses(chunk, html, match.index) })
    index++
  }

  if (slides.length === 0) {
    slides.push({ title: extractTitle(html, 0), uses: extractClassUses(html) })
  }

  return slides
}

function extractCssDefinedClasses(html: string): ClassUse[] {
  const classes = new Map<string, ClassUse>()
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  const classRe = /\.([a-zA-Z_][\w-]*)/g
  let styleMatch: RegExpExecArray | null

  while ((styleMatch = styleRe.exec(html)) !== null) {
    const styleBody = styleMatch[1]
    const bodyOffset = styleMatch.index + styleMatch[0].indexOf(styleBody)
    classRe.lastIndex = 0
    let classMatch: RegExpExecArray | null
    while ((classMatch = classRe.exec(styleBody)) !== null) {
      const cls = classMatch[1]
      if (classes.has(cls)) continue

      const absoluteOffset = bodyOffset + classMatch.index
      const lineStart = html.lastIndexOf("\n", absoluteOffset) + 1
      const lineEnd = html.indexOf("\n", absoluteOffset)
      const line = lineEnd === -1 ? html.slice(lineStart) : html.slice(lineStart, lineEnd)
      classes.set(cls, {
        className: cls,
        selector: `.${cls}`,
        location: "style_rule",
        line: lineNumberAt(html, absoluteOffset),
        excerpt: normalizeExcerpt(line),
      })
    }
  }

  return [...classes.values()]
}

function summarize(filePath: string, slides: SlideReport[]): QAReport {
  const totalIssues = slides.reduce((sum, slide) => sum + slide.issues.length, 0)
  const errorCount = slides.reduce((sum, slide) => sum + slide.issues.filter((issue) => issue.severity === "error").length, 0)
  const warningCount = slides.reduce((sum, slide) => sum + slide.issues.filter((issue) => issue.severity === "warning").length, 0)
  const summary = totalIssues === 0
    ? "All slides passed layout QA."
    : `Found ${totalIssues} issue(s): ${errorCount} error(s), ${warningCount} warning(s) across ${slides.filter((s) => s.issues.length > 0).length} slide(s).`

  return { file: filePath, slides, totalIssues, errorCount, warningCount, summary }
}

export function runComplianceQA(htmlFilePath: string, vocabulary?: DesignClassVocabulary): QAReport {
  const html = readFileSync(htmlFilePath, "utf-8")
  const slideUses = extractSlideClassUses(html)
  const allowedClasses = vocabulary?.classes
  const prefixExemptions = vocabulary?.prefixExemptions ?? []

  const slides: SlideReport[] = slideUses.map((slide, index) => {
    const issues: LayoutIssue[] = []
    const reported = new Set<string>()

    if (allowedClasses) {
      for (const use of slide.uses) {
        if (reported.has(use.className)) continue
        if (allowedClasses.has(use.className)) continue
        if (isExemptClass(use.className, prefixExemptions)) continue

        reported.add(use.className)
        issues.push({
          type: "compliance",
          sub: "unknown_class",
          severity: "error",
          detail: `HTML uses CSS class \`${use.className}\` which is not defined in the active design. Replace it with a class from the Component Index or Layout Index.`,
          data: {
            class: use.className,
            selector: use.selector,
            location: use.location,
            line: use.line,
            tag: use.tagName ?? "",
            classAttr: use.classAttr ?? "",
            excerpt: use.excerpt,
          },
        })
      }
    }

    return { index, title: slide.title, issues }
  })

  if (allowedClasses && slides.length > 0) {
    const first = slides[0]
    const reported = new Set<string>()
    for (const use of extractCssDefinedClasses(html)) {
      if (reported.has(use.className)) continue
      if (allowedClasses.has(use.className)) continue
      if (isExemptClass(use.className, prefixExemptions)) continue

      reported.add(use.className)
      first.issues.push({
        type: "compliance",
        sub: "novel_css_rule",
        severity: "error",
        detail: `<style> defines CSS class \`.${use.className}\` which is not part of the active design. Remove this custom rule and use the design's existing component styles. For minor adjustments, use inline \`style=""\` instead.`,
        data: {
          class: use.className,
          selector: use.selector,
          location: use.location,
          line: use.line,
          excerpt: use.excerpt,
        },
      })
    }
  }

  return summarize(htmlFilePath, slides)
}
