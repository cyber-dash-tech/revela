import type { ArtifactQAReport } from "./qa/artifact"
import type { AutoCompileNarrativeVaultResult } from "./narrative-vault/auto-compile"

export function formatMarkdownQaUserNotice(result: AutoCompileNarrativeVaultResult): string | undefined {
  if (result.ok) return undefined

  const lines = ["**Markdown QA blocked**"]
  lines.push(`Touched: ${result.touched.length > 0 ? result.touched.map((file) => `\`${file}\``).join(", ") : "unknown"}`)

  const blockers = result.markdownQa?.blockers ?? []
  if (blockers.length > 0) {
    lines.push("Top repair(s):")
    for (const card of blockers.slice(0, 3)) {
      const location = [card.file, card.nodeId].filter(Boolean).join(" / ")
      lines.push(`- \`${card.issueCode}\`${location ? ` (${location})` : ""}: ${card.smallestRepair}`)
    }
    if (blockers.length > 3) lines.push(`- ... ${blockers.length - 3} more`)
  } else if (result.error) {
    lines.push(`Hook error: ${result.error}`)
  } else {
    lines.push("Compile diagnostics are blocking the vault. See the tool output for details.")
  }

  return lines.join("\n")
}

export function formatArtifactQaUserNotice(report: ArtifactQAReport): string | undefined {
  if (report.passed) return undefined

  const lines = ["**Artifact QA failed**"]
  lines.push(`File: \`${report.file}\``)
  lines.push(`Hard errors: ${report.hardErrorCount}; warnings: ${report.warningCount}`)
  if (report.sections.length > 0) {
    lines.push("Top issue area(s):")
    for (const section of report.sections.slice(0, 3)) lines.push(`- ${firstLine(section)}`)
    if (report.sections.length > 3) lines.push(`- ... ${report.sections.length - 3} more`)
  }
  lines.push("Fix the reported artifact issues before treating the deck as ready.")
  return lines.join("\n")
}

export function formatStateGateUserNotice(kind: "write" | "patch", reason: string): string {
  return [
    "**Revela state gate blocked a direct DECKS.json edit**",
    `Operation: ${kind}`,
    `Reason: ${reason}`,
    "Use the `revela-decks` tool for controlled workspace state changes.",
  ].join("\n")
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.replace(/^#+\s*/, "") ?? "See report details."
}
