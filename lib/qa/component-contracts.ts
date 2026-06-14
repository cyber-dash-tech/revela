import { readFileSync } from "fs"
import type { DesignComponentContract } from "../design/designs"
import type { LayoutIssue, QAReport, SlideReport } from "./checks"

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function extractTitle(html: string, index: number): string {
  const match = /<(?:h1|h2|h3|title)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|title)>/i.exec(html)
  const title = match ? stripTags(match[1]).slice(0, 80) : ""
  return title || `Slide ${index + 1}`
}

function htmlHasClass(html: string, className: string): boolean {
  const classAttrRe = /class\s*=\s*(["'])([\s\S]*?)\1/gi
  let match: RegExpExecArray | null
  while ((match = classAttrRe.exec(html)) !== null) {
    if (match[2].split(/\s+/).includes(className)) return true
  }
  return false
}

function htmlUsesComponent(html: string, contract: DesignComponentContract): boolean {
  if (new RegExp(`data-preview-component\\s*=\\s*["']${escapeRegExp(contract.component)}["']`, "i").test(html)) return true
  return contract.requiredRootClasses.some((className) => htmlHasClass(html, className))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function validateContract(html: string, contract: DesignComponentContract): LayoutIssue[] {
  if (!htmlUsesComponent(html, contract)) return []

  const variantFailures: string[] = []
  for (const variant of contract.variants) {
    const missing = [
      ...variant.requiredDescendantClasses.filter((className) => !htmlHasClass(html, className)),
      ...(variant.repeatedItemClass && !htmlHasClass(html, variant.repeatedItemClass) ? [variant.repeatedItemClass] : []),
      ...(variant.requiredItemClasses ?? []).filter((className) => !htmlHasClass(html, className)),
      ...(variant.requireAlternatingClasses ?? []).filter((className) => !htmlHasClass(html, className)),
    ]
    if (missing.length === 0) return []
    variantFailures.push(`${variant.name}: missing ${missing.join(", ")}`)
  }

  return [{
    type: "compliance",
    sub: "component_contract",
    severity: "error",
    detail: `Component \`${contract.component}\` does not satisfy its design structure contract. ${contract.guidance}`,
    data: {
      component: contract.component,
      variants: variantFailures.join(" | "),
    },
  }]
}

function summarize(filePath: string, slides: SlideReport[]): QAReport {
  const totalIssues = slides.reduce((sum, slide) => sum + slide.issues.length, 0)
  const errorCount = slides.reduce((sum, slide) => sum + slide.issues.filter((issue) => issue.severity === "error").length, 0)
  const warningCount = slides.reduce((sum, slide) => sum + slide.issues.filter((issue) => issue.severity === "warning").length, 0)
  const summary = totalIssues === 0
    ? "All component structure contracts passed."
    : `Found ${totalIssues} component contract issue(s): ${errorCount} error(s), ${warningCount} warning(s).`
  return { file: filePath, slides, totalIssues, errorCount, warningCount, summary }
}

export function runComponentContractQA(htmlFilePath: string, contracts: DesignComponentContract[]): QAReport {
  const html = readFileSync(htmlFilePath, "utf-8")
  const sectionRe = /<section\b[\s\S]*?<\/section>/gi
  const slides: SlideReport[] = []
  let match: RegExpExecArray | null
  let index = 0

  while ((match = sectionRe.exec(html)) !== null) {
    const chunk = match[0]
    const issues = contracts.flatMap((contract) => validateContract(chunk, contract))
    slides.push({ index, title: extractTitle(chunk, index), issues })
    index++
  }

  if (slides.length === 0) {
    const issues = contracts.flatMap((contract) => validateContract(html, contract))
    slides.push({ index: 0, title: extractTitle(html, 0), issues })
  }

  return summarize(htmlFilePath, slides)
}
