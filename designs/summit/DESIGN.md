---
name: summit
description: genneral clean template for presentation
author: cyber-dash
version: 1.0.0
preview:
---

## Visual Style — Summit Theme

Apply this visual style when generating all slides in this session.

<!-- @design:foundation:start -->

### Color Palette

```css
:root {
    --bg-frame: #050505;
    --bg-page: #f7f4ee;
    --bg-page-alt: #efe9df;
    --text-primary: #171411;
    --text-secondary: #5e554c;
    --text-muted: #8a7f73;
    --line: rgba(23, 20, 17, 0.14);
    --line-strong: rgba(23, 20, 17, 0.28);
    --accent-earth: #8d6a49;
    --accent-olive: #6f7562;
    --accent-stone: #b9afa1;
    --accent-gold: #c9992a;
    --accent-danger: #b94a3c;
    --accent-sage: #9eb0a6;
    --shadow-soft: rgba(0, 0, 0, 0.18);
}
```

Accent usage guidance:
- `--accent-gold` — primary emphasis, TOC dividers, key data callouts
- `--accent-earth` — warm secondary accent, image captions, secondary labels
- `--accent-olive` — muted structural accent, chart fills, subtle dividers
- `--accent-stone` — lightest accent, disabled states, faint decorative lines
- `--accent-sage` — desaturated cool green; use for environmental, sustainability, or positive-signal content (e.g. quote decorations, positive indicators, nature-themed slides)
- `--accent-danger` — negative indicators, alerts, down-trend markers only

### Typography

- **Display / heading font**: `IBM Plex Sans Condensed` — used for all headings (`h1`–`h4`), eyebrows, and display text across every layout
- **Body font**: `Inter` — used for body copy, labels, captions, and UI text
- Font link tag:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  ```
- cover h1: `108px` to `124px`, weight `600` to `700`, line-height `0.88` to `0.94`, uppercase
- inner-layout h2: `30px` to `36px`, weight `600` to `700`, line-height `1.06` to `1.12`
- inner-layout h3: `20px` to `24px`, weight `600`, line-height `1.12` to `1.18`
- Body: `17px`, line-height `1.6`
- Eyebrow / caption: `11px` to `13px`, uppercase, letter-spacing `0.16em` to `0.2em`
- Stat number: `72px` to `88px`, weight `500`, line-height `0.95`
- Never use text shadows or glow.
- Never switch to a serif typeface; Summit is strictly sans-serif.

All sizes are fixed `px` for the 1920x1080 canvas. JS `transform: scale()` handles viewport adaptation. Never use `clamp()` or viewport-relative units.

### Page Framing

- The browser viewport is the black frame: `#050505`.
- The presentation canvas is a warm paper page inside that frame.
- Use the page edge as a visible compositional device. The paper should feel placed inside the viewport, not full-bleed by default.
- Default page inset: `40px` from viewport edges, with subtle inner shadow only if needed.

### Grid System

- **1920x1080 fixed canvas** with a paper page around `1760px` wide inside the frame.
- Main content width: `1480px`.
- Preferred editorial splits: `5 / 7`, `4 / 8`, `3 / 9`.
- Text column target: about `480px` max.
- Image column target: about `880px` max.
- Headings align to the text column, not to the full canvas.
- Let images carry visual weight; text should remain narrow, calm, and readable.

### Image Treatment

- Use real photography or realistic documentary imagery.
- Default to outdoor, alpine, mountain, ridge, snowline, expedition, and field photography.
- Prefer mountain and landscape imagery over indoor workshop scenes or generic product close-ups.
- Favor hard crops, edge-to-edge image blocks, and cinematic aspect ratios.
- Use `object-fit: cover` and accept aggressive cropping when composition improves.
- Avoid heavy dark overlays, neon gradients, frosted glass, or artificial glows.
- Captions should be small, quiet, and aligned to an image edge.
- When a layout places copy over a dominant visual field, create a charcoal-toned reading field that begins dense at the text side and fades naturally across the visual. Keep this as a broad structural transition, not a small boxed panel.

### Decorative Language

- Ornament is restrained: thin rules, small chevron dividers, subtle page blocks.
- Dense slides should rely on structure, not decoration.
- Sparse slides can use a single oversize photo or one quiet rule to hold composition.
- Never use blobs, glow halos, glass cards, or dashboard chrome.

### Slide Layout

- Every slide uses `.slide-canvas` sized to `1920px x 1080px`, scaled by JS.
- Every `<section class="slide">` must include `slide-qa="true"` or `slide-qa="false"`.
- Use `slide-qa="true"` for dense content layouts and `slide-qa="false"` for structural or intentionally sparse layouts.
- Default canvas padding: `72px 80px`.
- The paper page should usually sit inside the canvas with `padding: 56px 64px 64px`.
- Target strong fill on content-heavy slides while preserving editorial whitespace.

### HTML Structure

Every generated presentation must use this exact HTML skeleton:

```html
<!DOCTYPE html>
<html lang="{language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{Presentation Title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <!-- <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>  only if charts are needed -->
    <style>/* all CSS here */</style>
</head>
<body>
    <section class="slide cover-slide" slide-qa="false" data-index="0">
        <div class="slide-canvas"> ... </div>
    </section>
    <section class="slide" slide-qa="true" data-index="1">
        <div class="slide-canvas"> ... </div>
    </section>
    <script>/* all JS here */</script>
</body>
</html>
```

### Core CSS

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

html {
    scroll-snap-type: y mandatory;
    overflow-y: scroll;
    height: 100%;
}

body {
    background: var(--bg-frame);
    color: var(--text-primary);
    font-family: 'Inter', ui-sans-serif, sans-serif;
    -webkit-font-smoothing: antialiased;
    height: 100%;
}

.slide {
    min-height: 100dvh;
    scroll-snap-align: start;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--bg-frame);
}

.slide-canvas {
    width: 1920px;
    height: 1080px;
    flex-shrink: 0;
    transform-origin: center center;
    position: relative;
    overflow: hidden;
    padding: 72px 80px;
}

.page {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--bg-page);
    color: var(--text-primary);
    padding: 0;
    box-shadow: 0 24px 80px var(--shadow-soft);
    display: flex;
    flex-direction: column;
}

.page.alt {
    background: var(--bg-page-alt);
}

.eyebrow,
.caption,
.meta-label {
    font-size: 12px;
    line-height: 1.4;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
}

h1, h2, h3, h4 {
    font-family: 'IBM Plex Sans Condensed', 'Inter', ui-sans-serif, sans-serif;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-primary);
}

h1 { font-size: 88px; line-height: 0.96; }
h2 { font-size: 34px; line-height: 1.08; }
h3 { font-size: 24px; line-height: 1.14; }

p, li {
    font-size: 17px;
    line-height: 1.6;
    color: var(--text-secondary);
}

.rule {
    width: 100%;
    height: 1px;
    background: var(--line);
}

.rule.strong {
    background: var(--line-strong);
}

.chevron-divider {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
}

.chevron-divider::before,
.chevron-divider::after {
    content: '';
    width: 18px;
    height: 1px;
    background: var(--line-strong);
}

.media-frame {
    position: relative;
    overflow: hidden;
}

.media-frame img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
}

.media-caption {
    margin-top: 12px;
    font-size: 12px;
    line-height: 1.5;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
}

/* editorial-list: square bullet + optional <strong> lead phrase per item.
   Usage: <li><strong>Lead phrase.</strong> Supporting copy.</li>
   Dark bg override: set --accent-earth to rgba(247,244,238,0.72) on the list wrapper. */
.editorial-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.editorial-list li {
    position: relative;
    padding-left: 20px;
    font-size: 14px;
    line-height: 1.58;
    color: var(--text-secondary);
}

.editorial-list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    width: 6px;
    height: 6px;
    background: var(--accent-earth);
}

.reveal {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.reveal.visible {
    opacity: 1;
    transform: translateY(0);
}
```

### SlidePresentation Class (Complete JavaScript)

All presentations must include this complete `SlidePresentation` class.

```javascript
class SlidePresentation {
    constructor() {
        this.slides = document.querySelectorAll('.slide');
        this.currentSlide = 0;
        this.setupScaling();
        this.setupIntersectionObserver();
        this.setupKeyboardNav();
        this.setupTouchNav();
        this.setupMouseWheel();
    }

    setupScaling() {
        const canvases = document.querySelectorAll('.slide-canvas');
        const BASE_W = 1920;
        const BASE_H = 1080;
        const update = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const scale = Math.min(vw / BASE_W, vh / BASE_H);
            canvases.forEach((canvas) => {
                canvas.style.transform = `scale(${scale})`;
            });
        };
        window.addEventListener('resize', update);
        update();
    }

    setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
                }
            });
        }, { threshold: 0.2 });
        this.slides.forEach((slide) => observer.observe(slide));
    }

    setupKeyboardNav() {
        document.addEventListener('keydown', (event) => {
            if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(event.key)) {
                event.preventDefault();
                this.goTo(this.currentSlide + 1);
            } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) {
                event.preventDefault();
                this.goTo(this.currentSlide - 1);
            }
        });
    }

    setupTouchNav() {
        let startY = 0;
        document.addEventListener('touchstart', (event) => {
            startY = event.touches[0].clientY;
        }, { passive: true });
        document.addEventListener('touchend', (event) => {
            const deltaY = startY - event.changedTouches[0].clientY;
            if (Math.abs(deltaY) > 40) {
                this.goTo(this.currentSlide + (deltaY > 0 ? 1 : -1));
            }
        }, { passive: true });
    }

    setupMouseWheel() {
        let last = 0;
        document.addEventListener('wheel', (event) => {
            const now = Date.now();
            if (now - last < 800) return;
            last = now;
            this.goTo(this.currentSlide + (event.deltaY > 0 ? 1 : -1));
        }, { passive: true });
    }

    goTo(index) {
        const clamped = Math.max(0, Math.min(this.slides.length - 1, index));
        this.slides[clamped].scrollIntoView({ behavior: 'smooth' });
        this.currentSlide = clamped;
    }
}

    new SlidePresentation();
