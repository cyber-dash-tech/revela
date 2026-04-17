---
name: summit
description: Editorial outdoor annual-report theme with cinematic photography and restrained print-style layouts
author: OpenCode
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
    --shadow-soft: rgba(0, 0, 0, 0.18);
}
```

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
- Body: `15px` to `18px`, line-height `1.6`
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
    font-size: 14px;
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

.editorial-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.editorial-list li {
    position: relative;
    padding-left: 22px;
}

.editorial-list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 13px;
    width: 10px;
    height: 1px;
    background: var(--line-strong);
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

Full-canvas three-layer layout for slides that need a dominant background field behind all foreground content. Use for opening (cover) and closing slides, atmospheric section dividers, or any spread where a single background field should dominate the entire canvas.

Structural intent:
- bg slot: full-canvas background zone, sits below everything
- fg slot: foreground content zone, positioned above the gradient overlay

Every slot accepts 1 or more components. The LLM decides what goes in each slot based on the slide purpose.


```html
<section class="slide" slide-qa="false" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">

      <!-- [slot: bg] — 1+ components; suggested: full-bleed-media -->
      <div style="position:absolute;inset:0;z-index:0;">
      </div>

      <!-- directional blur layer — cover: mask to-left (left heavy); closing: mask to-right (right heavy) -->
      <!-- cover:   mask-image: linear-gradient(to left,  transparent 0%, transparent 20%, black 100%) -->
      <!-- closing: mask-image: linear-gradient(to right, transparent 0%, transparent 20%, black 100%) -->
      <div style="position:absolute;inset:0;z-index:1;backdrop-filter:blur(50px);-webkit-backdrop-filter:blur(50px);-webkit-mask-image:/* see above */;mask-image:/* see above */;"></div>

      <!-- gradient overlay — adjust direction and opacity based on fg content position -->
      <div style="position:absolute;inset:0;z-index:2;background:/* linear-gradient(...) */"></div>

      <!-- [slot: fg] — 1+ components; suggested: cover-title-stack, closing-title-stack -->
      <div style="position:relative;z-index:3;height:100%;">
      </div>

    </div>
  </div>
</section>
```

##### Tips
- **Z-index stacking is mandatory.** Always declare explicit z-index for all four layers: bg slot `z-index:0`, blur layer `z-index:1`, gradient overlay `z-index:2`, fg slot `z-index:3`. Relying on DOM order alone is fragile — `.full-bleed-media` creates a new stacking context that can trap the image above the overlay.
- **Directional blur layer.** Insert a `backdrop-filter:blur(50px)` div at `z-index:1` between the image and the gradient overlay. Use a `mask-image` linear-gradient to restrict blur to one side: cover scene uses `linear-gradient(to left, transparent 0%, transparent 20%, black 100%)` (left-heavy blur, right stays sharp); closing scene uses `linear-gradient(to right, transparent 0%, transparent 20%, black 100%)` (right-heavy blur, left stays sharp). Both `-webkit-mask-image` and `mask-image` must be set for cross-browser support.
- **Overlay direction.** Cover scene: use a diagonal gradient fading left-dark to right-transparent, e.g. `linear-gradient(105deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.72) 55%, rgba(5,5,5,0.10) 100%)`. Closing scene: use a bottom-heavy gradient, e.g. `linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.72) 100%)`.
- **All text in fg slot must be white-family.** Headings `#f7f4ee`, body `rgba(247,244,238,0.72)`, captions/eyebrows `rgba(247,244,238,0.50–0.55)`.
- **Page number.** Use `.page-number--light` since the background is always dark.
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

        <!-- [slot: left] — 1+ components; suggested: full-bleed-media, echart-panel, report-text-panel -->
        <div>
        </div>

        <!-- [slot: right] — 1+ components; suggested: report-text-panel, toc, flow-vertical, data-table -->
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

        <!-- [slot: left] — 1+ components; suggested: report-text-panel, toc, flow-vertical, echart-panel -->
        <div>
        </div>

        <!-- [slot: right] — 1+ components; suggested: full-bleed-media, echart-panel, data-table -->
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

Structural intent:
- each slot: 1fr column — any component(s)
- column count: determined by the number of direct child divs in the grid container; `auto-fit` distributes space equally

