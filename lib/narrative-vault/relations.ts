import { NARRATIVE_VAULT_RELATION_TYPES } from "./constants"
import type { VaultRelation } from "./types"
import type { NarrativeClaimRelationType } from "../narrative-state/types"

export function parseRelations(section: string, fromId: string, file: string): { relations: VaultRelation[]; unknownTypes: string[] } {
  const relations: VaultRelation[] = []
  const unknownTypes: string[] = []
  for (const line of section.split("\n")) {
    const match = /^\s*-\s*([a-z_]+):\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\](?:\s*-\s*(.+))?\s*$/.exec(line)
    if (!match) continue
    const relation = match[1]
    if (!isRelationType(relation)) {
      unknownTypes.push(relation)
      continue
    }
    relations.push({ fromId, relation, toId: match[2].trim(), rationale: match[3]?.trim(), file, source: "inline" })
  }
  return { relations, unknownTypes }
}

export interface RegistryRelationParseResult {
  relations: VaultRelation[]
  diagnostics: Array<{ code: string; message: string; line?: number; edgeId?: string }>
}

export function parseRelationRegistry(markdown: string, file = "relations.md"): RegistryRelationParseResult {
  const relations: VaultRelation[] = []
  const diagnostics: RegistryRelationParseResult["diagnostics"] = []
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  let current: Record<string, string> | undefined
  let currentLine = 0

  const flush = () => {
    if (!current) return
    const edgeId = current.id
    const missing = ["id", "from", "to", "type"].filter((field) => !current?.[field])
    if (missing.length > 0) {
      diagnostics.push({ code: "relation_edge_fields_missing", message: `Relation edge is missing required field(s): ${missing.join(", ")}.`, line: currentLine, edgeId })
      current = undefined
      return
    }
    const relation = current.type
    if (!isRelationType(relation)) {
      diagnostics.push({ code: "invalid_relation_type", message: `Invalid relation type: ${relation}.`, line: currentLine, edgeId })
      current = undefined
      return
    }
    relations.push({ id: current.id, fromId: current.from, toId: current.to, relation, rationale: current.rationale, file, source: "registry" })
    current = undefined
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed || trimmed === "edges:" || trimmed.startsWith("#")) continue
    const start = /^-\s+id:\s*(.+)$/.exec(trimmed)
    if (start) {
      flush()
      current = { id: unquote(start[1]) }
      currentLine = index + 1
      continue
    }
    const field = /^(id|from|to|type|rationale):\s*(.+)$/.exec(trimmed)
    if (field) {
      if (!current) {
        current = {}
        currentLine = index + 1
      }
      current[field[1]] = unquote(field[2])
    }
  }
  flush()

  const duplicateIds = duplicateValues(relations.map((relation) => relation.id ?? "").filter(Boolean))
  for (const id of duplicateIds) diagnostics.push({ code: "duplicate_edge_id", message: `Duplicate relation edge id: ${id}.`, edgeId: id })

  return { relations, diagnostics }
}

function isRelationType(value: string): value is NarrativeClaimRelationType {
  return (NARRATIVE_VAULT_RELATION_TYPES as readonly string[]).includes(value)
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "")
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort()
}
