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
  it("annotates safe image, block text, and box targets", () => {
    const source = `<html><body><section class="slide"><h1>Title</h1><h4>Subhead</h4><p>Body</p><img src="a.png"><div class="card">Card</div><figure>Figure</figure><div>Wrapper</div><li>Item</li><canvas></canvas><svg></svg><iframe></iframe><video></video><span>Inline</span></section></body></html>`

    const result = annotateVisualEditTargets(source)

    expect(result.targets.size).toBe(6)
    expect(result.html).toContain(`data-revela-edit-id="rve-1" data-revela-edit-kind="text-width"`)
    expect(result.html).toContain(`data-revela-edit-id="rve-4" data-revela-edit-kind="image"`)
    expect(result.html).toContain(`data-revela-edit-id="rve-5" data-revela-edit-kind="box"`)
    expect(result.html).toContain(`data-revela-edit-id="rve-6" data-revela-edit-kind="box"`)
    expect(result.html).not.toContain(`<div data-revela-edit-id`)
    expect(result.html).not.toContain(`<li data-revela-edit-id`)
    expect(result.html).not.toContain(`<canvas data-revela-edit-id`)
    expect(source).not.toContain("data-revela-edit-id")
  })

  it("does not annotate slide, chart, or runtime box containers", () => {
    const source = `<html><body><section class="slide"><div class="slide">Slide</div><div class="slide-canvas">Canvas</div><div class="echart-container">Chart</div><div class="echart-panel">Panel</div><div class="chart-container">Chart</div><div class="echarts-tooltip">Runtime</div><div class="card">Card</div></section></body></html>`

    const result = annotateVisualEditTargets(source)

    expect(result.targets.size).toBe(1)
    expect(result.html).toContain(`<div class="card" data-revela-edit-id="rve-1" data-revela-edit-kind="box">Card</div>`)
    expect(result.html).not.toContain(`class="echart-container" data-revela-edit-id`)
    expect(result.html).not.toContain(`class="slide" data-revela-edit-id`)
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

  it("saves box resize by edit id", () => {
    const file = deckFile(`<html><body><section class="slide"><div class="card" style="padding: 12px">Card</div></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "resize", editId: "rve-1", kind: "box", after: { stylePatch: { width: "220px", height: "140px", "max-width": "220px" } } }],
    })

    const html = readFileSync(file, "utf-8")
    expect(html).toContain(`style="padding: 12px; width: 220px; height: 140px"`)
    expect(html).not.toContain("max-width: 220px")
  })

  it("saves image move by edit id as translate", () => {
    const file = deckFile(`<html><body><section class="slide"><img class="hero" src="a.png" style="width: 100px; height: 80px"></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "move", editId: "rve-1", kind: "image", after: { stylePatch: { translate: "12px -8px" } } }],
    })

    expect(readFileSync(file, "utf-8")).toContain(`style="width: 100px; height: 80px; translate: 12px -8px"`)
  })

  it("saves move even when the source target already has complex transform", () => {
    const file = deckFile(`<html><body><section class="slide"><p style="transform: scale(1)">Body</p></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "move", editId: "rve-1", kind: "text-width", after: { stylePatch: { translate: "12px 8px" } } }],
    })

    expect(readFileSync(file, "utf-8")).toContain(`style="transform: scale(1); translate: 12px 8px"`)
  })

  it("allows moving a target that already has translate", () => {
    const file = deckFile(`<html><body><section class="slide"><p style="translate: 4px 5px">Body</p></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "move", editId: "rve-1", kind: "text-width", after: { stylePatch: { translate: "12px 8px" } } }],
    })

    expect(readFileSync(file, "utf-8")).toContain(`style="translate: 12px 8px"`)
  })

  it("accepts legacy transform move payload as translate", () => {
    const file = deckFile(`<html><body><section class="slide"><p style="transform: matrix(1, 0, 0, 1, 4, 5)">Body</p></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [{ type: "move", editId: "rve-1", kind: "text-width", after: { stylePatch: { transform: "matrix(1, 0, 0, 1, 12, 8)" } } }],
    })

    expect(readFileSync(file, "utf-8")).toContain(`style="transform: matrix(1, 0, 0, 1, 4, 5); translate: 12px 8px"`)
  })

  it("merges resize and move changes for the same target", () => {
    const file = deckFile(`<html><body><section class="slide"><img src="a.png" style="width: 100px; height: 80px"></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [
        { type: "resize", editId: "rve-1", kind: "image", after: { stylePatch: { width: "160px", height: "120px" } } },
        { type: "move", editId: "rve-1", kind: "image", after: { stylePatch: { translate: "10px 20px" } } },
      ],
    })

    expect(readFileSync(file, "utf-8")).toContain(`style="width: 160px; height: 120px; translate: 10px 20px"`)
  })

  it("saves box resize and move changes", () => {
    const file = deckFile(`<html><body><section class="slide"><figure class="media-card">Figure</figure></section></body></html>`)
    const annotated = annotateVisualEditTargets(readFileSync(file, "utf-8"))

    applyVisualTargetChanges({
      file,
      deckVersion: version(file),
      targetDeckVersion: version(file),
      targets: annotated.targets,
      changes: [
        { type: "resize", editId: "rve-1", kind: "box", after: { stylePatch: { width: "180px", height: "90px" } } },
        { type: "move", editId: "rve-1", kind: "box", after: { stylePatch: { translate: "8px 12px" } } },
      ],
    })

    expect(readFileSync(file, "utf-8")).toContain(`<figure class="media-card" style="width: 180px; height: 90px; translate: 8px 12px">Figure</figure>`)
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