Every slot accepts 1 or more components. Add or remove child divs to control column count — 3 is the default, but 4 or 5 columns work equally well.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page">
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
- **Column count = number of direct child divs.** `repeat(auto-fit, minmax(0, 1fr))` distributes available width equally across however many children exist. Add a 4th or 5th div to get 4 or 5 columns — no CSS change needed.
- **Equal columns — no hierarchy.** All slots carry the same visual weight. Adjust content density to suit the slide purpose; do not artificially inflate one column to create false hierarchy.
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

        <!-- [slot: right] — 1+ components; suggested: echart-panel, data-table, report-text-panel -->
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

<!-- @component:full-bleed-media:start -->
#### Full Bleed Media

Base hero-field component for any dominant visual area. This is not tied to a specific layout. Use it whenever a layout needs one large visual block that fully occupies its assigned region.

```html
<div class="full-bleed-media" style="height:100%;">
  <img src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1800&auto=format&fit=crop" alt="Mountain meadow and stream under dramatic alpine sky">
</div>
```

```css
.hero-field {
    height: 100%;
    position: relative;
}

.full-bleed-media {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

.full-bleed-media img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
}
```

Rules:
- Use when a layout needs one dominant visual field that fills its region completely.
- The content is often an image, but it may also be another visual component if the layout calls for it.
- Do not inset this component inside a hero field unless the layout explicitly requires inset treatment.

##### Tips
- When used as a background behind an overlay and foreground content, always set `z-index:0` on its parent container. `.full-bleed-media` has `position:relative` and creates a new stacking context — without explicit z-index, the overlay div that follows it in DOM order may still lose the stacking battle in some browsers.
- Pair the parent with `overflow:hidden` to prevent image edges from bleeding outside the intended region.
<!-- @component:full-bleed-media:end -->

<!-- @component:report-text-panel:start -->
#### Report Text Panel

Base narrative component for dense annual-report copy. Use it inside structural layouts that need a compact reading surface with heading, body copy, and footer metadata.

```html
<div class="report-text-panel report-text-panel--dark">
  <div style="max-width:420px;">
    <p class="eyebrow" style="color:rgba(243,238,230,0.72);">Section label / annual review</p>
    <h2 style="margin-top:16px;font-size:60px;line-height:0.92;letter-spacing:-0.03em;text-transform:uppercase;color:#f7f4ee;max-width:360px;">Narrative heading</h2>
    <p style="margin-top:20px;font-size:13px;line-height:1.58;color:rgba(243,238,230,0.84);max-width:390px;">Use one or two compact paragraphs. This component should read like a printed report page, not a presentation summary.</p>
  </div>
  <div class="report-panel-footer" style="color:rgba(243,238,230,0.68);">
    <p class="caption">Summit / Climate Report 2026</p>
    <p class="caption">03</p>
  </div>
</div>
```

```css
.report-text-panel {
    height: 100%;
    padding: 56px 48px 34px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.report-text-panel--dark {
    background: #2c2828;
    color: #f3eee6;
}

.report-text-panel--light {
    background: var(--bg-page-alt);
    color: var(--text-primary);
}

.report-panel-footer {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 18px;
}
```

Rules:
- Use for dense, factual report copy rather than slide-deck bullets.
- Pair with a structurally dominant hero field when the layout needs strong visual contrast.
- Dark and light variants should follow page tone, but the content structure stays the same.

##### Tips
- **`--dark` with background image: three-layer z-index required.** Place the `<img>` absolutely at `z-index:0`, the dark scrim at `z-index:1`, and all text content divs at `z-index:2`. Without explicit z-index, the image may render above the overlay in some stacking contexts.
- **Dark scrim opacity.** Use `rgba(23,18,14, 0.78→0.70)` for the gradient direction (top darker, bottom slightly lighter) or a flat `rgba(14,12,10,0.75)` for uniform depth. Avoid going below 0.65 — text legibility degrades on busy photography.
- **`--dark` text is already white-family in the built-in CSS.** Do not add inline color overrides to individual text nodes unless you are modifying the base variant — it creates maintenance debt.
- **`--light` on dark-background slides.** If a light panel sits on a slide with a dark background overlay, ensure the panel has an explicit background (e.g., `var(--bg-page)`) and is above the overlay in z-index.
<!-- @component:report-text-panel:end -->

<!-- @component:editorial-image-top:start -->
#### Editorial Image Top

