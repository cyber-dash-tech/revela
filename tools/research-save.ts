import { tool } from "@opencode-ai/plugin"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { hasDecksState, readDecksState, writeDecksState } from "../lib/decks-state"
import { recordWorkspaceAction } from "../lib/workspace-state/actions"

/**
 * Format today's date as YYYY-MM-DD
 */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Sanitize a key: lowercase, alphanumeric + hyphens only.
 */
function keyify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Build YAML frontmatter string.
 */
function buildFrontmatter(topic: string, axis: string, sources: string[]): string {
  const lines = [
    "---",
    `topic: ${topic}`,
    `axis: ${axis}`,
    `date: ${today()}`,
  ]
  if (sources.length > 0) {
    lines.push("sources:")
    for (const s of sources) {
      lines.push(`  - "${s.replace(/"/g, '\\"')}"`)
    }
  }
  lines.push("---")
  return lines.join("\n")
}

export default tool({
  description:
    "Save a research findings file to the workspace researches/ directory. " +
    "Creates researches/{topic}/{filename}.md with YAML frontmatter. " +
    "Each research axis gets its own file (e.g. 'market-data', 'catl-profile'). " +
    "Content should use ## Data / ## Cases / ## Images / ## Gaps sections.",
  args: {
    topic: tool.schema
      .string()
      .describe(
        "Topic key in kebab-case, e.g. 'ev-battery-market' or 'saas-competitive-analysis'. " +
        "All files for the same presentation share the same topic key.",
      ),
    filename: tool.schema
      .string()
      .describe(
        "Axis name without extension, e.g. 'market-data', 'catl-profile', 'tech-trends'. " +
        "Each parallel research agent uses a unique axis name.",
      ),
    content: tool.schema
      .string()
      .describe(
        "Structured markdown findings. Use these sections (omit empty ones):\n" +
        "## Data — key stats and data points, each with [Source: url]\n" +
        "## Cases — company/entity profiles, 1-2 sentences each with [Source: url]\n" +
        "## Images — image URLs: '{description}: {url} | Alt: {text} | Use: logo|screenshot|portrait'\n" +
        "## Gaps — topics not found or insufficiently covered",
      ),
    sources: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Source URLs or filenames for YAML frontmatter, e.g. ['https://example.com/report', 'data.xlsx']"),
  },
  async execute(args, context) {
    try {
      const topicKey = keyify(args.topic || "research")
      const fileKey = keyify(args.filename || "findings")
      const workspaceDir = context.directory ?? process.cwd()
      const topicDir = join(workspaceDir, "researches", topicKey)

      mkdirSync(topicDir, { recursive: true })

      const frontmatter = buildFrontmatter(args.topic, fileKey, args.sources ?? [])
      const fileContent = `${frontmatter}\n\n${args.content ?? ""}\n`
      const filePath = join(topicDir, `${fileKey}.md`)
      const relPath = `researches/${topicKey}/${fileKey}.md`

      writeFileSync(filePath, fileContent, "utf-8")

      if (hasDecksState(workspaceDir)) {
        const state = readDecksState(workspaceDir)
        recordWorkspaceAction(state, {
          type: "research.findings_saved",
          actor: "revela-research-save",
          inputs: { topic: topicKey, axis: fileKey, sourceCount: args.sources?.length ?? 0 },
          outputs: { path: relPath, sources: args.sources ?? [] },
          summary: `Saved research findings for ${topicKey}/${fileKey}.`,
          nodeIds: [`finding:${relPath}`],
        })
        writeDecksState(workspaceDir, state)
      }

      return JSON.stringify({ ok: true, path: relPath })
    } catch (e: any) {
      return JSON.stringify({ error: e.message || String(e) })
    }
  },
})
