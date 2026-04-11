---
name: minimal
description: Warm off-white light theme — frosted-glass cards, typographic, distraction-free
author: slides-it
version: 1.0.0
preview: bundled
---

## Visual Style — Minimal Theme

Apply this visual style when generating all slides in this session.

This theme pairs a warm, off-white background with frosted-glass cards and subtle geometric depth. Think: a well-designed printed magazine with a modern glass layer — warm paper feel, elevated with translucency.

<!-- @section:global:start -->

### Color Palette (Unchanged)

```css
:root {
    --bg-primary:    #FAF9F6;   /* warm off-white — main background */
    --bg-secondary:  #F0EEE8;   /* slightly darker warm grey */
    --bg-card:       rgba(255, 255, 255, 0.55); /* frosted glass white */
    --text-primary:  #1A1916;   /* near-black warm ink */
    --text-secondary:#6B6560;   /* warm mid-grey */
    --text-muted:    #A09890;   /* subtle captions */
    --accent:        #1A1916;   /* same as text — monochrome accent */
    --accent-2:      #6B6560;   /* secondary accent — warm grey */
    --border:        rgba(226, 222, 213, 0.6);  /* soft warm border, semi-transparent */
    --border-strong: #C9C4B8;   /* stronger divider */
}
```

### Typography

- **Display font**: `DM Serif Display` (headings) — load from Google Fonts
- **Body font**: `DM Sans` (body, captions) — load from Google Fonts
- Font link tag:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
  ```
- Title size (h1): `64px`, weight 400
- Section heading (h2): `42px`, weight 400
- Subtitle size: `22px`, weight 300
- Body size: `18px`
- Label: `13px`, letter-spacing `0.1em`, uppercase
- Card title: `24px` (DM Serif Display)
- Card body: `17px`
- Stat number: `64px`, weight 400
- Stat label: `15px`, uppercase
- Line height: `1.75` for body, `1.15` for h1, `1.2` for h2
- Letter spacing: `-0.02em` for large headings
- Card title: weight 400 (DM Serif Display)
- Card body / body-text: weight 400
- Stat label: weight 400

All sizes are fixed `px` — designed for the 1920×1080 canvas. JS `transform: scale()`
handles viewport adaptation. **Never use `clamp()` or viewport-relative units.**

### Background Layers (Subtle Geometric Depth)

**Layer 1 — Base gradient (subtle warmth):**
```css
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: linear-gradient(180deg, #FAF9F6 0%, #F5F3EE 50%, #FAF9F6 100%);
    z-index: -3;
}
```

**Layer 2 — Geometric circles (blurred, warm amber tones):**
```css
.geo-shape-1, .geo-shape-2, .geo-shape-3 {
    position: fixed;
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.20;
    z-index: -2;
    pointer-events: none;
}
.geo-shape-1 {
    width: 600px;
    height: 600px;
    background: #FFB347;
    top: -200px;
    right: -100px;
}
.geo-shape-2 {
    width: 400px;
    height: 400px;
    background: #FFA633;
    bottom: -100px;
    left: -100px;
}
.geo-shape-3 {
    width: 300px;
    height: 300px;
    background: #EE9526;
    top: 50%;
    left: 30%;
    opacity: 0.15;
}
```

**Layer 3 — Subtle diagonal lines (paper texture):**
```css
body::after {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 3px,
        rgba(0, 0, 0, 0.008) 3px,
        rgba(0, 0, 0, 0.008) 6px
    );
    z-index: -1;
    pointer-events: none;
}
```

### Slide Layout

- **1920×1080 fixed canvas** — each slide uses a `.slide-canvas` (1920×1080px),
  scaled to fit the viewport via JS `transform: scale()`.
- Content width tiers (inside canvas, via `max-width` + `margin: 0 auto`):
  - Default (`1200px`): Cover, Quote, Closing
  - Wide (`1600px`): content-heavy slides (grids, multi-column, process flows)
- Canvas padding: `60px 80px`
- **No `clamp()` — use fixed `px` for all sizes.** The canvas is always
  1920×1080 and JS handles scaling, so all typography and spacing must be fixed `px`.
- **Canvas utilization** — Elements should fill approximately 70–80% of the
  1920×1080 canvas area. Even in a minimal design, slides should not feel empty.
  Use larger serif headings, more generous card heights, wider grids, and
  comfortable padding to occupy the space. The calm feeling comes from typography
  and whitespace *rhythm*, not from leaving the canvas half-empty.
  - **Content slides** (Feature Cards, Stats, Two-Column, Step Flow): grid/flex
    containers should stretch toward the canvas edges. Frosted-glass cards should
    have ample internal padding and body text so they feel substantial.
  - **Sparse slides** (Cover, Quote, Closing): add decorative fills — thin geometric
    rules, positioned warm-amber circles (low opacity), large typographic ornaments
    (e.g. oversized `"` for quotes in `var(--border)` color), or horizontal `1px`
    dividers that span most of the canvas width. These anchor the composition
    without breaking the calm, paper-like feel.
  - **Never** leave more than ~20% of the canvas visually empty on any slide.