Image-first editorial module: image on top, text below. Best for highlight grids, product/material stories, and any module where the picture should lead before the reader enters the copy.

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
    <p>Choose this component when the visual should establish texture, materiality, or field context before the audience reads the narrative.</p>
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
- When used inside multi-column layouts, keep this component's copy shorter than the primary reading column unless the page hierarchy explicitly promotes it.

##### Tips
- **Do not set a fixed height on this component when used inside `three-highlights`.** Let the parent grid's `align-items:stretch` control the column height. Fixed heights fight against the stretch and create misaligned baselines.
- **Image aspect ratio.** Aim for 16:9 or 3:2 crops for the image block. Portrait crops create tall image zones that push text down and unbalance the composition.
- **Kicker icon size.** Keep Lucide SVG icons at 16–20px. Larger icons shift visual weight from the image to the label zone.
<!-- @component:editorial-image-top:end -->

<!-- @component:editorial-text-top:start -->
#### Editorial Text Top

Text-first editorial module: text on top, image below. Best for narrative snippets, report-style explanations, or blocks where the image serves as evidence rather than the primary hook.

```html
<div class="editorial-text-top">
  <div class="editorial-module-body">
    <div class="module-kicker-row">
      <i data-lucide="gauge" class="module-icon"></i>
      <p class="caption">Mountain operations</p>
    </div>
    <h3>Lead with the argument, then let the image confirm it.</h3>
    <p>Use this component when the audience should understand the point first and only then read the image as supporting evidence or context.</p>
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
- Keep the lower image block quieter than a hero image; it is supporting evidence, not the whole slide's focal point.
- Icon is optional. Prefer it only when it helps distinguish categories across repeated modules.
- In multi-column layouts, this component can carry more reading weight than neighboring support modules when the page hierarchy needs a denser narrative block.

##### Tips
- **Same height/stretch rule as `editorial-image-top`.** Do not set fixed heights; let parent grid stretch control the column.
- **When used as the center spine in `three-highlights`,** this is the one component that may legitimately be taller than its neighbors. That density imbalance is intentional — do not try to equalize it with padding or extra content in the outer columns.
<!-- @component:editorial-text-top:end -->

<!-- @component:editorial-text-left:start -->
#### Editorial Text Left

Horizontal editorial module: text on the left, image on the right. Extends the `editorial-image-top` / `editorial-text-top` family into the horizontal axis. Best for bottom-row cards inside `brief-grid`, compact feature rows, and any slot where the layout supplies a wider-than-tall frame that suits a side-by-side composition.

```html
<div class="editorial-text-left">
  <div class="editorial-module-body">
    <div class="module-kicker-row">
      <i data-lucide="zap" class="module-icon"></i>
      <p class="caption">Category label</p>
    </div>
    <h3 style="margin-top:10px;font-size:18px;line-height:1.08;">Card heading text</h3>
    <p style="font-size:13px;line-height:1.5;margin-top:8px;color:var(--text-secondary);">Supporting description. One or two sentences that position this card within the broader page argument. Keep it concise — this component is a support module, not the primary narrative.</p>
  </div>
  <div class="media-frame editorial-media editorial-text-left-media">
    <img src="https://images.unsplash.com/photo-1519904981063-b0cf448d479e?q=80&w=800&auto=format&fit=crop" alt="Supporting visual">
  </div>
</div>
```

```css
.editorial-text-left {
    display: flex;
    flex-direction: row;
    gap: 0;
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
}

.editorial-text-left .editorial-module-body {
    flex: 1.1;
    min-width: 0;
    padding: 24px 20px 20px 24px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}

