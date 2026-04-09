#!/usr/bin/env node
/**
 * scripts/seed.js — postinstall seed script
 *
 * Copies built-in designs and domains to ~/.config/revela/ if they don't
 * already exist. Runs automatically via `postinstall` in package.json.
 *
 * Rules:
 * - Only copies entries that are NOT already present in the target directory.
 * - Existing user-installed designs/domains are never overwritten.
 * - Creates the target directory structure if it doesn't exist.
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { homedir } from "os"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PKG_ROOT = join(__dirname, "..")
const CONFIG_DIR = join(homedir(), ".config", "revela")
const DESIGNS_SRC = join(PKG_ROOT, "designs")
const DOMAINS_SRC = join(PKG_ROOT, "domains")
const DESIGNS_DEST = join(CONFIG_DIR, "designs")
const DOMAINS_DEST = join(CONFIG_DIR, "domains")

/**
 * Seed a resource directory (designs or domains).
 * For each subdirectory in `src`, if the corresponding directory in `dest`
 * does not exist, copy it recursively.
 *
 * @param {string} src  - source directory (inside the package)
 * @param {string} dest - destination directory (inside ~/.config/revela/)
 * @param {string} label - human-readable label for logging
 */
function seedDir(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[revela] seed: source directory not found: ${src}`)
    return
  }

  mkdirSync(dest, { recursive: true })

  const entries = readdirSync(src, { withFileTypes: true })
  let copied = 0
  let skipped = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const srcEntry = join(src, entry.name)
    const destEntry = join(dest, entry.name)

    if (existsSync(destEntry)) {
      skipped++
      continue
    }

    cpSync(srcEntry, destEntry, { recursive: true })
    copied++
  }

  console.log(`[revela] seed ${label}: ${copied} copied, ${skipped} skipped`)
}

console.log(`[revela] postinstall seed → ${CONFIG_DIR}`)
seedDir(DESIGNS_SRC, DESIGNS_DEST, "designs")
seedDir(DOMAINS_SRC, DOMAINS_DEST, "domains")
console.log("[revela] seed complete")
