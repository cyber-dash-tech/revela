import { existsSync, readdirSync, readFileSync } from "fs"
import { basename, join } from "path"

export type ResearchImageUse = "logo" | "portrait" | "screenshot" | "unknown"

export interface ResearchImageLead {
  candidateId: string
  topic: string
  axis: string
  sourceFile: string
  description: string
  url: string
  alt: string
  use: ResearchImageUse
  line: number
  valid: boolean
  warnings: string[]
}

export interface ListResearchImageLeadOptions {
  uses?: string[]
  axis?: string[]
}

export interface ResearchImageLeadListResult {
  topic: string
  items: ResearchImageLead[]
  warnings: string[]
}

const LEAD_LINE_RE = /^-\s*(.+?):\s*(\S+)(?:\s*\|\s*Alt:\s*(.*?))?(?:\s*\|\s*Use:\s*(.*?))?\s*$/

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeUse(value: string | undefined): ResearchImageUse {
  const normalized = (value ?? "").trim().toLowerCase()
  if (normalized === "logo" || normalized === "portrait" || normalized === "screenshot") {
    return normalized
  }
  return "unknown"
}

function normalizeAxisFilter(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  const normalized = values
    .map((value) => slugify(value))
    .filter(Boolean)
  return normalized.length ? normalized : undefined
}

function normalizeUseFilter(values: string[] | undefined): ResearchImageUse[] | undefined {
  if (!values?.length) return undefined
  const normalized = values
    .map((value) => normalizeUse(value))
  return normalized.length ? normalized : undefined
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function shouldIncludeLead(lead: ResearchImageLead, options?: ListResearchImageLeadOptions): boolean {
  const uses = normalizeUseFilter(options?.uses)
  const axis = normalizeAxisFilter(options?.axis)
  if (uses?.length && !uses.includes(lead.use)) return false
  if (axis?.length && !axis.includes(lead.axis)) return false
  return true
}

function parseImageSection(
  topic: string,
  axis: string,
  sourceFile: string,
  content: string,
): { items: ResearchImageLead[]; warnings: string[] } {
  const lines = content.split(/\r?\n/)
  const items: ResearchImageLead[] = []
  const warnings: string[] = []
  let inImagesSection = false
  let candidateIndex = 0

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()

    if (/^##\s+Images\s*$/i.test(trimmed)) {
      inImagesSection = true
      continue
    }

    if (inImagesSection && /^##\s+/.test(trimmed)) {
      break
    }

    if (!inImagesSection || !trimmed.startsWith("-")) continue
    if (trimmed === "- None") continue

    const match = trimmed.match(LEAD_LINE_RE)
    if (!match) {
      warnings.push(`${sourceFile}:${index + 1} could not parse image lead`)
      continue
    }

    candidateIndex += 1
    const description = match[1].trim()
    const url = match[2].trim()
    const alt = (match[3] ?? "").trim()
    const use = normalizeUse(match[4])
    const itemWarnings: string[] = []
    const valid = isHttpUrl(url)

    if (!valid) itemWarnings.push("invalid-url")
    if (use === "unknown") itemWarnings.push("unknown-use")

    items.push({
      candidateId: `${axis}:${candidateIndex}`,
      topic,
      axis,
      sourceFile,
      description,
      url,
      alt,
      use,
      line: index + 1,
      valid,
      warnings: itemWarnings,
    })
  }

  return { items, warnings }
}

export function listResearchImageLeads(
  topic: string,
  workspaceDir: string,
  options?: ListResearchImageLeadOptions,
): ResearchImageLeadListResult {
  const topicSlug = slugify(topic)
  const researchDir = join(workspaceDir, "researches", topicSlug)
  if (!existsSync(researchDir)) {
    return { topic: topicSlug, items: [], warnings: [] }
  }

  const items: ResearchImageLead[] = []
  const warnings: string[] = []
  const entries = readdirSync(researchDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort()

  for (const entry of entries) {
    const filePath = join(researchDir, entry)
    const axis = basename(entry, ".md")
    const sourceFile = `researches/${topicSlug}/${entry}`
    const content = readFileSync(filePath, "utf-8")
    const parsed = parseImageSection(topicSlug, axis, sourceFile, content)

    for (const item of parsed.items) {
      if (shouldIncludeLead(item, options)) items.push(item)
    }

    warnings.push(...parsed.warnings)
  }

  return { topic: topicSlug, items, warnings }
}
