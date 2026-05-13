import { mkdtempSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import decksTool from "../../tools/decks"

type TestTool = { execute: (input: any, context: any) => unknown | Promise<unknown> }

export function tempWorkspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function readJsonFile<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8"))
}

export function readTextFile(path: string): string {
  return readFileSync(path, "utf-8")
}

export function validPngBuffer(): Uint8Array {
  return new Uint8Array(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1EAAAAASUVORK5CYII=",
    "base64",
  ))
}

export function mockFetchWith(
  originalFetch: typeof fetch,
  responseFactory: (...args: Parameters<typeof fetch>) => Promise<Response> | Response,
): typeof fetch {
  return Object.assign(
    async (...args: Parameters<typeof fetch>) => await responseFactory(...args),
    { preconnect: originalFetch.preconnect.bind(originalFetch) },
  ) as typeof fetch
}

export async function runDecksTool(input: Record<string, unknown>, workspaceRoot: string): Promise<string> {
  return runTool(decksTool as unknown as TestTool, input, workspaceRoot)
}

export async function executeDecksTool<T = any>(input: Record<string, unknown>, workspaceRoot: string): Promise<T> {
  return executeTool(decksTool as unknown as TestTool, input, workspaceRoot)
}

export async function runTool(tool: TestTool, input: Record<string, unknown>, workspaceRoot: string): Promise<string> {
  return String(await tool.execute(input, { directory: workspaceRoot }))
}

export async function executeTool<T = any>(tool: TestTool, input: Record<string, unknown>, workspaceRoot: string): Promise<T> {
  return JSON.parse(await runTool(tool, input, workspaceRoot))
}
