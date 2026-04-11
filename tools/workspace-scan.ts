import { tool } from "@opencode-ai/plugin"
import { readdirSync, statSync, existsSync } from "fs"
import { join, relative, extname } from "path"

const DOC_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".xlsx", ".xls",
  ".pptx", ".ppt", ".csv", ".md", ".txt",
])

// Directories to exclude from scanning
const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", "dist", ".opencode",
  "researches",  // Exclude revela's own research output
  "designs", "domains",  // Exclude revela plugin assets
])

type FileEntry = {
  path: string
  type: string
  size: string
}

/**
 * Format bytes into a human-readable size string.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Map extension to a friendly type label.
 */
function typeLabel(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "PDF",
    ".docx": "Word",
    ".doc": "Word",
    ".xlsx": "Excel",
    ".xls": "Excel",
    ".pptx": "PowerPoint",
    ".ppt": "PowerPoint",
    ".csv": "CSV",
    ".md": "Markdown",
    ".txt": "Text",
  }
  return map[ext] ?? ext.slice(1).toUpperCase()
}

/**
 * Recursively scan a directory for document files.
 */
function scanDir(dir: string, rootDir: string, results: FileEntry[], maxDepth: number, depth: number): void {
  if (depth > maxDepth) return
  if (!existsSync(dir)) return

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    // Skip hidden files/dirs and excluded dirs
    if (entry.startsWith(".")) continue
    if (EXCLUDE_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      scanDir(fullPath, rootDir, results, maxDepth, depth + 1)
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase()
      if (DOC_EXTENSIONS.has(ext)) {
        results.push({
          path: relative(rootDir, fullPath),
          type: typeLabel(ext),
          size: formatSize(stat.size),
        })
      }
    }
  }
}

export default tool({
  description:
    "Scan the current workspace for document and data files that can be used as research input. " +
    "Returns a structured list of all found files with their type and size. " +
    "Searches for: PDF, Word (docx/doc), Excel (xlsx/xls), PowerPoint (pptx/ppt), CSV, Markdown, and text files. " +
    "Excludes node_modules, .git, dist, and the researches/ output directory. " +
    "Use this as the first step before reading workspace documents.",
  args: {
    path: tool.schema
      .string()
      .optional()
      .describe(
        "Optional subdirectory to scan (relative to workspace root). " +
        "If omitted, scans the entire workspace.",
      ),
    max_depth: tool.schema
      .number()
      .optional()
      .describe("Maximum directory depth to recurse. Defaults to 6."),
  },
  async execute(args, context) {
    try {
      const workspaceDir = context.directory ?? process.cwd()
      const scanRoot = args.path ? join(workspaceDir, args.path) : workspaceDir
      const maxDepth = args.max_depth ?? 6

      if (!existsSync(scanRoot)) {
        return JSON.stringify({ error: `Path not found: ${args.path}` })
      }

      const results: FileEntry[] = []
      scanDir(scanRoot, workspaceDir, results, maxDepth, 0)

      if (results.length === 0) {
        return JSON.stringify({
          found: 0,
          message: "No document files found in workspace.",
          files: [],
        })
      }

      // Sort by type then path for readability
      results.sort((a, b) => a.type.localeCompare(b.type) || a.path.localeCompare(b.path))

      // Build markdown table
      const tableRows = results.map((f) => `| ${f.path} | ${f.type} | ${f.size} |`)
      const table = [
        "| File | Type | Size |",
        "|------|------|------|",
        ...tableRows,
      ].join("\n")

      return JSON.stringify({
        found: results.length,
        table,
        files: results,
      })
    } catch (e: any) {
      return JSON.stringify({ error: e.message || String(e) })
    }
  },
})
