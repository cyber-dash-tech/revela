import { describe, it, expect } from "bun:test"
import { parseFrontmatter } from "../lib/frontmatter"

describe("parseFrontmatter", () => {
  // ── No frontmatter ─────────────────────────────────────────────────────────

  it("returns empty meta and full content as body when no frontmatter", () => {
    const result = parseFrontmatter("Hello world")
    expect(result.meta).toEqual({})
    expect(result.body).toBe("Hello world")
  })

  it("returns empty meta when content starts with non-fence line", () => {
    const result = parseFrontmatter("title: fake\nbody text")
    expect(result.meta).toEqual({})
    expect(result.body).toBe("title: fake\nbody text")
  })

  it("handles empty string input", () => {
    const result = parseFrontmatter("")
    expect(result.meta).toEqual({})
    expect(result.body).toBe("")
  })

  // ── Valid frontmatter ──────────────────────────────────────────────────────

  it("parses a single key-value pair", () => {
    const text = "---\nname: default\n---\nbody"
    const { meta, body } = parseFrontmatter(text)
    expect(meta.name).toBe("default")
    expect(body).toBe("body")
  })

  it("parses multiple key-value pairs", () => {
    const text = "---\nname: minimal\nauthor: alice\nversion: 1.2.3\n---\nbody text"
    const { meta, body } = parseFrontmatter(text)
    expect(meta.name).toBe("minimal")
    expect(meta.author).toBe("alice")
    expect(meta.version).toBe("1.2.3")
    expect(body).toBe("body text")
  })

  it("trims whitespace from keys and values", () => {
    const text = "---\n  name  :  my design  \n---\nbody"
    const { meta } = parseFrontmatter(text)
    expect(meta.name).toBe("my design")
  })

  it("splits only on first colon — value may contain colons", () => {
    const text = "---\nurl: http://example.com/path:8080\n---\nbody"
    const { meta } = parseFrontmatter(text)
    expect(meta.url).toBe("http://example.com/path:8080")
  })

  it("allows empty value (key: with nothing after colon)", () => {
    const text = "---\nkey: \n---\nbody"
    const { meta } = parseFrontmatter(text)
    expect(meta.key).toBe("")
  })

  it("trims leading/trailing whitespace from body", () => {
    const text = "---\nname: x\n---\n\n\nHello\n\n"
    const { body } = parseFrontmatter(text)
    expect(body).toBe("Hello")
  })

  it("handles body that itself contains --- separators", () => {
    const text = "---\nname: x\n---\nFirst part\n---\nSecond part"
    const { meta, body } = parseFrontmatter(text)
    expect(meta.name).toBe("x")
    // Only the first closing fence is consumed
    expect(body).toBe("First part\n---\nSecond part")
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("treats file with only opening --- as no frontmatter (no closing fence)", () => {
    const text = "---\nname: x\nno closing fence"
    const { meta, body } = parseFrontmatter(text)
    // No closing fence found → treat entire content as body
    expect(meta).toEqual({})
    expect(body).toBe(text.trim())
  })

  it("handles empty frontmatter block (--- immediately followed by ---)", () => {
    const text = "---\n---\nbody here"
    const { meta, body } = parseFrontmatter(text)
    expect(meta).toEqual({})
    expect(body).toBe("body here")
  })

  it("skips lines without a colon inside frontmatter block", () => {
    const text = "---\nname: valid\nno-colon-line\nversion: 2.0\n---\nbody"
    const { meta } = parseFrontmatter(text)
    expect(meta.name).toBe("valid")
    expect(meta.version).toBe("2.0")
    // The colon-less line is silently ignored
    expect(Object.keys(meta)).toHaveLength(2)
  })
})