.editorial-text-left-media {
    flex: 1;
    min-width: 0;
    height: auto;
    align-self: stretch;
}
```

Rules:
- Use when the slot is wider than it is tall and a side-by-side reading order is natural.
- The text zone (left) should hold the argument; the image (right) should confirm or contextualise it.
- Icon is optional. Use it only to distinguish categories across a set of parallel cards.
- When the card carries a large statistic or callout number, place it between the heading and the description paragraph using an inline style (`font-size: 48px; font-family: IBM Plex Sans Condensed; font-weight: 700; color: var(--accent-gold); line-height: 1;`). This keeps the number inside the reading flow without requiring a separate component.

##### Tips
- **Fixed 4:3 aspect ratio.** `.editorial-text-left` uses `width: 100%; aspect-ratio: 4/3`. Height is derived automatically from width — no parent height constraint required.
- **Text-to-image flex ratio.** Default is `1.1 : 1` (text slightly wider). For cards with more copy, try `1.3 : 1`. For cards that need a more dramatic image, try `1 : 1` or even `0.9 : 1`. Do not go below `0.8` — the text will start to feel compressed.
- **Large inline statistic.** When adding a big callout number (e.g., `75%`), give it `margin: 12px 0 4px` and keep the label below it in a `<p class="caption">` tag. This naturally reads as: heading → number → label → description — a clear visual hierarchy without a bespoke component.
- **Media frame background.** `.media-frame` already has `background: var(--bg-page-alt)` as a fallback. If the image has transparent padding or loads slowly, the fallback color will match the card tone.
- **Vertical alignment.** `justify-content: flex-start` is intentional — keep heading and text anchored to the top. Centering them vertically creates floating copy that looks disconnected from the image edge.
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
- Combine with `report-text-panel` or `echart-panel` on the opposing side of a layout when needed.

##### Tips
- **`.last` class on final item is mandatory.** Without it, the connecting line extends past the last item and exits the component boundary. Always add `.last` to the final `div.flow-item`.
- **Dark background with background image.** When the column containing `flow-vertical` has a background image, use the same three-layer z-index pattern: background `z-index:0`, dark scrim `z-index:1`, component content `z-index:2`. Set the parent column to `position:relative;overflow:hidden`.
- **Dark text overrides (same as flow-horizontal).** Flow-number border `rgba(247,244,238,0.3)`, color `rgba(247,244,238,0.6)`; h4 `#f7f4ee`; p `rgba(247,244,238,0.7)`. Also override the connecting line color: `background:rgba(247,244,238,0.2)`.
- **Column height constraint.** `flow-vertical` expands naturally with content. In a two-column layout, ensure the opposing column (report-text-panel or echart-panel) has enough content to avoid a large height mismatch.
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



<!-- @component:cover-title-stack:start -->
#### Cover Title Stack

Full-height foreground text layer for the cover layout. Sits above the hero image and its directional gradient overlay as `z-index:2`. The gradient runs from left-dark to right-transparent (diagonal `105deg`), creating a charcoal reading field on the left that dissolves naturally into the image without forming a boxed card.

```html
<div class="cover-title-stack">
  <div class="cover-brand-label reveal">
    <span class="chevron-divider" style="color:rgba(247,244,238,0.55);">Organisation Name</span>
  </div>
  <div class="cover-body">
    <p class="cover-eyebrow reveal">Report Title · Year</p>
    <h1 class="reveal">Opening<br>Statement<br>Here.</h1>
    <p class="cover-subtitle reveal">One or two lines of supporting copy. Keep it short — the image does the visual work.</p>
  </div>
  <div class="cover-footer">
    <p class="caption reveal" style="color:rgba(247,244,238,0.5);">website or location</p>
    <p class="caption reveal" style="color:rgba(247,244,238,0.5);">Organisation · Year</p>
  </div>
</div>
```

```css
.cover-title-stack {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 84px;
    color: #f7f4ee;
}

.cover-body {
    max-width: 680px;
}

.cover-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(247, 244, 238, 0.55);
    margin-bottom: 20px;
}

.cover-title-stack h1 {
    color: #f7f4ee;
    font-size: 96px;
    line-height: 0.92;
    letter-spacing: -0.03em;
    text-transform: uppercase;
}

.cover-subtitle {
    margin-top: 28px;
    font-size: 15px;
    line-height: 1.56;
    color: rgba(247, 244, 238, 0.72);
    max-width: 460px;
}

.cover-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
}
```

Rules:
- Always place at `z-index:3` above the image (`z-index:0`), blur layer (`z-index:1`), and gradient overlay (`z-index:2`).
- The gradient overlay on the parent is what creates the reading field — do not add a background to `.cover-title-stack` itself.
- Use `chevron-divider` for the brand label, not a plain eyebrow. It is the primary editorial accent at the top of the cover.
- Keep `.cover-body` width under `700px` so the right half of the image remains visible through the gradient.
- Footer captions should use `rgba(247,244,238,0.5)` — quieter than body copy.

