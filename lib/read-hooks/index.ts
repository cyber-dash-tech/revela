/**
 * lib/read-hooks/index.ts
 *
 * Entry point for the read-hooks module.
 * Exports preRead and postRead for use in plugins/revela.ts hook handlers.
 *
 * preRead  → tool.execute.before: redirect binary files (DOCX/PPTX/XLSX) to temp txt
 * postRead → tool.execute.after:  transform PDF/image attachments before LLM sees them
 */

export { preRead } from "./pre-read"
export { postRead } from "./post-read"
