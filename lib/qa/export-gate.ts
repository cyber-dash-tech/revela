import { formatReport, runQA } from "./index"
import { assertDeckHtmlContractValid } from "../deck-html/contract"

export interface ExportQAGateOptions {
  workspaceRoot?: string
}

export async function assertExportQAPassed(filePath: string, options: ExportQAGateOptions = {}): Promise<void> {
  if (options.workspaceRoot) assertDeckHtmlContractValid(options.workspaceRoot, filePath)

  const report = await runQA(filePath)
  if (report.totalIssues === 0) return

  throw new Error(
    "Export blocked because pre-export QA found issues. Fix them and export again.\n\n" +
    formatReport(report)
  )
}
