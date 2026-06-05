import { spawn, spawnSync } from "child_process"
import { existsSync, mkdirSync, readdirSync, rmSync } from "fs"
import { join, resolve } from "path"
import { tmpdir } from "os"

const repoRoot = resolve(join(import.meta.dir, ".."))
const timeoutMs = Number(process.env.REVELA_MCP_PACK_SMOKE_TIMEOUT_MS || 30000)
const keepTemp = process.argv.includes("--keep-temp")
const debug = process.argv.includes("--debug")
const tempRoot = resolve(process.env.REVELA_MCP_PACK_SMOKE_DIR || join(tmpdir(), `revela-mcp-pack-smoke-${process.pid}`))
const packDir = join(tempRoot, "pack")
const npmCache = resolve(process.env.npm_config_cache || join(tempRoot, "npm-cache"))

mkdirSync(packDir, { recursive: true })
mkdirSync(npmCache, { recursive: true })

try {
  const tarballPath = packTarball()
  await smokeNpxMcp(tarballPath)
} finally {
  if (!keepTemp && !process.env.REVELA_MCP_PACK_SMOKE_DIR) {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

function packTarball(): string {
  const result = spawnSync("npm", ["pack", "--pack-destination", packDir, "--json"], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
  if (result.status !== 0) {
    fail("npm pack failed.", { stdout: result.stdout, stderr: result.stderr })
  }

  const tgz = readdirSync(packDir).find((item) => item.endsWith(".tgz"))
  if (!tgz) fail("npm pack did not produce a .tgz file.", { stdout: result.stdout, stderr: result.stderr })
  const tarballPath = join(packDir, tgz)
  if (!existsSync(tarballPath)) fail(`Packed tarball was not found: ${tarballPath}`)
  return tarballPath
}

async function smokeNpxMcp(tarballPath: string): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    const child = spawn("npx", ["-y", "--package", tarballPath, "revela", "mcp"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        npm_config_cache: npmCache,
        ...(debug ? { REVELA_MCP_DEBUG: "1" } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (ok: boolean, message?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      if (!ok) {
        fail(message || "Packed MCP smoke failed.", {
          tarballPath,
          npmCache,
          stdout,
          stderr,
        })
      }
      resolvePromise()
    }

    const timer = setTimeout(() => {
      finish(false, `Timed out after ${timeoutMs}ms waiting for packed npx MCP initialize/tools-list response.`)
    }, timeoutMs)

    child.stdout.on("data", (data) => {
      stdout += data.toString()
      if (
        stdout.includes("\"id\":2") &&
        stdout.includes("revela_doctor") &&
        stdout.includes("revela_read_deck_plan") &&
        stdout.includes("revela_review_deck_read") &&
        stdout.includes("revela_review_deck_open")
      ) {
        finish(true)
      }
    })
    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })
    child.on("error", (error) => {
      finish(false, `Failed to start npx for packed MCP smoke: ${error.message}`)
    })
    child.on("close", (code) => {
      if (!settled) finish(false, `Packed npx MCP process exited before tools/list completed with code ${code ?? "unknown"}.`)
    })

    writeMessage(child.stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "revela-packed-mcp-smoke", version: "0" },
      },
    })
    writeMessage(child.stdin, { jsonrpc: "2.0", method: "notifications/initialized" })
    writeMessage(child.stdin, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  })
}

function writeMessage(stdin: NodeJS.WritableStream, message: unknown): void {
  const body = JSON.stringify(message)
  stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

function fail(message: string, details: Record<string, unknown> = {}): never {
  process.stderr.write(`${message}\n`)
  const enriched = {
    npmCache,
    tempRoot,
    hint: "If npx fails before launching Revela, check npm cache permissions or rerun with a writable npm_config_cache.",
    ...details,
  }
  process.stderr.write(`${JSON.stringify(enriched, null, 2)}\n`)
  process.exit(1)
}
