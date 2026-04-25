---
name: starter
description: Neutral structural base design for AI-authored Revela themes
author: cyber-dash
version: 1.0.0
internal: true
preview:
---

## Visual Style — Starter Theme

Starter is the neutral structural base for generating new Revela designs. It should be treated as a stable layout/component system, not as a strong visual identity. When deriving a new design, preserve the structure and replace the visual language.

<!-- @design:foundation:start -->

### Color Palette

```css
:root {
    --bg-frame: #111315;
    --bg-page: #f6f7f8;
    --bg-page-alt: #eceff2;
    --surface: #ffffff;
    --surface-strong: #dfe5eb;
    --text-primary: #17191c;
    --text-secondary: #4f5965;
    --text-muted: #7a8490;
    --line: rgba(23, 25, 28, 0.12);
    --line-strong: rgba(23, 25, 28, 0.26);
    --accent-primary: #3b82f6;
    --accent-secondary: #64748b;
    --accent-soft: #dbeafe;
    --accent-danger: #dc2626;
    --shadow-soft: rgba(15, 23, 42, 0.16);
    --font-display: 'Inter', ui-sans-serif, sans-serif;
    --font-body: 'Inter', ui-sans-serif, sans-serif;
    --font-size-body: 17px;
    --font-size-meta: 12px;
    --font-size-body-strong: 20px;
}
```

Accent usage guidance:
- `--accent-primary` — primary emphasis, active states, key data callouts
- `--accent-secondary` — secondary emphasis, muted graphics, structural marks
- `--accent-soft` — pale accent fills, subtle backgrounds, low-contrast highlights
- `--accent-danger` — negative indicators and warnings only

### Typography

- **Display / heading font**: `Inter` — neutral sans-serif base for all headings and display text
- **Body font**: `Inter` — neutral sans-serif base for copy, captions, labels, and UI text
- Font link tag:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ```
- cover h1: `88px` to `116px`, weight `700` to `800`, line-height `0.92` to `1.0`
- inner-layout h2: `34px` to `56px`, weight `650` to `800`, line-height `1.02` to `1.12`
- inner-layout h3: `22px` to `28px`, weight `650` to `750`, line-height `1.12` to `1.2`
- Body: `17px`, line-height `1.55` to `1.65`
- Eyebrow / caption / metadata: `12px`, uppercase optional, letter-spacing `0.08em` to `0.16em`
- Stat number: `72px` to `92px`, weight `700` to `800`, line-height `0.92`

All sizes are fixed `px` for the 1920x1080 canvas. JS `transform: scale()` handles viewport adaptation. Never use `clamp()` or viewport-relative units for internal slide layout.

### Visual Schema Rules

Before generating a derived design, extract a visual schema from references:
- `reference type`: flat vector, photography, UI screenshot, webpage, editorial deck, mascot, geometric motif, etc.
- `composition`: full-bleed, bottom strip, side rail, centered emblem, dense grid, sparse field, etc.
- `scale`: how much canvas height/width the motif occupies
- `anchoring`: bottom, corner, side, centered, background, inline component
- `typography relationship`: dominant type, supporting type, or motif-led composition
- `decorative language`: rules, dots, doodles, grids, cards, image treatments, etc.
- `must preserve`: composition and scale traits that define the reference
- `must avoid`: visual drift such as enlarging a small motif into a full-slide background

Preserve composition, not only color and shape.

### SVG Motif Rules

For flat vector, doodle, mascot, blob, line-art, or geometric references, prefer the `svg-motif` component. Use a fixed `viewBox`; place the SVG with CSS; keep facial features, doodles, and geometric details inside the SVG coordinate system. Do not build complex illustration details from scattered CSS absolute-positioned divs.

For photography, UI screenshots, webpages, and product surfaces, do not convert the reference to SVG. Extract palette, type scale, spacing, layout rhythm, borders, image treatment, and surface behavior instead.

### Page Framing

- The browser viewport is a neutral dark frame.
- The slide page is a light neutral surface.
- Default canvas padding is compact: `10px`, so preview and generated decks have a large usable page.
- Use page edge, rules, cards, panels, and quiet geometry as neutral structure. Avoid built-in industry-specific imagery.

### Grid System

- **1920x1080 fixed canvas** with one `.slide-canvas` per slide.
- All slides contain one `.page` unless a layout explicitly defines otherwise.
- Dense content should use clear slots, grid tracks, and reusable components.
- Layouts define structure only. They should not encode a topic, industry, or aesthetic identity.

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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script> only if charts are needed -->
    <style>/* all CSS here */</style>
</head>
<body>
    <section class="slide" slide-qa="false" data-index="0">
        <div class="slide-canvas"><div class="page">...</div></div>
    </section>
    <script>/* all JS here */</script>
</body>
</html>
```

