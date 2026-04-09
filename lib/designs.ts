/**
 * DesignManager — manage revela visual design templates.
 *
 * Designs are stored in ~/.config/revela/designs/<name>/.
 * Each design directory contains DESIGN.md (required) and optionally preview.html.
 *
 * Built-in designs are shipped with the npm package under designs/ and seeded
 * to the config directory on first run.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs"
import { join, resolve, basename } from "path"
import { tmpdir } from "os"
import { parseFrontmatter } from "./frontmatter"
import {
  DESIGNS_DIR,
  DEFAULT_DESIGN,
  loadConfig,
  saveConfig,
} from "./config"

// Seed directory: built-in designs shipped with this package.
const SEED_DIR = resolve(__dirname, "..", "designs")

export interface DesignInfo {
  name: string
  description: string
  author: string
  version: string
  skillText: string
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * Copy built-in designs from the package to ~/.config/revela/designs/.
 * Always overwrites to keep bundled designs up to date.
 * User-created designs (not in the seed directory) are never touched.
 */
export function seedBuiltinDesigns(): void {
  if (!existsSync(SEED_DIR)) return
  mkdirSync(DESIGNS_DIR, { recursive: true })

  for (const entry of readdirSync(SEED_DIR)) {
    const src = join(SEED_DIR, entry)
    if (!statSync(src).isDirectory()) continue
    if (!existsSync(join(src, "DESIGN.md"))) continue

    const dst = join(DESIGNS_DIR, entry)
    mkdirSync(dst, { recursive: true })
    cpSync(src, dst, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Parse a DESIGN.md file into DesignInfo. Returns null on any error. */
export function parseDesignFile(filePath: string): DesignInfo | null {
  try {
    const text = readFileSync(filePath, "utf-8")
    const { meta, body } = parseFrontmatter(text)
    return {
      name: meta.name || basename(join(filePath, "..")),
      description: meta.description || "",
      author: meta.author || "unknown",
      version: meta.version || "0.0.0",
      skillText: body,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all installed designs, sorted by name. */
export function listDesigns(): DesignInfo[] {
  if (!existsSync(DESIGNS_DIR)) return []
  const results: DesignInfo[] = []

  for (const entry of readdirSync(DESIGNS_DIR).sort()) {
    const dir = join(DESIGNS_DIR, entry)
    if (!statSync(dir).isDirectory()) continue
    const mdPath = join(dir, "DESIGN.md")
    if (!existsSync(mdPath)) continue
    const info = parseDesignFile(mdPath)
    if (info) results.push(info)
  }
  return results
}

/** Get the name of the currently active design. */
export function activeDesign(): string {
  const cfg = loadConfig()
  return cfg.activeDesign || cfg.activeTemplate || DEFAULT_DESIGN
}

/** Set the active design. Throws if design is not installed. */
export function activateDesign(name: string): void {
  if (!designExists(name)) {
    throw new Error(`Design '${name}' is not installed`)
  }
  const cfg = loadConfig()
  cfg.activeDesign = name
  saveConfig(cfg)
}

/** Get the skill text body from a design's DESIGN.md. */
export function getDesignSkillMd(name?: string): string {
  const designName = name || activeDesign()
  const mdPath = join(DESIGNS_DIR, designName, "DESIGN.md")
  if (!existsSync(mdPath)) {
    throw new Error(`Design '${designName}' is not installed`)
  }
  const info = parseDesignFile(mdPath)
  if (!info) {
    throw new Error(`Failed to parse DESIGN.md for '${designName}'`)
  }
  return info.skillText
}

/** Remove an installed design. Throws if not found. */
export function removeDesign(name: string): void {
  const dir = join(DESIGNS_DIR, name)
  if (!existsSync(dir)) {
    throw new Error(`Design '${name}' is not installed`)
  }
  rmSync(dir, { recursive: true, force: true })
  // Reset active design if it was the removed one
  if (activeDesign() === name) {
    activateDesign(DEFAULT_DESIGN)
  }
}

/**
 * Install a design from a source.
 *
 * Supported sources:
 * - Local path (starts with `./ ` or `/` or exists on disk)
 * - URL (starts with `http://` or `https://`) — downloads zip
 * - GitHub shorthand `github:user/repo` — converted to zip URL
 *
 * Returns the installed design name.
 */
export async function installDesign(
  source: string,
  name?: string,
): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return installFromUrl(source, name)
  }
  if (source.startsWith("github:")) {
    const repo = source.slice("github:".length)
    const url = `https://github.com/${repo}/archive/refs/heads/main.zip`
    return installFromUrl(url, name)
  }
  // Local path
  return installFromPath(source, name)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function designExists(name: string): boolean {
  const dir = join(DESIGNS_DIR, name)
  return existsSync(dir) && existsSync(join(dir, "DESIGN.md"))
}

function installFromPath(srcPath: string, name?: string): string {
  const resolved = resolve(srcPath)
  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`)
  }
  if (!existsSync(join(resolved, "DESIGN.md"))) {
    throw new Error(`No DESIGN.md found in ${resolved}`)
  }
  const info = parseDesignFile(join(resolved, "DESIGN.md"))
  const designName = name || info?.name || basename(resolved)
  const target = join(DESIGNS_DIR, designName)

  mkdirSync(DESIGNS_DIR, { recursive: true })
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
  }
  cpSync(resolved, target, { recursive: true })
  return designName
}

async function installFromUrl(url: string, name?: string): Promise<string> {
  // Download zip to temp dir
  const tmp = join(tmpdir(), `revela-design-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })

  try {
    const zipPath = join(tmp, "design.zip")
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    writeFileSync(zipPath, buffer)

    // Extract using Bun's built-in or system unzip
    const extractDir = join(tmp, "extracted")
    mkdirSync(extractDir)

    // Use system unzip (available on macOS/Linux)
    const proc = Bun.spawnSync(["unzip", "-q", "-o", zipPath, "-d", extractDir])
    if (proc.exitCode !== 0) {
      throw new Error(`Failed to extract zip: ${proc.stderr.toString()}`)
    }

    // Find DESIGN.md in extracted contents (GitHub zips wrap in a subdirectory)
    const candidates = [extractDir]
    for (const entry of readdirSync(extractDir)) {
      const p = join(extractDir, entry)
      if (statSync(p).isDirectory()) candidates.push(p)
    }

    for (const candidate of candidates) {
      if (existsSync(join(candidate, "DESIGN.md"))) {
        return installFromPath(candidate, name)
      }
    }
    throw new Error("No DESIGN.md found inside the downloaded zip")
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
