import { describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { designRead } from "../lib/runtime"
import { extractDeckHtmlPatchTargets, extractNarrativeCachePatchTargets, runPreWriteChecks } from "../plugins/revela/hooks/revela_guard"
import { commandFromInput, runMaterialReadNotice } from "../plugins/revela/hooks/revela_material_notice"
import { extractDeckHtmlTargets, runPostWriteChecks, workspaceRootFromInput } from "../plugins/revela/hooks/revela_post_write_notice"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("Codex plugin hooks", () => {
  it("extracts deck HTML targets from apply_patch payloads", () => {
    const targets = extractDeckHtmlTargets(`*** Begin Patch
*** Update File: decks/demo.html
@@
*** Update File: notes/readme.md
*** End Patch`)

    expect(targets).toEqual(["decks/demo.html"])
  })

  it("extracts deck HTML targets only from patch file headers for pre-write checks", () => {
    expect(extractDeckHtmlPatchTargets(`*** Begin Patch
*** Update File: docs/guide.md
@@
+Mention decks/demo.html in prose.
*** End Patch`)).toEqual([])

    expect(extractDeckHtmlPatchTargets(hookPayload("/tmp/revela-demo", "decks/demo.html"))).toEqual(["decks/demo.html"])
  })

  it("reads workspace root from JSON hook payloads", () => {
    expect(workspaceRootFromInput(JSON.stringify({ cwd: "/tmp/revela-demo" }))).toBe("/tmp/revela-demo")
  })

  it("runs Artifact QA successfully for a valid touched deck", async () => {
    const root = workspace()
    try {
      writeDeck(root, validDeckHtml())

      const result = await runPostWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(true)
      expect(result.messages.join("\n")).toContain("Artifact QA: PASSED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("fails when a touched deck has no direct slide-canvas", async () => {
    const root = workspace()
    try {
      writeDeck(root, `
        <html><head><style>
          body { margin: 0; }
          .slide { width: 1920px; height: 1080px; }
        </style></head><body>
          <section class="slide" data-slide-index="1"><h1>Missing canvas</h1></section>
        </body></html>
      `)

      const result = await runPostWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("missing_slide_canvas")
      expect(result.messages.join("\n")).toContain("**Artifact QA failed**")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("auto-compiles narrative Markdown patches when the vault is clean", async () => {
    const root = workspace()
    try {
      writeValidVault(root, "Board")

      const result = await runPostWriteChecks(hookPayload(root, "revela-narrative/claims/pilot.md"))

      expect(result.ok).toBe(true)
      expect(result.messages.join("\n")).toContain("Auto-compile completed")
      expect(result.messages.join("\n")).toContain("Status: ok")
      expect(result.messages.join("\n")).toContain("Markdown QA: clean")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("returns a concise Markdown QA blocker notice for invalid narrative Markdown", async () => {
    const root = workspace()
    try {
      writeValidVault(root, "Board")
      writeFileSync(join(root, "revela-narrative", "claims", "pilot.md"), `---
type: claim
id: claim:pilot
kind: recommendation
importance: central
evidenceRequired: true
supportedScope: Pilot decision.
unsupportedScope: Full rollout.
---
Approve a bounded pilot.
---
type: claim
---
## Relations

- supports: [[claim:claim-typed-target]]
- supports: [[claim:missing]]
`, "utf-8")

      const result = await runPostWriteChecks(hookPayload(root, "revela-narrative/claims/pilot.md"))

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("**Markdown QA blocked**")
      expect(result.messages.join("\n")).toContain("duplicate_frontmatter")
      expect(result.messages.join("\n")).toContain("typed_wikilink_target")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not run narrative QA for non-vault Markdown patches", async () => {
    const result = await runPostWriteChecks(hookPayload("/tmp/revela-demo", "researches/topic/findings.md"))

    expect(result.ok).toBe(true)
    expect(result.messages).toEqual([])
  })

  it("blocks deck patches until active design rules are read", async () => {
    const root = workspace()
    try {
      const result = await runPreWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("active design rules must be loaded")
      expect(result.messages.join("\n")).toContain('section: "rules"')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("allows deck patches after active design rules are read", async () => {
    const root = workspace()
    try {
      designRead({ workspaceRoot: root, section: "rules" })

      const result = await runPreWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(true)
      expect(result.messages).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("blocks deck patches when the design rules marker is stale or mismatched", async () => {
    const root = workspace()
    try {
      mkdirSync(join(root, ".opencode", "revela", "codex-hooks"), { recursive: true })
      writeFileSync(join(root, ".opencode", "revela", "codex-hooks", "design-rules-read.json"), JSON.stringify({
        designName: "not-the-active-design",
        rulesHash: "stale",
        readAt: new Date().toISOString(),
      }), "utf-8")

      const result = await runPreWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("active design")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not require design rules for non-deck patches", async () => {
    const result = await runPreWriteChecks("*** Update File: notes/readme.md")

    expect(result.ok).toBe(true)
    expect(result.messages).toEqual([])
  })

  it("blocks direct narrative cache patches", async () => {
    const payload = hookPayload("/tmp/revela-demo", ".opencode/revela/narrative-cache/compiled-narrative.json")

    expect(extractNarrativeCachePatchTargets(payload)).toEqual([".opencode/revela/narrative-cache/compiled-narrative.json"])

    const result = await runPreWriteChecks(payload)

    expect(result.ok).toBe(false)
    expect(result.messages.join("\n")).toContain("narrative cache patches are blocked")
    expect(result.messages.join("\n")).toContain("Edit `revela-narrative/**/*.md`")
  })

  it("extracts shell commands from Codex hook payloads", () => {
    expect(commandFromInput(JSON.stringify({ tool_input: { cmd: "textutil -convert txt proposal.docx -stdout" } }))).toBe("textutil -convert txt proposal.docx -stdout")
  })

  it("notices direct textutil reads for scanned Office material", async () => {
    const root = workspace()
    try {
      mkdirSync(join(root, ".opencode", "revela", "material-intake"), { recursive: true })
      writeFileSync(join(root, ".opencode", "revela", "material-intake", "registry.json"), JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        sources: [{
          sourcePath: "proposal.docx",
          type: "docx",
          status: "scanned",
          requiresExtraction: true,
          allowedReadPath: null,
          extraction: null,
          review: null,
          warnings: [],
          firstSeen: new Date().toISOString(),
          lastChecked: new Date().toISOString(),
        }],
      }), "utf-8")

      const result = await runMaterialReadNotice(JSON.stringify({
        cwd: root,
        tool_input: { cmd: "textutil -convert txt proposal.docx -stdout" },
      }))

      expect(result.ok).toBe(true)
      expect(result.messages.join("\n")).toContain("Revela material intake notice")
      expect(result.messages.join("\n")).toContain("proposal.docx")
      expect(result.messages.join("\n")).toContain("read_view_path")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

function workspace(): string {
  const root = tempWorkspace("revela-codex-hook-test-")
  mkdirSync(join(root, "decks"), { recursive: true })
  return root
}

function writeDeck(root: string, html: string): void {
  writeFileSync(join(root, "decks", "demo.html"), html, "utf-8")
}

function hookPayload(root: string, file: string): string {
  return JSON.stringify({ cwd: root, tool_input: { patch: `*** Update File: ${file}` } })
}

function validDeckHtml(): string {
  return `
    <html><head><style>
      body { margin: 0; }
      .slide { min-height: 100dvh; display: flex; align-items: center; justify-content: center; }
      .slide-canvas { width: 1920px; height: 1080px; }
    </style></head><body>
      <section class="slide" slide-qa="false" data-slide-index="1">
        <div class="slide-canvas"><h1>Valid canvas</h1></div>
      </section>
    </body></html>
  `
}

function writeValidVault(root: string, audience: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:auto-demo\nstatus: ready_for_approval\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), `---\ntype: audience\nprimary: ${audience}\nbeliefBefore: Pilot value is unclear.\nbeliefAfter: Pilot value is bounded by evidence.\n---\n`, "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve a bounded pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:pilot\nconfidence: medium\n---\nA bounded pilot is justified.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim:pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Pilot decision.\nunsupportedScope: Full rollout.\n---\nApprove a bounded pilot.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "pilot.md"), "---\ntype: evidence\nid: evidence:pilot\nclaimId: claim:pilot\nsource: Ops note\nquote: Pilot constraints are explicit.\nsupportScope: Pilot only.\nunsupportedScope: Full rollout.\ncaveat: One source.\nstrength: strong\n---\n", "utf-8")
}
