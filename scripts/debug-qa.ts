import { measureSlides } from "../lib/qa/measure.ts"

const allMetrics = await measureSlides("./slides/ai-power-shift.html")

for (const m of allMetrics) {
  console.log(`\n=== Slide ${m.index + 1}: ${m.title} ===`)
  console.log(`Canvas: ${JSON.stringify(m.canvasRect)}`)
  console.log(`ContentRect: ${JSON.stringify(m.contentRect)}`)
  console.log(`Top-level elements (${m.elements.length}):`)
  for (const el of m.elements) {
    console.log(`  [${el.selector}] w=${Math.round(el.rect.width)} h=${Math.round(el.rect.height)} top=${Math.round(el.rect.top)} left=${Math.round(el.rect.left)} children=${el.children.length}`)
    if (el.children.length > 0 && el.children.length <= 5) {
      for (const ch of el.children) {
        console.log(`    -> [${ch.selector}] w=${Math.round(ch.rect.width)} h=${Math.round(ch.rect.height)} top=${Math.round(ch.rect.top)} left=${Math.round(ch.rect.left)}`)
      }
    }
  }
}
