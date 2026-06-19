import { dirname, resolve } from "path"
import { pathToFileURL } from "url"

export function withExportBaseHref(html: string, htmlFilePath: string): string {
  if (/<base\b/i.test(html)) return html

  const baseHref = pathToFileURL(`${dirname(resolve(htmlFilePath))}/`).href
  const baseTag = `<base href="${baseHref}">`

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${baseTag}`)
  }
  return `${baseTag}\n${html}`
}
