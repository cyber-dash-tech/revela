import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { listResearchImageLeads } from "../lib/research/image-leads"

let workspaceDir = ""

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "revela-image-leads-"))
})

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true })
})

describe("listResearchImageLeads", () => {
  it("parses image leads across multiple research files", () => {
    const researchDir = join(workspaceDir, "researches", "ev-market")
    mkdirSync(researchDir, { recursive: true })
    writeFileSync(join(researchDir, "tesla-profile.md"), `---
topic: ev-market
axis: tesla-profile
---

## Data
- Revenue grew. [Source: https://example.com]

## Images
- Tesla logo: https://example.com/tesla.png | Alt: Tesla corporate logo | Use: logo
- Elon Musk portrait: https://example.com/elon.jpg | Alt: Elon Musk headshot | Use: portrait

## Gaps
- None
`, "utf-8")
    writeFileSync(join(researchDir, "byd-profile.md"), `## Images
- BYD screenshot: https://example.com/byd.png | Alt: BYD product screenshot | Use: screenshot
`, "utf-8")

    const result = listResearchImageLeads("EV Market", workspaceDir)

    expect(result.topic).toBe("ev-market")
    expect(result.warnings).toEqual([])
    expect(result.items).toHaveLength(3)
    expect(result.items).toEqual([
      expect.objectContaining({
        candidateId: "byd-profile:1",
        axis: "byd-profile",
        description: "BYD screenshot",
        use: "screenshot",
        sourceFile: "researches/ev-market/byd-profile.md",
      }),
      expect.objectContaining({
        candidateId: "tesla-profile:1",
        axis: "tesla-profile",
        description: "Tesla logo",
        use: "logo",
        sourceFile: "researches/ev-market/tesla-profile.md",
      }),
      expect.objectContaining({
        candidateId: "tesla-profile:2",
        axis: "tesla-profile",
        description: "Elon Musk portrait",
        use: "portrait",
      }),
    ])
  })

  it("supports axis and use filters", () => {
    const researchDir = join(workspaceDir, "researches", "ev-market")
    mkdirSync(researchDir, { recursive: true })
    writeFileSync(join(researchDir, "tesla-profile.md"), `## Images
- Tesla logo: https://example.com/tesla.png | Alt: Tesla corporate logo | Use: logo
- Elon Musk portrait: https://example.com/elon.jpg | Alt: Elon Musk headshot | Use: portrait
`, "utf-8")
    writeFileSync(join(researchDir, "market-data.md"), `## Images
- Charging screenshot: https://example.com/charging.png | Alt: Charging map | Use: screenshot
`, "utf-8")

    const result = listResearchImageLeads("ev-market", workspaceDir, {
      axis: ["tesla-profile"],
      uses: ["logo"],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual(expect.objectContaining({
      candidateId: "tesla-profile:1",
      use: "logo",
      axis: "tesla-profile",
    }))
  })

  it("normalizes axis and use filters", () => {
    const researchDir = join(workspaceDir, "researches", "ev-market")
    mkdirSync(researchDir, { recursive: true })
    writeFileSync(join(researchDir, "tesla-profile.md"), `## Images
- Tesla logo: https://example.com/tesla.png | Alt: Tesla corporate logo | Use: logo
`, "utf-8")

    const result = listResearchImageLeads("ev-market", workspaceDir, {
      axis: [" Tesla Profile "],
      uses: ["Logo"],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual(expect.objectContaining({
      candidateId: "tesla-profile:1",
      use: "logo",
    }))
  })

  it("marks invalid urls and unknown uses without dropping the lead", () => {
    const researchDir = join(workspaceDir, "researches", "ev-market")
    mkdirSync(researchDir, { recursive: true })
    writeFileSync(join(researchDir, "tesla-profile.md"), `## Images
- Broken lead: not-a-url | Alt: bad | Use: hero
- Missing alt lead: https://example.com/good.png | Use: logo
- unparsable line
`, "utf-8")

    const result = listResearchImageLeads("ev-market", workspaceDir)

    expect(result.warnings).toEqual([
      "researches/ev-market/tesla-profile.md:4 could not parse image lead",
    ])
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toEqual(expect.objectContaining({
      candidateId: "tesla-profile:1",
      valid: false,
      use: "unknown",
      warnings: ["invalid-url", "unknown-use"],
    }))
    expect(result.items[1]).toEqual(expect.objectContaining({
      candidateId: "tesla-profile:2",
      alt: "",
      valid: true,
      use: "logo",
      warnings: [],
    }))
  })
})
