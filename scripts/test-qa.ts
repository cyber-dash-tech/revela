import { runQA, formatReport } from "../lib/qa/index.ts"

const report = await runQA("./slides/ai-power-shift.html")
console.log(formatReport(report))
console.log("\n--- Raw Issues ---")
for (const slide of report.slides) {
  if (slide.issues.length > 0) {
    console.log(`\nSlide ${slide.index + 1}: ${slide.title}`)
    for (const issue of slide.issues) {
      console.log(`  [${issue.severity}] ${issue.type}: ${issue.detail.slice(0, 150)}`)
    }
  }
}