```

<!-- @design:foundation:end -->

<!-- @design:rules:start -->

### Composition Rules

These rules are mandatory for Summit.

- **Image over decoration.** If a slide has strong photography, reduce ornamental elements to one rule or one caption.
- **Text column stays narrow.** Do not let narrative text stretch across the page just because space exists.
- **One visual center per slide.** Either the image, the heading block, or the metrics dominate. Never all three at equal weight.
- **Metrics should read like a report, not a dashboard.** Use calm typography, generous spacing, and minimal UI framing.
- **Dense slides need structure, not decoration.** Use rules, columns, and alignment. Avoid extra accents.
- **Sparse slides depend on image weight.** If content is light, the photo or page framing must hold the composition.
- **No glass cards, neon KPI styling, or startup-product chrome.** Summit is editorial and print-adjacent.
- **Visual hierarchy is strict:** eyebrow -> heading -> body -> caption.

### Common Mistakes

- Using equally wide text and image columns instead of an asymmetric editorial split.
- Filling empty space with decorative shapes instead of using a stronger crop or larger photograph.
- Treating metric blocks like SaaS dashboard cards.
- Setting long paragraphs directly on top of busy imagery.
- Using more than one dominant photo on a single slide without a clear hierarchy.
- Letting captions become body-copy sized.

### Do & Don't

- **Do** let the paper page feel physical inside the dark frame.
- **Do** use thin rules and quiet labels to create structure.
- **Do** crop imagery boldly when it improves the composition.
- **Do** keep headings hard-edged, restrained, and report-like.
- **Don't** use glow, glass, blob shapes, or neon gradients.
- **Don't** center everything by default; asymmetry is part of the design language.
- **Don't** turn highlights into generic cards with rounded corners and shadows.
- **Don't** overload a slide with both many metrics and many images.

<!-- @design:rules:end -->

<!-- @design:layouts:start -->

### Layout Types

Each `<section class="slide">` must set `slide-qa="true"` or `slide-qa="false"`. Use the QA column to decide which value to write. Fetch any layout with the `revela-designs` tool (`action: "read"`, `layout: "<name>"`).

<!-- @layout:fullbleed:start qa=false -->
#### Fullbleed

Full-canvas layout for slides where a single image dominates the entire canvas with text composited over it. Use for opening (cover) and closing slides, or atmospheric section dividers.

Structural intent:
- Single slot: place one `image-title` component directly inside `.page`. The component is self-contained — it manages its own image, blur, overlay, and text layers internally.

```html
<section class="slide" slide-qa="false" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">

      <!-- [slot: content] — use image-title component; set --left for cover, --right for closing -->
      <!-- image-title handles all internal z-index layering (image → blur → overlay → text) -->

    </div>
  </div>
</section>
```

##### Tips
- **Use `image-title` as the sole child.** The component is self-contained and fills `width:100%; height:100%` automatically. Do not add extra wrapper divs around it.
- **Cover vs closing.** Cover: `image-title--left` with a diagonal overlay (`105deg`, left-dark to right-transparent) and left-biased blur mask. Closing: `image-title--right` with a bottom-heavy overlay (`180deg`) and right-biased blur mask.
- **Page number.** Use `.page-number--light` — position it inside `.page` at `z-index:10` so it sits above the `image-title` stacking context.
- **Text opacity.** For atmospheric section dividers where content is minimal, add `style="opacity:0.85"` on the `.image-title` container to soften the foreground text layer against the image.
<!-- @layout:fullbleed:end -->

<!-- @layout:narrative:start qa=true -->
#### Narrative

Asymmetric two-column layout with the left column wider (1.618fr) and the right column narrower (1fr). Use when one side needs more visual or reading weight than the other.

Structural intent:
- left slot: wider zone (1.618fr) — can hold any component(s)
- right slot: narrower zone (1fr) — can hold any component(s)

Every slot accepts 1 or more components. The LLM decides what each slot contains — there is no text/visual semantic preset.


```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;overflow:hidden;">
      <div class="narrative-grid">

        <!-- [slot: left] — 1+ components; suggested: image-title, echart-panel, text-panel -->
        <div>
        </div>

        <!-- [slot: right] — 1+ components; suggested: text-panel, toc, flow-vertical, data-table -->
        <div>
        </div>

      </div>
    </div>
  </div>
</section>
```

```css
.narrative-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.618fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    overflow: hidden;
    align-items: start;
}

.narrative-grid--reverse {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.618fr);
}

.narrative-grid > * {
    overflow: hidden;
    min-height: 0;
    min-width: 0;
}
```

##### Tips
- **Grid container uses `.narrative-grid` class.** Applies `minmax(0, Nfr)` tracks and `overflow:hidden` on all children. Do not add inline `height:100%` or `flex:1` — the class handles containment.
- **No semantic preset.** Either slot can hold any component. The wider left column naturally suits visually dominant content (full-bleed media, wide charts), but this is not a hard rule.
- **Dark panel variant.** When a slot uses a dark background, override CSS variables on that container: `--text-primary`, `--text-secondary`, `--text-muted`, `--line`, `--line-strong` — all set to white-family values. Use `.page-number--light`.
- **Background image inside a slot.** Use the three-layer z-index pattern: background `z-index:0`, dark overlay `z-index:1`, content `z-index:2`.
<!-- @layout:narrative:end -->

<!-- @layout:narrative-reverse:start qa=true -->
#### Narrative Reverse

Asymmetric two-column layout with the left column narrower (1fr) and the right column wider (1.618fr). Mirror of `narrative` — same grid class with `--reverse` modifier.

Structural intent:
- left slot: narrower zone (1fr) — can hold any component(s)
- right slot: wider zone (1.618fr) — can hold any component(s)

Every slot accepts 1 or more components. The LLM decides what each slot contains — there is no text/visual semantic preset.


```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;overflow:hidden;">
      <div class="narrative-grid narrative-grid--reverse">

        <!-- [slot: left] — 1+ components; suggested: text-panel, toc, flow-vertical, echart-panel -->
        <div>
        </div>

        <!-- [slot: right] — 1+ components; suggested: image-title, echart-panel, data-table -->
        <div>
        </div>

      </div>
    </div>
  </div>
</section>
```

##### Tips
- **Same `.narrative-grid` class as `narrative`, with `--reverse` modifier.** Add both `narrative-grid` and `narrative-grid--reverse` to the grid container. The modifier swaps column proportions to `1fr left / 1.618fr right`.
- **No semantic preset.** Either slot can hold any component — visual on the right, text on the left, or any other combination based on content needs.
- **Dark panel variant.** Same CSS variable override pattern as `narrative`: set `--text-primary` etc. to white-family values on the panel container, all child components inherit automatically.
<!-- @layout:narrative-reverse:end -->

<!-- @layout:highlight-cols:start qa=true -->
#### Highlight Cols

Equal N-column layout. Use when 3 or more parallel items of roughly equal visual weight should appear side by side — proof blocks, highlights, feature comparisons, stat groups, or any multi-column editorial spread.

A short section header is optional but recommended. In Summit, that header should stay lean: eyebrow plus title only, with no intro paragraph competing with the columns below.

Structural intent:
- each slot: 1fr column — any component(s)
- column count: determined by the number of direct child divs in the grid container; `auto-fit` distributes space equally

Every slot accepts 1 or more components. Add or remove child divs to control column count — 3 is the default, but 4 or 5 columns work equally well.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page">
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;max-width:520px;">
        <p class="eyebrow">Section Label</p>
        <h2 style="font-size:52px;line-height:0.94;text-transform:uppercase;">Short framing title for the parallel columns</h2>
      </div>

      <div class="highlight-cols-grid" style="flex:1;min-height:0;">

        <!-- [slot: 1] — 1+ components; suggested: editorial-image-top, editorial-text-top, echart-panel -->
        <div>
        </div>

        <!-- [slot: 2] — 1+ components; suggested: editorial-text-top, echart-panel, flow-vertical -->
        <div>
        </div>

        <!-- [slot: 3] — 1+ components; suggested: editorial-image-top, editorial-text-top, echart-panel -->
        <div>
        </div>

      </div>
    </div>
  </div>
</section>
```

```css
.highlight-cols-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 32px;
    overflow: hidden;
    align-items: start;
}

.highlight-cols-grid > * {
    overflow: hidden;
    min-height: 0;
}
```

##### Tips
- **Grid container needs `flex:1;min-height:0` inline** when inside `.page` (which is flex-column). The class handles column sizing; the inline style handles row stretch.
- **Header stays lean.** If you add a section header above the grid, use only `eyebrow + title`. Do not add an intro paragraph; the columns themselves should carry the explanation.
- **Column count = number of direct child divs.** `repeat(auto-fit, minmax(0, 1fr))` distributes available width equally across however many children exist. Add a 4th or 5th div to get 4 or 5 columns — no CSS change needed.
- **Equal columns — no hierarchy.** All slots carry the same visual weight. Adjust content density to suit the slide purpose; do not artificially inflate one column to create false hierarchy.
- **When using 4-5 columns, compress the header.** Keep the title to one or two short lines so the grid retains most of the slide height.
- **Do not set fixed heights on editorial components.** Let components fill height via flexbox stretch.
<!-- @layout:highlight-cols:end -->

<!-- @layout:halves:start qa=true -->
#### Halves

Equal two-column layout. Use when two items of equal visual weight should appear side by side — paired charts, dual evidence blocks, before/after comparisons, or any two-column editorial spread.

Structural intent:
- left slot: 1fr column — any component(s)
- right slot: 1fr column — any component(s)

Every slot accepts 1 or more components. The LLM decides what each slot contains — both columns are fully equal with no hierarchy preset.


```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="overflow:hidden;">
      <div class="halves-grid" style="flex:1;min-height:0;">

        <!-- [slot: left] — 1+ components; suggested: echart-panel, data-table, editorial-image-top -->
        <div>
        </div>

        <!-- [slot: right] — 1+ components; suggested: echart-panel, data-table, text-panel -->
        <div>
        </div>

      </div>
    </div>
  </div>
</section>
```

```css
.halves-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0px;
    overflow: hidden;
    align-items: stretch;
}

.halves-grid > * {
    overflow: hidden;
    min-height: 0;
    min-width: 0;
}
```

##### Tips
- **Grid container needs `flex:1;min-height:0` inline** when inside `.page`. The class handles column sizing.
- **Equal columns — no hierarchy.** Both slots carry the same weight. Choose components based on content, not a fixed text/visual assignment.
- **Gap `40px` is intentional.** The slightly wider gap than `three-col` (32px) compensates for the larger individual column width.
<!-- @layout:halves:end -->

<!-- @layout:stacked:start qa=true -->
#### Stacked

Two-row vertical layout in a fixed golden-ratio proportion: top row takes 1fr and bottom row takes 1.618fr. Use when a horizontal component (process flow, stat row, header band) should anchor the top, with a taller content zone below.

Structural intent:
- top slot: `1fr` height — upper zone in golden-ratio proportion
- bottom slot: `1.618fr` height — larger lower zone fills remaining space

