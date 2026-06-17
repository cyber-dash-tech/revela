import { writeFileSync } from "fs"
import { join } from "path"
import { renderBuiltInPreviewHtml } from "../lib/page-templates"

const outputPath = join(import.meta.dir, "..", "lib", "page-templates", "built-in-preview.html")
writeFileSync(outputPath, renderBuiltInPreviewHtml(), "utf-8")
console.log(`Generated ${outputPath}`)
