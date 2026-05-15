import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"
import { NARRATIVE_VAULT_NODE_DIRS } from "./constants"
import { parseVaultFrontmatter } from "./frontmatter"
import { splitMarkdownSections } from "./markdown"
import { narrativeVaultPath, vaultRelativePath } from "./paths"
import { parseRelations } from "./relations"
import type { VaultDiagnostic, VaultDocument } from "./types"

export function listNarrativeVaultFiles(workspaceRoot: string): string[] {
  const root = narrativeVaultPath(workspaceRoot)
  if (!existsSync(root)) return []
  const files = ["index.md", "audience.md", "decision.md", "thesis.md"].map((file) => join(root, file)).filter((file) => existsSync(file))
  for (const dir of NARRATIVE_VAULT_NODE_DIRS) {
    const folder = join(root, dir)
    if (!existsSync(folder) || !statSync(folder).isDirectory()) continue
    for (const entry of readdirSync(folder).sort()) {
      const file = join(folder, entry)
      if (entry.endsWith(".md") && statSync(file).isFile()) files.push(file)
    }
  }
  return files
}

export function readNarrativeVaultDocuments(workspaceRoot: string): { documents: VaultDocument[]; diagnostics: VaultDiagnostic[] } {
  const root = narrativeVaultPath(workspaceRoot)
  const diagnostics: VaultDiagnostic[] = []
  const documents = listNarrativeVaultFiles(workspaceRoot).map((path) => {
    const markdown = readFileSync(path, "utf-8")
    const parsed = parseVaultFrontmatter(markdown)
    const split = splitMarkdownSections(parsed.body)
    const id = stringField(parsed.frontmatter, "id")
    const relationResult = id ? parseRelations(split.sections.relations ?? "", id, vaultRelativePath(relative(root, path))) : { relations: [], unknownTypes: [] }
    for (const type of relationResult.unknownTypes) {
      diagnostics.push({ severity: "error", code: "unknown_relation_type", message: `Unknown relation type: ${type}`, file: vaultRelativePath(relative(root, path)), nodeId: id })
    }
    return {
      path,
      relativePath: vaultRelativePath(relative(root, path)),
      frontmatter: parsed.frontmatter,
      body: split.main,
      sections: split.sections,
      relations: relationResult.relations,
    }
  })
  return { documents, diagnostics }
}

function stringField(frontmatter: Record<string, string | string[] | boolean>, key: string): string {
  const value = frontmatter[key]
  return typeof value === "string" ? value.trim() : ""
}
