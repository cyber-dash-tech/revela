import { relative, resolve, sep } from "path"
import { hasDecksState, readDecksState, writeDecksState } from "../decks-state"
import { recordWorkspaceAction } from "./actions"
import { recordArtifactRenderTarget } from "./render-targets"

export function recordRenderedArtifact(
  workspaceRoot: string,
  input: {
    sourceHtmlPath: string
    outputPath: string
    type: "pdf" | "pptx" | "png"
    actor: string
    artifactVersion?: string
  },
): void {
  const root = resolve(workspaceRoot)
  if (!hasDecksState(root)) return

  const state = readDecksState(root)
  const sourceHtmlPath = workspaceRelative(root, resolve(root, input.sourceHtmlPath))
  const outputPath = workspaceRelative(root, resolve(root, input.outputPath))
  const target = recordArtifactRenderTarget(state, {
    sourceHtmlPath,
    type: input.type,
    outputPath,
    artifactVersion: input.artifactVersion,
  })

  recordWorkspaceAction(state, {
    type: "artifact.rendered",
    actor: input.actor,
    inputs: { sourceHtmlPath, type: input.type },
    outputs: { outputPath, targetId: target.id },
    status: "success",
    summary: `Rendered ${input.type.toUpperCase()} artifact from ${sourceHtmlPath}.`,
    nodeIds: [target.id],
  })
  writeDecksState(root, state)
}

export function workspaceRelative(root: string, target: string): string {
  return relative(root, target).split(sep).join("/")
}
