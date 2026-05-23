import { resolveRevelaRuntime } from "./runtime-resolver"
import { appendFileSync } from "fs"

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: any
}

type RuntimeModule = {
  doctor(input?: any): any
  compileNarrative(input?: any): any
  markdownQa(input?: any): any
  readDeckPlan(input?: any): any
  createDeckFoundation(input: any): any
  runDeckQa(input: any): Promise<any>
  exportPdf(input: any): Promise<any>
  exportPptx(input: any): Promise<any>
  designList(): any
  designRead(input?: any): any
}

type MessageMode = "framed" | "raw"

const tools = [
  {
    name: "revela_doctor",
    description: "Inspect Revela workspace availability and basic file-native state.",
    inputSchema: objectSchema({ workspaceRoot: stringProp("Optional workspace root.") }),
  },
  {
    name: "revela_compile_narrative",
    description: "Compile revela-narrative/ Markdown into canonical NarrativeStateV1 diagnostics.",
    inputSchema: objectSchema({ workspaceRoot: stringProp("Optional workspace root.") }),
  },
  {
    name: "revela_markdown_qa",
    description: "Run Markdown QA for the Revela narrative vault.",
    inputSchema: objectSchema({
      workspaceRoot: stringProp("Optional workspace root."),
      scope: enumProp(["touched", "affected", "full"], "QA scope."),
      strictness: enumProp(["authoring", "readiness", "render"], "QA strictness."),
      touched: arrayProp("Touched vault files."),
    }),
  },
  {
    name: "revela_read_deck_plan",
    description: "Read the file-native deck-plan/ projection and diagnostics.",
    inputSchema: objectSchema({ workspaceRoot: stringProp("Optional workspace root.") }),
  },
  {
    name: "revela_create_deck_foundation",
    description: "Create or repair a file-native Revela HTML deck foundation shell.",
    inputSchema: objectSchema({
      workspaceRoot: stringProp("Optional workspace root."),
      outputPath: requiredStringProp("Workspace-relative HTML output path."),
      title: requiredStringProp("HTML title."),
      language: requiredStringProp("HTML language tag."),
      designName: stringProp("Optional design name."),
      mode: enumProp(["create", "repair"], "Create or repair mode."),
      overwrite: booleanProp("Whether create mode may overwrite an existing file."),
    }, ["outputPath", "title", "language"]),
  },
  {
    name: "revela_run_deck_qa",
    description: "Run Revela artifact QA on a generated HTML deck.",
    inputSchema: objectSchema({
      workspaceRoot: stringProp("Optional workspace root."),
      file: requiredStringProp("Workspace-relative or absolute HTML deck path."),
    }, ["file"]),
  },
  {
    name: "revela_export_pdf",
    description: "Run export QA and export a Revela HTML deck to PDF.",
    inputSchema: objectSchema({
      workspaceRoot: stringProp("Optional workspace root."),
      file: requiredStringProp("Workspace-relative or absolute HTML deck path."),
    }, ["file"]),
  },
  {
    name: "revela_export_pptx",
    description: "Run export QA and export a Revela HTML deck to PPTX.",
    inputSchema: objectSchema({
      workspaceRoot: stringProp("Optional workspace root."),
      file: requiredStringProp("Workspace-relative or absolute HTML deck path."),
    }, ["file"]),
  },
  {
    name: "revela_design_list",
    description: "List installed Revela designs and the active design.",
    inputSchema: objectSchema({}),
  },
  {
    name: "revela_design_read",
    description: "Read Revela design instructions for the active or requested design.",
    inputSchema: objectSchema({ name: stringProp("Optional design name.") }),
  },
]

let runtimePromise: Promise<RuntimeModule> | undefined
const debugEnabled = process.env.REVELA_MCP_DEBUG === "1"
const bootLogEnabled = process.env.REVELA_MCP_BOOT_LOG === "1"
const bootLogPath = "/tmp/revela-mcp-boot.log"
let activeResponseMode: MessageMode = "framed"

async function runtime(): Promise<RuntimeModule> {
  runtimePromise ??= import(runtimeUrl()) as Promise<RuntimeModule>
  return runtimePromise
}