### Core CSS

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-snap-type: y mandatory; overflow-y: scroll; height: 100%; }
body { background: var(--bg-frame); color: var(--text-primary); font-family: var(--font-body); -webkit-font-smoothing: antialiased; height: 100%; }
.slide { min-height: 100dvh; scroll-snap-align: start; display: flex; align-items: center; justify-content: center; overflow: hidden; background: var(--bg-frame); }
.slide-canvas { width: 1920px; height: 1080px; flex-shrink: 0; transform-origin: center center; position: relative; overflow: hidden; padding: 10px; }
.page { position: relative; width: 100%; height: 100%; background: var(--bg-page); color: var(--text-primary); padding: 56px 64px 64px; box-shadow: 0 24px 80px var(--shadow-soft); display: flex; flex-direction: column; overflow: hidden; }
.page.alt { background: var(--bg-page-alt); }
.eyebrow, .caption, .meta-label { font-size: var(--font-size-meta); line-height: 1.4; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
h1, h2, h3, h4 { font-family: var(--font-display); font-weight: 750; letter-spacing: -0.035em; color: var(--text-primary); }
h1 { font-size: 96px; line-height: 0.94; }
h2 { font-size: 46px; line-height: 1.04; }
h3 { font-size: 26px; line-height: 1.14; }
p, li { font-size: var(--font-size-body); line-height: 1.6; color: var(--text-secondary); }
.rule { width: 100%; height: 1px; background: var(--line); }
.rule.strong { background: var(--line-strong); }
.media-frame { position: relative; overflow: hidden; background: var(--surface-strong); }
.media-frame img { width: 100%; height: 100%; display: block; object-fit: cover; }
.media-caption { margin-top: 12px; font-size: var(--font-size-meta); line-height: 1.5; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.editorial-list { list-style: none; display: flex; flex-direction: column; gap: 14px; }
.editorial-list li { position: relative; padding-left: 20px; font-size: var(--font-size-body); line-height: 1.58; color: var(--text-secondary); }
.editorial-list li::before { content: ''; position: absolute; left: 0; top: 8px; width: 6px; height: 6px; background: var(--accent-primary); }
.reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1); }
.reveal.visible { opacity: 1; transform: translateY(0); }
```

### SlidePresentation Class (Complete JavaScript)

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
            const scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
            canvases.forEach((canvas) => { canvas.style.transform = `scale(${scale})`; });
        };
        window.addEventListener('resize', update);
        update();
    }
    setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) entry.target.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
            });
        }, { threshold: 0.2 });
        this.slides.forEach((slide) => observer.observe(slide));
    }
    setupKeyboardNav() {
        document.addEventListener('keydown', (event) => {
            if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(event.key)) { event.preventDefault(); this.goTo(this.currentSlide + 1); }
            else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); this.goTo(this.currentSlide - 1); }
        });
    }
    setupTouchNav() {
        let startY = 0;
        document.addEventListener('touchstart', (event) => { startY = event.touches[0].clientY; }, { passive: true });
        document.addEventListener('touchend', (event) => {
            const deltaY = startY - event.changedTouches[0].clientY;
            if (Math.abs(deltaY) > 40) this.goTo(this.currentSlide + (deltaY > 0 ? 1 : -1));
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

- **Structure first.** Use layouts and slots before adding decoration.
- **Visual schema first.** Derived designs must identify reference type, composition, scale, anchoring, typography relationship, decorative language, must-preserve, and must-avoid before writing CSS.
- **Preserve composition.** A bottom strip stays bottom anchored; a small corner motif stays small; a sparse reference stays sparse.
- **Stable layout CSS.** Do not rewrite base layout/container CSS unless the structure itself must change. Prefer tokens, typography, component skins, and small motif components.
- **Reusable class vocabulary.** New classes must be documented in this DESIGN.md. Avoid many one-off selectors in generated decks.
- **SVG for vector motifs.** Use `svg-motif` for flat vector, doodle, mascot, blob, line-art, and geometric references.
- **Images for photographic references.** Use image treatment rules rather than fake SVG when the reference is photographic, UI, webpage, or product imagery.
- **Preview must be real.** A design preview should show actual layout/component behavior, not empty placeholder boxes only.

### Common Mistakes

- Copying a reference's colors while losing its composition and scale.
- Enlarging small decorative marks into full-slide backgrounds.
- Rebuilding characters with many absolutely positioned CSS divs instead of a single SVG component.
- Inventing slide-specific classes that are not documented in the design vocabulary.
- Mixing too many layout ideas on one slide instead of using a clear slot structure.

<!-- @design:rules:end -->

<!-- @design:layouts:start -->

### Layout Types

Each `<section class="slide">` must set `slide-qa="true"` or `slide-qa="false"`. Use the QA flag on each layout marker.

<!-- @layout:fullbleed:start qa=false -->
#### Fullbleed

Full-page layout for a single dominant component such as `image-title`, a large `svg-motif`, or a sparse title field.

```html
<section class="slide" slide-qa="false" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <!-- [slot: content] — usually image-title, svg-motif, or a custom hero component -->
    </div>
  </div>