Every slot accepts 1 or more components. The LLM decides what each slot contains — there is no semantic preset for either row.


```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <div class="stacked-grid">

        <!-- [slot: top] — 1+ components; suggested: flow-horizontal, stat-row -->
        <div class="stacked-top">
        </div>

        <!-- [slot: bottom] — 1+ components; suggested: echart-panel, data-table -->
        <div class="stacked-bottom">
        </div>

      </div>
    </div>
  </div>
</section>
```

```css
.stacked-grid {
    display: grid;
    grid-template-rows: minmax(0, 1fr) minmax(0, 1.618fr);
    height: 100%;
    width: 100%;
    overflow: hidden;
}

.stacked-top {
    overflow: hidden;
    min-height: 0;
}

.stacked-bottom {
    overflow: hidden;
    min-height: 0;
}
```

##### Tips
- **Top and bottom rows follow a fixed 1 : 1.618 golden-ratio proportion.** The top slot takes 1fr and the bottom takes 1.618fr — both rows are sized relative to the total canvas height, not by their content.
- **Both slots clip overflow.** `min-height: 0` on both `.stacked-top` and `.stacked-bottom` ensures content cannot break out of its row.
- **Both slots are fully equal in kind.** There is no preset for which slot holds "process" vs "data" — place any combination of components that fits the slide narrative.
- **Dark background variant.** Set CSS variable overrides (`--text-primary` etc.) on `.stacked-grid` to cascade into both slots automatically.
<!-- @layout:stacked:end -->

<!-- @design:layouts:end -->


<!-- @design:components:start -->

### Component Library

Use these components when a page needs repeatable editorial modules inside a larger layout. Components define the block itself, not the page grid around it.



<!-- @component:text-panel:start -->
#### Text Panel

<!-- renamed from report-text-panel -->

Unified narrative text container. Use inside any layout slot that needs a self-contained reading surface with heading, body copy, and optional footer metadata. The body zone accepts prose, a bullet list, or both — choose based on content, not convention.

```html
<!-- variant A: prose only (--dark) -->
<div class="text-panel text-panel--dark">
  <div style="max-width:420px;">
    <p class="eyebrow" style="color:rgba(243,238,230,0.72);">Section label / annual review</p>
    <h2 style="margin-top:16px;font-size:60px;line-height:0.92;letter-spacing:-0.03em;text-transform:uppercase;color:#f7f4ee;max-width:360px;">Narrative heading</h2>
    <div class="text-panel-body" style="margin-top:20px;">
      <p style="font-size:13px;line-height:1.58;color:rgba(243,238,230,0.84);max-width:390px;">Use one or two compact paragraphs when continuous prose fits the content better than a list.</p>
    </div>
  </div>
  <div class="text-panel-footer" style="color:rgba(243,238,230,0.68);">
    <p class="caption">Summit / Climate Report 2026</p>
    <p class="caption">03</p>
  </div>
</div>

<!-- variant B: bullet list only (--light) -->
<div class="text-panel text-panel--light">
  <div style="max-width:420px;">
    <p class="eyebrow">Key findings</p>
    <h3 style="margin-top:12px;">Three priorities for 2026</h3>
    <div class="text-panel-body" style="margin-top:16px;">
      <ul class="editorial-list">
        <li><strong>Lead phrase.</strong> Supporting explanation for this point.</li>
        <li><strong>Second point.</strong> One sentence of context or evidence.</li>
        <li><strong>Third point.</strong> Keep each item roughly equal in length.</li>
      </ul>
    </div>
  </div>
  <div class="text-panel-footer">
    <p class="caption">Summit / Climate Report 2026</p>
    <p class="caption">03</p>
  </div>
</div>

<!-- variant C: prose + bullets mixed (--dark) -->
<div class="text-panel text-panel--dark">
  <div style="max-width:420px;">
    <p class="eyebrow" style="color:rgba(243,238,230,0.72);">Context</p>
    <h3 style="margin-top:12px;color:#f7f4ee;">Heading here</h3>
    <div class="text-panel-body" style="margin-top:16px;">
      <p style="font-size:13px;line-height:1.58;color:rgba(243,238,230,0.84);">Introductory sentence that frames what follows. Then the list expands the argument:</p>
      <ul class="editorial-list" style="margin-top:12px;">
        <li><strong>Lead phrase.</strong> Supporting explanation.</li>
        <li><strong>Second point.</strong> One sentence of evidence.</li>
      </ul>
    </div>
  </div>
  <div class="text-panel-footer" style="color:rgba(243,238,230,0.68);">
    <p class="caption">Summit / Climate Report 2026</p>
    <p class="caption">03</p>
  </div>
</div>
```

```css
/* renamed from .report-text-panel */
.text-panel {
    height: 100%;
    padding: 56px 48px 34px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.text-panel--dark {
    background: #2c2828;
    color: #f3eee6;
}

.text-panel--light {
    background: var(--bg-page-alt);
    color: var(--text-primary);
}

/* body zone: flex column so prose <p> and <ul> stack naturally with consistent gap */
.text-panel-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* renamed from .report-panel-footer */
.text-panel-footer {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 18px;
}
```

Rules:
- `.text-panel-body` is the only required structural child. Place `<p>` elements, an `<ul class="editorial-list">`, or both inside it.
- Eyebrow, heading, and footer are all optional — include them only when the content calls for them.
- Choose `--dark` or `--light` to match the slide's tone. Do not mix variants within a single panel.
- Pair with a visually dominant neighbor (image, chart) when the layout needs strong contrast against the text zone.

##### Tips
- **`--dark` with background image: three-layer z-index required.** Place the `<img>` absolutely at `z-index:0`, the dark scrim at `z-index:1`, and all text content divs at `z-index:2`. Without explicit z-index, the image may render above the overlay in some stacking contexts.
- **Dark scrim opacity.** Use `rgba(23,18,14, 0.78→0.70)` for the gradient direction (top darker, bottom slightly lighter) or a flat `rgba(14,12,10,0.75)` for uniform depth. Avoid going below 0.65 — text legibility degrades on busy photography.
- **`--dark` text is already white-family in the built-in CSS.** Do not add inline color overrides to individual text nodes unless you are modifying the base variant — it creates maintenance debt.
- **`--light` on dark-background slides.** If a light panel sits on a slide with a dark background overlay, ensure the panel has an explicit background (e.g., `var(--bg-page)`) and is above the overlay in z-index.
- **`editorial-list` inside `--dark`.** Add `style="--accent-earth:rgba(247,244,238,0.72)"` on the `<ul>` wrapper so the bullet squares read against the dark background.
<!-- @component:text-panel:end -->

<!-- @component:stat-card:start -->
#### Stat Card

Lightweight editorial metric module for a single highlighted number. Use when one data point should carry the visual emphasis while the metric name and guiding sentence stay quiet and compact.

This is **not** a dashboard card. It has no border, no background fill, no shadow, and no corner treatment. Hierarchy comes from number scale, spacing, and restrained typography.

```html
<!-- variant A: default vertical composition -->
<div class="stat-card">
  <p class="caption" style="color:var(--text-muted);">Performance signal</p>
  <div class="stat-card-value" style="color: var(--accent-gold);">27%</div>
  <div class="text-panel-body" style="gap:10px;max-width:330px;">
    <h3 style="font-size:24px;line-height:1.04;text-transform:uppercase;">EBIT Margin</h3>
    <p style="font-size:14px;line-height:1.56;color:var(--text-secondary);">Expanded for the third consecutive quarter as premium mix offset freight pressure and held pricing discipline through softer volume.</p>
  </div>
</div>

<!-- variant B: horizontal composition -->
<div class="stat-card stat-card--horizontal">
  <div style="display:flex;flex-direction:column;gap:12px;flex:0 0 220px;min-width:0;">
    <p class="caption" style="color:var(--text-muted);">Operational baseline</p>
    <div class="stat-card-value" style="color: var(--accent-olive);">4.8x</div>
  </div>
  <div class="text-panel-body" style="gap:10px;max-width:330px;">
    <h3 style="font-size:24px;line-height:1.04;text-transform:uppercase;">Inventory Turnover</h3>
    <p style="font-size:14px;line-height:1.56;color:var(--text-secondary);">Higher cycle efficiency reduced working-capital drag without adding new capacity, leaving more headroom for seasonal demand swings.</p>
  </div>
</div>
```

```css
.stat-card {
    height: 100%;
    display: flex;
    min-height: 0;
    flex-direction: column;
    justify-content: flex-start;
    gap: 16px;
    padding-top: 8px;
}

.stat-card--horizontal {
    flex-direction: row;
    align-items: flex-start;
    gap: 30px;
}

.stat-card-value {
    font-family: 'IBM Plex Sans Condensed', 'Inter', ui-sans-serif, sans-serif;
    font-size: 88px;
    line-height: 0.9;
    letter-spacing: -0.04em;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: inherit;
}
```

Rules:
- Use this component only for a **single** highlighted metric. If the slide needs several peer metrics, switch to a multi-item layout instead of stacking several stat cards together without hierarchy.
- The number color is chosen semantically from the Summit palette via inline `style="color: var(--accent-xxx)"`; do not hardcode a fixed color in the component CSS.
- Do not add background fills, borders, shadows, or rounded corners. The module must remain typographic and editorial.
- Use `h3` for the metric name and a single compact `p` for the guiding sentence. Keep the copy to one or two sentences.
- Default `stat-card` is vertical. Add `stat-card--horizontal` only when the number and explanation need a side-by-side read.

##### Tips
- **Horizontal width discipline.** In the horizontal variant, keep the number column narrow (`~220px`) so the prose still reads as the explanatory side, not as a second visual block.
- **Long numbers.** For values such as `12,450` or `83.6%`, reduce the inline font size slightly before tightening letter-spacing further.
- **Semantic color choice.** `--accent-gold` works for primary emphasis, `--accent-olive` for stable or positive operational metrics, `--accent-danger` for negative indicators, and `--accent-sage` for environmental or resilience-oriented signals.
- **Do not over-explain.** If the description starts to become paragraph-length, switch to `text-panel` or pair the stat card with a narrative component in the neighboring slot.
<!-- @component:stat-card:end -->

<!-- @component:editorial-image-top:start -->
#### Editorial Image Top

Image-first editorial module: image on top, text below. Best for highlight grids, product/material stories, and any module where the picture should lead before the reader enters the copy.

The copy zone uses `text-panel-body` for consistent prose/bullet handling across all editorial modules.

