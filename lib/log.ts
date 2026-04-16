import { Logger } from "tslog"

/**
 * Revela structured logger (tslog).
 *
 * Log levels:
 *   0 = silly, 1 = trace, 2 = debug, 3 = info, 4 = warn, 5 = error, 6 = fatal
 *
 * Set REVELA_DEBUG=1 to enable debug-level output (minLevel 2).
 * Default minLevel is 3 (info) in production.
 */
const minLevel = process.env.REVELA_DEBUG === "1" ? 2 : 3

export const log = new Logger({
  name: "revela",
  minLevel,
  type: "json",
  hideLogPositionForProduction: true,
  overwrite: {
    transportJSON: (_logObj: unknown) => {
      // Silenced: revela runs as an OpenCode plugin; writing to stderr
      // pollutes the host terminal. Logs are intentionally suppressed.
    },
  },
})

/**
 * Create a child logger for a specific sub-module.
 *
 * @example
 * const qaLog = childLog("qa")
 * qaLog.info("measuring slides", { file: htmlPath })
 */
export function childLog(name: string) {
  return log.getSubLogger({ name })
}