</section>
```
<!-- @layout:fullbleed:end -->

<!-- @layout:narrative:start qa=true -->
#### Narrative

Asymmetric two-column layout. Use when one side needs more visual or reading weight.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <div class="narrative-grid">
        <div><!-- [slot: left] — 1+ components --></div>
        <div><!-- [slot: right] — 1+ components --></div>
      </div>
    </div>
  </div>
</section>
```

```css
.narrative-grid { display: grid; grid-template-columns: minmax(0, 1.618fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: 100%; overflow: hidden; align-items: stretch; }
.narrative-grid--reverse { grid-template-columns: minmax(0, 1fr) minmax(0, 1.618fr); }
.narrative-grid > * { overflow: hidden; min-height: 0; min-width: 0; }
```
<!-- @layout:narrative:end -->

<!-- @layout:narrative-reverse:start qa=true -->
#### Narrative Reverse

Mirrored asymmetric two-column layout. Same structure as `narrative`, with the wider column on the right.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <div class="narrative-grid narrative-grid--reverse">
        <div><!-- [slot: left] — 1+ components --></div>
        <div><!-- [slot: right] — 1+ components --></div>
      </div>
    </div>
  </div>
</section>
```
<!-- @layout:narrative-reverse:end -->

<!-- @layout:highlight-cols:start qa=true -->
#### Highlight Cols

Equal-column layout for parallel ideas, feature groups, proof points, or compact component showcases.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page">
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;max-width:620px;">
        <p class="eyebrow">Section Label</p>
        <h2>Parallel columns title</h2>
      </div>
      <div class="highlight-cols-grid" style="flex:1;min-height:0;">
        <div><!-- [slot: 1] --></div>
        <div><!-- [slot: 2] --></div>
        <div><!-- [slot: 3] --></div>
      </div>
    </div>
  </div>
</section>
```

```css
.highlight-cols-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 32px; overflow: hidden; align-items: stretch; }
.highlight-cols-grid > * { overflow: hidden; min-height: 0; }
```
<!-- @layout:highlight-cols:end -->

<!-- @layout:halves:start qa=true -->
#### Halves

Symmetric two-column layout for direct comparison, paired evidence, or split workflows.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <div class="halves-grid">
        <div><!-- [slot: left] --></div>
        <div><!-- [slot: right] --></div>
      </div>
    </div>
  </div>
</section>
```

```css
.halves-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); height: 100%; overflow: hidden; align-items: stretch; }
.halves-grid > * { overflow: hidden; min-height: 0; min-width: 0; }
```
<!-- @layout:halves:end -->

<!-- @layout:stacked:start qa=true -->
#### Stacked

Two-row layout for a compact header/summary above a larger evidence, chart, or flow area.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <div class="stacked-grid">
        <div class="stacked-top"><!-- [slot: top] --></div>
        <div class="stacked-bottom"><!-- [slot: bottom] --></div>
      </div>
    </div>
  </div>
</section>
```

```css
.stacked-grid { display: grid; grid-template-rows: minmax(0, 1fr) minmax(0, 1.618fr); height: 100%; width: 100%; overflow: hidden; }
.stacked-top, .stacked-bottom { overflow: hidden; min-height: 0; }
```
<!-- @layout:stacked:end -->

