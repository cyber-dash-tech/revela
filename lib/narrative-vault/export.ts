import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { narrativeVaultPath } from "./paths"
import type { NarrativeStateV1 } from "../narrative-state/types"

export interface ExportNarrativeVaultResult {
  files: string[]
}

export function exportNarrativeStateToVault(workspaceRoot: string, narrative: NarrativeStateV1): ExportNarrativeVaultResult {
  const root = narrativeVaultPath(workspaceRoot)
  const files: string[] = []
  mkdirSync(root, { recursive: true })
  for (const dir of ["claims", "evidence", "objections", "risks", "research-gaps"]) mkdirSync(join(root, dir), { recursive: true })

  write(root, files, "index.md", frontmatter({ type: "index", id: narrative.id, status: narrative.status }) + "\n")
  write(root, files, "audience.md", frontmatter({ type: "audience", ...narrative.audience }) + "\n")
  write(root, files, "decision.md", frontmatter({ type: "decision", ...narrative.decision }) + "\n")
  if (narrative.thesis) write(root, files, "thesis.md", frontmatter({ type: "thesis", ...narrative.thesis }) + `\n${narrative.thesis.statement}\n`)

  const relationsByClaim = new Map<string, string[]>()
  for (const relation of narrative.claimRelations ?? []) {
    const lines = relationsByClaim.get(relation.fromClaimId) ?? []
    lines.push(`- ${relation.relation}: [[${relation.toClaimId}]]${relation.rationale ? ` - ${relation.rationale}` : ""}`)
    relationsByClaim.set(relation.fromClaimId, lines)
  }

  for (const claim of narrative.claims) {
    const relationLines = relationsByClaim.get(claim.id) ?? []
    const caveats = claim.caveats?.length ? `\n## Caveats\n\n${claim.caveats.map((item) => `- ${item}`).join("\n")}\n` : ""
    const relations = relationLines.length ? `\n## Relations\n\n${relationLines.join("\n")}\n` : ""
    write(root, files, join("claims", `${safeFileName(claim.id)}.md`), frontmatter({ type: "claim", id: claim.id, kind: claim.kind, importance: claim.importance, evidenceRequired: claim.evidenceRequired, supportedScope: claim.supportedScope, unsupportedScope: claim.unsupportedScope }) + `\n${claim.text}\n${caveats}${relations}`)
  }

  for (const binding of narrative.evidenceBindings) write(root, files, join("evidence", `${safeFileName(binding.id)}.md`), frontmatter({ type: "evidence", ...binding }) + `\n${binding.quote ?? ""}\n`)
  for (const objection of narrative.objections) write(root, files, join("objections", `${safeFileName(objection.id)}.md`), frontmatter({ type: "objection", ...objection }) + `\n${objection.text}\n`)
  for (const risk of narrative.risks) write(root, files, join("risks", `${safeFileName(risk.id)}.md`), frontmatter({ type: "risk", ...risk }) + `\n${risk.text}\n`)
  for (const gap of narrative.researchGaps ?? []) write(root, files, join("research-gaps", `${safeFileName(gap.id)}.md`), frontmatter({ type: "research-gap", ...gap }) + `\n${gap.question}\n`)
  return { files }
}

function write(root: string, files: string[], relativePath: string, content: string): void {
  const filePath = join(root, relativePath)
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf-8")
  files.push(relativePath.split(/[/\\]+/).join("/"))
}

function frontmatter(values: Record<string, unknown>): string {
  const lines = ["---"]
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${quote(String(item))}`)
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value ? "true" : "false"}`)
    } else {
      lines.push(`${key}: ${quote(String(value))}`)
    }
  }
  lines.push("---", "")
  return lines.join("\n")
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function safeFileName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node"
}