- Title slide: large serif heading left-aligned + thin `1px` rule beneath + muted subtitle
- Content slides: heading top with `border-bottom: 1px solid var(--border)` separator, content below

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
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>
    <!-- <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>  ← only if charts needed -->
    <style>/* all CSS here */</style>
</head>
<body>
    <!-- Geometric background shapes -->
    <div class="geo-shape-1"></div>
    <div class="geo-shape-2"></div>
    <div class="geo-shape-3"></div>

    <!-- Navigation -->
    <div class="progress-bar" id="progressBar"></div>
    <nav class="nav-dots" id="navDots" aria-label="Slide navigation"></nav>

    <!-- Slides -->
    <section class="slide title-slide" data-slide-type="cover" data-index="0">
        <div class="slide-canvas"> ... </div>
    </section>
    <section class="slide" data-slide-type="content" data-index="1">
        <div class="slide-canvas"> ... </div>
    </section>
    <!-- every <section class="slide"> must have data-slide-type — see SKILL.md for valid values -->

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
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'DM Sans', ui-sans-serif, sans-serif;
    -webkit-font-smoothing: antialiased;
    height: 100%;
}

.slide {
    height: 100dvh;
    scroll-snap-align: start;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

.slide-canvas {
    width: 1920px;
    height: 1080px;
    flex-shrink: 0;
    transform-origin: center center;
    /* scale set by JS setupScaling() */
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px 80px;
}
```

### Navigation & Progress

#### Progress Bar

```css
.progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 2px;
    background: var(--border-strong);
    width: 0%;
    z-index: 100;
    transition: width 0.2s ease;
}
```

No glow, no gradient — a quiet, thin line.

#### Nav Dots

```css
.nav-dots {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 100;
}
.nav-dots button {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: transparent;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s;
}
.nav-dots button.active {
    background: var(--text-primary);
    border-color: var(--text-primary);
}
```

No glow, no box-shadow — solid fill only.

#### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
    .reveal {
        transition: opacity 0.3s ease;
        opacity: 1;
    }
}
```

### SlidePresentation Class (Complete JavaScript)

All presentations must include this complete `SlidePresentation` class. Every
method is fully implemented — copy this exactly and include it in the `<script>`
block.

