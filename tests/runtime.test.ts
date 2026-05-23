import { describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { compileNarrativeVault } from "../lib/narrative-vault/compile"
import { readDeckPlan } from "../lib/runtime"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("runtime facade", () => {
  it("passes compiled narrative hash into deck-plan stale detection", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-hash-")
    writeMinimalVault(root)
    writeDeckPlan(root, "stale-narrative-hash")

    const result = readDeckPlan({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    expect(result.warnings).toContain("Deck plan narrativeHash does not match current narrative state.")
    expect(result.projection?.diagnostics).toContainEqual(expect.objectContaining({
      code: "stale_narrative_hash",
      file: "deck-plan/index.md",
    }))
  })

  it("does not warn when deck-plan narrative hash matches the compiled vault", () => {
    const root = tempWorkspace("revela-runtime-deck-plan-current-")
    writeMinimalVault(root)
    const compiled = compileNarrativeVault(root)
    writeDeckPlan(root, computeNarrativeHash(compiled.narrative!))

    const result = readDeckPlan({ workspaceRoot: root })

    expect(result.ok).toBe(true)
    expect(result.warnings).not.toContain("Deck plan narrativeHash does not match current narrative state.")
    expect(result.projection?.diagnostics.some((item) => item.code === "stale_narrative_hash")).toBe(false)
  })
})

function writeMinimalVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:runtime-demo\nstatus: draft\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Executive committee\nbeliefBefore: Needs proof.\nbeliefAfter: Trusts a bounded pilot.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:runtime-demo\nconfidence: medium\n---\nA bounded pilot is the recommended next step.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim-pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\n---\nApprove a bounded pilot.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence-pilot\nsource: Proposal\nsourcePath: proposal.md\nquote: Pilot approval is requested.\nsupportScope: Supports the internal pilot request.\nunsupportedScope: Does not prove external market demand.\ncaveat: Intent evidence only.\nstrength: partial\n---\n\n## Relations\n\n- supports: [[claim-pilot]] - Proposal states the pilot request.\n", "utf-8")
}

function writeDeckPlan(root: string, narrativeHash: string): void {
  mkdirSync(join(root, "deck-plan", "slides"), { recursive: true })
  writeFileSync(join(root, "deck-plan", "index.md"), `---
id: deck-plan
narrativeHash: ${narrativeHash}
outputPath: decks/runtime-demo.html
---

# Deck Plan

## Source Authority

- Meaning: revela-narrative/.

## Audience / Goal / Decision

- Audience: Executive committee.

## Deck Parameters

- Target slides: 5.

## Chapter Map

- Pilot: slides 1-5.

## Slide Plan

- Slide 1: Cover.

## Evidence Trace

- Preserve evidence trace.

## Boundary / Risk Treatment

- Keep caveats visible.

## Chapter Writing Batches

- Batch 1: all slides.

## HTML Identity Contract

- Use positive 1-based slide indexes.
`, "utf-8")
}

