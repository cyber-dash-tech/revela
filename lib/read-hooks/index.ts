/**
 * lib/read-hooks/index.ts
 *
 * Entry point for the read-hooks module.
 * Exports preRead and postRead for use in plugins/revela.ts hook handlers.
 *
 * preRead  → tool.execute.before: materialize Office docs and redirect to temp markdown
 * postRead → tool.execute.after:  transform PDF/image attachments before LLM sees them
 */

export { preRead } from "./pre-read"
export { postRead } from "./post-read"
