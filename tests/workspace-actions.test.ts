import { describe, expect, it } from "bun:test"
import { createEmptyDecksState } from "../lib/decks-state"
import { compactActionPayload, MAX_WORKSPACE_ACTIONS, recordWorkspaceAction } from "../lib/workspace-state/actions"

describe("workspace action provenance", () => {
  it("appends compact action records to deck state", () => {
    const state = createEmptyDecksState()

    recordWorkspaceAction(state, {
      type: "workspace.scanned",
      actor: "test",
      timestamp: "2026-05-05T00:00:00.000Z",
      inputs: { path: "", maxDepth: 6 },
      outputs: { found: 1, empty: undefined, paths: ["sources/a.pdf"] },
      summary: "Scanned workspace.",
      nodeIds: ["source:sources/a.pdf", "source:sources/a.pdf"],
    })

    expect(state.actions).toHaveLength(1)
    expect(state.actions[0]).toMatchObject({
      id: expect.stringMatching(/^action:2026-05-05T00:00:00\.000Z:workspace\.scanned:[a-f0-9]{10}$/),
      type: "workspace.scanned",
      actor: "test",
      status: "success",
      inputs: { maxDepth: 6 },
      outputs: { found: 1, paths: ["sources/a.pdf"] },
      nodeIds: ["source:sources/a.pdf"],
    })
  })

  it("compacts long strings, empty values, and large arrays", () => {
    const payload = compactActionPayload({
      blank: " ",
      text: `${"a".repeat(520)}`,
      list: Array.from({ length: 60 }, (_, index) => index),
      nested: { keep: "yes", drop: undefined },
    })

    expect(payload.blank).toBeUndefined()
    expect(String(payload.text)).toEndWith("... [truncated]")
    expect(payload.list).toHaveLength(50)
    expect(payload.nested).toEqual({ keep: "yes" })
  })

  it("caps action history to the latest records", () => {
    const state = createEmptyDecksState()
    for (let index = 0; index < MAX_WORKSPACE_ACTIONS + 5; index += 1) {
      recordWorkspaceAction(state, {
        type: "review.performed",
        timestamp: `2026-05-05T00:00:${String(index).padStart(2, "0")}.000Z`,
        outputs: { index },
      })
    }

    expect(state.actions).toHaveLength(MAX_WORKSPACE_ACTIONS)
    expect(state.actions[0].outputs).toEqual({ index: 5 })
  })
})
