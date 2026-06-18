import puppeteer, { type Browser } from "puppeteer-core"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

export const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
]

export const CHROME_PATH_ENV_VARS = ["REVELA_CHROME_PATH", "PUPPETEER_EXECUTABLE_PATH"] as const

export function findChromePath(): string {
  for (const envName of CHROME_PATH_ENV_VARS) {
    const override = process.env[envName]?.trim()
    if (!override) continue
    if (existsSync(override)) return override
    throw new Error(
      `Chrome executable configured by ${envName} does not exist: ${override}\n` +
      "Set REVELA_CHROME_PATH to a valid Chrome/Chromium binary, or unset the override to use auto-detection."
    )
  }

  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  throw new Error(
    "Could not find a Chrome/Chromium installation.\n" +
    "Tried:\n" + CHROME_PATHS.map((p) => `  ${p}`).join("\n") + "\n" +
    "You can set REVELA_CHROME_PATH=/path/to/chromium or PUPPETEER_EXECUTABLE_PATH=/path/to/chrome."
  )
}

export interface LaunchChromeOptions {
  width?: number
  height?: number
  allowFileAccess?: boolean
}

export function createChromeUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), "revela-chrome-"))
}

export function cleanupChromeUserDataDir(userDataDir: string): void {
  rmSync(userDataDir, { recursive: true, force: true })
}

function withProfileCleanup(browser: Browser, userDataDir: string): Browser {
  const originalClose = browser.close.bind(browser)
  browser.close = async () => {
    try {
      await originalClose()
    } finally {
      try {
        cleanupChromeUserDataDir(userDataDir)
      } catch (error) {
        console.warn(`Could not clean up Chrome profile ${userDataDir}: ${String(error)}`)
      }
    }
  }
  return browser
}

function formatLaunchError(error: unknown, executablePath: string, userDataDir: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(
    "Failed to launch Chrome/Chromium for Revela browser-backed checks.\n" +
    `Executable: ${executablePath}\n` +
    `Platform: ${process.platform} ${process.arch}\n` +
    `Temporary profile: ${userDataDir}\n` +
    `REVELA_CHROME_PATH: ${process.env.REVELA_CHROME_PATH || "(unset)"}\n` +
    `PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || "(unset)"}\n` +
    "If this happens in Codex/macOS, set REVELA_CHROME_PATH to a Chrome/Chromium binary that can run headless, " +
    "or run browser-backed tests in an environment that allows Chrome to start.\n" +
    `Original error: ${message}`
  )
}

export async function launchChrome(options: LaunchChromeOptions = {}): Promise<Browser> {
  const width = options.width ?? 1920
  const height = options.height ?? 1080
  const executablePath = findChromePath()
  const userDataDir = createChromeUserDataDir()
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-hang-monitor",
    "--disable-popup-blocking",
    "--disable-prompt-on-repost",
    "--disable-sync",
    "--disable-translate",
    "--metrics-recording-only",
    "--mute-audio",
    "--safebrowsing-disable-auto-update",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    `--window-size=${width},${height}`,
  ]

  if (options.allowFileAccess) {
    args.push("--allow-file-access-from-files")
  }

  try {
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      userDataDir,
      args,
    })
    return withProfileCleanup(browser, userDataDir)
  } catch (error) {
    try {
      cleanupChromeUserDataDir(userDataDir)
    } catch (cleanupError) {
      console.warn(`Could not clean up Chrome profile ${userDataDir}: ${String(cleanupError)}`)
    }
    throw formatLaunchError(error, executablePath, userDataDir)
  }
}
