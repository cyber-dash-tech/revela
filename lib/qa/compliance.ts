import { readFileSync } from "fs"
import type { DesignClassVocabulary } from "../design/designs"
import type { LayoutIssue, QAReport, SlideReport } from "./checks"

interface ClassUse {
  className: string
  selector: string
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

function extractClassUses(html: string): ClassUse[] {
  const uses: ClassUse[] = []
  const classAttrRe = /class\s*=\s*(["'])([\s\S]*?)\1/gi
  let match: RegExpExecArray | null

  while ((match = classAttrRe.exec(html)) !== null) {
    const raw = match[2] || ""
    for (const cls of raw.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
      uses.push({ className: cls, selector: `.${cls}` })
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
    slides.push({ title: extractTitle(chunk, index), uses: extractClassUses(chunk) })
    index++
  }

  if (slides.length === 0) {
    slides.push({ title: extractTitle(html, 0), uses: extractClassUses(html) })
  }

  return slides
}

function extractCssDefinedClasses(html: string): string[] {
  const classes = new Set<string>()
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  const classRe = /\.([a-zA-Z_][\w-]*)/g
  let styleMatch: RegExpExecArray | null

  while ((styleMatch = styleRe.exec(html)) !== null) {
    classRe.lastIndex = 0
    let classMatch: RegExpExecArray | null
    while ((classMatch = classRe.exec(styleMatch[1])) !== null) {
      classes.add(classMatch[1])
    }
  }

  return [...classes]
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
          severity: "warning",
          detail: `HTML uses CSS class \`${use.className}\` which is not defined in the active design. Replace it with a class from the Component Index or Layout Index.`,
          data: { class: use.className, selector: use.selector },
        })
      }
    }

    return { index, title: slide.title, issues }
  })

  if (allowedClasses && slides.length > 0) {
    const first = slides[0]
    const reported = new Set<string>()
    for (const cls of extractCssDefinedClasses(html)) {
      if (reported.has(cls)) continue
      if (allowedClasses.has(cls)) continue
      if (isExemptClass(cls, prefixExemptions)) continue

      reported.add(cls)
      first.issues.push({
        type: "compliance",
        sub: "novel_css_rule",
        severity: "warning",
        detail: `<style> defines CSS class \`.${cls}\` which is not part of the active design. Remove this custom rule and use the design's existing component styles. For minor adjustments, use inline \`style=""\` instead.`,
        data: { class: cls },
      })
    }
  }

  return summarize(htmlFilePath, slides)
}