```html
<div class="editorial-image-top">
  <div class="media-frame editorial-media">
    <img src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop" alt="Climber on alpine ridge">
  </div>
  <div class="editorial-module-body">
    <div class="module-kicker-row">
      <i data-lucide="leaf" class="module-icon"></i>
      <p class="caption">Alpine materials</p>
    </div>
    <h3>Use the image to set tone before the copy explains the point.</h3>
    <!-- text-panel-body: place <p>, <ul class="editorial-list">, or both -->
    <div class="text-panel-body">
      <p>Choose this component when the visual should establish texture, materiality, or field context before the audience reads the narrative.</p>
      <!-- optional bullets:
      <ul class="editorial-list">
        <li><strong>Lead phrase.</strong> Supporting point.</li>
        <li><strong>Second point.</strong> One sentence.</li>
      </ul>
      -->
    </div>
  </div>
</div>
```

```css
.editorial-media {
    width: 100%;
}

.editorial-module-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.module-kicker-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.module-icon {
    width: 15px;
    height: 15px;
    stroke-width: 1.6;
    color: var(--accent-earth);
    flex-shrink: 0;
}

.editorial-image-top {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.editorial-image-top .editorial-media {
    height: 240px;
}

.editorial-image-top .editorial-module-body h3 {
    margin-top: 2px;
}
```

Rules:
- Use when the image should lead and the text should read as a follow-on explanation.
- The image should usually occupy more visual weight than the text.
- Icon is optional. If used, keep it small, single-color, and subordinate to the caption.
- The `text-panel-body` inside `.editorial-module-body` accepts prose `<p>`, an `<ul class="editorial-list">`, or both. Use whichever form suits the content.
- When used inside multi-column layouts, keep this component's copy shorter than the primary reading column unless the page hierarchy explicitly promotes it.

##### Tips
- **Do not set a fixed height on this component when used inside `highlight-cols`.** Let the parent grid's `align-items:stretch` control the column height. Fixed heights fight against the stretch and create misaligned baselines.
- **Image aspect ratio.** Aim for 16:9 or 3:2 crops for the image block. Portrait crops create tall image zones that push text down and unbalance the composition.
- **Kicker icon size.** Keep Lucide SVG icons at 16–20px. Larger icons shift visual weight from the image to the label zone.
- **`editorial-list` font-size.** Override to `font-size:13px;gap:10px` inline — the base `editorial-list` is `14px/gap:14px`, which is slightly large for the narrow copy zone here.
<!-- @component:editorial-image-top:end -->

<!-- @component:editorial-text-top:start -->
#### Editorial Text Top

Text-first editorial module: text on top, image below. Best for narrative snippets, report-style explanations, or blocks where the image serves as evidence rather than the primary hook.

The copy zone uses `text-panel-body` for consistent prose/bullet handling across all editorial modules.

```html
<div class="editorial-text-top">
  <div class="editorial-module-body">
    <div class="module-kicker-row">
      <i data-lucide="gauge" class="module-icon"></i>
      <p class="caption">Mountain operations</p>
    </div>
    <h3>Lead with the argument, then let the image confirm it.</h3>
    <!-- text-panel-body: place <p>, <ul class="editorial-list">, or both -->
    <div class="text-panel-body">
      <p>Use this component when the audience should understand the point first and only then read the image as supporting evidence or context.</p>
      <!-- optional bullets:
      <ul class="editorial-list">
        <li><strong>Lead phrase.</strong> Supporting point.</li>
        <li><strong>Second point.</strong> One sentence.</li>
      </ul>
      -->
    </div>
  </div>
  <div class="media-frame editorial-media">
    <img src="https://images.unsplash.com/photo-1519904981063-b0cf448d479e?q=80&w=1200&auto=format&fit=crop" alt="Hiker in alpine basin">
  </div>
  <p class="media-caption">Optional caption / field site / program name</p>
</div>
```

```css
.editorial-text-top {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.editorial-text-top .editorial-module-body {
    padding-bottom: 2px;
}

.editorial-text-top .editorial-media {
    height: 240px;
}

.editorial-text-top .media-caption {
    margin-top: -4px;
}
```

Rules:
- Use when the text must establish the idea before the image appears.
- The `text-panel-body` inside `.editorial-module-body` accepts prose `<p>`, an `<ul class="editorial-list">`, or both. Use whichever form suits the content.
- Keep the lower image block quieter than a hero image; it is supporting evidence, not the whole slide's focal point.
- Icon is optional. Prefer it only when it helps distinguish categories across repeated modules.
- In multi-column layouts, this component can carry more reading weight than neighboring support modules when the page hierarchy needs a denser narrative block.

##### Tips
- **Same height/stretch rule as `editorial-image-top`.** Do not set fixed heights; let parent grid stretch control the column.
- **When used as a center spine in `highlight-cols`,** this is the one component that may legitimately be taller than its neighbors. That density imbalance is intentional — do not try to equalize it with padding or extra content in the outer columns.
- **`editorial-list` font-size.** Override to `font-size:13px;gap:10px` inline — the base `editorial-list` is `14px/gap:14px`, which is slightly large for the narrow copy zone here.
<!-- @component:editorial-text-top:end -->

<!-- @component:editorial-text-left:start -->
#### Editorial Text Left

Horizontal editorial module: a full-width title band on top, with text on the left and a visual slot on the right below. Best for compact feature rows or any slot where a wide-but-short frame suits a side-by-side composition with a clear heading above.

Structure:
- **header zone** (full width): holds the `h3` module title — independent of the copy below
- **left: `.editorial-text-left-copy`** — kicker, then `text-panel-body` (prose, bullets, or both)
- **right: `.editorial-text-left-visual`** — accepts any of: `media-frame img`, `echart-container`, or `image-title`

```html
<div class="editorial-text-left">

  <!-- header: module title spans full width -->
  <div class="editorial-text-left-header">
    <h3 style="font-size:20px;line-height:1.08;">Module title — a single standalone heading above both columns</h3>
  </div>

  <div class="editorial-text-left-content">

    <!-- left: editorial copy -->
    <div class="editorial-text-left-copy">
      <div class="module-kicker-row">
        <i data-lucide="zap" class="module-icon"></i>
        <p class="caption">Category label</p>
      </div>
      <!-- text-panel-body: place <p>, <ul class="editorial-list">, or both — choose based on content -->
      <div class="text-panel-body" style="margin-top:12px;">
        <!-- prose variant -->
        <p style="font-size:13px;line-height:1.5;color:var(--text-secondary);">Supporting description. One or two sentences that position this card within the broader page argument.</p>
        <!-- bullet variant (use instead of or after prose): -->
        <!-- <ul class="editorial-list" style="font-size:13px;gap:10px;">
          <li><strong>Lead phrase.</strong> Supporting explanation for this point.</li>
          <li><strong>Second point.</strong> One sentence of context or evidence.</li>
          <li><strong>Third point.</strong> Keep each item roughly equal in length.</li>
        </ul> -->
      </div>
    </div>

    <!-- right: visual slot — choose one -->
    <div class="editorial-text-left-visual">

      <!-- option A: plain image -->
      <div class="media-frame" style="width:100%;height:100%;">
        <img src="https://images.unsplash.com/photo-1519904981063-b0cf448d479e?q=80&w=800&auto=format&fit=crop" alt="Supporting visual">
      </div>

      <!-- option B: echart -->
      <!-- <div class="echart-container" id="chart-unique-id" style="width:100%;height:100%;"></div> -->

      <!-- option C: image-title (self-contained, handles its own overlay and text layers) -->
      <!-- <div class="image-title image-title--right"> ... </div> -->

    </div>

  </div>
</div>
```

```css
.editorial-text-left {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
    overflow: hidden;
}

.editorial-text-left-header {
    flex-shrink: 0;
    padding: 20px 24px 16px;
}

.editorial-text-left-content {
    display: flex;
    flex: 1;
    min-height: 0;
}

.editorial-text-left-copy {
    flex: 1.1;
    min-width: 0;
    padding: 16px 20px 20px 24px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}

.editorial-text-left-visual {
    flex: 1;
    min-width: 0;
    min-height: 0;
    align-self: stretch;
    overflow: hidden;
    position: relative;
}
```

Rules:
- The `h3` in `.editorial-text-left-header` is the module's top-level title; it must not be repeated inside the copy zone.
- The left copy zone holds a kicker row followed by a `text-panel-body`. The body accepts prose `<p>`, an `<ul class="editorial-list">`, or both — choose based on content.
- The right visual slot is open: use a plain `media-frame img`, an `echart-container`, or a full `image-title` component. Choose based on content — there is no default.
- When using `editorial-list` inside `text-panel-body`, add `<strong>` around the first 2–5 words of each `<li>` to create a bold lead phrase for scannable hierarchy.
- When the card carries a large statistic or callout number, place it between the header and the copy zone using an inline style (`font-size: 48px; font-family: IBM Plex Sans Condensed; font-weight: 700; color: var(--accent-gold); line-height: 1;`).

##### Tips
- **Parent must supply height.** `.editorial-text-left` uses `height: 100%` and `flex: 1` internally. The parent slot must have a defined height (grid cell, `height:100%` chain, or `flex:1;min-height:0`).
- **Text-to-visual flex ratio.** Default is `1.1 : 1` (copy slightly wider). For more copy, try `1.3 : 1`. For a visually dominant right panel, try `1 : 1.2`. Do not go below `0.8` on the copy side.
- **`editorial-list` font-size inside copy zone.** Override to `font-size:13px` and `gap:10px` inline — the base `editorial-list` uses `14px / gap:14px`, which is slightly large for the narrow copy column.
- **`echart-container` in visual slot.** Set `width:100%;height:100%` on the container and call `echarts.init()` after `SlidePresentation` is instantiated. The `position:relative;overflow:hidden` on `.editorial-text-left-visual` contains the canvas correctly.
- **`image-title` in visual slot.** The component is self-contained and fills `width:100%;height:100%` automatically. Use `image-title--right` modifier with a bottom-heavy overlay and right-biased blur mask for the most common editorial orientation.
- **Dark background.** Override CSS variables on `.editorial-text-left` to cascade into both the copy and visual zones: `--text-primary`, `--text-secondary`, `--text-muted`, `--line`, `--line-strong` — all set to white-family values.
<!-- @component:editorial-text-left:end -->

<!-- @component:echart-panel:start -->
#### EChart Panel

Chart layout frame for data visualisation. Defines the structural container and header zone; the chart type (bar, line, donut, scatter, heatmap, treemap, etc.) is chosen by the LLM based on the data.

