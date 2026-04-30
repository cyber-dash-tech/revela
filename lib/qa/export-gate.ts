import { formatReport, runQA } from "./index"

export async function assertExportQAPassed(filePath: string): Promise<void> {
  const report = await runQA(filePath)
  if (report.totalIssues === 0) return

  throw new Error(
    "Export blocked because pre-export QA found issues. Fix them and export again.\n\n" +
    formatReport(report)
  )
}
