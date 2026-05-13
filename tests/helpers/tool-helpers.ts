import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import decksTool from "../../tools/decks"

type TestTool = { execute: (input: any, context: any) => unknown | Promise<unknown> }

export function tempWorkspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
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
