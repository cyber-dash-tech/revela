export interface NarrativeVaultAuthoringContract {
  allowedActions: string[]
  forbiddenCompatibilityActions: string[]
  validNodeTypes: string[]
  idConvention: {
    rule: string
    examples: string[]
    avoid: string[]
  }
  relationSyntax: {
    rule: string
    examples: string[]
    avoid: string[]
  }
  structuredTemplates: {
    claim: Record<string, unknown>
    evidence: Record<string, unknown>
    researchGap: Record<string, unknown>
  }
  markdownRepairPolicy: string[]
}

export function narrativeVaultAuthoringContract(): NarrativeVaultAuthoringContract {
  return {
    allowedActions: [
      "initNarrativeVault",
      "updateVaultCoreNarrative",
      "upsertVaultClaim",
      "upsertVaultEvidence",
      "bindResearchFindings",
      "upsertVaultObjection",
      "upsertVaultRisk",
      "upsertVaultResearchGap",
      "updateVaultResearchGap",
      "compileNarrativeVault",
    ],
    forbiddenCompatibilityActions: [
      "upsertNarrative",
      "upsertResearchGaps",
      "deriveResearchGaps",
      "updateResearchGap",
      "closeResearchGap",
      "applyEvidenceCandidates",
    ],
    validNodeTypes: ["index", "audience", "decision", "thesis", "claim", "evidence", "objection", "risk", "research-gap"],
    idConvention: {
      rule: "New vault nodes use plain stable ids without type prefixes or colons. Keep legacy ids when editing existing nodes, but do not generate new ids such as claim:foo.",
      examples: ["claim-belief-change-purpose", "evidence-proposal-intent", "gap-market-size", "risk-overclaiming"],
      avoid: ["claim:belief-change-purpose", "evidence:proposal:intent", "researchGap-market-size"],
    },
    relationSyntax: {
      rule: "Relation lines use a relation label and a plain node-id wikilink. Wikilinks target frontmatter node ids directly.",
      examples: ["- supports: [[claim-belief-change-purpose]]", "- depends_on: [[evidence-proposal-intent]]"],
      avoid: ["[[claim:claim-belief-change-purpose]]", "[[evidence:evidence-proposal-intent]]"],
    },
    structuredTemplates: {
      claim: {
        action: "upsertVaultClaim",
        narrative: {
          claims: [{
            id: "claim-belief-change-purpose",
            kind: "recommendation",
            text: "Audience belief change is the central purpose of the artifact.",
            importance: "central",
            evidenceRequired: true,
            evidenceStatus: "partial",
            supportedScope: "What current sources explicitly support.",
            unsupportedScope: "What still requires research or user confirmation.",
            caveats: ["Do not overclaim beyond available source trace."],
          }],
          claimRelations: [{
            fromClaimId: "claim-belief-change-purpose",
            toClaimId: "claim-recommendation",
            relation: "supports",
            rationale: "Belief change frames the recommendation.",
          }],
        },
      },
      evidence: {
        action: "upsertVaultEvidence",
        evidence: {
          id: "evidence-proposal-intent",
          claimId: "claim-belief-change-purpose",
          source: "proposal.md",
          sourcePath: "proposal.md",
          quote: "Exact quote or snippet from the source.",
          location: "section or line reference when known",
          supportScope: "Scope explicitly supported by the quote.",
          unsupportedScope: "Scope not supported by this evidence.",
          caveat: "Limitation that travels with this evidence.",
          strength: "partial",
        },
      },
      researchGap: {
        action: "upsertVaultResearchGap",
        gapId: "gap-market-size",
        researchGaps: [{
          id: "gap-market-size",
          targetType: "claim",
          targetId: "claim-market-size",
          question: "What source can support the market-size claim?",
          status: "open",
          priority: "high",
          createdFromIssueType: "missing_evidence",
        }],
      },
    },
    markdownRepairPolicy: [
      "Use direct Markdown patches only for small repairs after reading the existing node.",
      "Do not delete and recreate existing vault nodes to fix schema.",
      "Do not append a second frontmatter block.",
      "Do not duplicate stable headings such as Evidence, Caveats, Relations, Response, Mitigation, or Notes.",
    ],
  }
}