<!-- @design:layouts:end -->

<!-- @design:components:start -->

### Components

Components are reusable primitives. Derived designs should preserve coverage and skin them through variables, typography, surfaces, and small motif components.

<!-- @component:text-panel:start -->
#### Text Panel (.text-panel)

Reusable text container for headings, body copy, lists, and footer metadata.

```html
<div class="text-panel text-panel--light">
  <div class="text-panel-body">
    <p class="eyebrow">Context</p>
    <h2>Panel heading</h2>
    <ul class="editorial-list"><li><strong>Signal.</strong> Supporting copy.</li></ul>
  </div>
  <div class="text-panel-footer"><span class="caption">Source</span><span class="caption">01</span></div>
</div>
```

```css
.text-panel { height: 100%; padding: 56px 48px 34px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; }
.text-panel--light { background: var(--bg-page-alt); color: var(--text-primary); }
.text-panel--dark { background: #1f242b; color: #f8fafc; --text-primary: #f8fafc; --text-secondary: #cbd5e1; --text-muted: #94a3b8; --line: rgba(248,250,252,0.16); }
.text-panel-body { display: flex; flex-direction: column; gap: 14px; }
.text-panel-footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; }
```
<!-- @component:text-panel:end -->

<!-- @component:stat-card:start -->
#### Stat Card (.stat-card)

Compact data statement with large numeric value, label, and explanatory copy.

```html
<div class="stat-card">
  <p class="eyebrow">Metric</p>
  <div class="stat-card-value">72%</div>
  <h3>Short implication</h3>
  <p>One or two lines explaining the signal.</p>
</div>
```

```css
.stat-card { height: 100%; display: flex; min-height: 0; flex-direction: column; justify-content: flex-start; gap: 16px; padding-top: 8px; }
.stat-card--horizontal { flex-direction: row; align-items: flex-start; gap: 30px; }
.stat-card-value { font-family: var(--font-display); font-size: 88px; line-height: 0.9; letter-spacing: -0.05em; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--accent-primary); }
```
<!-- @component:stat-card:end -->

<!-- @component:editorial-image-top:start -->
#### Editorial Image Top (.editorial-image-top)

Media-over-copy module. Use for examples, visual proof, screenshots, or neutral placeholders.

```html
<div class="editorial-image-top">
  <div class="media-frame editorial-media"><img src="..." alt=""></div>
  <div class="editorial-module-body"><p class="eyebrow">Label</p><h3>Module heading</h3><p>Short supporting text.</p></div>
</div>
```

```css
.editorial-image-top { display: flex; flex-direction: column; gap: 16px; height: 100%; }
.editorial-image-top .editorial-media { height: 240px; border: 1px solid var(--line); }
.editorial-module-body { display: flex; flex-direction: column; gap: 12px; }
```
<!-- @component:editorial-image-top:end -->

<!-- @component:editorial-text-top:start -->
#### Editorial Text Top (.editorial-text-top)

Text-over-media module for explanation first, visual second.

```html
<div class="editorial-text-top">
  <div class="editorial-module-body"><p class="eyebrow">Label</p><h3>Module heading</h3><p>Short supporting text.</p></div>
  <div class="media-frame editorial-media"></div>
</div>
```

```css
.editorial-text-top { display: flex; flex-direction: column; gap: 16px; height: 100%; }
.editorial-text-top .editorial-media { flex: 1; min-height: 180px; border: 1px solid var(--line); }
```
<!-- @component:editorial-text-top:end -->

<!-- @component:editorial-text-left:start -->
#### Editorial Text Left (.editorial-text-left)

Horizontal text-and-visual module for compact evidence or feature explanation.

```html
<div class="editorial-text-left">
  <div class="editorial-text-left-header"><p class="eyebrow">Label</p><h3>Module heading</h3></div>
  <div class="editorial-text-left-content">
    <div class="editorial-text-left-copy"><p>Short copy.</p></div>
    <div class="editorial-text-left-visual"><div class="media-frame"></div></div>
  </div>
</div>
```

