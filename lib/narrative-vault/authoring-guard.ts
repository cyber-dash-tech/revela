import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { VaultDiagnosticDisplay } from "./diagnostic-report"

const VALID_TYPES = new Set(["index", "audience", "decision", "thesis", "claim", "evidence", "objection", "risk", "research-gap"])
const STABLE_HEADINGS = ["Evidence", "Caveats", "Relations", "Response", "Mitigation", "Notes"]

export interface VaultAuthoringGuardReport {
  ok: boolean
  blockers: VaultDiagnosticDisplay[]
  warnings: VaultDiagnosticDisplay[]
}

export function runVaultAuthoringGuard(workspaceRoot: string, touched: string[]): VaultAuthoringGuardReport {
  const diagnostics: VaultDiagnosticDisplay[] = []
  for (const relativePath of [...new Set(touched)].sort()) {
    const filePath = join(workspaceRoot, relativePath)
    if (!existsSync(filePath)) continue
    const text = readFileSync(filePath, "utf-8")
    diagnostics.push(...inspectVaultMarkdown(relativePath.replace(/\\/g, "/"), text))
  }

  const blockers = diagnostics.filter((diagnostic) => diagnostic.severity === "error")
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning")
  return { ok: blockers.length === 0, blockers, warnings }
}

export function inspectVaultMarkdown(file: string, text: string): VaultDiagnosticDisplay[] {
  const diagnostics: VaultDiagnosticDisplay[] = []
  const type = extractFrontmatterField(text, "type")
  const nodeId = extractFrontmatterField(text, "id")

  if (countYamlFences(text) > 2) {
    diagnostics.push(display({
      severity: "error",
      code: "duplicate_frontmatter",
      file,
      nodeId,
      message: "Vault Markdown contains more than one frontmatter block, usually caused by appending a replacement document instead of replacing the old one.",
      suggestedFix: "Keep one leading frontmatter block and merge the intended fields/body into the existing document.",
      suggestedAction: "Read the file, remove the duplicated frontmatter/body, and rerun compileNarrativeVault.",
    }))
  }

  if (type && !VALID_TYPES.has(type)) {
    diagnostics.push(display({
      severity: "error",
      code: "invalid_node_type_authoring",
      file,
      nodeId,
      message: `Unsupported vault node type \`${type}\` in frontmatter.`,
      suggestedFix: type === "researchGap" || type === "research_gap"
        ? "Use `type: \"research-gap\"` for research gap nodes."
        : "Use a supported node type: index, audience, decision, thesis, claim, evidence, objection, risk, or research-gap.",
      suggestedAction: "Patch only the type frontmatter line and rerun compileNarrativeVault.",
    }))
  }

  if (type === "evidence" && !extractFrontmatterField(text, "claimId")) {
    diagnostics.push(display({
      severity: "error",
      code: "evidence_claim_id_missing_authoring",
      file,
      nodeId,
      message: "Evidence nodes must declare claimId before they can become canonical support.",
      suggestedFix: "Add `claimId` pointing to an existing claim id, or keep the material as research/findings until support is explicit.",
      suggestedAction: "Patch the evidence frontmatter and rerun compileNarrativeVault.",
    }))
  }

  for (const heading of STABLE_HEADINGS) {
    const count = countHeading(text, heading)
    if (count > 1) {
      diagnostics.push(display({
        severity: "error",
        code: "duplicate_stable_heading",
        file,
        nodeId,
        message: `Vault Markdown contains ${count} \`## ${heading}\` sections.`,
        suggestedFix: `Merge content into a single \`## ${heading}\` section instead of appending a duplicate heading.`,
        suggestedAction: "Read the file, merge duplicate sections in place, and rerun compileNarrativeVault.",
      }))
    }
  }

  for (const match of text.matchAll(/\[\[([A-Za-z][\w-]*):([^\]]+)\]\]/g)) {
    if (!match[2].startsWith(`${match[1]}-`) && !match[2].startsWith(`${match[1]}:`)) continue
    diagnostics.push(display({
      severity: "error",
      code: "typed_wikilink_target",
      file,
      nodeId,
      message: `Relation target \`[[${match[1]}:${match[2]}]]\` mixes type metadata into the wikilink id.`,
      suggestedFix: `Use standard node-id wikilinks, for example \`[[${match[2]}]]\`, and keep relation type in the list prefix such as \`supports:\`.`,
      suggestedAction: "Patch the Relations wikilinks to target node ids directly and rerun compileNarrativeVault.",
    }))
  }

  return diagnostics
}

function display(diagnostic: VaultDiagnosticDisplay): VaultDiagnosticDisplay {
  return diagnostic
}

function countYamlFences(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim() === "---").length
}

function countHeading(text: string, heading: string): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`^##\\s+${escaped}\\s*$`, "gim")
  return [...text.matchAll(pattern)].length
}

function extractFrontmatterField(text: string, field: string): string | undefined {
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) return undefined
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = frontmatter[1].match(new RegExp(`^${escaped}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, "m"))
  return match?.[1]?.trim()
}