```javascript
class SlidePresentation {
    constructor() {
        this.slides = document.querySelectorAll('.slide');
        this.currentSlide = 0;
        this.setupScaling();
        this.setupProgressBar();
        this.setupNavDots();
        this.setupIntersectionObserver();
        this.setupKeyboardNav();
        this.setupTouchNav();
        this.setupMouseWheel();
    }

    /* Scale 1920×1080 canvases to fit viewport */
    setupScaling() {
        const canvases = document.querySelectorAll('.slide-canvas');
        const BASE_W = 1920, BASE_H = 1080;
        const update = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const scale = Math.min(vw / BASE_W, vh / BASE_H);
            canvases.forEach(c => { c.style.transform = `scale(${scale})`; });
        };
        window.addEventListener('resize', update);
        update();
    }

    /* Horizontal progress bar at top */
    setupProgressBar() {
        const bar = document.getElementById('progressBar');
        const update = () => {
            const scrolled = window.scrollY;
            const total = document.body.scrollHeight - window.innerHeight;
            bar.style.width = total > 0 ? (scrolled / total * 100) + '%' : '0%';
        };
        window.addEventListener('scroll', update, { passive: true });
        update();
    }

    /* Vertical dot navigation on right side */
    setupNavDots() {
        const nav = document.getElementById('navDots');
        this.slides.forEach((_, i) => {
            const btn = document.createElement('button');
            btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
            if (i === 0) btn.classList.add('active');
            btn.addEventListener('click', () => this.goTo(i));
            nav.appendChild(btn);
        });
        this.dots = nav.querySelectorAll('button');

        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    const idx = parseInt(e.target.dataset.index);
                    this.dots.forEach((d, i) => d.classList.toggle('active', i === idx));
                    this.currentSlide = idx;
                }
            });
        }, { threshold: 0.5 });
        this.slides.forEach(s => obs.observe(s));
    }

    /* Reveal animations on scroll — opacity only, no translateY */
    setupIntersectionObserver() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
                }
            });
        }, { threshold: 0.15 });
        this.slides.forEach(s => obs.observe(s));
    }

    /* Arrow keys, Space, PageUp/PageDown */
    setupKeyboardNav() {
        document.addEventListener('keydown', e => {
            if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(e.key)) {
                e.preventDefault();
                this.goTo(this.currentSlide + 1);
            } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
                e.preventDefault();
                this.goTo(this.currentSlide - 1);
            }
        });
    }

    /* Swipe support for touch devices */
    setupTouchNav() {
        let startY = 0;
        document.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
        document.addEventListener('touchend', e => {
            const dy = startY - e.changedTouches[0].clientY;
            if (Math.abs(dy) > 40) this.goTo(this.currentSlide + (dy > 0 ? 1 : -1));
        }, { passive: true });
    }

    /* Debounced mouse wheel navigation (800ms) */
    setupMouseWheel() {
        let last = 0;
        document.addEventListener('wheel', e => {
            const now = Date.now();
            if (now - last < 800) return;
            last = now;
            this.goTo(this.currentSlide + (e.deltaY > 0 ? 1 : -1));
        }, { passive: true });
    }

    /* Scroll to slide by index */
    goTo(idx) {
        const clamped = Math.max(0, Math.min(this.slides.length - 1, idx));
        this.slides[clamped].scrollIntoView({ behavior: 'smooth' });
        this.currentSlide = clamped;
    }
}

new SlidePresentation();
```

After the `SlidePresentation` class, include:
1. `lucide.createIcons();` to render Lucide icons (if icons are used)
2. ECharts initialization (if charts are present)
3. Inline editing code (see SKILL.md)

<!-- @section:global:end -->

<!-- @section:components:start -->

### Component Library

These are independent, composable building blocks. Mix them freely on any slide —
they are not locked to specific layouts.

<!-- @component:reveal:start -->
#### Reveal Animation (.reveal)

Add `.reveal` to any element that should animate on scroll. JS adds `.visible`
via IntersectionObserver. This theme uses opacity-only transitions — no
directional motion (translateY/translateX) — to preserve the calm, paper-like feel.

```css
.reveal {
    opacity: 0;
    transition: opacity 0.4s ease;
}
.reveal.visible {
    opacity: 1;
}
/* Stagger children */
.reveal:nth-child(1) { transition-delay: 0s; }
.reveal:nth-child(2) { transition-delay: 0.06s; }
.reveal:nth-child(3) { transition-delay: 0.12s; }
.reveal:nth-child(4) { transition-delay: 0.18s; }
.reveal:nth-child(5) { transition-delay: 0.24s; }
.reveal:nth-child(6) { transition-delay: 0.30s; }
.reveal:nth-child(7) { transition-delay: 0.36s; }
.reveal:nth-child(8) { transition-delay: 0.42s; }
```

No `.title-reveal` in this theme — cover headings use the same `.reveal` fade.

<!-- @component:reveal:end -->

<!-- @component:showcase:start -->
#### Showcase (.showcase)

Semi-transparent container that frames a component or image with padding and
visual depth. Use inside `.two-col-aside`, `.two-col-main`, or as a standalone
wrapper when a component needs a "stage" rather than sitting directly on the
slide background. Vertically and horizontally centers its content.

```css
.showcase {
    padding: 28px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
}
```