```html
<div class="echart-panel">
  <div class="echart-panel-header">
    <p class="eyebrow">SECTION LABEL</p>
    <h3>Chart Title</h3>
    <p class="chart-subtitle">Optional context or unit note</p>
  </div>
  <div class="echart-container" id="chart-01"></div>
  <p class="chart-caption">Source: Organisation / Year</p>
</div>

<script>
// Include ECharts in the HTML head only when charts are present:
// <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
// Initialise after SlidePresentation is instantiated:
const chart = echarts.init(document.getElementById('chart-01'));
chart.setOption({ /* LLM selects type and config */ });
</script>
```

```css
.echart-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0;
}

.echart-panel-header {
    flex-shrink: 0;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 20px;
}

.echart-panel-header h3 {
    margin-top: 6px;
}

.chart-subtitle {
    margin-top: 4px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
}

.echart-container {
    flex: 1;
    min-height: 0; /* required inside flex to let ECharts fill correctly */
}

.chart-caption {
    flex-shrink: 0;
    margin-top: 12px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
}
```

Rules:
- Always include `min-height: 0` on `.echart-container`; without it ECharts overflows flex containers.
- Set `id` per chart to avoid collision when multiple charts appear in one slide.
- Choose chart type, colour palette, and axis config based on the data. Summit palette suggestion: use `--accent-earth` (`#8d6a49`), `--accent-olive` (`#6f7562`), and `--text-muted` (`#8a7f73`) as the primary series colours.
- Add ECharts script tag to `<head>` only when charts are present in the slide deck; do not include it unconditionally.
- `echarts.init()` must run after the DOM is ready and after `SlidePresentation` is instantiated.

##### Tips
- **Dark background: always use `backgroundColor:'transparent'` in `setOption`.** Do not rely on CSS background — ECharts renders to a canvas element and ignores inherited CSS background.
- **Dark background: override ALL text colors in the ECharts option.** Axis labels, legend text, axis line colors, and tooltip styles do not inherit from CSS. Set them explicitly: `rgba(247,244,238,0.65)` for labels, `rgba(247,244,238,0.2)` for grid lines.
- **Candlestick on dark background.** Use `--accent-olive` (`#6f7562`) for up candles and `--accent-danger` (`#b94a3c`) for down candles. These read clearly against dark backgrounds and stay within the Summit palette.
- **`height:100%` vs fixed pixel height.** Use `flex:1;min-height:0` when the chart should fill available space automatically (e.g., inside `split-dashboard`). Use a fixed pixel height (e.g., `height:380px`) only when you need to cap the chart to a specific proportion of the slide.
- **Chart sizing for `narrative-hero-left-dark`.** The left 7.8fr column is wide. A donut or candlestick chart works best centered with some breathing room. Add `padding: 24px 32px` to `.echart-container` to prevent the chart from touching the column edges.
<!-- @component:echart-panel:end -->

<!-- @component:flow-horizontal:start -->
#### Flow Horizontal

Horizontal step or phase sequence. Use for process stages, numbered definitions, or parallel concepts that should be read left to right. Suitable for 2–5 items.

```html
<div class="flow-horizontal">
  <div class="flow-item">
    <div class="flow-number">01</div>
    <div class="flow-body">
      <h4>Step Title</h4>
      <p>Brief description of this step or phase.</p>
    </div>
  </div>
  <div class="flow-item">
    <div class="flow-number">02</div>
    <div class="flow-body">
      <h4>Step Title</h4>
      <p>Brief description of this step or phase.</p>
    </div>
  </div>
  <div class="flow-item">
    <div class="flow-number">03</div>
    <div class="flow-body">
      <h4>Step Title</h4>
      <p>Brief description of this step or phase.</p>
    </div>
  </div>
</div>
```

```css
.flow-horizontal {
    position: relative;
    display: flex;
    align-items: flex-start;
    width: 100%;
}

.flow-horizontal::before {
    content: '';
    position: absolute;
    top: 17px;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--line-strong);
    z-index: 0;
}

.flow-horizontal .flow-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-right: 40px;
}

.flow-horizontal .flow-item:last-child {
    padding-right: 0;
}

.flow-horizontal .flow-number {
    position: relative;
    z-index: 1;
    background: var(--bg-page);
    font-family: 'IBM Plex Sans Condensed', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    border: 1px solid var(--line-strong);
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.flow-horizontal .flow-body h4 {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.14;
}

.flow-horizontal .flow-body p {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-secondary);
}
```

Rules:
- Prefer 3–4 items for balanced layout; 5 items work when copy is very short.
- Do not use arrowheads or chevrons between items; the horizontal rule threading through the numbers is the only connector.
- Number labels are report-style (`01`, `02`, `03`), not circles or bullets.
- Keep each item's body copy short — this is a reference summary, not a detailed explanation.

##### Tips
- **Dark background color overrides.** Flow-number: `border-color:rgba(247,244,238,0.3); color:rgba(247,244,238,0.6); background:<dark-bg-color>`. Heading h4: `color:#f7f4ee`. Body p: `color:rgba(247,244,238,0.7)`. Apply inline on each element — CSS cascade does not automatically inherit from the slide background.
- **Step copy length directly affects column balance.** One step with a long paragraph will push its column taller than the others and break the horizontal rhythm. Trim all steps to roughly equal length (2–4 lines each).
- **Horizontal rule connector.** The `::before` pseudo-element on `.flow-horizontal` draws a full-width line at `top: 17px` (vertical centre of the 34px number box). `.flow-number` sits above it via `z-index: 1` and `background: var(--bg-page)`, creating the effect of the line threading through the numbers. On dark backgrounds, override `background` on `.flow-number` to match the slide background color, and set `.flow-horizontal::before { background: rgba(247,244,238,0.15); }`.
<!-- @component:flow-horizontal:end -->

<!-- @component:flow-vertical:start -->
#### Flow Vertical

Vertical step or timeline sequence. Use for chronological phases, execution stages, or progress narratives that should be read top to bottom. Suitable for 2–6 items.

```html
<div class="flow-vertical">
  <div class="flow-item">
    <div class="flow-marker">
      <div class="flow-number">01</div>
      <div class="flow-line"></div>
    </div>
    <div class="flow-body">
      <h4>Phase Title</h4>
      <p>Description of this stage or milestone.</p>
    </div>
  </div>
  <div class="flow-item">
    <div class="flow-marker">
      <div class="flow-number">02</div>
      <div class="flow-line"></div>
    </div>
    <div class="flow-body">
      <h4>Phase Title</h4>
      <p>Description of this stage or milestone.</p>
    </div>
  </div>
  <div class="flow-item last">
    <div class="flow-marker">
      <div class="flow-number">03</div>
      <!-- no flow-line on last item -->
    </div>
    <div class="flow-body">
      <h4>Phase Title</h4>
      <p>Description of this stage or milestone.</p>
    </div>
  </div>
</div>
```

```css
.flow-vertical {
    display: flex;
    flex-direction: column;
    width: 100%;
}

.flow-vertical .flow-item {
    display: flex;
    gap: 28px;
    align-items: flex-start;
}

.flow-vertical .flow-marker {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
}

.flow-vertical .flow-number {
    font-family: 'IBM Plex Sans Condensed', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    border: 1px solid var(--line-strong);
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.flow-vertical .flow-line {
    width: 1px;
    flex: 1;
    min-height: 28px;
    background: var(--line-strong);
    margin: 6px 0;
}

.flow-vertical .flow-body {
    padding-bottom: 32px;
}

.flow-vertical .flow-item.last .flow-body {
    padding-bottom: 0;
}

.flow-vertical .flow-body h4 {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.14;
    margin-top: 4px;
}

.flow-vertical .flow-body p {
    margin-top: 8px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-secondary);
}
```

Rules:
- Add class `last` to the final `.flow-item` and omit the `.flow-line` div inside it.
- The connecting line grows to fill the vertical space between items via `flex: 1`.
- Number boxes share the same border-only square style as `flow-horizontal` for visual consistency.
- Copy per item can be slightly longer than horizontal flow since vertical reading allows more density.
- Combine with `text-panel` or `echart-panel` on the opposing side of a layout when needed.

##### Tips
- **`.last` class on final item is mandatory.** Without it, the connecting line extends past the last item and exits the component boundary. Always add `.last` to the final `div.flow-item`.
- **Dark background with background image.** When the column containing `flow-vertical` has a background image, use the same three-layer z-index pattern: background `z-index:0`, dark scrim `z-index:1`, component content `z-index:2`. Set the parent column to `position:relative;overflow:hidden`.
- **Dark text overrides (same as flow-horizontal).** Flow-number border `rgba(247,244,238,0.3)`, color `rgba(247,244,238,0.6)`; h4 `#f7f4ee`; p `rgba(247,244,238,0.7)`. Also override the connecting line color: `background:rgba(247,244,238,0.2)`.
- **Column height constraint.** `flow-vertical` expands naturally with content. In a two-column layout, ensure the opposing column (`text-panel` or `echart-panel`) has enough content to avoid a large height mismatch.
<!-- @component:flow-vertical:end -->

<!-- @component:data-table:start -->
#### Data Table

Annual-report format data table. Use for year-on-year comparisons, emissions data, supply chain figures, and any structured numeric dataset that requires legible column alignment. Adjust `font-size` and cell `padding` to suit density needs — no separate component required for compact variants.

```html
<div class="data-table-wrap">
  <p class="data-table-label">Key Figures — Income Statement</p>
  <table class="data-table">
    <thead>
      <tr>
        <th>Scope</th>
        <th>2021</th>
        <th>2022</th>
        <th class="col-highlight">2023</th>
        <th class="col-highlight">2024</th>
        <th>YoY</th>
      </tr>
    </thead>
    <tbody>
      <tr class="section-header">
        <td colspan="6">Direct Emissions</td>
      </tr>
      <tr>
        <td>Scope 1</td>
        <td>1,329.2</td>
        <td>1,273.4</td>
        <td class="col-highlight">1,156.4</td>
        <td class="col-highlight">1,042.0</td>
        <td class="delta positive">−10%</td>
      </tr>
      <tr>
        <td>Scope 2</td>
        <td>1,617.8</td>
        <td>1,432.9</td>
        <td class="col-highlight">820.0</td>
        <td class="col-highlight">0.0</td>
        <td class="delta positive">−100%</td>
      </tr>
      <tr class="subtotal">
        <td>1+2 (net)</td>
        <td>2,905.5</td>
        <td>3,286.3</td>
        <td class="col-highlight">1,976.4</td>
        <td class="col-highlight">1,042.0</td>
        <td class="delta positive">−47%</td>
      </tr>
    </tbody>
  </table>
  <p class="table-caption">Thousands of tonnes CO₂e · Source: Company Disclosures 2024</p>
</div>
```

