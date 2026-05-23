import { spawn } from "child_process"
import { join } from "path"

const mode = process.argv.includes("--raw") ? "raw" : "framed"
const debug = process.argv.includes("--debug")
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
const serverPath = positional[0] || join(import.meta.dir, "..", "plugins", "revela", "mcp", "revela-server.ts")
const serverArgs = positional.slice(1)
const child = spawn("bun", [serverPath, ...serverArgs], {
  env: debug ? { ...process.env, REVELA_MCP_DEBUG: "1" } : process.env,
  stdio: ["pipe", "pipe", "pipe"],
})

let stdout = ""
let stderr = ""
const timer = setTimeout(() => {
  child.kill()
  console.error("Timed out waiting for Revela MCP initialize/tools-list response.")
  if (stdout) console.error(`stdout:\n${stdout}`)
  if (stderr) console.error(`stderr:\n${stderr}`)
  process.exit(2)
}, 3000)

child.stdout.on("data", (data) => {
  stdout += data.toString()
  process.stdout.write(data)
  if (stdout.includes("\"id\":2") && stdout.includes("revela_doctor") && stdout.includes("revela_story_read") && stdout.includes("revela_review_deck_read") && stdout.includes("revela_review_deck_open")) {
    clearTimeout(timer)
    child.kill()
  }
})

child.stderr.on("data", (data) => {
  stderr += data.toString()
  process.stderr.write(data)
})

writeMessage({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "revela-mcp-smoke", version: "0" },
  },
})
writeMessage({ jsonrpc: "2.0", method: "notifications/initialized" })
writeMessage({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })

function writeMessage(message: unknown): void {
  child.stdin.write(mode === "raw" ? JSON.stringify(message) : frame(message))
}

function frame(message: unknown): string {
  const body = JSON.stringify(message)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}
