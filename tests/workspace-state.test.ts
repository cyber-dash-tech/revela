import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { createEmptyDecksState, readDecksState, writeDecksState } from "../lib/decks-state"
import {
  hasWorkspaceState,
  readOrCreateWorkspaceState,
  readWorkspaceState,
  saveCanonicalState,
  workspaceStatePath,
  writeWorkspaceState,
} from "../lib/workspace-state/repository"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("workspace state repository", () => {
  interface TestState {
    version: 1
    name: string
    normalized?: boolean
  }

  function tempRoot() {
    return tempWorkspace("revela-workspace-state-")
  }

  it("reads and writes the root workspace state file", () => {
    const root = tempRoot()
    const state: TestState = { version: 1, name: "demo" }

    writeWorkspaceState(root, state)

    expect(workspaceStatePath(root)).toBe(join(root, "DECKS.json"))
    expect(hasWorkspaceState(root)).toBe(true)
    expect(readWorkspaceState<TestState>(root)).toEqual(state)
    expect(readFileSync(workspaceStatePath(root), "utf-8").endsWith("\n")).toBe(true)
  })

  it("creates state only when missing", () => {
    const root = tempRoot()
    let createCount = 0
    const create = () => {
      createCount += 1
      return { version: 1 as const, name: "created" }
    }

    expect(readOrCreateWorkspaceState(root, create)).toEqual({ version: 1, name: "created" })
    expect(readOrCreateWorkspaceState(root, create)).toEqual({ version: 1, name: "created" })
    expect(createCount).toBe(1)
  })

  it("applies repository normalization on read and write", () => {
    const root = tempRoot()
    const normalize = (state: TestState): TestState => ({ ...state, normalized: true })

    saveCanonicalState(root, { version: 1, name: "raw" }, { normalize })

    expect(readWorkspaceState<TestState>(root, { normalize })).toEqual({ version: 1, name: "raw", normalized: true })
    expect(JSON.parse(readFileSync(workspaceStatePath(root), "utf-8"))).toEqual({ version: 1, name: "raw", normalized: true })
  })

  it("keeps DECKS.json IO compatible through the repository", () => {
    const root = tempRoot()
    const state = createEmptyDecksState()
    state.actions.push({
      id: "action:test",
      type: "workspace.scanned",
      timestamp: "2026-05-05T00:00:00.000Z",
      status: "success",
    })

    writeDecksState(root, state)

    expect(existsSync(join(root, "DECKS.json"))).toBe(true)
    expect(readDecksState(root)).toEqual(state)
  })
})
