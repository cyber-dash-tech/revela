import type { DecksState } from "../decks-state"
import { hasNarrativeVault } from "./paths"

export const VAULT_MIGRATION_PRESERVED_IN_DECKS_JSON = [
  "approvals",
  "renderTargets",
  "reviews",
  "deck specs",
  "artifact coverage",
  "actions",
  "sourceMaterials",
]

export interface NarrativeVaultMigrationHint {
  available: boolean
  reason: string
  suggestedAction?: "exportNarrativeVault"
  preservedInDecksJson: string[]
  nextActions: string[]
}

export function getNarrativeVaultMigrationHint(workspaceRoot: string, state: DecksState): NarrativeVaultMigrationHint {
  if (hasNarrativeVault(workspaceRoot)) {
    return {
      available: false,
      reason: "revela-narrative/ already exists; Markdown is the canonical narrative source.",
      preservedInDecksJson: VAULT_MIGRATION_PRESERVED_IN_DECKS_JSON,
      nextActions: ["Use targeted vault actions or edit Markdown nodes, then run compileNarrativeVault."],
    }
  }

  if (state.narrative) {
    return {
      available: true,
      reason: "DECKS.json contains a canonical narrative mirror, but no revela-narrative/ vault exists yet.",
      suggestedAction: "exportNarrativeVault",
      preservedInDecksJson: VAULT_MIGRATION_PRESERVED_IN_DECKS_JSON,
      nextActions: [
        "Run revela-decks action exportNarrativeVault to create editable Markdown narrative files.",
        "Continue keeping approvals, render targets, reviews, artifact coverage, actions, and source material records in DECKS.json.",
        "Review the returned diagnosticReport before making or exporting artifacts.",
      ],
    }
  }

  return {
    available: false,
    reason: "No canonical narrative is available to export yet.",
    preservedInDecksJson: VAULT_MIGRATION_PRESERVED_IN_DECKS_JSON,
    nextActions: ["Initialize narrative intent first, then export a Markdown vault when stable narrative state exists."],
  }
}