function runtimeUrl(): string {
  const pluginRoot = new URL("..", import.meta.url).pathname
  const resolved = resolveRevelaRuntime({ pluginRoot })
  if (!resolved.ok || !resolved.runtimePath) {
    throw new Error(`Could not resolve Revela runtime. ${resolved.diagnostics.join(" ")}`)
  }
  debug("runtime", { pluginRoot, source: resolved.source, runtimePath: resolved.runtimePath })
  return new URL(`file://${resolved.runtimePath}`).href
}

async function handle(req: JsonRpcRequest): Promise<any | undefined> {
  if (!req.id && String(req.method || "").startsWith("notifications/")) return undefined

  try {
    debug("request", { id: req.id, method: req.method })
    bootLog("request", { id: req.id, method: req.method })
    if (req.method === "initialize") {
      bootLog("initialize-received", { id: req.id, protocolVersion: req.params?.protocolVersion })
      return result(req.id, {
        protocolVersion: req.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "revela", version: "0.1.0" },
      })
    }
    if (req.method === "tools/list") {
      return result(req.id, { tools })
    }
    if (req.method === "tools/call") {
      const name = req.params?.name
      const args = req.params?.arguments ?? {}
      const value = await callTool(name, args)
      return result(req.id, {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      })
    }
    return error(req.id, -32601, `Unknown method: ${req.method}`)
  } catch (e) {
    return error(req.id, -32000, e instanceof Error ? e.message : String(e))
  }
}

async function callTool(name: string, args: any): Promise<any> {
  const r = await runtime()
  if (name === "revela_doctor") return r.doctor(args)
  if (name === "revela_compile_narrative") return r.compileNarrative(args)
  if (name === "revela_markdown_qa") return r.markdownQa(args)
  if (name === "revela_read_deck_plan") return r.readDeckPlan(args)
  if (name === "revela_create_deck_foundation") return r.createDeckFoundation(args)
  if (name === "revela_run_deck_qa") return r.runDeckQa(args)
  if (name === "revela_export_pdf") return r.exportPdf(args)
  if (name === "revela_export_pptx") return r.exportPptx(args)
  if (name === "revela_design_list") return r.designList()
  if (name === "revela_design_read") return r.designRead(args)
  throw new Error(`Unknown tool: ${name}`)
}

function result(id: JsonRpcRequest["id"], value: any): any {
  return { jsonrpc: "2.0", id, result: value }
}

function error(id: JsonRpcRequest["id"], code: number, message: string): any {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

function objectSchema(properties: Record<string, any>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false }
}

function requiredStringProp(description: string) {
  return { type: "string", description }
}

function stringProp(description: string) {
  return { type: "string", description }
}

function booleanProp(description: string) {
  return { type: "boolean", description }
}

function enumProp(values: string[], description: string) {
  return { type: "string", enum: values, description }
}

function arrayProp(description: string) {
  return { type: "array", items: { type: "string" }, description }
}

