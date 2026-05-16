import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { narrativeVaultPath } from "./paths"
import type { AudienceIntent, DecisionIntent, NarrativeStateV1, NarrativeThesis } from "../narrative-state/types"

export interface InitNarrativeVaultInput {
  id?: string
  status?: NarrativeStateV1["status"]
  audience?: Partial<AudienceIntent>
  decision?: Partial<DecisionIntent>
  thesis?: Partial<NarrativeThesis>
}

export interface InitNarrativeVaultResult {
  ok: boolean
  files: string[]
  created: boolean
  path: string
}

const VAULT_NODE_DIRS = ["claims", "evidence", "objections", "risks", "research-gaps"]

export function initNarrativeVault(workspaceRoot: string, input: InitNarrativeVaultInput = {}): InitNarrativeVaultResult {
  const root = narrativeVaultPath(workspaceRoot)
  const files: string[] = []
  mkdirSync(root, { recursive: true })
  for (const dir of VAULT_NODE_DIRS) mkdirSync(join(root, dir), { recursive: true })

  write(root, files, "index.md", frontmatter({ type: "index", id: input.id ?? "narrative:workspace", status: input.status ?? "draft" }))
  write(root, files, "audience.md", `${frontmatter({ type: "audience", ...input.audience })}${input.audience?.primary ?? ""}\n`)
  write(root, files, "decision.md", `${frontmatter({ type: "decision", ...input.decision })}${input.decision?.action ?? ""}\n`)
  write(root, files, "thesis.md", `${frontmatter({ type: "thesis", id: input.thesis?.id ?? "thesis:main", confidence: input.thesis?.confidence ?? "medium", caveat: input.thesis?.caveat })}${input.thesis?.statement ?? ""}\n`)

  return { ok: true, files, created: true, path: "revela-narrative" }
}

function write(root: string, files: string[], relativePath: string, content: string): void {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
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
