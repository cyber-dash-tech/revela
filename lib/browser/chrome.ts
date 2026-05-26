import puppeteer, { type Browser } from "puppeteer-core"
import { existsSync } from "fs"

export const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
]

export function findChromePath(): string {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  throw new Error(
    "Could not find a Chrome/Chromium installation.\n" +
    "Tried:\n" + CHROME_PATHS.map((p) => `  ${p}`).join("\n")
  )
}

export interface LaunchChromeOptions {
  width?: number
  height?: number
  allowFileAccess?: boolean
}

export async function launchChrome(options: LaunchChromeOptions = {}): Promise<Browser> {
  const width = options.width ?? 1920
  const height = options.height ?? 1080
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    `--window-size=${width},${height}`,
  ]

  if (options.allowFileAccess) {
    args.splice(3, 0, "--allow-file-access-from-files")
  }

  return await puppeteer.launch({
    executablePath: findChromePath(),
    headless: true,
    args,
  })
}
