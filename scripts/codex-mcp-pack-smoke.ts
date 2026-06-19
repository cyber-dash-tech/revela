import { spawn, spawnSync } from "child_process"
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "fs"
import { join, resolve } from "path"
import { tmpdir } from "os"

const repoRoot = resolve(join(import.meta.dir, ".."))
const timeoutMs = Number(process.env.REVELA_MCP_PACK_SMOKE_TIMEOUT_MS || 30000)
const keepTemp = process.argv.includes("--keep-temp")
const debug = process.argv.includes("--debug")
const tempRoot = resolve(process.env.REVELA_MCP_PACK_SMOKE_DIR || join(tmpdir(), `revela-mcp-pack-smoke-${process.pid}`))
const packDir = join(tempRoot, "pack")
const extractDir = join(tempRoot, "extract")
const npmCache = resolve(process.env.npm_config_cache || join(tempRoot, "npm-cache"))

mkdirSync(packDir, { recursive: true })
mkdirSync(extractDir, { recursive: true })
mkdirSync(npmCache, { recursive: true })

try {
  const tarballPath = packTarball()
  const packageRoot = extractTarball(tarballPath)
  linkInstalledDependencies(packageRoot)
  await smokePackagedPluginMcp(packageRoot, tarballPath)
} finally {
  if (!keepTemp && !process.env.REVELA_MCP_PACK_SMOKE_DIR) {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

function packTarball(): string {
  const result = spawnSync("npm", ["pack", "--pack-destination", packDir, "--json"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      npm_config_cache: npmCache,
    },
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

function extractTarball(tarballPath: string): string {
  const result = spawnSync("tar", ["-xzf", tarballPath, "-C", extractDir], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
  if (result.status !== 0) {
    fail("Packed tarball extraction failed.", { tarballPath, stdout: result.stdout, stderr: result.stderr })
  }

  const packageRoot = join(extractDir, "package")
  const serverPath = join(packageRoot, "plugins", "revela", "mcp", "revela-server.ts")
  if (!existsSync(serverPath)) fail(`Packed Codex MCP server was not found: ${serverPath}`, { tarballPath })
  return packageRoot
}

function linkInstalledDependencies(packageRoot: string): void {
  const sourceNodeModules = join(repoRoot, "node_modules")
  if (!existsSync(sourceNodeModules)) {
    fail("Packed MCP smoke requires installed dependencies. Run bun install before smoke:mcp-pack.", { packageRoot })
  }
  symlinkSync(sourceNodeModules, join(packageRoot, "node_modules"), "dir")
}

async function smokePackagedPluginMcp(packageRoot: string, tarballPath: string): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    const serverPath = join(packageRoot, "plugins", "revela", "mcp", "revela-server.ts")
    const child = spawn("bun", [serverPath], {
      cwd: packageRoot,
      env: {
        ...process.env,
        npm_config_cache: npmCache,
        REVELA_REPO_ROOT: packageRoot,
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
          packageRoot,
          npmCache,
          stdout,
          stderr,
        })
      }
      resolvePromise()
    }

    const timer = setTimeout(() => {
      finish(false, `Timed out after ${timeoutMs}ms waiting for packed Codex plugin MCP initialize/tools-list response.`)
    }, timeoutMs)

    child.stdout.on("data", (data) => {
      stdout += data.toString()
      if (
        stdout.includes("\"id\":1") &&
        stdout.includes("\"serverInfo\"") &&
        stdout.includes("\"id\":2") &&
        stdout.includes("revela_doctor") &&
        stdout.includes("revela_read_deck_plan") &&
        stdout.includes("revela_open_deck") &&
        stdout.includes("revela_switch_deck_design") &&
        stdout.includes("revela_review_deck_read") &&
        !stdout.includes("revela_review_deck_open")
      ) {
        finish(true)
      }
    })
    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })
    child.on("error", (error) => {
      finish(false, `Failed to start packed Codex plugin MCP smoke: ${error.message}`)
    })
    child.on("close", (code) => {
      if (!settled) finish(false, `Packed Codex plugin MCP process exited before tools/list completed with code ${code ?? "unknown"}.`)
    })

    writeMessage(child.stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "revela-packed-plugin-mcp-smoke", version: "0" },
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
    hint: "If npm pack or packaged MCP startup fails, check package contents, Bun availability, and npm cache permissions.",
    ...details,
  }
  process.stderr.write(`${JSON.stringify(enriched, null, 2)}\n`)
  process.exit(1)
}
