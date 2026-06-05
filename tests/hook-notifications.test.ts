import { describe, expect, it } from "bun:test"
import { formatArtifactQaUserNotice, formatMarkdownQaUserNotice, formatStateGateUserNotice } from "../lib/hook-notifications"

describe("hook user notifications", () => {
  it("formats markdown QA blocker notices", () => {
    const notice = formatMarkdownQaUserNotice({
      ok: false,
      mirrored: "preserved_failed_compile",
      cachePath: ".revela/narrative-cache",
      touched: ["revela-narrative/thesis.md"],
      markdownQa: {
        ok: false,
        repairCards: [],
        blockers: [
          {
            severity: "error",
            file: "thesis.md",
            issueCode: "duplicate_frontmatter",
            message: "Duplicate frontmatter.",
            smallestRepair: "Keep one leading frontmatter block.",
          },
        ],
        warnings: [],
      },
      markdown: "",
    })

    expect(notice).toContain("Markdown QA blocked")
    expect(notice).toContain("revela-narrative/thesis.md")
    expect(notice).toContain("duplicate_frontmatter")
    expect(notice).toContain("Keep one leading frontmatter block")
  })

  it("does not format markdown QA notices when clean", () => {
    expect(formatMarkdownQaUserNotice({ ok: true, mirrored: "updated", cachePath: "cache", touched: [], markdown: "" })).toBeUndefined()
  })

  it("formats artifact QA failed notices", () => {
    const notice = formatArtifactQaUserNotice({
      file: "decks/demo.html",
      passed: false,
      hardErrorCount: 2,
      warningCount: 1,
      sections: ["**[deck HTML contract]**\n\nSlide is invalid."],
    })

    expect(notice).toContain("Artifact QA failed")
    expect(notice).toContain("decks/demo.html")
    expect(notice).toContain("Hard errors: 2; warnings: 1")
    expect(notice).toContain("[deck HTML contract]")
  })

  it("formats state gate notices", () => {
    const notice = formatStateGateUserNotice("patch", "DECKS.json is controlled")

    expect(notice).toContain("state gate blocked")
    expect(notice).toContain("Operation: patch")
    expect(notice).toContain("DECKS.json is controlled")
  })
})
