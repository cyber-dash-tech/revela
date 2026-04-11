/**
 * lib/ctx.ts — Revela Global Runtime Context
 *
 * A session-level singleton shared across all modules: plugin hooks,
 * read-hooks, future subagents, and any other feature modules.
 *
 * Lifecycle: resets on OpenCode restart. NOT persisted to config.json.
 * For persistent user preferences (activeDesign, activeDomain), see lib/config.ts.
 */

export interface RevelaCtx {
  /** Master switch — controls prompt injection, read hooks, subagents, etc. */
  enabled: boolean

  /**
   * True when the current LLM request originates from the revela-research subagent.
   * Set in experimental.chat.system.transform by detecting RESEARCH_AGENT_SIGNATURE.
   * Used by tool.execute.before to allow websearch for research agents only.
   */
  isResearchAgent: boolean
}

/** Global singleton. Import and use directly from any module. */
export const ctx: RevelaCtx = {
  enabled: false,
  isResearchAgent: false,
}