<!-- @component:showcase:end -->

<!-- @component:card:start -->
#### Card (.card)

Frosted-glass container for any grouped content — features, evidence, info blocks.

```html
<div class="card">
    <i data-lucide="circle-dashed" class="card-icon"></i>
    <p class="card-label">01</p>
    <p class="card-title">Title</p>
    <p class="card-body">Body text describing the item.</p>
</div>
```

All inner elements are optional — use only what the content needs.

```css
.card {
    background: var(--bg-card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.10);
}
.card-icon        { width: 28px; height: 28px; color: var(--accent-2); margin-bottom: 12px; transition: transform 0.2s ease; }
.card:hover .card-icon { transform: scale(1.05); }
.card-label       { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }
.card-title       { font-family: 'DM Serif Display', serif; font-size: 24px; margin-bottom: 12px; }
.card-body        { font-size: 17px; color: var(--text-secondary); line-height: 1.7; flex: 1; }
```

<!-- @component:card:end -->

<!-- @component:image-card:start -->
#### Image Card (.image-card)

Standalone image with rounded corners and optional caption. Use for product shots,
screenshots, team photos, or any visual that deserves its own space.

```html
<div class="image-card">
    <img src="photo.jpg" alt="Description">
    <p class="image-card-caption">Optional caption text</p>
</div>
```

Caption is optional — omit when the image is self-explanatory.

```css
.image-card {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
}
.image-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.image-card-caption {
    padding: 14px 18px;
    font-size: 14px;
    color: var(--text-muted);
    background: var(--bg-card);
    backdrop-filter: blur(16px);
    font-family: 'DM Sans', sans-serif;
}
```

Sizing: set `width` and `height` on `.image-card` via inline style to control
aspect ratio. Typical: `width:100%; height:400px` in a column, or
`width:480px; height:320px` standalone.

<!-- @component:image-card:end -->

<!-- @component:card-img:start -->
#### Card with Image Header (.card-img)

Card variant with an image at the top and text content below. Use for team
members, portfolio items, or any card where a visual header adds context.

```html
<div class="card card-img">
    <div class="card-img-top">
        <img src="photo.jpg" alt="Description">
    </div>
    <p class="card-title">Title</p>
    <p class="card-body">Description text goes here.</p>
</div>
```

```css
.card-img {
    padding: 0;
    overflow: hidden;
}
.card-img-top {
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
}
.card-img-top img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.card-img .card-title,
.card-img .card-body,
.card-img .card-label {
    padding-left: 28px;
    padding-right: 28px;
}
.card-img .card-title { padding-top: 20px; }
.card-img .card-body  { padding-bottom: 28px; }
```

<!-- @component:card-img:end -->

<!-- @component:avatar:start -->
#### Avatar (.avatar)

Circular cropped image for people, team members, or profile pictures.

```html
<img src="person.jpg" alt="Name" class="avatar avatar-lg">
```

```css
.avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--border-strong);
    flex-shrink: 0;
}
.avatar-sm { width: 48px; height: 48px; }
.avatar-lg { width: 96px; height: 96px; }
```

No glow, no shadow — clean circle with a thin warm border. Pair with card text
for team slides: avatar left, name + role right.

<!-- @component:avatar:end -->

<!-- @component:stat-card:start -->
#### Stat Card (.stat-card)

Large metric display. Numbers appear statically with fade-in — no counter animation.

```html
<div class="stat-card">
    <div class="stat-number">85%</div>
    <div class="stat-label">Growth Rate</div>
    <div class="stat-desc">Year over year revenue increase</div>
</div>
```

```css
.stat-card {
    background: var(--bg-card);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 48px 40px;
    text-align: center;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
    border-bottom: 2px solid var(--border-strong);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
.stat-number { font-family: 'DM Serif Display', serif; font-size: 64px; font-weight: 400; color: var(--text-primary); line-height: 1; letter-spacing: -0.03em; margin-bottom: 12px; }
.stat-label  { font-size: 15px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
.stat-desc   { font-size: 15px; color: var(--text-secondary); line-height: 1.5; opacity: 0.8; }
```

No `.gradient-text` on numbers — minimal stays monochrome.

<!-- @component:stat-card:end -->

