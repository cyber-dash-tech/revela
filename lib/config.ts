/**
 * Config file management for revela.
 *
 * Reads/writes `~/.config/revela/config.json`.
 * All paths are derived from CONFIG_DIR.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { childLog } from "./log"

const configLog = childLog("config")

/** Root config directory for revela runtime data. */
export const CONFIG_DIR = join(homedir(), ".config", "revela")

/** Directory where installed designs are stored at runtime. */
export const DESIGNS_DIR = join(CONFIG_DIR, "designs")

/** Directory where installed domains are stored at runtime. */
export const DOMAINS_DIR = join(CONFIG_DIR, "domains")

/** Path to the main config file. */
export const CONFIG_FILE = join(CONFIG_DIR, "config.json")

/** Path to the dynamically generated system prompt. */
export const ACTIVE_PROMPT_FILE = join(CONFIG_DIR, "_active-prompt.md")

/** Default design name. */
export const DEFAULT_DESIGN = "aurora"

/** Default domain name. */
export const DEFAULT_DOMAIN = "general"

export interface SlidesConfig {
  activeDesign?: string
  activeDomain?: string
  /** Legacy key — fallback for activeDesign. */
  activeTemplate?: string
  /** Legacy key — fallback for activeDomain. */
  activeIndustry?: string
  [key: string]: string | undefined
}

/** Load config.json, returning empty object on any error. */
export function loadConfig(): SlidesConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"))
    }
  } catch (e) {
    configLog.warn("config.json is corrupt or unreadable — using defaults", {
      configFile: CONFIG_FILE,
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return {}
}

/** Write config.json atomically. Creates parent dirs if needed. */
export function saveConfig(config: SlidesConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
}