```css
.data-table-wrap {
    width: 100%;
}

.data-table-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 8px;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
}

.data-table thead tr {
    border-bottom: 1.5px solid var(--line-strong);
}

.data-table th {
    padding: 0 12px 10px 0;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    white-space: nowrap;
}

.data-table th:not(:first-child),
.data-table td:not(:first-child) {
    text-align: right;
}

.data-table th.col-highlight,
.data-table td.col-highlight {
    color: var(--text-primary);
    background: rgba(23, 20, 17, 0.05);
    padding-left: 6px;
    padding-right: 8px;
}

.data-table th.col-highlight {
    color: var(--text-secondary);
}

.data-table tbody tr {
    border-bottom: 1px solid var(--line);
}

.data-table tbody tr:last-child {
    border-bottom: none;
}

.data-table td {
    padding: 9px 12px 9px 0;
    line-height: 1.4;
    color: var(--text-secondary);
}

.data-table tr.subtotal td {
    font-weight: 600;
    color: var(--text-primary);
    border-top: 1px solid var(--line-strong);
    border-bottom: 1px solid var(--line-strong);
}

.data-table tr.section-header td {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding-top: 14px;
    padding-bottom: 4px;
    border-bottom: none;
}

.data-table .delta {
    font-weight: 600;
    white-space: nowrap;
}

.data-table .delta.positive {
    color: var(--accent-olive);
}

.data-table .delta.negative {
    color: var(--accent-danger);
}

.data-table .delta.neutral {
    color: var(--text-muted);
}

.table-caption {
    margin-top: 12px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
}
```

Rules:
- No outer border. Separation is by `border-bottom` on rows only.
- Numeric columns are right-aligned; the label column is left-aligned.
- Use `tabular-nums` for number columns so decimals align vertically.
- Use `.subtotal` on summary rows (totals, net figures) — heavier weight and double-rule border.
- Use `.section-header` rows to group rows into labelled categories within a single table (no data, just a label spanning all columns).
- Use `.col-highlight` on both `th` and `td` in a column to spotlight the current or most important period.
- `.delta.positive` and `.delta.negative` use Summit accent colours, not generic green/red. `.delta.neutral` for flat movement.
- Use `data-table-label` as a heading above the table when multiple tables are stacked.
- Include `.table-caption` below with the data source and unit.