<!-- @component:quote-block:start -->
#### Quote Block (.quote-block)

```html
<div class="quote-deco">&ldquo;</div>
<div class="quote-block">
    <blockquote>&ldquo;The quote text goes here.&rdquo;</blockquote>
    <cite>Attribution</cite>
</div>
```

```css
.quote-block            { display: flex; flex-direction: column; justify-content: center; border-left: 2px solid var(--border-strong); padding-left: 32px; max-width: 1200px; }
.quote-block blockquote { font-family: 'DM Serif Display', serif; font-size: 40px; font-style: italic; line-height: 1.4; margin-bottom: 20px; }
.quote-block cite       { font-size: 14px; color: var(--text-muted); letter-spacing: 0.05em; text-transform: uppercase; font-style: normal; font-family: 'DM Sans', sans-serif; }
.quote-deco             { position: absolute; font-family: 'DM Serif Display', serif; font-size: 280px; line-height: 1; color: var(--border); opacity: 0.3; pointer-events: none; z-index: 0; }
```

No background color on `.quote-block` — let the typography speak.

<!-- @component:quote-block:end -->

<!-- @component:step-flow:start -->
#### Step Flow (.step-flow)

Horizontal process with numbered circles and connectors. Alternate `.step`
and `.step-connector` as siblings inside `.step-flow`.

```html
<div class="step-flow">
    <div class="step">
        <div class="step-circle">1</div>
        <div class="step-title">Describe</div>
        <div class="step-desc">Tell us your topic and audience.</div>
    </div>
    <div class="step-connector"></div>
    <div class="step">
        <div class="step-circle">2</div>
        <div class="step-title">Generate</div>
        <div class="step-desc">AI creates your slides.</div>
    </div>
    <!-- more steps + connectors as needed -->
</div>
```

```css
.step-flow      { display: flex; align-items: flex-start; max-width: 1600px; margin: 0 auto; }
.step           { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; }
.step-circle    { width: 64px; height: 64px; border-radius: 50%; background: var(--text-primary); color: var(--bg-primary); font-family: 'DM Serif Display', serif; font-size: 24px; font-weight: 400; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step-connector { flex: 0 0 32px; height: 1px; background: var(--border); margin-top: 32px; align-self: flex-start; }
.step-title     { font-family: 'DM Serif Display', serif; font-size: 20px; }
.step-desc      { font-size: 16px; color: var(--text-secondary); line-height: 1.6; max-width: 200px; }
```

Circles are solid fill — no gradient, no glow, no shadow.

<!-- @component:step-flow:end -->

<!-- @component:evidence-list:start -->
#### Evidence List (.evidence-list)

Styled bullet list with em-dash markers. Use inside `.card`, `.two-col-main`, or any container.

```html
<ul class="evidence-list">
    <li>First piece of evidence or supporting point</li>
    <li>Second supporting point</li>
</ul>
```

```css
.evidence-list    { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.evidence-list li { padding-left: 18px; position: relative; font-size: 18px; color: var(--text-primary); line-height: 1.5; }
.evidence-list li::before { content: '\2014'; position: absolute; left: 0; top: 0; color: var(--border-strong); font-family: 'DM Serif Display', serif; }
```

<!-- @component:evidence-list:end -->

<!-- @component:chart-container:start -->
#### Chart Container (.chart-container)

Wrapper for any ECharts visualization. Can appear on any slide, in any layout.
See §Data Visualization for chart type selection and theme-specific styling.

```html
<div class="chart-container" id="chart-{purpose}"
     style="width:{w}px; height:{h}px"></div>
```

```css
.chart-container { position: relative; flex-shrink: 0; }
```

Common sizing by context:
- Inside a column (`.two-col-main`, `.two-col-aside`): `width:100%; height:320–400px`
- Full-width standalone: `max-width:1400px; height:500px; margin:0 auto`
- Inside a `.card` (sparkline/mini): `width:100%; height:140–200px`
- Below a stats row: `max-width:1200px; height:300px; margin:24px auto 0`

JS init pattern (inside `window.addEventListener('load', ...)`):
```javascript
if (typeof echarts !== 'undefined') {
    const el = document.getElementById('chart-{purpose}');
    if (el) {
        const chart = echarts.init(el, null, { renderer: 'canvas' });
        chart.setOption({ /* see §Data Visualization for theme options */ });
    }
}
```

