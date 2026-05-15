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
    relations.push({ fromId, relation, toId: match[2].trim(), rationale: match[3]?.trim(), file })
  }
  return { relations, unknownTypes }
}

function isRelationType(value: string): value is NarrativeClaimRelationType {
  return (NARRATIVE_VAULT_RELATION_TYPES as readonly string[]).includes(value)
}
