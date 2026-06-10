#!/usr/bin/env bun

type CommandResult = unknown | Promise<unknown>

const [argvCommand, ...args] = process.argv.slice(2)
const command = process.env.REVELA_CLI_COMMAND || argvCommand

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp()
  process.exit(0)
}

if (command === "mcp") {
  await import("../plugins/revela/mcp/revela-server")
}
else {
  const runtime = await import("../lib/runtime/index")
  const options = parseArgs(args)

  try {
    let result: CommandResult
    if (command === "doctor") result = runtime.doctor(options)
    else if (command === "deck-plan") result = runtime.readDeckPlan(options)
    else if (command === "deck-foundation") result = runtime.createDeckFoundation(required(options, ["outputPath", "title", "language"]))
    else if (command === "qa") result = runtime.runDeckQa(required(options, ["file"]))
    else if (command === "review-read") result = runtime.reviewDeckRead(required(options, ["file"]))
    else if (command === "export-pdf") result = runtime.exportPdf(required(options, ["file"]))
    else if (command === "export-pptx") result = runtime.exportPptx(required(options, ["file"]))
    else if (command === "export-png") result = runtime.exportPng(required(options, ["file"]))
    else if (command === "design-list") result = runtime.designList()
    else if (command === "design-read") result = runtime.designRead(options)
    else if (command === "design-use") result = runtime.designActivate(required(options, ["name"]))
    else if (command === "design-create") result = runtime.designCreate(required(options, ["name", "designMd", "previewHtml"]))
    else if (command === "design-validate") result = runtime.designValidate(required(options, ["name"]))
    else if (command === "design-pack") result = runtime.designPack(required(options, ["name"]))
    else if (command === "design-install-archive") result = runtime.designInstallArchive(required(options, ["archivePath"]))
    else if (command === "domain-list") result = runtime.domainList()
    else if (command === "domain-read") result = runtime.domainRead(options)
    else if (command === "domain-use") result = runtime.domainActivate(required(options, ["name"]))
    else {
      throw new Error(`Unknown command: ${command}`)
    }

    process.stdout.write(`${JSON.stringify(await result, null, 2)}\n`)
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  }
}

function parseArgs(values: string[]): Record<string, any> {
  const result: Record<string, any> = {}
  for (let i = 0; i < values.length; i++) {
    const arg = values[i]
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`)
    const key = arg.slice(2)
    const next = values[i + 1]
    if (next === undefined || next.startsWith("--")) {
      result[key] = true
      continue
    }
    result[key] = parseValue(next)
    i++
  }
  return result
}

function parseValue(value: string): unknown {
  if (value === "true") return true
  if (value === "false") return false
  return value
}

function required(input: Record<string, any>, keys: string[]): Record<string, any> {
  const missing = keys.filter((key) => input[key] === undefined || input[key] === "")
  if (missing.length > 0) throw new Error(`Missing required option(s): ${missing.map((key) => `--${key}`).join(", ")}`)
  return input
}

function printHelp(): void {
  process.stdout.write(`Revela CLI

Usage:
  revela mcp
  revela doctor [--workspaceRoot <path>]
  revela deck-plan [--workspaceRoot <path>]
  revela deck-foundation --outputPath <path> --title <title> --language <tag> [--workspaceRoot <path>] [--designName <name>] [--mode create|repair] [--overwrite true]
  revela qa --file <path> [--workspaceRoot <path>]
  revela review-read --file <path> [--workspaceRoot <path>] [--format json|markdown]
  revela export-pdf --file <path> [--workspaceRoot <path>]  # deck PDF, or single-page PDF fallback for non-deck HTML
  revela export-pptx --file <path> [--workspaceRoot <path>]
  revela export-png --file <path> [--workspaceRoot <path>] [--outputDir <path>]
  revela design-list
  revela design-read [--name <design>] [--section <rules|foundation|chart-rules>] [--workspaceRoot <path>]
  revela design-use --name <design>
  revela design-create --name <design> --designMd <text> --previewHtml <text> [--base <design>] [--overwrite true]
  revela design-validate --name <design>
  revela domain-list
  revela domain-read [--name <domain>]
  revela domain-use --name <domain>
`)
}