<!-- @component:chart-container:end -->

<!-- @component:text-helpers:start -->
#### Text Helpers

```css
h1             { font-family: 'DM Serif Display', serif; font-size: 64px; font-weight: 400; line-height: 1.15; letter-spacing: -0.02em; }
h2             { font-family: 'DM Serif Display', serif; font-size: 42px; font-weight: 400; line-height: 1.2; letter-spacing: -0.01em; }
.label         { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); font-weight: 400; }
.subtitle      { font-size: 22px; color: var(--text-secondary); font-weight: 300; line-height: 1.6; }
.body-text     { font-size: 18px; color: var(--text-secondary); line-height: 1.75; }
```

Use `<em>` (italic) on the single most important phrase in a heading — never bold,
never color, never gradient. Max one emphasized phrase per slide.

<!-- @component:text-helpers:end -->

<!-- @component:dividers:start -->
#### Dividers and Rules

```css
.divider       { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.divider-wide  { border: none; border-top: 1px solid var(--border); width: 300px; }
.heading-rule  { border: none; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
```

- `.divider` (full-width, `1px`): structural — separate heading from content
- `.divider-wide` (`300px`): decorative anchor — bottom of sparse slides
- `.heading-rule` (border-bottom on heading): separate title from body on content slides
- Never use gradient lines, colored borders, or thick rules

<!-- @component:dividers:end -->

<!-- @component:icons:start -->
#### Icons (Lucide)

Load via CDN: `<script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>`
Use `<i data-lucide="icon-name" class="card-icon"></i>` and call `lucide.createIcons()` in JS.

- Icons are **optional** in this theme — typography and whitespace provide the hierarchy
- Icon color: `var(--accent-2)` (warm grey), size: `1.75rem`, hover: `scale(1.05)`
- When used, pick simple stroke-style icons: `circle-dashed` → restraint, `eye` → clarity,
  `text` → typography, `book-open` → research, `target` → precision
- Cards may include icons, but omitting them often feels more "minimal"
- Stats, quotes, step flow: never add icons

<!-- @component:icons:end -->

<!-- @component:deco-fills:start -->
#### Decorative Fills (.deco-circle, .deco-rule)

Positioned-absolute background elements behind content.

```css
.deco-circle { position: absolute; border-radius: 50%; pointer-events: none; z-index: 0; }
.deco-rule   { position: absolute; pointer-events: none; z-index: 0; }

/* Ensure content stacks above decorative fills */
.slide-canvas > *:not(.deco-circle):not(.deco-rule):not(.quote-deco) { position: relative; z-index: 1; }
```

Set size, color, opacity, and position via inline styles:
- Typical `.deco-circle`: `width:200–400px; height:same; background:rgba(255,179,71,0.04–0.06); filter:blur(30–40px)`
- Typical `.deco-rule`: `width:120–200px; height:1px; background:linear-gradient(90deg, transparent, var(--border-strong), transparent); opacity:0.3–0.5`
- Sparse slides (cover, quote, closing): 2–3 deco elements
- Dense slides (grids, multi-column): 0 deco elements — content is the fill
- Never exceed 3 per slide

<!-- @component:deco-fills:end -->

<!-- @section:components:end -->

<!-- @section:layouts:start -->
### Layout Primitives

Components can be placed in any of these layout arrangements.
Mix layouts and components freely — these are tools, not templates.

#### Centered Stack

`.slide-canvas` default behavior — `flex-direction: column; justify-content: center`.
Use for: cover, closing, quote-focused, single-statement slides.

#### Top-Aligned Stack

Override `.slide-canvas` with `style="justify-content: flex-start; padding-top: 80px"`.
Use for: content-heavy slides where vertical space matters.

#### Two-Column Grid (.two-col)

```html
<div class="two-col">
    <div class="two-col-main"><!-- primary content --></div>
    <div class="two-col-aside"><!-- secondary content --></div>
</div>
```