```css
.editorial-text-left { display: flex; flex-direction: column; gap: 0; height: 100%; overflow: hidden; border: 1px solid var(--line); }
.editorial-text-left-header { flex-shrink: 0; padding: 24px 26px 16px; border-bottom: 1px solid var(--line); }
.editorial-text-left-content { display: flex; flex: 1; min-height: 0; }
.editorial-text-left-copy { flex: 1.1; min-width: 0; padding: 20px 24px; display: flex; flex-direction: column; justify-content: flex-start; }
.editorial-text-left-visual { flex: 1; min-width: 0; min-height: 0; align-self: stretch; overflow: hidden; position: relative; background: var(--surface-strong); }
```
<!-- @component:editorial-text-left:end -->

<!-- @component:echart-panel:start -->
#### EChart Panel (.echart-panel)

Chart container with header, chart area, and caption.

```html
<div class="echart-panel">
  <div class="echart-panel-header"><p class="eyebrow">Chart</p><h3>Chart heading</h3><p class="chart-subtitle">Subtitle</p></div>
  <div class="echart-container" id="chart-id"></div>
  <p class="chart-caption">Source: dataset</p>
</div>
```

```css
.echart-panel { display: flex; flex-direction: column; height: 100%; gap: 0; }
.echart-panel-header { flex-shrink: 0; padding-bottom: 16px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.chart-subtitle { margin-top: 4px; font-size: 13px; color: var(--text-muted); line-height: 1.4; }
.echart-container { flex: 1; min-height: 0; }
.chart-caption { flex-shrink: 0; margin-top: 12px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
```
<!-- @component:echart-panel:end -->

<!-- @component:flow-horizontal:start -->
#### Flow Horizontal (.flow-horizontal)

Horizontal process with numbered markers.

```html
<div class="flow-horizontal">
  <div class="flow-item"><div class="flow-number" data-n="01"></div><div class="flow-body"><h4>Step</h4><p>Short text.</p></div></div>
</div>
```

```css
.flow-number { position: relative; width: 36px; height: 36px; flex-shrink: 0; border: 1px solid var(--line-strong); background: var(--surface); display: flex; align-items: center; justify-content: center; }
.flow-number::after { content: attr(data-n); font-size: 12px; font-weight: 800; color: var(--accent-primary); }
.flow-body h4 { font-size: 20px; font-weight: 700; line-height: 1.14; }
.flow-body p { margin-top: 8px; font-size: 17px; line-height: 1.6; color: var(--text-secondary); }
.flow-horizontal { position: relative; display: flex; align-items: flex-start; width: 100%; }
.flow-horizontal::before { content: ''; position: absolute; top: 17px; left: 0; right: 0; height: 1px; background: var(--line-strong); z-index: 0; }
.flow-horizontal .flow-item { flex: 1; display: flex; flex-direction: column; gap: 18px; padding-right: 40px; }
.flow-horizontal .flow-number { position: relative; z-index: 1; }
```
<!-- @component:flow-horizontal:end -->

<!-- @component:flow-vertical:start -->
#### Flow Vertical (.flow-vertical)

Vertical process for side panels and narrow slots.

```html
<div class="flow-vertical">
  <div class="flow-item"><div class="flow-marker"><div class="flow-number" data-n="01"></div><div class="flow-line"></div></div><div class="flow-body"><h4>Step</h4><p>Short text.</p></div></div>
</div>
```

```css
.flow-vertical { display: flex; flex-direction: column; width: 100%; }
.flow-vertical .flow-item { display: flex; gap: 28px; align-items: flex-start; }
.flow-vertical .flow-marker { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.flow-vertical .flow-line { width: 1px; flex: 1; min-height: 28px; background: var(--line-strong); margin: 6px 0; }
.flow-vertical .flow-body { padding-bottom: 32px; }
.flow-vertical .flow-item.last .flow-body { padding-bottom: 0; }
```
<!-- @component:flow-vertical:end -->

<!-- @component:data-table:start -->
#### Data Table (.data-table)

Dense tabular data with optional highlights and deltas.

```html
<div class="data-table-wrap">
  <div class="data-table-label">Dataset</div>
  <table class="data-table"><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody><tr><td>Example</td><td>42</td></tr></tbody></table>
  <p class="table-caption">Source note</p>
</div>
```

```css
.data-table-wrap { width: 100%; }
.data-table-label { font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
.data-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: 17px; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.data-table thead tr { border-bottom: 1.5px solid var(--line-strong); }
.data-table th { padding: 0 12px 10px 0; text-align: left; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; }
.data-table th:not(:first-child), .data-table td:not(:first-child) { text-align: right; }
.data-table tbody tr { border-bottom: 1px solid var(--line); }
.data-table td { padding: 9px 12px 9px 0; line-height: 1.4; color: var(--text-secondary); }
.data-table .delta.positive { color: var(--accent-primary); }
.data-table .delta.negative { color: var(--accent-danger); }
.table-caption { margin-top: 12px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
```
<!-- @component:data-table:end -->