function writeMessage(message: any, mode: MessageMode = activeResponseMode): void {
  activeResponseMode = mode
  const body = JSON.stringify(message)
  debug("response", {
    id: message?.id,
    mode,
    result: message?.result ? Object.keys(message.result) : undefined,
    error: message?.error?.message,
  })
  bootLog("response-written", {
    id: message?.id,
    mode,
    result: message?.result ? Object.keys(message.result) : undefined,
    error: message?.error?.message,
    bytes: Buffer.byteLength(body, "utf8"),
  })
  if (mode === "raw") {
    process.stdout.write(`${body}\n`)
    return
  }
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`)
}

async function main(): Promise<void> {
  debug("startup", { script: import.meta.path })
  bootLog("server-loaded", { script: import.meta.path, cwd: process.cwd() })
  const reader = Bun.stdin.stream().getReader()
  bootLog("stdin-reader-started", {})
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array()

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      bootLog("stdin-done", { bufferedBytes: buffer.byteLength })
      break
    }
    buffer = concatBytes(buffer, value)
    const parsed = parseMessages(buffer)
    const responseMode = parsed.mode || activeResponseMode
    activeResponseMode = responseMode
    if (parsed.messages.length > 0) {
      debug("parse", { mode: parsed.mode, messages: parsed.messages.length })
      bootLog("messages-parsed", { mode: parsed.mode, messages: parsed.messages.length, remainingBytes: parsed.remaining.byteLength })
    }
    buffer = parsed.remaining
    for (const message of parsed.messages) {
      const response = await handle(message)
      if (response) writeMessage(response, responseMode)
    }
  }

  const trimmed = decode(buffer).trim()
  if (trimmed) {
    bootLog("line-buffer-parse", { chars: trimmed.length })
    for (const message of parseLineMessages(trimmed)) {
      const response = await handle(message)
      if (response) writeMessage(response, "raw")
    }
  }
}

function parseFramedMessages(input: Uint8Array<ArrayBufferLike>): {
  messages: JsonRpcRequest[]
  remaining: Uint8Array<ArrayBufferLike>
} {
  const messages: JsonRpcRequest[] = []
  let cursor = 0
  while (cursor < input.byteLength) {
    const headerEnd = indexOfHeaderEnd(input, cursor)
    if (headerEnd === -1) break
    const header = decode(input.slice(cursor, headerEnd))
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) break
    const length = Number(match[1])
    const start = headerEnd + 4
    const end = start + length
    if (input.byteLength < end) break
    messages.push(JSON.parse(decode(input.slice(start, end))))
    cursor = end
  }
  return { messages, remaining: input.slice(cursor) }
}

function parseMessages(input: Uint8Array<ArrayBufferLike>): {
  messages: JsonRpcRequest[]
  remaining: Uint8Array<ArrayBufferLike>
  mode?: "framed" | "raw"
} {
  const framed = parseFramedMessages(input)
  if (framed.messages.length > 0) return { ...framed, mode: "framed" }

  const remainingText = decode(framed.remaining)
  if (/^\s*Content-Length:/i.test(remainingText) && !remainingText.includes("\r\n\r\n")) {
    return { messages: [], remaining: input }
  }

  const raw = parseRawJsonMessages(remainingText)
  if (raw.messages.length > 0) return { messages: raw.messages, remaining: encode(raw.remaining), mode: "raw" }

  return framed
}

function parseLineMessages(input: string): JsonRpcRequest[] {
  const messages: JsonRpcRequest[] = []
  for (const line of input.split(/\n/).map((item) => item.trim()).filter(Boolean)) {
    messages.push(JSON.parse(line))
  }
  return messages
}

function parseRawJsonMessages(input: string): { messages: JsonRpcRequest[]; remaining: string } {
  const messages: JsonRpcRequest[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  let cursor = 0

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (start === -1) {
      if (/\s/.test(char)) {
        cursor = i + 1
        continue
      }
      if (char !== "{" && char !== "[") return { messages, remaining: input.slice(cursor) }
      start = i
      depth = 1
      inString = false
      escaped = false
      continue
    }

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
    } else if (char === "{" || char === "[") {
      depth++
    } else if (char === "}" || char === "]") {
      depth--
      if (depth === 0) {
        const end = i + 1
        messages.push(JSON.parse(input.slice(start, end)))
        cursor = end
        start = -1
      }
    }
  }

  return { messages, remaining: input.slice(start === -1 ? cursor : start) }
}

function concatBytes(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
  const next = new Uint8Array(a.byteLength + b.byteLength)
  next.set(a)
  next.set(b, a.byteLength)
  return next
}

function indexOfHeaderEnd(input: Uint8Array<ArrayBufferLike>, offset: number): number {
  for (let i = offset; i <= input.byteLength - 4; i++) {
    if (input[i] === 13 && input[i + 1] === 10 && input[i + 2] === 13 && input[i + 3] === 10) return i
  }
  return -1
}

function decode(input: Uint8Array<ArrayBufferLike>): string {
  return new TextDecoder().decode(input)
}

function encode(input: string): Uint8Array {
  return new TextEncoder().encode(input)
}

function debug(event: string, data: Record<string, unknown>): void {
  if (!debugEnabled) return
  process.stderr.write(`[revela-mcp] ${event} ${JSON.stringify(data)}\n`)
}

function bootLog(event: string, data: Record<string, unknown>): void {
  if (!bootLogEnabled) return
  try {
    appendFileSync(bootLogPath, `${new Date().toISOString()} ${event} ${JSON.stringify(data)}\n`, "utf8")
  } catch {
    // Diagnostics must never interfere with the MCP stdio protocol.
  }
}

main().catch((e) => {
  bootLog("top-level-error", { error: e instanceof Error ? e.stack || e.message : String(e) })
  writeMessage(error(null, -32000, e instanceof Error ? e.message : String(e)))
})