##### Tips
- **Compact variant.** For high-density datasets, reduce `.data-table` to `font-size:11px` and `.data-table td` padding to `6px 8px 6px 0`. No separate component needed.
- **Dark background: override CSS variables on `.data-table-wrap`.** Set `--text-primary:#f7f4ee`, `--text-secondary:rgba(247,244,238,0.7)`, `--text-muted:rgba(247,244,238,0.45)`, `--line:rgba(247,244,238,0.12)`, `--line-strong:rgba(247,244,238,0.28)`. All child elements inherit automatically via `var()`.
- **`col-highlight` on dark.** Override background on `.data-table-wrap`: `.data-table th.col-highlight, .data-table td.col-highlight { background: rgba(247,244,238,0.06); }`. Also override `--accent-earth` → `var(--accent-gold)` so highlight header color remains visible.
- **Delta positive on dark.** Override `--accent-olive` → `#8faf7e` on `.data-table-wrap`. The default `--accent-olive` (#6f7562) is nearly invisible on dark backgrounds.
- **`.table-caption` on dark.** Set explicitly: `color:rgba(247,244,238,0.45)`. It does not inherit from the CSS variable override on the wrapper.
- **Two stacked tables.** Add `margin-top:18px` between `.data-table-wrap` blocks and use `data-table-label` on each. Do not add a horizontal rule between them — the label serves as the visual separator.
<!-- @component:data-table:end -->







<!-- @component:image-title:start -->
#### Image Title

Self-contained full-canvas component: a dominant photograph with a directional blur layer, a gradient overlay, and a foreground text stack — all composited inside one element. Use for cover slides, closing slides, atmospheric section dividers, or any full-bleed spread where a single image should dominate the entire canvas.

The LLM controls three key variables via inline style or modifier class:
- **Alignment**: `image-title--left` (cover default), `image-title--right` (closing default), `image-title--center`
- **Overlay opacity / direction**: set the `background` gradient on `.image-title-overlay` inline
- **Text opacity**: set `opacity` on `.image-title` itself (range `0.7`–`1.0`; default `1.0`)

```html
<div class="image-title image-title--left">

  <!-- Layer 0: background image -->
  <img class="image-title-media" src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1920&auto=format&fit=crop" alt="Alpine ridge at dawn">

  <!-- Layer 1: directional blur — mask gradient concentrates blur on the text side -->
  <!-- cover (--left):   mask to-left  → blur left,  sharp right -->
  <!-- closing (--right): mask to-right → blur right, sharp left -->
  <div class="image-title-blur" style="-webkit-mask-image:linear-gradient(to left, transparent 0%, transparent 20%, black 100%);mask-image:linear-gradient(to left, transparent 0%, transparent 20%, black 100%);"></div>

  <!-- Layer 2: gradient overlay — adjust direction and opacity to suit slide purpose -->
  <!-- cover default:   linear-gradient(105deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.72) 55%, rgba(5,5,5,0.10) 100%) -->
  <!-- closing default: linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.72) 100%) -->
  <div class="image-title-overlay" style="background:linear-gradient(105deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.72) 55%, rgba(5,5,5,0.10) 100%);"></div>

  <!-- Layer 3: foreground text -->
  <div class="image-title-fg">
    <div class="image-title-brand reveal">
      <span class="chevron-divider" style="color:rgba(247,244,238,0.55);">Organisation Name</span>
    </div>
    <div class="image-title-body">
      <p class="image-title-eyebrow reveal">Report Title · Year</p>
      <h1 class="reveal">Opening<br>Statement<br>Here.</h1>
      <p class="image-title-subtitle reveal">One or two lines of supporting copy. Keep it short — the image does the visual work.</p>
    </div>
    <div class="image-title-footer">
      <p class="caption reveal" style="color:rgba(247,244,238,0.5);">website or location</p>
      <p class="caption reveal" style="color:rgba(247,244,238,0.5);">Organisation · Year</p>
    </div>
  </div>

</div>
```

```css
/* Container — clips all layers, holds stacking context */
.image-title {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: #f7f4ee;
}

/* Layer 0: background image */
.image-title-media {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    z-index: 0;
}

/* Layer 1: directional blur */
.image-title-blur {
    position: absolute;
    inset: 0;
    z-index: 1;
    backdrop-filter: blur(50px);
    -webkit-backdrop-filter: blur(50px);
}

/* Layer 2: gradient overlay — background set inline by LLM */
.image-title-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
}

/* Layer 3: foreground text */
.image-title-fg {
    position: relative;
    z-index: 3;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 84px;
}

/* Alignment variants */
.image-title--left .image-title-body {
    max-width: 680px;
}

.image-title--right .image-title-fg {
    text-align: right;
}
.image-title--right .image-title-body {
    max-width: 860px;
    margin-left: auto;
}

.image-title--center .image-title-fg {
    text-align: center;
    align-items: center;
}
.image-title--center .image-title-body {
    max-width: 900px;
}

/* Text elements */
.image-title-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(247, 244, 238, 0.55);
    margin-bottom: 20px;
}

.image-title h1 {
    color: #f7f4ee;
    font-size: 96px;
    line-height: 0.92;
    letter-spacing: -0.03em;
    text-transform: uppercase;
}

.image-title-subtitle {
    margin-top: 24px;
    font-size: 15px;
    line-height: 1.56;
    color: rgba(247, 244, 238, 0.72);
    max-width: 480px;
}

.image-title-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
}
```

Rules:
- Always use one of the three modifier classes: `image-title--left`, `image-title--right`, or `image-title--center`. Never omit the modifier.
- Set the `background` gradient on `.image-title-overlay` inline — never use a static class value. The direction and opacity must match the text position: dense dark on the text side, fading toward the open image side.
- The blur mask direction must mirror the text alignment: `--left` uses `to left`, `--right` uses `to right`. Both `-webkit-mask-image` and `mask-image` are required for cross-browser support.
- All text inside `.image-title-fg` must be white-family: headings `#f7f4ee`, body `rgba(247,244,238,0.72)`, captions and eyebrows `rgba(247,244,238,0.50–0.55)`.
- Use `.page-number--light` on any slide using this component.
- When used inside `fullbleed` layout, place this component directly as the sole child of the `.page` div — the layout provides no additional framing.

##### Tips
- **h1 size range.** Scale between `88px` and `120px` depending on title length. Three short lines at `96px` is the default for cover; `100px` works well for short closing statements. Longer titles should reduce to `80–88px`.
- **Cover overlay (--left).** Use `linear-gradient(105deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.72) 55%, rgba(5,5,5,0.10) 100%)`. Left stop must stay near `0.95` — the title needs a near-opaque dark backing on all hero imagery. Only the right tail fades to near-transparent so the image breathes.
- **Closing overlay (--right).** Use `linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.72) 100%)`. Bottom-heavy dark zone backs the right-aligned text. Do not drop the bottom stop below `0.60`.
- **Text opacity.** Add `style="opacity:0.85"` (or similar) to the `.image-title` container itself to softly blend the entire foreground text layer into the image — useful for atmospheric or section-divider slides where editorial restraint is the goal. Do not go below `0.70`.
- **`--right` closing variant.** Mirror the blur mask: use `mask-image:linear-gradient(to right, transparent 0%, transparent 20%, black 100%)`. The right side stays blurred (text zone); the left side of the image stays sharp.
- **`--center` variant.** Use a radial or symmetric overlay: `radial-gradient(ellipse at center, rgba(5,5,5,0.72) 0%, rgba(5,5,5,0.20) 100%)` or a flat `rgba(5,5,5,0.55)`. Center blur mask: `mask-image:radial-gradient(ellipse at center, black 0%, transparent 80%)`.
- **Subtitle width on `--right`.** `.image-title-subtitle` inherits `max-width:480px` which is set for left-aligned text. On `--right`, override to match the `.image-title-body` width: `style="max-width:520px;margin-left:auto;"`.
<!-- @component:image-title:end -->

<!-- @component:toc:start -->
#### TOC Panel

Narrow editorial panel for table-of-contents slides. A 3px accent-gold vertical rule on the left anchors the panel; the right body holds a title, short intro note, chapter list, and a footer block. The `justify-content:space-between` flex column pins the footer to the bottom of the panel.

```html
<div class="toc-panel">
  <div style="width:3px;background:var(--accent-gold);flex:0 0 3px;"></div>
  <div style="padding-left:22px;display:flex;flex-direction:column;justify-content:space-between;flex:1;">
    <div>
      <h2 style="font-size:34px;line-height:0.94;letter-spacing:-0.03em;text-transform:uppercase;max-width:220px;">Table of Contents</h2>
      <p style="margin-top:18px;font-size:11px;line-height:1.6;letter-spacing:0.06em;color:var(--text-secondary);max-width:255px;">Short introductory note describing the scope of the sections that follow.</p>
      <ol style="list-style:none;display:flex;flex-direction:column;gap:10px;margin-top:26px;">
        <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:center;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span style="font-weight:700;">01</span><span>Chapter title or section theme</span></li>
        <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:center;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span style="font-weight:700;">02</span><span>Chapter title or section theme</span></li>
        <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:center;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span style="font-weight:700;">03</span><span>Chapter title or section theme</span></li>
        <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:center;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span style="font-weight:700;">04</span><span>Chapter title or section theme</span></li>
        <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:center;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span style="font-weight:700;">05</span><span>Chapter title or section theme</span></li>
        <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:center;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;"><span style="font-weight:700;">06</span><span>Chapter title or section theme</span></li>
      </ol>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="rule"></div>
      <div>
        <p class="caption">Scope of report</p>
        <p style="margin-top:10px;font-size:11px;line-height:1.6;color:var(--text-secondary);max-width:255px;">Optional scope note, data coverage period, or brief methodology reference.</p>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:end;">
        <p class="caption">Organisation · Year</p>
      </div>
    </div>
  </div>
</div>
```

```css
.toc-panel {
    background: var(--bg-page);
    height: 100%;
    padding: 42px 38px 30px;
    display: flex;
}
```

##### Tips
- **Chapter numbers must be `font-weight:700`.** Without bold, the numbers dissolve visually into the lighter chapter title text.
- **Last `li` has no `border-bottom`.** Every item except the last carries `border-bottom:1px solid var(--line)`. Remove it from the final entry to avoid a floating rule at the bottom of the list.
- **accent-gold vertical rule.** The 3px left rule uses `var(--accent-gold)`. Do not substitute another color — it is the primary editorial accent in Summit.
- **`justify-content:space-between` requires a defined height on the parent.** The panel must sit inside a container with a known height (grid cell, absolute position, or `height:100%` chain) or the footer will not pin to the bottom.
<!-- @component:toc:end -->

<!-- @component:quote:start -->
#### Quote (.quote-block)

Flat editorial quote block. Wide and short (width > height). Transparent background — place it inside any layout slot. The large decorative quotation mark is CSS-rendered (no icon dependency).

```html
<div class="quote-block">
  <div class="quote-mark" aria-hidden="true">“</div>
  <p class="quote-text">The mountains teach us that progress is measured not in speed, but in the ground gained against resistance.</p>
  <div class="quote-attribution">
    <div class="quote-avatar">JD</div><!-- or <img src="avatar.jpg" alt="Jane Doe"> -->
    <div class="quote-meta">
      <p class="quote-name">Jane Doe</p>
      <p class="caption">CEO, Acme Corporation</p>
    </div>
  </div>
</div>
```

```css
.quote-block {
    position: relative;
    padding: 36px 44px 32px;
    overflow: hidden;
}

.quote-mark {
    position: absolute;
    top: -18px;
    left: 28px;
    font-family: Baskerville, Georgia, serif;
    font-size: 140px;
    font-weight: 700;
    line-height: 1;
    color: var(--accent-sage);
    opacity: 0.42;
    pointer-events: none;
    user-select: none;
}

.quote-text {
    position: relative;
    font-size: 20px;
    font-style: italic;
    line-height: 1.5;
    color: var(--text-primary);
    max-width: 860px;
    padding-top: 48px; /* clears the decorative mark */
}

.quote-attribution {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 24px;
}

.quote-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--bg-page-alt);
    border: 1px solid var(--line-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'IBM Plex Sans Condensed', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-muted);
    flex-shrink: 0;
    overflow: hidden;
}

.quote-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.quote-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.quote-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
}
```

**Tips:**

- **Dark background**: override text colors on the parent slot — `color: var(--bg-page)` for `.quote-text` and `.quote-name`; increase `.quote-mark` opacity to `0.15` (the sage hue reads better against dark at lower opacity).
- **Avatar with photo**: replace `<div class="quote-avatar">JD</div>` with `<div class="quote-avatar"><img src="path/to/photo.jpg" alt="Jane Doe"></div>`. The `overflow: hidden` + `object-fit: cover` handles any image aspect ratio.
- **Quote text length**: adjust `font-size` between `18px` (longer quotes, 3+ lines) and `24px` (short punchy quotes, 1 line). Keep `line-height: 1.5`.
- **Opacity guidance**: on `--bg-page` (warm paper), `.quote-mark` opacity `0.25` works well. On dark `--bg-frame` backgrounds, reduce to `0.15`.
- **Source-only attribution** (no person): omit `.quote-avatar` entirely and use `.quote-name` for the source text (e.g. a report title or publication name).

<!-- @component:quote:end -->

<!-- @component:brand-watermark:start -->
#### Brand Watermark

Decorative brand watermark for selected slides. Use it as a quiet print-style brand trace in the top-right corner, not as a header logo. The image is typically a user-provided transparent PNG.

```html
<div class="brand-watermark" aria-hidden="true">
  <img src="assets/brand-watermark-dark.png" alt="">
</div>
```

```css
.brand-watermark {
    position: absolute;
    top: 46px;
    right: 54px;
    height: 28px;
    max-width: 360px;
    opacity: 0.10;
    pointer-events: none;
    z-index: 1;
}

.brand-watermark img {
    height: 100%;
    width: auto;
    display: block;
    object-fit: contain;
}

.brand-watermark--light {
    opacity: 0.14;
}
```

Rules:
- Use a transparent-background, monochrome image. Prefer a simplified brand mark rather than a full logo lockup.
- Default placement is the top-right corner. Keep it inside the paper page, not floating in the outer black frame.
- Treat it as decorative. It must remain weaker than the slide title, image, and main narrative content.
- Use a dark watermark image on light pages and a light watermark image on dark or fullbleed pages.
- Do not pair it with another top-corner brand label, heading, or caption in the same region.
- Omit it when the top-right area contains important photography detail or dense content.

##### Tips
- **Preferred asset format.** Use a user-provided transparent PNG with no background box. WebP or SVG can also work, but transparent PNG is the default assumption for Summit.
- **Light vs dark variants.** Prepare two assets when possible: `brand-watermark-dark.png` for light pages and `brand-watermark-light.png` for dark pages. PNG cannot reliably recolor like inline SVG, so separate assets are safer.
- **Size control.** Default to controlling the watermark by `height`, not fixed `width`. This keeps user-provided marks with very different aspect ratios visually consistent while preserving their natural proportions.
- **Opacity range.** On light pages, keep opacity around `0.08` to `0.12`. On dark pages, `0.12` to `0.18` is usually enough.
- **Aspect ratio.** Do not force the mark into a square crop if the supplied artwork is wide or tall. Use `height: 100%` and `width: auto` on the image so the artwork keeps its natural proportions.
- **Overflow guard.** Keep a `max-width` on the wrapper for unusually long horizontal wordmarks so they do not intrude into the title field.
- **Best usage.** Works best on section openers, TOC pages, and selected content slides with enough negative space. Cover and closing slides usually rely on their existing brand labels instead.
<!-- @component:brand-watermark:end -->

<!-- @component:page-number:start -->
#### Page Number (.page-number)

Absolute-positioned slide counter, bottom-right corner. Always present on content slides.
Use `.page-number--light` when the slide background is dark (which is most slides in Summit).

```html
<div class="page-number page-number--light">01 / 12</div>
```

Omit `--light` only on slides with a white/light background.

```css
.page-number {
  position: absolute;
  bottom: 36px;
  right: 52px;
  font-family: 'IBM Plex Sans Condensed', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  z-index: 10;
  pointer-events: none;
}
.page-number--light {
  color: rgba(247, 244, 238, 0.45);
}
```

<!-- @component:page-number:end -->

<!-- @component:timeline-journey-horizontal:start -->
#### Timeline Journey Horizontal

A horizontal milestone timeline with a central axis line. Nodes sit on the axis; a dashed vertical stem leads to a tip node, with date, title, and description text alongside. Alternate nodes above and below the axis for rhythm. Suitable for 4–8 milestones across a chronological arc, transformation story, or multi-year programme recap.

```html
<div class="tjh">
  <div class="tjh-axis"></div>

  <!-- UP node: item bottom edge sits on axis, content grows upward.
       DOM order (top→bottom): label, tip-dot, stem, axis-dot -->
  <div class="tjh-item tjh-item--up" style="left:7%; --tjh-item-color:var(--accent-earth);">
    <div class="tjh-label">
      <span class="tjh-date">Mar 2019</span>
      <span class="tjh-title">Programme Launch</span>
      <span class="tjh-text">Cross-regional baseline mapping and legacy risk exposure formally catalogued.</span>
    </div>
    <div class="tjh-tip-dot"></div>
    <div class="tjh-stem"></div>
    <div class="tjh-axis-dot"></div>
  </div>

  <!-- DOWN node: item top edge sits on axis, content grows downward.
       DOM order (top→bottom): axis-dot, stem, tip-dot, label -->
  <div class="tjh-item tjh-item--down" style="left:21%; --tjh-item-color:var(--accent-gold);">
    <div class="tjh-axis-dot"></div>
    <div class="tjh-stem"></div>
    <div class="tjh-tip-dot"></div>
    <div class="tjh-label">
      <span class="tjh-date">Nov 2019</span>
      <span class="tjh-title">Supplier Audit</span>
      <span class="tjh-text">Sprint completed across all strategic mills.</span>
    </div>
  </div>

  <!-- Add more nodes following the same up/down pattern -->
</div>
```

```css
.tjh {
  --tjh-node: 12px;
  --tjh-stem-h: 80px;
  --tjh-col: calc(100% / 7); /* adjust denominator to match node count */

  position: relative;
  width: 100%;
  height: 360px;
}

/* Axis line */
.tjh-axis {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--line-strong);
  transform: translateY(-50%);
}

/* Item base */
.tjh-item {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--tjh-col);
  transform: translateX(-50%);
}

/* --up: bottom edge on axis, content grows upward */
.tjh-item--up  { bottom: 50%; }

/* --down: top edge on axis, content grows downward */
.tjh-item--down { top: 50%; }

/* Dots */
.tjh-axis-dot,
.tjh-tip-dot {
  width: var(--tjh-node);
  height: var(--tjh-node);
  border-radius: 50%;
  background: var(--tjh-item-color);
  flex-shrink: 0;
}

/* Straddle the axis line */
.tjh-item--up   .tjh-axis-dot { margin-bottom: calc(-1 * var(--tjh-node) / 2); }
.tjh-item--down .tjh-axis-dot { margin-top:    calc(-1 * var(--tjh-node) / 2); }

/* Dashed stem */
.tjh-stem {
  width: 1px;
  height: var(--tjh-stem-h);
  background-image: repeating-linear-gradient(
    to bottom,
    var(--line-strong) 0px,
    var(--line-strong) 4px,
    transparent 4px,
    transparent 8px
  );
  flex-shrink: 0;
}

/* Label */
.tjh-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 0 6px;
}

.tjh-item--up   .tjh-label { margin-bottom: 6px; }
.tjh-item--down .tjh-label { margin-top: 6px; }

/* Date: inherits node colour via --tjh-item-color */
.tjh-date {
  font-family: 'IBM Plex Sans Condensed', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--tjh-item-color);
  line-height: 1.3;
  white-space: nowrap;
}

.tjh-title {
  font-family: 'IBM Plex Sans Condensed', sans-serif;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  line-height: 1.15;
}

.tjh-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}
```

Rules:
- Position nodes with `left: X%` inline style. For N nodes, space them at `(100/(N+1)) * k %` or manually distribute to reflect time proportions.
- Each node requires `--tjh-item-color` set inline (use any summit accent colour).
- **`--up` DOM order**: label → tip-dot → stem → axis-dot (label at top, axis-dot at bottom touching axis).
- **`--down` DOM order**: axis-dot → stem → tip-dot → label (axis-dot at top touching axis, label at bottom).
- Label order within `.tjh-label` is always: date → title → text (top to bottom).
- Keep `.tjh-text` short (1–2 lines). The column width (`--tjh-col`) limits wrapping naturally.
- Alternate up/down across nodes for visual rhythm. Do not stack multiple up or multiple down nodes consecutively unless intentional.
- `--tjh-col` denominator should match the total number of nodes so each item gets equal horizontal space.

##### Tips
- **Adjust height**: Increase `.tjh { height }` if label text is tall or stems feel cramped.
- **Adjust stem length**: Change `--tjh-stem-h` to lengthen or shorten the dashed connector.
- **Dark background overrides**: Set `--line-strong: rgba(247,244,238,0.25)` on `.tjh`, override `.tjh-axis { background }`, set `.tjh-title { color: #f7f4ee }`, `.tjh-text { color: rgba(247,244,238,0.7) }`. The `--tjh-item-color` accent colours work on dark backgrounds without change.
- **Fewer nodes**: For 4–5 nodes, widen `--tjh-col` by using a smaller denominator (e.g. `calc(100% / 5)`), and space `left` values accordingly.
<!-- @component:timeline-journey-horizontal:end -->

<!-- @component:timeline-journey-vertical:start -->
#### Timeline Journey Vertical

A vertical milestone timeline with a central axis line. Nodes sit on the axis; a horizontal dashed stem leads to a tip dot, with date, title, and description text alongside. Alternate nodes left and right of the axis for rhythm. Suitable for 3–8 milestones across a chronological arc, transformation story, or multi-year programme recap.

Can be placed inside any layout slot that provides a defined height (`narrative`, `halves`, `highlight-cols`, `stacked`, or a full-page content zone). The component fills `width: 100%; height: 100%` of its parent.

```html
<div class="tjv">
  <div class="tjv-axis"></div>

  <!-- LEFT node: DOM order axis-dot → stem → tip-dot → label.
       flex-direction: row-reverse flips visual order to: label | tip-dot | stem | axis-dot
       → axis-dot ends up on the right touching the axis; label on the far left, right-aligned. -->
  <div class="tjv-item tjv-item--left" style="top:14%;--tjv-item-color:var(--accent-earth);">
    <div class="tjv-axis-dot"></div>
    <div class="tjv-stem"></div>
    <div class="tjv-tip-dot"></div>
    <div class="tjv-label">
      <span class="tjv-date">Mar 2019</span>
      <span class="tjv-title">Programme Launch</span>
      <span class="tjv-text">Cross-regional baseline mapping and legacy risk exposure formally catalogued across all operating units.</span>
    </div>
  </div>

  <!-- RIGHT node: DOM order axis-dot → stem → tip-dot → label.
       flex-direction: row renders as: axis-dot | stem | tip-dot | label
       → axis-dot on the left touching the axis; label on the far right, left-aligned. -->
  <div class="tjv-item tjv-item--right" style="top:30%;--tjv-item-color:var(--accent-gold);">
    <div class="tjv-axis-dot"></div>
    <div class="tjv-stem"></div>
    <div class="tjv-tip-dot"></div>
    <div class="tjv-label">
      <span class="tjv-date">Nov 2019</span>
      <span class="tjv-title">Supplier Audit Completed</span>
      <span class="tjv-text">Full sprint completed across all strategic mills. 94% of Tier 1 suppliers assessed against new emissions criteria.</span>
    </div>
  </div>

  <!-- Add more nodes following the same left/right pattern -->
</div>
```

```css
.tjv {
  --tjv-node:   12px;  /* axis-dot diameter */
  --tjv-stem-w: 80px;  /* horizontal dashed stem width */

  position: relative;
  width: 100%;
  height: 100%;
}

/* Vertical axis — horizontally centered, full height */
.tjv-axis {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line-strong);
  transform: translateX(-50%);
}

/* Item base */
.tjv-item {
  position: absolute;
  display: flex;
  align-items: center;
  height: 80px;           /* vertical size of the clickable/hover zone */
  transform: translateY(-50%); /* center the row on the top: Y% point */
}

/* LEFT: row-reverse flips DOM order so axis-dot appears on the right (on the axis) */
.tjv-item--left {
  right: 50%;
  flex-direction: row-reverse;
}

/* RIGHT: standard row; axis-dot appears on the left (on the axis) */
.tjv-item--right {
  left: 50%;
  flex-direction: row;
}

/* Axis dot — straddles the axis line */
.tjv-axis-dot {
  width: var(--tjv-node);
  height: var(--tjv-node);
  border-radius: 50%;
  background: var(--tjv-item-color);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

/* LEFT: axis-dot is visually rightmost (row-reverse); push right to straddle axis */
.tjv-item--left .tjv-axis-dot {
  margin-right: calc(-1 * var(--tjv-node) / 2);
}

/* RIGHT: axis-dot is visually leftmost; push left to straddle axis */
.tjv-item--right .tjv-axis-dot {
  margin-left: calc(-1 * var(--tjv-node) / 2);
}

/* Tip dot — smaller circle at the stem end near the label */
.tjv-tip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tjv-item-color);
  flex-shrink: 0;
}

/* Horizontal dashed stem */
.tjv-stem {
  width: var(--tjv-stem-w);
  height: 1px;
  background-image: repeating-linear-gradient(
    to right,
    var(--line-strong) 0px,
    var(--line-strong) 4px,
    transparent 4px,
    transparent 8px
  );
  flex-shrink: 0;
}

/* Label block */
.tjv-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tjv-item--left .tjv-label {
  text-align: right;
  align-items: flex-end;
  padding-right: 20px;
  max-width: 560px;
}

.tjv-item--right .tjv-label {
  text-align: left;
  align-items: flex-start;
  padding-left: 20px;
  max-width: 560px;
}

/* Date — colored per node via --tjv-item-color */
.tjv-date {
  font-family: 'IBM Plex Sans Condensed', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--tjv-item-color);
  line-height: 1.3;
  white-space: nowrap;
}

.tjv-title {
  font-family: 'IBM Plex Sans Condensed', sans-serif;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  line-height: 1.15;
}

.tjv-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  max-width: 380px;
}
```

Rules:
- **DOM order is identical for left and right nodes**: `axis-dot → stem → tip-dot → label`. The visual direction is controlled by CSS (`row-reverse` for left, `row` for right) — never by changing the DOM order.
- Position each node with `top: Y%` inline style. For N nodes, distribute evenly: `(100 / (N + 1)) * k %` or manually to reflect actual time proportions.
- Every node must set `--tjv-item-color` inline (use any Summit accent: `--accent-earth`, `--accent-gold`, `--accent-olive`, `--accent-sage`).
- Alternate `--left` and `--right` across nodes for visual rhythm. Do not place consecutive same-side nodes unless intentional.
- The parent container must have a defined height. Use `height: 100%` when inside a layout slot, or set an explicit `px` height when used standalone.
- Keep `.tjv-text` to 2–4 lines. Longer text shifts the effective visual centre of the item away from the `axis-dot`.

##### Tips
- **Adjust stem length**: Change `--tjv-stem-w` on `.tjv` (or inline on a single item) to lengthen or shorten the dashed connector. Wider columns benefit from a longer stem (`120px`); narrow slots look cleaner at `60px`.
- **Adjust node slot height**: The `height: 80px` on `.tjv-item` sets the vertical click/hover zone. It does not clip label text — labels overflow naturally below the slot. If labels are tall, increase `top` spacing between nodes to avoid overlap.
- **In a layout slot** (`narrative`, `halves`, `highlight-cols`): wrap `.tjv` in a `div` with `height: 100%` and `position: relative` so the absolute positioning resolves correctly.
- **Standalone full-page use**: set an explicit height on the `.tjv` wrapper (e.g. `height: 720px`) when used outside a height-constrained layout.
- **Dark background overrides**: set on the `.tjv` wrapper — `--line-strong: rgba(247,244,238,0.25)` (axis + stem), `.tjv-title { color: #f7f4ee }`, `.tjv-text { color: rgba(247,244,238,0.7) }`. The `--tjv-item-color` accent colours work on dark backgrounds without change.
- **Fewer nodes (3–4)**: increase spacing — use `top` values like `15%, 35%, 55%, 75%` to prevent the timeline from clustering at the top.
- **More nodes (6–8)**: reduce `.tjv-text` to 1–2 lines and consider reducing `font-size` to `12px` to avoid label collisions.
<!-- @component:timeline-journey-vertical:end -->

<!-- @design:components:end -->