##### Tips
- **h1 size range.** Scale between `88px` and `120px` depending on title length. Three short lines at `96px` is the default. Longer titles should reduce to `80–88px` to prevent overflow.
- **Gradient direction.** The parent overlay uses `linear-gradient(105deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.72) 55%, rgba(5,5,5,0.10) 100%)`. Adjust the degree if the hero image has strong content on the left edge — a shallower angle (around `90deg`) protects more of the left zone.
- **Dark overlay opacity.** The left stop (`0.95`) must stay high — the title needs a near-opaque dark backing on all hero imagery. The mid stop (`0.72`) keeps body text legible. Only the right tail (`0.10`) fades to near-transparent so the image breathes on the right side.
- **Directional blur.** Add a `backdrop-filter:blur(50px)` layer at `z-index:1` with `mask-image:linear-gradient(to left, transparent 0%, transparent 20%, black 100%)`. This concentrates blur on the left (text) side and keeps the right side of the image sharp. Always set both `-webkit-mask-image` and `mask-image`.
<!-- @component:cover-title-stack:end -->

<!-- @component:closing-title-stack:start -->
#### Closing Title Stack

Full-height foreground text layer for the closing layout. Mirrors `cover-title-stack` in structure but reverses the gradient direction — the overlay fades from top-transparent to bottom-dark (180deg), so the sign-off text at the bottom has the strongest backing while the image breathes through at the top.

```html
<div class="closing-title-stack">
  <div class="closing-brand-label reveal">
    <span class="chevron-divider" style="color:rgba(247,244,238,0.6);">Organisation Name</span>
  </div>
  <div class="closing-body">
    <h1 class="reveal">The work continues<br>beyond the page.</h1>
    <p class="closing-subtitle reveal">One short supporting sentence. Keep it restrained — the closing is atmospheric, not informational.</p>
  </div>
  <div class="closing-footer">
    <p class="caption reveal" style="color:rgba(247,244,238,0.62);">website or location</p>
    <p class="caption reveal" style="color:rgba(247,244,238,0.62);">Report Title · Organisation</p>
  </div>
</div>
```

```css
.closing-title-stack {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 84px;
    color: #f7f4ee;
    text-align: right;
}

.closing-body {
    max-width: 860px;
    margin-left: auto;
}

.closing-title-stack h1 {
    color: #f7f4ee;
    font-size: 100px;
    line-height: 0.9;
    letter-spacing: -0.03em;
    text-transform: uppercase;
}

.closing-subtitle {
    margin-top: 24px;
    font-size: 16px;
    line-height: 1.56;
    color: rgba(247, 244, 238, 0.78);
    max-width: 520px;
}

.closing-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
}
```

Rules:
- Always place at `z-index:3` above the hero image (`z-index:0`), blur layer (`z-index:1`), and overlay (`z-index:2`).
- The closing overlay gradient runs `180deg` (top → bottom), opposite to the cover overlay. This is not a mistake — the bottom-heavy dark zone ensures the text sits in the densest part of the gradient.
- **Text is right-aligned** (`text-align:right`). `.closing-body` uses `margin-left:auto` so the content block itself anchors to the right side. This mirrors cover's left anchor and creates bookend symmetry.
- Keep content minimal. One headline, one short paragraph, two footer captions. Do not add data, bullet points, or section labels.
- `.closing-body` can extend to `max-width:960px` for very short single-line titles.

##### Tips
- **h1 size range.** Scale between `88px` and `120px`. Closing titles are often short declarative sentences; `100px` is a good default for 3–7 words.
- **Gradient direction is bottom-heavy by design.** Cover fades left-to-right; closing fades top-to-bottom. This creates visual symmetry between the two bookend slides: the text always sits in the densest dark zone of its respective overlay.
- **Overlay opacity.** Use `linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.72) 100%)`. The top stop is `0.30` so the image is still visible at the top; the bottom stop `0.72` gives the right-aligned text and footer a strong dark backing. Do not drop the bottom stop below `0.60`.
- **Directional blur.** Add a `backdrop-filter:blur(50px)` layer at `z-index:1` with `mask-image:linear-gradient(to right, transparent 0%, transparent 20%, black 100%)`. This concentrates blur on the right (text) side and keeps the left side of the image sharp — the mirror of the cover blur. Always set both `-webkit-mask-image` and `mask-image`.
<!-- @component:closing-title-stack:end -->

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

<!-- @design:components:end -->
