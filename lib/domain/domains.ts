/**
 * DomainManager — manage revela domain definitions (formerly "industries").
 *
 * Domains are stored in ~/.config/revela/domains/<name>/.
 * Each domain directory contains DOMAIN.md (required).
 *
 * Built-in domains are shipped with the npm package under domains/ and seeded
 * to the config directory on first run.
 *
 * NOTE: For backward compatibility, the .md files inside each domain directory
 * are still named INDUSTRY.md. The config key `activeIndustry` is used as
 * fallback for `activeDomain`.
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
import { parseFrontmatter } from "../frontmatter"
import {
  DOMAINS_DIR,
  DEFAULT_DOMAIN,
  loadConfig,
  saveConfig,
} from "../config"

// Seed directory: built-in domains shipped with this package.
const SEED_DIR = resolve(__dirname, "../..", "domains")

/** The markdown filename inside each domain directory. */
const DOMAIN_FILE = "INDUSTRY.md"

export interface DomainInfo {
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
 * Copy built-in domains from the package to ~/.config/revela/domains/.
 * Always overwrites to keep bundled domains up to date.
 * User-created domains (not in the seed directory) are never touched.
 */
export function seedBuiltinDomains(): void {
  if (!existsSync(SEED_DIR)) return
  mkdirSync(DOMAINS_DIR, { recursive: true })

  for (const entry of readdirSync(SEED_DIR)) {
    const src = join(SEED_DIR, entry)
    if (!statSync(src).isDirectory()) continue
    if (!existsSync(join(src, DOMAIN_FILE))) continue

    const dst = join(DOMAINS_DIR, entry)
    mkdirSync(dst, { recursive: true })
    cpSync(src, dst, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Parse an INDUSTRY.md file into DomainInfo. Returns null on any error. */
export function parseDomainFile(filePath: string): DomainInfo | null {
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

/** List all installed domains, sorted by name. */
export function listDomains(): DomainInfo[] {
  if (!existsSync(DOMAINS_DIR)) return []
  const results: DomainInfo[] = []

  for (const entry of readdirSync(DOMAINS_DIR).sort()) {
    const dir = join(DOMAINS_DIR, entry)
    if (!statSync(dir).isDirectory()) continue
    const mdPath = join(dir, DOMAIN_FILE)
    if (!existsSync(mdPath)) continue
    const info = parseDomainFile(mdPath)
    if (info) results.push(info)
  }
  return results
}

/** Get the name of the currently active domain. */
export function activeDomain(): string {
  const cfg = loadConfig()
  return cfg.activeDomain || cfg.activeIndustry || DEFAULT_DOMAIN
}

/** Set the active domain. Throws if domain is not installed. */
export function activateDomain(name: string): void {
  if (!domainExists(name)) {
    throw new Error(`Domain '${name}' is not installed`)
  }
  const cfg = loadConfig()
  cfg.activeDomain = name
  saveConfig(cfg)
}

/** Get the skill text body from a domain's INDUSTRY.md. */
export function getDomainSkillMd(name?: string): string {
  const domainName = name || activeDomain()
  const mdPath = join(DOMAINS_DIR, domainName, DOMAIN_FILE)
  if (!existsSync(mdPath)) {
    throw new Error(`Domain '${domainName}' is not installed`)
  }
  const info = parseDomainFile(mdPath)
  if (!info) {
    throw new Error(`Failed to parse ${DOMAIN_FILE} for '${domainName}'`)
  }
  return info.skillText
}

/** Remove an installed domain. Throws if not found or is the protected default. */
export function removeDomain(name: string): void {
  if (name === DEFAULT_DOMAIN) {
    throw new Error(`Cannot remove the built-in '${DEFAULT_DOMAIN}' domain`)
  }
  const dir = join(DOMAINS_DIR, name)
  if (!existsSync(dir)) {
    throw new Error(`Domain '${name}' is not installed`)
  }
  rmSync(dir, { recursive: true, force: true })
  // Reset active domain if it was the removed one
  if (activeDomain() === name) {
    activateDomain(DEFAULT_DOMAIN)
  }
}

/**
 * Install a domain from a source.
 *
 * Supported sources:
 * - Local path (starts with `./` or `/` or exists on disk)
 * - URL (starts with `http://` or `https://`) — downloads zip
 * - GitHub shorthand `github:user/repo` — converted to zip URL
 *
 * Returns the installed domain name.
 */
export async function installDomain(
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

function domainExists(name: string): boolean {
  const dir = join(DOMAINS_DIR, name)
  return existsSync(dir) && existsSync(join(dir, DOMAIN_FILE))
}

function installFromPath(srcPath: string, name?: string): string {
  const resolved = resolve(srcPath)
  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`)
  }
  if (!existsSync(join(resolved, DOMAIN_FILE))) {
    throw new Error(`No ${DOMAIN_FILE} found in ${resolved}`)
  }
  const info = parseDomainFile(join(resolved, DOMAIN_FILE))
  const domainName = name || info?.name || basename(resolved)
  const target = join(DOMAINS_DIR, domainName)

  mkdirSync(DOMAINS_DIR, { recursive: true })
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
  }
  cpSync(resolved, target, { recursive: true })
  return domainName
}

async function installFromUrl(url: string, name?: string): Promise<string> {
  const tmp = join(tmpdir(), `revela-domain-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })

  try {
    const zipPath = join(tmp, "domain.zip")
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    writeFileSync(zipPath, buffer)

    const extractDir = join(tmp, "extracted")
    mkdirSync(extractDir)

    const proc = Bun.spawnSync(["unzip", "-q", "-o", zipPath, "-d", extractDir])
    if (proc.exitCode !== 0) {
      throw new Error(`Failed to extract zip: ${proc.stderr.toString()}`)
    }

    const candidates = [extractDir]
    for (const entry of readdirSync(extractDir)) {
      const p = join(extractDir, entry)
      if (statSync(p).isDirectory()) candidates.push(p)
    }

    for (const candidate of candidates) {
      if (existsSync(join(candidate, DOMAIN_FILE))) {
        return installFromPath(candidate, name)
      }
    }
    throw new Error(`No ${DOMAIN_FILE} found inside the downloaded zip`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
