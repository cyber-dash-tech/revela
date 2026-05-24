/**
 * Revela logger facade.
 * Keep this module dependency-free so lightweight runtime tools can load from
 * Codex Git marketplace checkouts that do not have package dependencies
 * installed. Logging is intentionally silent by default because Revela often
 * runs over stdio protocols where stderr noise is user-visible.
 */
type LogMethod = (message?: unknown, ...args: unknown[]) => void

export interface RevelaLogger {
  silly: LogMethod
  trace: LogMethod
  debug: LogMethod
  info: LogMethod
  warn: LogMethod
  error: LogMethod
  fatal: LogMethod
  getSubLogger(input?: { name?: string }): RevelaLogger
}

const noop: LogMethod = () => {}

function createNoopLogger(_name = "revela"): RevelaLogger {
  return {
    silly: noop,
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    getSubLogger: (input?: { name?: string }) => createNoopLogger(input?.name),
  }
}

export const log: RevelaLogger = createNoopLogger()

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
