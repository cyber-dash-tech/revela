import { existsSync } from "fs"
import { resolve } from "path"
import { extractDesignClasses } from "../design/designs"
import { readDeckPlanArtifact } from "../narrative-state/deck-plan-artifact"
import { formatArtifactQAReport, runArtifactQA } from "../qa/artifact"
import { openRefineDeck } from "../refine/open"
import { createCodexExecReviewPromptBridge } from "../refine/prompt-bridge"
import { workspaceRelative } from "../workspace-state/rendered-artifacts"

export interface ReviewDeckReadInput {
  workspaceRoot?: string
  file: string
  format?: "json" | "markdown"
}

export interface ReviewDeckOpenInput extends ReviewDeckReadInput {
  bridge?: "codex-exec"
  openBrowser?: boolean
  openUrl?: (url: string) => void
}

export async function reviewDeckRead(input: ReviewDeckReadInput): Promise<any> {
  const workspaceRoot = root(input.workspaceRoot)
  const requestedFile = input.file?.trim()
  if (!requestedFile) {
    return {
      ok: false,
      file: "",
      error: "Missing required file.",
      diagnostics: [{ severity: "error", code: "missing_file", message: "Provide a workspace-relative or absolute deck HTML file." }],
    }
  }

  const filePath = resolve(workspaceRoot, requestedFile)
  const file = workspaceRelative(workspaceRoot, filePath)
  if (!existsSync(filePath)) {
    return {
      ok: false,
      file,
      error: `Deck HTML file not found: ${file}`,
      diagnostics: [{ severity: "error", code: "file_not_found", message: `Deck HTML file not found: ${file}` }],
    }
  }

  const artifactQa = await readArtifactQa(workspaceRoot, filePath)
  const deckPlan = readDeckPlan(workspaceRoot)
  const diagnostics = {
    artifactQa: artifactQa.summary,
    deckPlan: summarizeDeckPlan(deckPlan),
  }
  const markdown = input.format === "markdown"
    ? formatReviewDeckReadMarkdown({ file, artifactQa, deckPlan })
    : undefined

  return {
    ok: artifactQa.ok,
    file,
    artifactQa,
    deckPlan,
    diagnostics,
    markdown,
  }
}

export async function reviewDeckOpen(input: ReviewDeckOpenInput): Promise<any> {
  const workspaceRoot = root(input.workspaceRoot)
  const requestedFile = input.file?.trim()
  if (!requestedFile) {
    return {
      ok: false,
      file: "",
      error: "Missing required file.",
      diagnostics: [{ severity: "error", code: "missing_file", message: "Provide a workspace-relative or absolute deck HTML file." }],
    }
  }

  try {
    const opened = openRefineDeck(requestedFile, {
      workspaceRoot,
      mode: "edit",
      openBrowser: input.openBrowser,
      openUrl: input.openUrl,
      sessionID: `codex-review:${requestedFile}`,
      promptBridge: createCodexExecReviewPromptBridge(),
      surface: "codex",
    })
    return {
      ok: true,
      file: opened.deck.file,
      deck: {
        slug: opened.deck.slug,
        file: opened.deck.file,
        source: opened.deck.source,
      },
      bridge: input.bridge ?? "codex-exec",
      url: opened.url,
      token: new URL(opened.url).searchParams.get("token"),
      mode: opened.mode,
      openedBrowser: opened.openedBrowser,
      reusedSession: opened.reusedSession,
      liveSession: opened.liveSession,
      source: opened.source,
      stateNote: opened.stateNote,
      preflightChanged: opened.preflightChanged,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      file: requestedFile,
      bridge: input.bridge ?? "codex-exec",
      error: message,
      diagnostics: [{ severity: "error", code: "review_open_failed", message }],
    }
  }
}

async function readArtifactQa(workspaceRoot: string, filePath: string) {
  let vocabulary
  try {
    vocabulary = extractDesignClasses()
  } catch {
    // Design vocabulary is optional for standalone artifacts.
  }
  const report = await runArtifactQA({ workspaceRoot, filePath, vocabulary })
  return {
    ok: report.passed,
    summary: {
      passed: report.passed,
      errors: report.hardErrorCount,
      warnings: report.warningCount,
    },
    report,
    markdown: formatArtifactQAReport(report),
  }
}

function readDeckPlan(workspaceRoot: string) {
  return readDeckPlanArtifact(workspaceRoot)
}

function summarizeDeckPlan(deckPlan: ReturnType<typeof readDeckPlanArtifact>) {
  return {
    ok: deckPlan.ok,
    skipped: !deckPlan.ok && Boolean(deckPlan.reason?.includes("missing")),
    warnings: deckPlan.warnings?.length ?? 0,
    reason: deckPlan.reason,
  }
}

function formatReviewDeckReadMarkdown(input: {
  file: string
  artifactQa: Awaited<ReturnType<typeof readArtifactQa>>
  deckPlan: ReturnType<typeof readDeckPlanArtifact>
}): string {
  const lines = [
    "# Review Deck Read",
    "",
    `File: \`${input.file}\``,
    "",
    `Artifact QA: ${input.artifactQa.summary.passed ? "passed" : "failed"} (${input.artifactQa.summary.errors} hard error(s), ${input.artifactQa.summary.warnings} warning(s))`,
    `Deck-plan: ${input.deckPlan.ok ? "read" : `skipped/diagnostic - ${input.deckPlan.reason ?? "not available"}`}`,
    "",
    input.artifactQa.markdown,
  ]
  return lines.join("\n")
}

function root(workspaceRoot: string | undefined): string {
  return resolve(workspaceRoot || process.cwd())
}