```css
.two-col       { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: stretch; max-width: 1600px; margin: 0 auto; flex: 1; }
.two-col-main  { display: flex; flex-direction: column; justify-content: center; }
.two-col-main h2 { font-size: 36px; margin-bottom: 16px; }
.two-col-main p  { font-size: 18px; color: var(--text-secondary); line-height: 1.75; }
.two-col-aside { display: flex; flex-direction: column; justify-content: center; }
.two-col-aside .card { flex: 1; }
```

Either side can contain any components — cards, charts, text, evidence lists, stat cards.

#### Three-Column Grid

```css
.card-grid  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1600px; margin: 0 auto; flex: 1; align-content: stretch; }
.stats-row  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; max-width: 1600px; margin: 0 auto; }
```

Use `.card-grid` for cards, `.stats-row` for stat cards, or create a custom grid.
For 2 items: `repeat(2, 1fr)`. For 4: `repeat(2, 1fr)` (2×2 grid).
The grid container can hold any mix of components.

#### Horizontal Flow

Used by `.step-flow` — `display: flex; align-items: flex-start; max-width: 1600px`.
Also works for timelines, comparison strips, or any horizontal sequence.

<!-- @section:layouts:end -->

<!-- @section:charts:start -->
### Data Visualization (ECharts)

When a slide includes charts or data visualization, use [ECharts](https://echarts.apache.org/)
loaded via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
```

#### Chart Type Selection

Choose the chart type based on the data, not by habit. Different data patterns
demand different visualizations:

| Data Pattern | Chart Type | Common Placements |
|---|---|---|
| Proportions / composition (parts of a whole) | Pie / Donut | Any layout — pair with narrative or standalone |
| Trends over time (growth, decline, cycles) | Line or Area | Full-width for detail, two-col for trend + commentary |
| Category comparisons (A vs B vs C) | Vertical Bar | Full-width or two-col |
| Rankings / sorted magnitudes | Horizontal Bar | Full-width (labels need room) |
| Distribution / histogram | Vertical Bar (binned) | Full-width |
| KPIs with sparkline context | Stats Row + small Line chart below | Custom composite |

Layout is not fixed — pick the layout that serves the narrative. A chart can
occupy one column of Two-Column, span full-width on its own slide, or sit
inside a Feature Card as a small sparkline. Let the data and story decide.

#### Shared monochrome chart styles

All chart types share these minimal theme defaults:

- **Color palette**: `['#1A1916', '#6B6560', '#C9C4B8']` (monochrome warm — ink, mid-grey, border).
  For >3 series, extend with `#A09890` (muted) and `#D5D0C8` (light warm).
- **Background**: `'transparent'`
- **Axis labels / legend text**: `var(--text-muted)` (`#A09890`), `14px` DM Sans font
- **Grid lines**: `var(--border)` (`#C9C4B8`) at 30% opacity — barely visible
- **Animation**: `false` or very subtle fade-in only (consistent with minimal's stillness)
- **Tooltip**: light background (`var(--bg-card)`), `var(--text-primary)` text, thin `var(--border)` border

#### Pie / Donut

- Inner radius `55-65%` for donut; `0` for full pie
- `borderRadius: 6`, `borderColor: var(--bg-primary)`, `borderWidth: 3` for segment gaps
- Center label: large text in `var(--text-primary)`, DM Serif Display font
- Legend: bottom-aligned, `itemWidth: 12`, `itemGap: 20`
- Container: `280–360px` square is typical

#### Bar (vertical & horizontal)

- No rounded caps — flat bar ends for a cleaner, more structural look
- Bar width: `40-60%` of category gap — never touch adjacent bars
- Solid fills only — no gradient fills (gradients break the monochrome discipline)
- For ≤5 categories: one shade per bar from monochrome warm. For single-series: solid `var(--text-primary)`
- Axis line: `1px` `var(--border)`. Tick marks: hidden

#### Line / Area

- Line width: `1.5-2px`, smooth curves (`smooth: true`) — thinner than aurora to feel quieter
- No glow or shadow effects
- Area fill: solid color at 6-10% opacity — no gradients
- Data points: show on hover only (`symbol: 'none'`, `emphasis: { symbol: 'circle' }`)
- For multiple series: distinguish with solid vs dashed lines, all within monochrome warm palette

#### Integration rules

- Initialize charts inside a `window.addEventListener('load', ...)` or after DOM ready
- Use `echarts.init(container, null, { renderer: 'canvas' })` — canvas renderer for performance
- Charts must use the monochrome warm palette — never default ECharts colors or colored accents
- Responsive: charts are inside the 1920×1080 canvas, scaled by JS `transform: scale()` —
  no need for ECharts `resize()` handling

<!-- @section:charts:end -->

<!-- @section:guide:start -->
### Composition Guide

#### Common Recipes

These are starting points — not constraints. Combine any components with any
layout primitive as the content demands.

| Content Pattern | Suggested Recipe | Minimal Notes |
|---|---|---|
| 3–4 parallel features | 3-col grid + card ×3 | Number labels (`01`, `02`). Icon optional. |
| Key metrics (2–4 KPIs) | 3-col grid + stat-card ×3 | Static numbers, no counter animation. DM Serif Display. |
| Narrative + evidence | two-col + serif heading in main, frosted card with evidence-list in aside | Em-dash bullets |
| Sequential process (3–5 steps) | horizontal flow + step-flow | Filled dark circles, `1px` connectors. Quiet. |
| Memorable quote | centered stack + quote-block + quote-deco | DM Serif Display italic, `border-left: 2px`. |
| Single powerful statement | centered stack + large italic heading + deco fills | `<em>` on key phrase. No gradient-text. |
| Data visualization | any layout + chart-container | Chart type per data — see §Data Visualization. Monochrome warm. |
| KPIs with trend context | 3-col grid + stat-cards, then chart below | Static numbers + supporting chart |
| Team / people (3–4) | 3-col grid + card ×3 (no icons) | card-title → name (serif), card-body → role |
| Before vs After | two-col + content per side | Serif heading + em-dash evidence-list each column |
| 6+ items on one topic | Split across 2 slides | Max 4 items per slide (stricter than other themes) |

#### Element Usage Rules

**Emphasis (`<em>`):** Use italic on the single most important phrase in a heading —
never bold, never color, never gradient. Typical: core concept (`clear presentation`),
key insight (`nothing left to take away`). Max one per slide.

**Dividers:** `.divider` (full-width) for structural separation. `.divider-wide` (`300px`)
as decorative anchor at bottom of sparse slides. `.heading-rule` on content slide headings.
Never gradient lines, colored borders, or thick rules.

**Icons (Lucide):** Optional. Typography and whitespace provide the hierarchy.
When used: simple stroke-style in `var(--accent-2)`. Cards may include icons,
but omitting often feels more "minimal." Stats, quotes, step flow: never add icons.

**Card labels:** Sequential numbers (`01`, `02`, `03`) preferred — orderly and typographic.
Short category words acceptable when items are unordered. Omit when the title is clear.

**Decorative fills:** Sparse slides: 2–3 deco elements (warm-amber circles, thin rules).
Dense slides: 0 — content is the fill. Never exceed 3 per slide.

#### Common Mistakes

- Using colored accents, gradients, or glows → stay monochrome warm.
- Adding icons to every card when the heading is already clear → less is more.
- Using counter animations on numbers → minimal uses static numbers with fade-in.
- Using more than 4 items per slide → split across slides.
- Adding decorative fills to dense content slides → content is the fill.
- Always using donut charts for data → match chart type to data pattern (see §Data Visualization).
- Leaving more than ~20% of canvas visually empty → expand content or add thin rules.

### Code Blocks (if any)

```css
pre, code {
    background: #F0EEE8;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: 'DM Mono', 'Söhne Mono', ui-monospace, monospace;
    font-size: 14px;
    color: var(--text-primary);
}
```

### Do & Don't

- **Do** use light backgrounds throughout — never dark
- **Do** let the subtle geometric shapes add depth without overwhelming
- **Do** use serif headings (`DM Serif Display`) contrasted with sans-serif body (`DM Sans`)
- **Do** keep the accent monochrome — no colored accents
- **Do** use frosted-glass cards with `backdrop-filter: blur(16px)` and `rgba(255,255,255,0.55)` background
- **Do** use minimal animations — this theme values stillness
- **Don't** use gradients, glows, or colored borders
- **Don't** add too many geometric shapes — 2-3 is enough
- **Don't** use more than 4 bullet points per slide

<!-- @section:guide:end -->