<!-- @component:image-title:start -->
#### Image Title (.image-title)

Hero title component for image, surface, or abstract visual backgrounds.

```html
<div class="image-title image-title--left">
  <div class="image-title-media"></div>
  <div class="image-title-overlay"></div>
  <div class="image-title-fg"><div class="image-title-body"><p class="image-title-eyebrow">Label</p><h1>Title</h1><p class="image-title-subtitle">Subtitle</p></div></div>
</div>
```

```css
.image-title { position: relative; width: 100%; height: 100%; overflow: hidden; color: #f8fafc; background: #1f242b; }
.image-title-media { position: absolute; inset: 0; z-index: 0; background: linear-gradient(135deg, #1f2937, #475569); }
.image-title-overlay { position: absolute; inset: 0; z-index: 1; background: linear-gradient(90deg, rgba(15,23,42,0.78), rgba(15,23,42,0.18)); }
.image-title-fg { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 72px 84px; }
.image-title--left .image-title-body { max-width: 760px; }
.image-title--right .image-title-fg { text-align: right; }
.image-title--right .image-title-body { max-width: 860px; margin-left: auto; }
.image-title-eyebrow { font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(248,250,252,0.62); margin-bottom: 20px; }
.image-title h1 { color: #f8fafc; font-size: 104px; line-height: 0.92; letter-spacing: -0.055em; }
.image-title-subtitle { margin-top: 24px; font-size: 18px; line-height: 1.56; color: rgba(248,250,252,0.78); max-width: 520px; }
```
<!-- @component:image-title:end -->

<!-- @component:toc:start -->
#### TOC (.toc-panel)

Table of contents or section index.

```html
<div class="toc-panel"><div class="toc-panel-inner"><div class="toc-header"><p class="eyebrow">Contents</p><h2>Agenda</h2></div><div class="toc-list"><div class="toc-item"><span>01</span><strong>Section title</strong><em>03</em></div></div></div></div>
```

```css
.toc-panel { height: 100%; padding: 54px 52px 42px; display: flex; overflow: hidden; background: var(--bg-page); }
.toc-panel-inner { display: flex; flex-direction: column; justify-content: space-between; width: 100%; gap: 32px; }
.toc-header { max-width: 620px; display: flex; flex-direction: column; gap: 18px; }
.toc-list { display: flex; flex-direction: column; border-top: 1px solid var(--line-strong); }
.toc-item { display: grid; grid-template-columns: 70px 1fr 60px; gap: 24px; align-items: baseline; padding: 22px 0; border-bottom: 1px solid var(--line); }
.toc-item span, .toc-item em { font-style: normal; color: var(--text-muted); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; }
.toc-item strong { font-size: 28px; line-height: 1.08; color: var(--text-primary); }
```
<!-- @component:toc:end -->

<!-- @component:quote:start -->
#### Quote (.quote-block)

Large quotation or summary statement.

```html
<div class="quote-block"><p class="quote-mark">“</p><blockquote>Statement text goes here.</blockquote><p class="quote-source">Source</p></div>
```

```css
.quote-block { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 24px; max-width: 980px; }
.quote-mark { font-size: 96px; line-height: 0.7; color: var(--accent-primary); }
.quote-block blockquote { font-family: var(--font-display); font-size: 54px; line-height: 1.06; letter-spacing: -0.04em; color: var(--text-primary); }
.quote-source { font-size: 13px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--text-muted); }
```
<!-- @component:quote:end -->

<!-- @component:brand-watermark:start -->
#### Brand Watermark (.brand-watermark)

Small neutral identity mark for preview and closing slides.

```html
<div class="brand-watermark"><span></span><strong>Brand</strong></div>
```

```css
.brand-watermark { display: inline-flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
.brand-watermark span { width: 18px; height: 18px; border: 2px solid var(--accent-primary); display: block; }
.brand-watermark strong { font-weight: 800; color: var(--text-secondary); }
```
<!-- @component:brand-watermark:end -->

<!-- @component:page-number:start -->
#### Page Number (.page-number)

Small page number utility.

