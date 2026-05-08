import { tool } from "@opencode-ai/plugin"
import { completeInspectRequest } from "../lib/inspect/requests"
import type { InspectionResult } from "../lib/inspection-context/result"

const evidenceSourceItemSchema = tool.schema.object({
  source: tool.schema.string().describe("Human-readable source label."),
  sourcePath: tool.schema.string().optional(),
  findingsFile: tool.schema.string().optional(),
  location: tool.schema.string().optional(),
  page: tool.schema.string().optional(),
  url: tool.schema.string().optional(),
  quote: tool.schema.string().optional(),
  caveat: tool.schema.string().optional(),
})

export default tool({
  description:
    "Submit the final structured Evidence Inspector result for a pending /revela inspect request. " +
    "Use only when responding to an inspection prompt. This updates the local browser inspector; it does not mutate DECKS.json or deck files.",
  args: {
    requestId: tool.schema.string().describe("Pending inspection request id from the inspection prompt."),
    result: tool.schema.object({
      version: tool.schema.number().describe("Must be 1."),
      status: tool.schema.enum(["success", "no_match"]),
      selectedText: tool.schema.string().optional(),
      slide: tool.schema.object({
        index: tool.schema.number(),
        title: tool.schema.string(),
      }).optional(),
      matchConfidence: tool.schema.enum(["none", "low", "medium", "high"]),
      cards: tool.schema.object({
        reading: tool.schema.object({
          status: tool.schema.enum(["matched", "no_match"]),
          claimId: tool.schema.string().optional(),
          canonicalClaimId: tool.schema.string().optional(),
          claimText: tool.schema.string().optional(),
          evidenceStatus: tool.schema.string().optional(),
          evidenceBindingIds: tool.schema.array(tool.schema.string()),
          supportedScope: tool.schema.string().optional(),
          unsupportedScope: tool.schema.string().optional(),
          caveats: tool.schema.array(tool.schema.string()),
          relatedObjections: tool.schema.array(tool.schema.string()),
          relatedRisks: tool.schema.array(tool.schema.string()),
          artifactCoverage: tool.schema.array(tool.schema.object({
            artifactId: tool.schema.string(),
            type: tool.schema.string(),
            outputPath: tool.schema.string().optional(),
            coverageStatus: tool.schema.enum(["current", "stale", "partial", "missing"]),
            containsClaim: tool.schema.boolean(),
            stale: tool.schema.boolean(),
            staleReason: tool.schema.string().optional(),
            locations: tool.schema.array(tool.schema.string()),
            note: tool.schema.string().optional(),
          })).optional(),
          rationale: tool.schema.string(),
        }).optional(),
        exploratory: tool.schema.object({
          status: tool.schema.enum(["available", "limited", "unavailable"]),
          official: tool.schema.boolean().describe("Must be false; exploratory reading is not official artifact content."),
          audience: tool.schema.string().optional(),
          claimFocus: tool.schema.string().optional(),
          objectionPrompts: tool.schema.array(tool.schema.string()),
          audienceReframe: tool.schema.string(),
          appendixLeads: tool.schema.array(tool.schema.string()),
          meetingPrep: tool.schema.array(tool.schema.string()),
          boundaries: tool.schema.array(tool.schema.string()),
          rationale: tool.schema.string(),
        }).optional(),
        purpose: tool.schema.object({
          status: tool.schema.enum(["clear", "weak", "misplaced", "unknown"]),
          role: tool.schema.string().optional(),
          rationale: tool.schema.string(),
          whyItMatters: tool.schema.string(),
        }),
        source: tool.schema.object({
          status: tool.schema.enum(["supported", "weak", "unsupported", "not_needed", "unknown"]),
          matchedClaim: tool.schema.string().optional(),
          sources: tool.schema.array(evidenceSourceItemSchema),
          warnings: tool.schema.array(tool.schema.string()),
          gaps: tool.schema.array(tool.schema.string()),
          caveats: tool.schema.array(tool.schema.string()),
          rationale: tool.schema.string(),
        }),
      }),
      stale: tool.schema.object({
        stale: tool.schema.boolean(),
        reason: tool.schema.string().optional(),
      }).optional(),
    }).describe("Final structured inspector result to render in the browser."),
  },
  async execute(args) {
    try {
      if (args.result.version !== 1) throw new Error("Inspection result version must be 1.")
      const request = completeInspectRequest(args.requestId, args.result as InspectionResult)
      return JSON.stringify({ ok: true, requestId: request.requestId, status: request.status })
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: e.message || String(e) })
    }
  },
})
