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
    --font-display: 'Montserrat', ui-sans-serif, sans-serif;
    --font-body: 'Montserrat', ui-sans-serif, sans-serif;
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

- **Display / heading font**: `Montserrat` — geometric sans-serif base for all headings and display text
- **Body font**: `Montserrat` — geometric sans-serif base for copy, captions, labels, and UI text
- Font link tag:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
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

### Visual Motif Rules

Do not use decorative SVG as a default content component. Use `media` for normal images, screenshots, diagrams, logos, and portraits. Use `hero` for full-bleed cover, divider, closing, or strong visual-statement slides with overlaid text.

For explicit illustration/icon-like requests or when authoring a new design from flat vector, doodle, mascot, blob, line-art, or geometric references, a small SVG motif may be used as an implementation detail. Use a fixed `viewBox`; place the SVG with CSS; keep facial features, doodles, and geometric details inside the SVG coordinate system. Do not build complex illustration details from scattered CSS absolute-positioned divs.

For photography, UI screenshots, webpages, and product surfaces, do not convert the reference to SVG. Extract palette, type scale, spacing, layout rhythm, borders, image treatment, and surface behavior instead.

### Page Framing

- The browser viewport is a neutral dark frame.
- The slide page is a light neutral surface.
- `.slide-canvas` is the export surface and must keep `padding: 0`; put safe-area spacing on `.page` or inner layout containers.
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
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script> only if charts are needed -->
    <style>/* all CSS here */</style>