```html
<div class="page-number">04</div>
```

```css
.page-number { position: absolute; right: 34px; bottom: 26px; z-index: 10; font-size: 12px; letter-spacing: 0.14em; color: var(--text-muted); }
.page-number--light { color: rgba(248,250,252,0.72); }
```
<!-- @component:page-number:end -->

<!-- @component:timeline-journey-horizontal:start -->
#### Timeline Journey Horizontal (.timeline-journey-horizontal)

Horizontal timeline for milestones.

```html
<div class="timeline-journey-horizontal"><div class="timeline-node"><span>01</span><h4>Milestone</h4><p>Short note.</p></div></div>
```

```css
.timeline-journey-horizontal { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; }
.timeline-journey-horizontal::before { content: ''; position: absolute; left: 0; right: 0; top: 18px; height: 1px; background: var(--line-strong); }
.timeline-node { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px; padding-right: 18px; }
.timeline-node span { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--line-strong); color: var(--accent-primary); font-size: 12px; font-weight: 800; }
```
<!-- @component:timeline-journey-horizontal:end -->

<!-- @component:timeline-journey-vertical:start -->
#### Timeline Journey Vertical (.timeline-journey-vertical)

Vertical timeline for narrow slots.

```html
<div class="timeline-journey-vertical"><div class="timeline-v-node"><span>01</span><div><h4>Milestone</h4><p>Short note.</p></div></div></div>
```

```css
.timeline-journey-vertical { display: flex; flex-direction: column; gap: 0; }
.timeline-v-node { display: grid; grid-template-columns: 42px 1fr; gap: 18px; padding-bottom: 26px; position: relative; }
.timeline-v-node::before { content: ''; position: absolute; left: 17px; top: 42px; bottom: 4px; width: 1px; background: var(--line-strong); }
.timeline-v-node span { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--line-strong); color: var(--accent-primary); font-size: 12px; font-weight: 800; }
```
<!-- @component:timeline-journey-vertical:end -->

<!-- @component:svg-motif:start -->
#### SVG Motif (.svg-motif)

Pattern for flat vector motifs, doodles, mascots, blob characters, line-art, and abstract geometric visuals. Keep drawing details inside the SVG; CSS only places and sizes the motif.

```html
<div class="svg-motif svg-motif--bottom" aria-hidden="true">
  <svg viewBox="0 0 1600 420" role="img" aria-label="Decorative vector motif">
    <rect x="0" y="350" width="1600" height="24" fill="var(--accent-soft)" />
    <path d="M120 330 C160 240 260 220 330 290 C380 340 290 370 180 370 Z" fill="var(--accent-primary)" />
    <circle cx="230" cy="310" r="8" fill="var(--text-primary)" />
  </svg>
</div>
```

```css
.svg-motif { position: relative; pointer-events: none; color: var(--text-primary); }
.svg-motif svg { display: block; width: 100%; height: 100%; overflow: visible; }
.svg-motif--bottom { position: absolute; left: 0; right: 0; bottom: 0; height: 30%; }
.svg-motif--side { position: absolute; right: 0; top: 0; bottom: 0; width: 34%; }
.svg-motif--corner { position: absolute; right: 40px; bottom: 36px; width: 360px; height: 220px; }
.svg-motif--hero { width: 100%; height: 100%; }
```

Usage rules:
- Use fixed `viewBox` values such as `0 0 1600 420` for strips or `0 0 600 600` for emblems.
- For bottom strips, the wrapper should usually occupy `20%` to `35%` of slide height.
- Do not let a small reference motif become a full-slide mascot unless the user requests it.
- Do not create eyes, mouths, doodles, or character details as separate CSS-positioned HTML elements outside the SVG.
<!-- @component:svg-motif:end -->

<!-- @design:components:end -->

<!-- @design:chart-rules:start -->

### Data Visualization (ECharts)

- Use neutral chart styling by default: clean axes, limited series count, and restrained labels.
- Use `--accent-primary` for the main series and `--accent-secondary` for supporting series.
- Avoid dashboard chrome, glowing charts, and excessive gridlines.
- Always include a short chart caption or source note when data is shown.
- Keep chart containers inside `echart-panel` so QA can measure stable geometry.

Recommended ECharts defaults:

```javascript
const baseChartText = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
const baseChartLine = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
const primary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
const secondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();
```

<!-- @design:chart-rules:end -->
