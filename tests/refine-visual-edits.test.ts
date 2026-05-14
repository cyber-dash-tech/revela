import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import { annotateVisualEditTargets, applyVisualTargetChanges } from "../lib/refine/visual-targets"
import { tempWorkspace } from "./helpers/tool-helpers"

function deckFile(html: string): string {
  const root = tempWorkspace("revela-visual-edits-test-")
  mkdirSync(join(root, "decks"), { recursive: true })
  const file = join(root, "decks", "deck.html")
  writeFileSync(file, html, "utf-8")
  return file
}

function version(file: string): string {
  const stat = statSync(file)
  return `${stat.mtimeMs}:${stat.size}`
}

describe("visual edit targets", () => {
  it("annotates only safe image and block text targets", () => {
    const source = `<html><body><section class="slide"><h1>Title</h1><h4>Subhead</h4><p>Body</p><img src="a.png"><div>Card</div><li>Item</li><canvas></canvas><svg></svg><iframe></iframe><video></video><span>Inline</span></section></body></html>`

    const result = annotateVisualEditTargets(source)

    expect(result.targets.size).toBe(4)
    expect(result.html).toContain(`data-revela-edit-id="rve-1" data-revela-edit-kind="text-width"`)
    expect(result.html).toContain(`data-revela-edit-id="rve-4" data-revela-edit-kind="image"`)
    expect(result.html).not.toContain(`<div data-revela-edit-id`)
    expect(result.html).not.toContain(`<li data-revela-edit-id`)
    expect(result.html).not.toContain(`<canvas data-revela-edit-id`)
    expect(source).not.toContain("data-revela-edit-id")
  })

  it("saves image resize by edit id", () => {
    const file = deckFile(`<html><body><section class="slide"><img class="hero" src="a.png" style="width: 100px; height: 80px"></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    const result = applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "resize", editId: "rve-1", kind: "image", after: { stylePatch: { width: "160px", height: "120px" } } }],
    })

    expect(result.ok).toBe(true)
    expect(readFileSync(file, "utf-8")).toContain(`style="width: 160px; height: 120px"`)
  })

  it("saves paragraph width by edit id without height", () => {
    const file = deckFile(`<html><body><section class="slide"><p class="body">Paragraph</p></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "resize", editId: "rve-1", kind: "text-width", after: { stylePatch: { width: "300px", "max-width": "300px", height: "120px" } } }],
    })

    const html = readFileSync(file, "utf-8")
    expect(html).toContain(`style="width: 300px; max-width: 300px"`)
    expect(html).not.toContain("height: 120px")
  })

  it("rejects stale deck versions", () => {
    const file = deckFile(`<html><body><section class="slide"><img src="a.png"></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    expect(() => applyVisualTargetChanges({
      file,
      deckVersion: "old-version",
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "resize", editId: "rve-1", kind: "image", after: { stylePatch: { width: "160px", height: "120px" } } }],
    })).toThrow("Deck changed outside Review")
  })

  it("rejects stale source offsets", () => {
    const file = deckFile(`<html><body><section class="slide"><img id="hero" src="a.png"></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))
    writeFileSync(file, `<html><body><section class="slide"><img id="hero" src="b.png"></section></body></html>`, "utf-8")

    expect(() => applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "resize", editId: "rve-1", kind: "image", after: { stylePatch: { width: "160px", height: "120px" } } }],
    })).toThrow("Target is no longer editable")
  })

  it("patches multiple targets using original offsets", () => {
    const file = deckFile(`<html><body><section class="slide"><p>A</p><img src="a.png"><p>B</p></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [
        { type: "resize", editId: "rve-1", kind: "text-width", after: { stylePatch: { width: "220px", "max-width": "220px" } } },
        { type: "resize", editId: "rve-2", kind: "image", after: { stylePatch: { width: "160px", height: "120px" } } },
        { type: "resize", editId: "rve-3", kind: "text-width", after: { stylePatch: { width: "260px", "max-width": "260px" } } },
      ],
    })

    const html = readFileSync(file, "utf-8")
    expect(html).toContain(`<p style="width: 220px; max-width: 220px">A</p>`)
    expect(html).toContain(`<img src="a.png" style="width: 160px; height: 120px">`)
    expect(html).toContain(`<p style="width: 260px; max-width: 260px">B</p>`)
  })
})