</head>
<body>
    <section class="slide" slide-qa="false" data-slide-index="1">
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
.slide-canvas { width: 1920px; height: 1080px; flex-shrink: 0; transform-origin: center center; position: relative; overflow: hidden; padding: 0; }
.page { position: relative; width: 100%; height: 100%; background: var(--bg-page); color: var(--text-primary); padding: 56px 64px 64px; box-shadow: 0 24px 80px var(--shadow-soft); display: flex; flex-direction: column; overflow: hidden; }
.page.alt { background: var(--bg-page-alt); }
.eyebrow, .caption, .meta-label { font-size: var(--font-size-meta); line-height: 1.4; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.source, .source-note { font-family: "Times New Roman", Times, serif; font-size: 11px; line-height: 1.35; letter-spacing: 0; text-transform: none; color: var(--text-muted); }
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
.media-caption.source, .media-caption.source-note { font-family: "Times New Roman", Times, serif; font-size: 11px; line-height: 1.35; letter-spacing: 0; text-transform: none; }
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
- **SVG is exceptional.** Use decorative SVG only when the user explicitly asks for an illustration/icon-like visual or when design authoring requires a motif.
- **Icon system is Lucide.** For ordinary UI, semantic, status, category, process, and navigation icons, use Lucide (`data-lucide`). Do not hand-write inline SVG for icons. SVG is allowed only for intentional decorative motifs, illustrations, or design-specific artwork. If any `data-lucide` icon is present, load Lucide via CDN and call `lucide.createIcons()` after `SlidePresentation`.
- **Chart system is ECharts.** Data charts default to ECharts inside `echart-panel`. Do not use hand-written SVG, div/CSS shapes, canvas mocks, or static faux charts as data-chart substitutes. SVG remains acceptable for decorative motifs, diagrams, or illustrations, not data charts. Before creating or changing a chart, fetch the `echart-panel` component and `section: "chart-rules"`; if chart rules or runtime are unavailable, report the gap instead of inventing a fake chart fallback.
- **Start from foundation.** New deck HTML starts from `@design:foundation`. Do not recreate foundation CSS, JavaScript, or the HTML skeleton from memory. Prefer a foundation helper when available; otherwise fetch `section: "foundation"` before writing a new deck shell. Existing deck edits preserve the current foundation unless the user asks for foundation repair or QA reports a foundation contract problem.
- **Canonical slide canvas.** Every slide must be `<section class="slide" slide-qa="..." data-slide-index="N">` with exactly one direct child `.slide-canvas`. `.slide-canvas` is the 1920px x 1080px export surface and must keep `padding: 0`, `position: relative`, and `overflow: hidden`; put `.page` or layout containers inside `.slide-canvas`, never slide content directly under `.slide`. Missing, nested, or duplicate `.slide-canvas` elements are invalid and fail Artifact QA.
- **Images for photographic references.** Use image treatment rules rather than fake SVG when the reference is photographic, UI, webpage, or product imagery.
- **Content pages need a stable title block.** Except cover, TOC, closing, section divider, and full-bleed hero slides, every normal content slide should include a visible title block from the upper-left safe area. It should contain a compact chapter/section label plus a slide title written as the page's claim or takeaway.
- **Do not hide the page title inside a card.** Body components may have their own headings, but the slide-level title block should remain separate and easy to scan unless the chosen layout explicitly defines a compact side-title variant.
- **Text panels are not decorative rule panels.** Do not add a default left border, vertical accent bar, yellow/gold line, or inline rule to `text-panel`. Use typography, spacing, boxes, stats, quotes, or layout-level dividers for emphasis.
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

Each `<section class="slide">` must set `slide-qa="true"` or `slide-qa="false"`. Use the QA flag on each layout marker. It must also set `data-slide-index="N"`, where `N` is the canonical positive 1-based artifact slide identity from the approved deck plan or DOM order. Indexes must be unique and strictly increase.

Normal `qa=true` content layouts should start with a slide-level title block unless the layout marker explicitly says otherwise. Use this structure as the default: an eyebrow for chapter/section context, then an `h2` that states the slide's claim or takeaway. Keep body boxes, charts, media, and text panels below or beside that title region.

<!-- @layout:fullbleed:start qa=false -->
#### Fullbleed

Full-page layout for a single dominant component such as `hero`, a full-screen chart/media element, or a sparse title field.

```html
<section class="slide" slide-qa="false" data-slide-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <!-- [slot: content] — usually hero, media, echart-panel, or a sparse title field -->
    </div>
  </div>
</section>
```
<!-- @layout:fullbleed:end -->

<!-- @layout:narrative:start qa=true -->
#### Narrative

Asymmetric two-column layout. Use when one side needs more visual or reading weight.

```html
<section class="slide" slide-qa="true" data-slide-index="N">
  <div class="slide-canvas">
    <div class="page">
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;max-width:680px;">
        <p class="eyebrow">Chapter / Section</p>
        <h2>Slide claim or takeaway</h2>
      </div>
      <div style="flex:1;min-height:0;">
        <div class="narrative-grid">
          <div><!-- [slot: left] — 1+ components --></div>
          <div><!-- [slot: right] — 1+ components --></div>
        </div>
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
<section class="slide" slide-qa="true" data-slide-index="N">
  <div class="slide-canvas">
    <div class="page">
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;max-width:680px;">
        <p class="eyebrow">Chapter / Section</p>
        <h2>Slide claim or takeaway</h2>
      </div>
      <div style="flex:1;min-height:0;">
        <div class="narrative-grid narrative-grid--reverse">
          <div><!-- [slot: left] — 1+ components --></div>
          <div><!-- [slot: right] — 1+ components --></div>
        </div>
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
<section class="slide" slide-qa="true" data-slide-index="N">
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
<section class="slide" slide-qa="true" data-slide-index="N">
  <div class="slide-canvas">
    <div class="page">
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;max-width:680px;">
        <p class="eyebrow">Chapter / Section</p>
        <h2>Slide claim or takeaway</h2>
      </div>
      <div style="flex:1;min-height:0;">
        <div class="halves-grid">
          <div><!-- [slot: left] --></div>
          <div><!-- [slot: right] --></div>
        </div>
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
<section class="slide" slide-qa="true" data-slide-index="N">
  <div class="slide-canvas">
    <div class="page">
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;max-width:680px;">
        <p class="eyebrow">Chapter / Section</p>
        <h2>Slide claim or takeaway</h2>
      </div>
      <div style="flex:1;min-height:0;">
        <div class="stacked-grid">
          <div class="stacked-top"><!-- [slot: top] --></div>
          <div class="stacked-bottom"><!-- [slot: bottom] --></div>
        </div>
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

Components are reusable primitives. Use this hierarchy: `layout -> box/card -> text-panel + media/chart/table/stat/quote`.

LLM-facing vocabulary:
- `box` — card/group primitive for one idea, case, evidence item, metric, objection, risk, or action.
- `text-panel` — language module for title, body text, bullets, and source notes.
- `media` — normal image/screenshot/diagram/logo/portrait component; use `hero` instead for full-bleed covers.
- `echart-panel` — chart frame with caption/source structure.
- `data-table` — structured table component for tabular data and source notes.
- `steps` — process or phase sequence; compatibility implementation may use `.flow-*` classes.
- `roadmap-horizontal` and `roadmap-vertical` — dated phases, milestones, historical evolution, or future plans; compatibility implementation may use `.timeline-journey-*` classes.
- `hero` — full-bleed cover, section divider, closing, or strong visual statement with overlaid title/subtitle.
- `stat-card`, `quote`, and `toc` — pattern components for their specific use cases.
- `page-number` and `brand-watermark` — utility components.

Do not expose `image-title`, `media--cover`, `editorial-*`, `flow-*`, `timeline-journey-*`, or `svg-motif` as new component choices. Old classes may remain in CSS as compatibility implementation details.

Source and citation text should use `.source` or `.source-note`, not `.caption`. Source text uses Times New Roman at 11px and never uses uppercase letter-spacing treatment.

Density guidance: normal content slides usually need 2-4 boxes. Evidence slides should use 2-3 evidence boxes or one main chart/table with 2 supporting boxes. Process slides should use 3-5 steps. Use one dominant element only for covers, section dividers, closing asks, full-screen charts/visuals, or deliberate emphasis.

<!-- @component:box:start -->
#### Box (.box)

Card/group primitive for one idea, case, evidence item, metric, objection, risk, or action. Put `text-panel`, `media`, `echart-panel`, `data-table`, `stat-card`, or `quote` inside a box when they support the same idea.

```html
<div class="box">
  <div class="text-panel text-panel--plain">
    <div class="text-panel-body">
      <p class="eyebrow">Evidence</p>
      <h3>One clear idea</h3>
      <p>Short supporting copy or source-bound explanation.</p>
    </div>
  </div>
</div>
```

```css
.box { height: 100%; min-height: 0; padding: 28px; border: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; gap: 18px; overflow: hidden; }
.box--quiet { background: transparent; }
.box--accent { border-color: var(--accent-primary); background: var(--accent-soft); }
```
<!-- @component:box:end -->

<!-- @component:text-panel:start -->
#### Text Panel (.text-panel)

Language module for headings, body copy, lists, and footer/source metadata. It can sit inside `box` or directly in a layout slot.

`text-panel` is a neutral language container. Do not add a default left border, vertical accent bar, yellow/gold rule, or decorative stripe to it. If a slide needs emphasis, use a `box`, `stat-card`, `quote`, `toc`, or a layout-level divider instead.

```html
<div class="text-panel text-panel--light">
  <div class="text-panel-body">
    <p class="eyebrow">Context</p>
    <h2>Panel heading</h2>
    <ul class="editorial-list"><li><strong>Signal.</strong> Supporting copy.</li></ul>
  </div>
  <div class="text-panel-footer"><span class="source">Source: dataset</span><span class="caption">01</span></div>
</div>
```

```css
.text-panel { height: 100%; padding: 56px 48px 34px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; }
.text-panel--plain { padding: 0; background: transparent; }
.text-panel--light { background: var(--bg-page-alt); color: var(--text-primary); }
.text-panel--dark { background: #1f242b; color: #f8fafc; --text-primary: #f8fafc; --text-secondary: #cbd5e1; --text-muted: #94a3b8; --line: rgba(248,250,252,0.16); }
.text-panel-body { display: flex; flex-direction: column; gap: 14px; }
.text-panel-footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; }
```
<!-- @component:text-panel:end -->

<!-- @component:media:start -->
#### Media (.media)

Normal image, screenshot, diagram, logo, or portrait component. Keep important visual information understandable. Do not use `media` for full-bleed covers/dividers/closings; use `hero` for those.

```html
<figure class="media">
  <div class="media-frame"><img src="..." alt="Concise description"></div>
  <figcaption class="media-caption source-note">Source or note</figcaption>
</figure>
```

```css
.media { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.media-frame { position: relative; overflow: hidden; background: var(--surface-strong); }
.media-frame img { width: 100%; height: 100%; display: block; object-fit: cover; }
.media--contain .media-frame img { object-fit: contain; }
.media-caption { margin-top: 0; font-size: var(--font-size-meta); line-height: 1.5; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.media-caption.source, .media-caption.source-note { font-family: "Times New Roman", Times, serif; font-size: 11px; line-height: 1.35; letter-spacing: 0; text-transform: none; }
```
<!-- @component:media:end -->

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

<!-- @component:echart-panel:start -->
#### EChart Panel (.echart-panel)

Chart container with header, chart area, and caption.

```html
<div class="echart-panel">
  <div class="echart-panel-header"><p class="eyebrow">Chart</p><h3>Chart heading</h3><p class="chart-subtitle">Subtitle</p></div>
  <div class="echart-container" id="chart-id"></div>
  <p class="chart-caption source-note">Source: dataset</p>
</div>
```

```css
.echart-panel { display: flex; flex-direction: column; height: 100%; gap: 0; }
.echart-panel-header { flex-shrink: 0; padding-bottom: 16px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.chart-subtitle { margin-top: 4px; font-size: 13px; color: var(--text-muted); line-height: 1.4; }
.echart-container { flex: 1; min-height: 0; }
.chart-caption { flex-shrink: 0; margin-top: 12px; }
```
<!-- @component:echart-panel:end -->

<!-- @component:steps:start -->
#### Steps (.steps)

Process or phase sequence. Use 3-5 steps. Use `.steps--horizontal` for wide slots and `.steps--vertical` for side panels or narrow slots.

```html
<div class="steps steps--horizontal">
  <div class="step-item"><div class="step-number" data-n="01"></div><div class="step-body"><h4>Step</h4><p>Short text.</p></div></div>
</div>
```

```css
.step-number, .flow-number { position: relative; width: 36px; height: 36px; flex-shrink: 0; border: 1px solid var(--line-strong); background: var(--surface); display: flex; align-items: center; justify-content: center; }
.step-number::after, .flow-number::after { content: attr(data-n); font-size: 12px; font-weight: 800; color: var(--accent-primary); }
.step-body h4, .flow-body h4 { font-size: 20px; font-weight: 700; line-height: 1.14; }
.step-body p, .flow-body p { margin-top: 8px; font-size: 17px; line-height: 1.6; color: var(--text-secondary); }
.steps--horizontal, .flow-horizontal { position: relative; display: flex; align-items: flex-start; width: 100%; }
.steps--horizontal::before, .flow-horizontal::before { content: ''; position: absolute; top: 17px; left: 0; right: 0; height: 1px; background: var(--line-strong); z-index: 0; }
.steps--horizontal .step-item, .flow-horizontal .flow-item { flex: 1; display: flex; flex-direction: column; gap: 18px; padding-right: 40px; }
.steps--horizontal .step-number, .flow-horizontal .flow-number { position: relative; z-index: 1; }
.steps--vertical, .flow-vertical { display: flex; flex-direction: column; width: 100%; }
.steps--vertical .step-item, .flow-vertical .flow-item { display: flex; gap: 28px; align-items: flex-start; }
.step-marker, .flow-marker { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.step-line, .flow-line { width: 1px; flex: 1; min-height: 28px; background: var(--line-strong); margin: 6px 0; }
.steps--vertical .step-body, .flow-vertical .flow-body { padding-bottom: 32px; }
.steps--vertical .step-item.last .step-body, .flow-vertical .flow-item.last .flow-body { padding-bottom: 0; }
```
<!-- @component:steps:end -->

<!-- @component:data-table:start -->
#### Data Table (.data-table)

Dense tabular data with optional highlights and deltas.

```html
<div class="data-table-wrap">
  <div class="data-table-label">Dataset</div>
  <table class="data-table"><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody><tr><td>Example</td><td>42</td></tr></tbody></table>
  <p class="table-caption source-note">Source note</p>
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
.table-caption { margin-top: 12px; }
```
<!-- @component:data-table:end -->

<!-- @component:hero:start -->
#### Hero (.hero)

Full-bleed cover, section divider, closing, or strong visual statement with optional overlaid title/subtitle. Never use `hero` inside a `box`. Never use `hero` for screenshots, charts, tables, diagrams, or source evidence that must stay fully readable.

```html
<div class="hero hero--left image-title image-title--left">
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
.hero { position: relative; width: 100%; height: 100%; overflow: hidden; color: #f8fafc; background: #1f242b; }
.hero--left .image-title-body { max-width: 760px; }
.hero--right .image-title-fg { text-align: right; }
.hero--right .image-title-body { max-width: 860px; margin-left: auto; }
```
<!-- @component:hero:end -->

<!-- @component:toc:start -->
#### TOC (.toc-panel)

Table of contents or section index.

```html
<div class="toc-panel">
  <div class="toc-panel-inner">
    <div class="toc-header">
      <h2>Table of<br>Contents</h2>
      <p class="toc-note">Brief context note describing the scope of the sections that follow.</p>
      <p class="toc-footer">Creative-Curious-Cooperation</p>
    </div>
    <ol class="toc-list">
      <li class="toc-item"><span>01</span><strong>The vision of a changing world</strong></li>
      <li class="toc-item"><span>02</span><strong>Smart home solutions</strong></li>
      <li class="toc-item"><span>03</span><strong>Smart city innovations</strong></li>
      <li class="toc-item"><span>04</span><strong>Smart office revolution</strong></li>
      <li class="toc-item"><span>05</span><strong>Wearable technology</strong></li>
      <li class="toc-item"><span>06</span><strong>The future of connected work</strong></li>
    </ol>
  </div>
</div>
```

```css
.toc-panel { height: 100%; padding: 86px 118px 58px; display: flex; overflow: hidden; background: var(--bg-page); }
.toc-panel-inner { width: 100%; display: grid; grid-template-columns: 37% 1fr; align-items: stretch; gap: 76px; }
.toc-header { display: flex; flex-direction: column; min-height: 100%; }
.toc-header h2 { margin-top: 32px; max-width: 360px; font-size: 46px; line-height: 1.04; letter-spacing: 0.02em; text-transform: uppercase; font-weight: 650; }
.toc-note { margin-top: 230px; margin-bottom: 0; max-width: 300px; font-size: 14px; line-height: 1.7; letter-spacing: 0.02em; color: var(--text-muted); }
.toc-footer { margin-top: auto; font-size: 11px; line-height: 1.4; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 750; color: var(--text-primary); }
.toc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; gap: 42px; height: 100%; }
.toc-item { display: grid; grid-template-columns: 80px 1fr; gap: 44px; align-items: center; }
.toc-item span { font-style: normal; font-family: var(--font-display); font-size: 42px; line-height: 1; letter-spacing: 0.03em; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.toc-item strong { font-size: 17px; line-height: 1.35; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 500; color: var(--text-primary); }
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

<!-- @component:roadmap-horizontal:start -->
#### Roadmap Horizontal (.roadmap-horizontal)

Horizontal milestone journey with a central axis line. Nodes sit on the axis; a dashed vertical stem leads to a tip dot, with date, title, and description text alongside. Alternate nodes above and below the axis for rhythm. Suitable for 4-8 milestones across a chronological arc, transformation story, roadmap, or multi-year programme recap.

```html
<div class="roadmap-horizontal timeline-journey-horizontal" data-preview-component="roadmap-horizontal">
  <div class="tjh-axis"></div>

  <!-- Up node: label, tip-dot, stem, axis-dot. Content grows upward. -->
  <div class="tjh-item tjh-item--up" style="left:12%; --tjh-item-color:var(--accent-primary);">
    <div class="tjh-label">
      <span class="tjh-date">Q1</span>
      <span class="tjh-title">Baseline</span>
      <span class="tjh-text">Map current signals and establish the reference state.</span>
    </div>
    <div class="tjh-tip-dot"></div>
    <div class="tjh-stem"></div>
    <div class="tjh-axis-dot"></div>
  </div>

  <!-- Down node: axis-dot, stem, tip-dot, label. Content grows downward. -->
  <div class="tjh-item tjh-item--down" style="left:34%; --tjh-item-color:var(--accent-secondary);">
    <div class="tjh-axis-dot"></div>
    <div class="tjh-stem"></div>
    <div class="tjh-tip-dot"></div>
    <div class="tjh-label">
      <span class="tjh-date">Q2</span>
      <span class="tjh-title">Prototype</span>
      <span class="tjh-text">Convert the plan into visible experiments.</span>
    </div>
  </div>
</div>
```

```css
.roadmap-horizontal, .timeline-journey-horizontal {
  --tjh-node: 12px;
  --tjh-stem-h: 76px;
  --tjh-col: calc(100% / 6);
  position: relative;
  width: 100%;
  height: 340px;
}
.tjh-axis { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: var(--line-strong); transform: translateY(-50%); }
.tjh-item { position: absolute; display: flex; flex-direction: column; align-items: center; width: var(--tjh-col); transform: translateX(-50%); }
.tjh-item--up { bottom: 50%; }
.tjh-item--down { top: 50%; }
.tjh-axis-dot, .tjh-tip-dot { width: var(--tjh-node); height: var(--tjh-node); border-radius: 999px; background: var(--tjh-item-color, var(--accent-primary)); flex-shrink: 0; }
.tjh-item--up .tjh-axis-dot { margin-bottom: calc(-1 * var(--tjh-node) / 2); }
.tjh-item--down .tjh-axis-dot { margin-top: calc(-1 * var(--tjh-node) / 2); }
.tjh-stem { width: 1px; height: var(--tjh-stem-h); background-image: repeating-linear-gradient(to bottom, var(--line-strong) 0 4px, transparent 4px 8px); flex-shrink: 0; }
.tjh-label { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 0 6px; }
.tjh-item--up .tjh-label { margin-bottom: 8px; }
.tjh-item--down .tjh-label { margin-top: 8px; }
.tjh-date { font-size: var(--font-size-meta); font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--tjh-item-color, var(--accent-primary)); line-height: 1.3; white-space: nowrap; }
.tjh-title { font-size: 18px; font-weight: 700; line-height: 1.15; color: var(--text-primary); }
.tjh-text { font-size: 15px; line-height: 1.45; color: var(--text-secondary); }
```

Rules:
- Position nodes with `left: X%` inline style. For N nodes, space them at `(100 / (N + 1)) * k %` or manually distribute to show real time gaps.
- Each node may set `--tjh-item-color` inline. Prefer existing neutral theme tokens such as `--accent-primary`, `--accent-secondary`, `--accent-danger`, or a derived local accent.
- Up node DOM order is `label -> tip-dot -> stem -> axis-dot`; down node DOM order is `axis-dot -> stem -> tip-dot -> label`.
- Keep `.tjh-text` short, usually 1-2 lines. The column width limits wrapping naturally.
- Alternate up/down nodes for visual rhythm unless clustering intentionally communicates a phase.
- Adjust `--tjh-col`, `--tjh-stem-h`, and component `height` for fewer or longer milestones.
<!-- @component:roadmap-horizontal:end -->

<!-- @component:roadmap-vertical:start -->
#### Roadmap Vertical (.roadmap-vertical)

Vertical milestone journey with a central axis line. Nodes sit on the axis; a horizontal dashed stem leads to a tip dot, with date, title, and description text alongside. Alternate nodes left and right of the axis for rhythm. Suitable for 3-8 milestones in a full-height slot.

```html
<div class="roadmap-vertical timeline-journey-vertical" data-preview-component="roadmap-vertical">
  <div class="tjv-axis"></div>

  <!-- Left node: DOM order stays axis-dot, stem, tip-dot, label. CSS reverses the row. -->
  <div class="tjv-item tjv-item--left" style="top:18%; --tjv-item-color:var(--accent-primary);">
    <div class="tjv-axis-dot"></div>
    <div class="tjv-stem"></div>
    <div class="tjv-tip-dot"></div>
    <div class="tjv-label">
      <span class="tjv-date">Discover</span>
      <span class="tjv-title">Signal scan</span>
      <span class="tjv-text">Collect inputs and identify the high-confidence path.</span>
    </div>
  </div>

  <!-- Right node: same DOM order, standard row direction. -->
  <div class="tjv-item tjv-item--right" style="top:42%; --tjv-item-color:var(--accent-secondary);">
    <div class="tjv-axis-dot"></div>
    <div class="tjv-stem"></div>
    <div class="tjv-tip-dot"></div>
    <div class="tjv-label">
      <span class="tjv-date">Build</span>
      <span class="tjv-title">Visible proof</span>
      <span class="tjv-text">Create the first proof points and refine the operating model.</span>
    </div>
  </div>
</div>
```

```css
.roadmap-vertical, .timeline-journey-vertical {
  --tjv-node: 12px;
  --tjv-stem-w: 76px;
  position: relative;
  width: 100%;
  height: 100%;
}
.tjv-axis { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--line-strong); transform: translateX(-50%); }
.tjv-item { position: absolute; display: flex; align-items: center; height: 78px; transform: translateY(-50%); }
.tjv-item--left { right: 50%; flex-direction: row-reverse; }
.tjv-item--right { left: 50%; flex-direction: row; }
.tjv-axis-dot { width: var(--tjv-node); height: var(--tjv-node); border-radius: 999px; background: var(--tjv-item-color, var(--accent-primary)); flex-shrink: 0; position: relative; z-index: 1; }
.tjv-item--left .tjv-axis-dot { margin-right: calc(-1 * var(--tjv-node) / 2); }
.tjv-item--right .tjv-axis-dot { margin-left: calc(-1 * var(--tjv-node) / 2); }
.tjv-tip-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--tjv-item-color, var(--accent-primary)); flex-shrink: 0; }
.tjv-stem { width: var(--tjv-stem-w); height: 1px; background-image: repeating-linear-gradient(to right, var(--line-strong) 0 4px, transparent 4px 8px); flex-shrink: 0; }
.tjv-label { display: flex; flex-direction: column; gap: 4px; }
.tjv-item--left .tjv-label { text-align: right; align-items: flex-end; padding-right: 18px; max-width: 440px; }
.tjv-item--right .tjv-label { text-align: left; align-items: flex-start; padding-left: 18px; max-width: 440px; }
.tjv-date { font-size: var(--font-size-meta); font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--tjv-item-color, var(--accent-primary)); line-height: 1.3; white-space: nowrap; }
.tjv-title { font-size: 18px; font-weight: 700; line-height: 1.15; color: var(--text-primary); }
.tjv-text { font-size: 15px; line-height: 1.45; color: var(--text-secondary); max-width: 360px; }
```

Rules:
- DOM order is identical for left and right nodes: `axis-dot -> stem -> tip-dot -> label`. Direction is controlled by CSS (`row-reverse` for left, `row` for right).
- Position each node with `top: Y%` inline style. For N nodes, distribute evenly with `(100 / (N + 1)) * k %` or manually to reflect time proportions.
- Each node may set `--tjv-item-color` inline. Prefer current theme tokens rather than hard-coded project colors.
- Alternate left and right nodes for rhythm. Avoid consecutive same-side nodes unless the story needs clustering.
- The parent container must have a defined height. Use `height: 100%` inside a layout slot, or set an explicit height when standalone.
- Keep `.tjv-text` to 2-3 lines. Longer labels shift the perceived center away from the axis dot.
<!-- @component:roadmap-vertical:end -->

<!-- @design:components:end -->

<!-- @design:chart-rules:start -->

### Data Visualization (ECharts)

- Chart system is ECharts. Data charts should use `echarts.init()` with an `echart-panel` container, not hand-written SVG, div/CSS shapes, canvas mocks, or static faux charts.
- Use neutral chart styling by default: clean axes, limited series count, restrained labels, and transparent backgrounds.
- Use `--accent-primary` for the main series and `--accent-secondary` for supporting series. Derive colors from CSS variables with `getComputedStyle(document.documentElement)` instead of hard-coding unrelated palettes.
- Keep chart containers inside `echart-panel` so QA can measure stable geometry. `.echart-container` must have stable sizing through explicit width/height or flex sizing with `min-height: 0`.
- Give every chart a unique id. Initialise with `echarts.init()` after `SlidePresentation` is instantiated, and call `chart.resize()` on window resize.
- Set `backgroundColor: "transparent"` in chart options. Set text, axis, legend, grid, and tooltip colors explicitly; ECharts canvas text does not inherit CSS reliably.
- Always include a short chart caption or source note when data is shown.
- Do not use fake chart fallback when ECharts runtime or chart rules are missing. Report the missing runtime/rules or use an approved local/runtime dependency.

Recommended ECharts defaults:

```javascript
const baseChartText = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
const baseChartLine = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
const primary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
const secondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();
```

<!-- @design:chart-rules:end -->
