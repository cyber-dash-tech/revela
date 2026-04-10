---
name: editorial-ribbon
description: High-contrast editorial light theme — condensed typography, vivid orange/mint ribbons, crisp print-like layouts
author: OpenAI
version: 1.0.0
preview: bundled
---

## Visual Style — Editorial Ribbon Theme

<!-- @section:global:start -->

Apply this visual style when generating all slides in this session.

This theme keeps the existing component system and layout logic intact, but changes the art direction to an editorial annual-report look inspired by the reference: bold condensed headlines, clean off-white content pages, sharp black separators, and large diagonal ribbon shapes in saturated orange, mint, blush, and soft aqua. The result should feel like a design-forward impact report rather than a software deck.

### Core Principle

Do **not** change component layout, HTML structure, slide architecture, spacing system, or JS behavior. Only restyle surfaces, typography, color, decoration, chart treatment, and visual hierarchy.

### Color Palette

```css
:root {
    --bg-primary:     #F3F1ED;   /* soft editorial paper */
    --bg-secondary:   #E8E5DF;   /* light warm grey */
    --bg-card:        rgba(255, 255, 255, 0.72); /* translucent paper card */
    --bg-card-solid:  #F7F5F1;   /* solid card fill when translucency is not desired */

    --text-primary:   #111111;   /* near-black ink */
    --text-secondary: #434343;   /* dark neutral grey */
    --text-muted:     #7A7872;   /* muted editorial caption */

    --accent:         #F45A2A;   /* ustwo-like orange */
    --accent-2:       #87D8B8;   /* mint ribbon */
    --accent-3:       #CFE8DB;   /* pale mint */
    --accent-4:       #F3B7D9;   /* pink/lilac accent */
    --accent-5:       #D9E6F6;   /* pale blue support */

    --border:         rgba(17, 17, 17, 0.12);
    --border-strong:  rgba(17, 17, 17, 0.32);
    --shadow-soft:    0 8px 30px rgba(0, 0, 0, 0.06);
    --shadow-strong:  0 18px 50px rgba(0, 0, 0, 0.10);
}
```

### Typography

- **Display font**: `Oswald` — for all major headings, section titles, stat labels that need the compressed editorial feel.
- **Body font**: `Inter` — for paragraph text, labels, captions, lists, and UI.
- Font link tag:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Oswald:wght@300;400;500;600&display=swap" rel="stylesheet">
  ```
- Title size (h1): `92px`, weight 500, uppercase by default
- Section heading (h2): `58px`, weight 500, uppercase by default
- Subtitle size: `22px`, weight 400
- Body size: `18px`
- Label: `13px`, letter-spacing `0.12em`, uppercase
- Card title: `28px` (`Oswald`)
- Card body: `17px`
- Stat number: `72px`, weight 500
- Stat label: `15px`, uppercase
- Line height: `1.6` for body, `0.96` for h1, `1.0` for h2
- Letter spacing: `-0.02em` for large headings

All sizes are fixed `px` for the 1920×1080 canvas. Do not use `clamp()` or viewport-relative units.

### Background Layers

This theme uses clean paper backgrounds on most slides, and stronger graphic treatment on cover or section-divider slides.

**Layer 1 — Editorial paper base:**
```css
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
        linear-gradient(180deg, #F4F1EC 0%, #F0ECE6 100%);
    z-index: -4;
}
```

**Layer 2 — Faint print grain:**
```css
body::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
        radial-gradient(rgba(0,0,0,0.025) 0.6px, transparent 0.6px);
    background-size: 10px 10px;
    opacity: 0.20;
    z-index: -3;
    pointer-events: none;
}
```

**Layer 3 — Ribbon / panel shapes:**
```css
.geo-shape-1, .geo-shape-2, .geo-shape-3 {
    position: fixed;
    pointer-events: none;
    z-index: -2;
    opacity: 0.95;
}
.geo-shape-1 {
    width: 1200px;
    height: 1200px;
    right: -320px;
    top: -220px;
    background: linear-gradient(135deg, var(--accent-2) 0%, var(--accent-3) 100%);
    clip-path: polygon(32% 0, 100% 0, 100% 100%, 60% 100%, 16% 48%);
}
.geo-shape-2 {
    width: 960px;
    height: 960px;
    left: -200px;
    top: -120px;
    background: linear-gradient(135deg, #D93C09 0%, var(--accent) 55%, #F86D3E 100%);
    clip-path: polygon(0 0, 78% 0, 42% 100%, 0 100%);
}
.geo-shape-3 {
    width: 760px;
    height: 760px;
    right: 280px;
    top: 160px;
    background: radial-gradient(circle at 30% 60%, rgba(32,180,126,0.95) 0%, rgba(135,216,184,0.82) 35%, rgba(135,216,184,0) 72%);
    filter: blur(24px);
    border-radius: 40% 60% 52% 48% / 58% 38% 62% 42%;
    opacity: 0.75;
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
  1920×1080 canvas area. The editorial feel comes from bold typography and
  controlled whitespace, not from leaving the canvas half-empty.
  - **Content slides**: feel like clean report pages on soft paper. Grid/flex
    containers should stretch toward the canvas edges. Cards should have ample
    internal padding and body text so they feel substantial.
  - **Cover and section-divider slides**: feel graphic and poster-like. Use
    oversized condensed headlines, vivid ribbon shapes, and strong asymmetrical
    compositions. Add decorative fills — diagonal ribbon blocks, gradient rules,
    or large typographic ornaments.
  - **Never** leave more than ~20% of the canvas visually empty on any slide.
- Title slide: large condensed uppercase heading + graphic ribbon decoration
- Content slides: heading top with rule separator, content below in clean editorial blocks

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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Oswald:wght@300;400;500;600&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>
    <!-- <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>  ← only if charts needed -->
    <style>/* all CSS here */</style>
</head>
<body>
    <!-- Geometric ribbon shapes -->
    <div class="geo-shape-1"></div>
    <div class="geo-shape-2"></div>
    <div class="geo-shape-3"></div>

    <!-- Navigation -->
    <div class="progress-bar" id="progressBar"></div>
    <nav class="nav-dots" id="navDots" aria-label="Slide navigation"></nav>

    <!-- Slides -->
    <section class="slide title-slide" data-index="0">
        <div class="slide-canvas"> ... </div>
    </section>
    <section class="slide" data-index="1">
        <div class="slide-canvas"> ... </div>
    </section>
    <!-- more slides, each with data-index -->

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
    font-family: 'Inter', ui-sans-serif, sans-serif;
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
    background: transparent;
}

.slide-canvas {
    width: 1920px;
    height: 1080px;
    flex-shrink: 0;
    transform-origin: center center;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px 80px;
}

/* Default content-slide treatment: editorial page */
.slide:not(.title-slide) .slide-canvas {
    background: linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.14) 100%);
}

/* Cover slide gets graphic treatment */
.title-slide .slide-canvas {
    background: #0D0D0D;
}
```

### Navigation & Progress

```css
.progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%);
    width: 0%;
    z-index: 100;
    transition: width 0.2s ease;
}

.nav-dots {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 9px;
    z-index: 100;
}
.nav-dots button {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(17,17,17,0.35);
    background: rgba(255,255,255,0.45);
    cursor: pointer;
    padding: 0;
    transition: transform 0.2s ease, background 0.2s ease;
}
.nav-dots button.active {
    background: var(--accent);
    border-color: var(--accent);
    transform: scale(1.1);
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
    .reveal {
        transition: opacity 0.3s ease;
        opacity: 1;
    }
}
```

### SlidePresentation Class (Complete JavaScript)

Keep the original `SlidePresentation` class unchanged.

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

    setupTouchNav() {
        let startY = 0;
        document.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
        document.addEventListener('touchend', e => {
            const dy = startY - e.changedTouches[0].clientY;
            if (Math.abs(dy) > 40) this.goTo(this.currentSlide + (dy > 0 ? 1 : -1));
        }, { passive: true });
    }

    setupMouseWheel() {
        let last = 0;
        document.addEventListener('wheel', e => {
            const now = Date.now();
            if (now - last < 800) return;
            last = now;
            this.goTo(this.currentSlide + (e.deltaY > 0 ? 1 : -1));
        }, { passive: true });
    }

    goTo(idx) {
        const clamped = Math.max(0, Math.min(this.slides.length - 1, idx));
        this.slides[clamped].scrollIntoView({ behavior: 'smooth' });
        this.currentSlide = clamped;
    }
}

new SlidePresentation();
```

After the class, still include:
1. `lucide.createIcons();` if icons are used
2. ECharts initialization if charts are present
3. Inline editing code

<!-- @section:global:end -->

### Component Library

All component layout and HTML structure remain unchanged. Only art direction changes.

<!-- @section:components:start -->

<!-- @component:reveal:start -->
#### Reveal Animation (.reveal)

Keep the same behavior, but make the fade slightly snappier.

```css
.reveal {
    opacity: 0;
    transition: opacity 0.32s ease;
}
.reveal.visible {
    opacity: 1;
}
.reveal:nth-child(1) { transition-delay: 0s; }
.reveal:nth-child(2) { transition-delay: 0.05s; }
.reveal:nth-child(3) { transition-delay: 0.10s; }
.reveal:nth-child(4) { transition-delay: 0.15s; }
.reveal:nth-child(5) { transition-delay: 0.20s; }
.reveal:nth-child(6) { transition-delay: 0.25s; }
.reveal:nth-child(7) { transition-delay: 0.30s; }
.reveal:nth-child(8) { transition-delay: 0.35s; }
```

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
    border: 1px solid rgba(17, 17, 17, 0.10);
    background: rgba(255, 255, 255, 0.42);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
}
.title-slide .showcase {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.12);
}
```

<!-- @component:showcase:end -->

<!-- @component:card:start -->
#### Card (.card)

Cards should feel like editorial blocks placed on paper, not glassmorphism widgets.

```html
<div class="card">
    <i data-lucide="circle-dashed" class="card-icon"></i>
    <p class="card-label">01</p>
    <p class="card-title">Title</p>
    <p class="card-body">Body text describing the item.</p>
</div>
```

```css
.card {
    background: linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(250,248,244,0.92) 100%);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(17,17,17,0.10);
    border-radius: 0;
    padding: 30px;
    box-shadow: var(--shadow-soft);
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    transition: transform 0.22s ease, box-shadow 0.22s ease;
    position: relative;
    overflow: hidden;
}
.card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 8px;
    height: 100%;
    background: linear-gradient(180deg, var(--accent) 0%, var(--accent-2) 100%);
    opacity: 0.92;
}
.card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-strong);
}
.card-icon  {
    width: 26px;
    height: 26px;
    color: var(--accent);
    margin-bottom: 14px;
    transition: transform 0.2s ease;
}
.card:hover .card-icon { transform: scale(1.05); }
.card-label {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 10px;
    padding-left: 0;
}
.card-title {
    font-family: 'Oswald', sans-serif;
    font-size: 28px;
    line-height: 1.0;
    text-transform: uppercase;
    letter-spacing: -0.01em;
    margin-bottom: 14px;
}
.card-body {
    font-size: 17px;
    color: var(--text-secondary);
    line-height: 1.65;
    flex: 1;
}
```

<!-- @component:card:end -->

<!-- @component:image-card:start -->
#### Image Card (.image-card)

```css
.image-card {
    border-radius: 0;
    overflow: hidden;
    border: 1px solid rgba(17,17,17,0.10);
    box-shadow: var(--shadow-soft);
    background: #FFFFFF;
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
    background: #FBF9F5;
    border-top: 1px solid rgba(17,17,17,0.08);
    font-family: 'Inter', sans-serif;
}
```

<!-- @component:image-card:end -->

<!-- @component:card-img:start -->
#### Card with Image Header (.card-img)

```css
.card-img {
    padding: 0;
    overflow: hidden;
}
.card-img-top {
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    position: relative;
}
.card-img-top::after {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 8px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%);
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
    padding-left: 30px;
    padding-right: 30px;
}
.card-img .card-title { padding-top: 22px; }
.card-img .card-body  { padding-bottom: 30px; }
```

<!-- @component:card-img:end -->

<!-- @component:avatar:start -->
#### Avatar (.avatar)

```css
.avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #FFFFFF;
    box-shadow: 0 0 0 1px rgba(17,17,17,0.12);
    flex-shrink: 0;
}
.avatar-sm { width: 48px; height: 48px; }
.avatar-lg { width: 96px; height: 96px; }
```

<!-- @component:avatar:end -->

<!-- @component:stat-card:start -->
#### Stat Card (.stat-card)

Stat cards should feel graphic and report-like.

```css
.stat-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(249,246,241,0.96) 100%);
    border: 1px solid rgba(17,17,17,0.10);
    border-radius: 0;
    padding: 48px 40px;
    text-align: center;
    box-shadow: var(--shadow-soft);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
.stat-card::before {
    content: '';
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    height: 6px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent-4) 52%, var(--accent-2) 100%);
}
.stat-number {
    font-family: 'Oswald', sans-serif;
    font-size: 72px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 0.95;
    letter-spacing: -0.03em;
    margin-bottom: 12px;
}
.stat-label {
    font-size: 15px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 12px;
}
.stat-desc {
    font-size: 15px;
    color: var(--text-secondary);
    line-height: 1.5;
}
```

<!-- @component:stat-card:end -->

<!-- @component:quote-block:start -->
#### Quote Block (.quote-block)

```css
.quote-block {
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-left: 8px solid var(--accent);
    padding-left: 32px;
    max-width: 1200px;
}
.quote-block blockquote {
    font-family: 'Oswald', sans-serif;
    font-size: 52px;
    font-weight: 400;
    text-transform: uppercase;
    line-height: 1.02;
    letter-spacing: -0.02em;
    margin-bottom: 18px;
}
.quote-block cite {
    font-size: 14px;
    color: var(--text-muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-style: normal;
    font-family: 'Inter', sans-serif;
}
.quote-deco {
    position: absolute;
    font-family: 'Oswald', sans-serif;
    font-size: 320px;
    line-height: 0.8;
    color: rgba(244,90,42,0.10);
    pointer-events: none;
    z-index: 0;
}
```

<!-- @component:quote-block:end -->

<!-- @component:step-flow:start -->
#### Step Flow (.step-flow)

```css
.step-flow      { display: flex; align-items: flex-start; max-width: 1600px; margin: 0 auto; }
.step           { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; }
.step-circle    {
    width: 66px;
    height: 66px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent) 0%, #E24216 100%);
    color: #FFFFFF;
    font-family: 'Oswald', sans-serif;
    font-size: 26px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 8px 18px rgba(244, 90, 42, 0.22);
}
.step-connector {
    flex: 0 0 32px;
    height: 4px;
    background: linear-gradient(90deg, var(--accent-4) 0%, var(--accent-2) 100%);
    margin-top: 31px;
    align-self: flex-start;
}
.step-title {
    font-family: 'Oswald', sans-serif;
    font-size: 22px;
    line-height: 1.0;
    text-transform: uppercase;
}
.step-desc {
    font-size: 16px;
    color: var(--text-secondary);
    line-height: 1.55;
    max-width: 220px;
}
```

<!-- @component:step-flow:end -->

<!-- @component:evidence-list:start -->
#### Evidence List (.evidence-list)

```css
.evidence-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.evidence-list li {
    padding-left: 20px;
    position: relative;
    font-size: 18px;
    color: var(--text-primary);
    line-height: 1.5;
}
.evidence-list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 11px;
    width: 10px;
    height: 3px;
    background: var(--accent);
}
```

<!-- @component:evidence-list:end -->

<!-- @component:chart-container:start -->
#### Chart Container (.chart-container)

```css
.chart-container { position: relative; flex-shrink: 0; }
```

<!-- @component:chart-container:end -->

<!-- @component:text-helpers:start -->
### Text Helpers

```css
h1 {
    font-family: 'Oswald', sans-serif;
    font-size: 92px;
    font-weight: 500;
    line-height: 0.96;
    letter-spacing: -0.02em;
    text-transform: uppercase;
}
h2 {
    font-family: 'Oswald', sans-serif;
    font-size: 58px;
    font-weight: 500;
    line-height: 1.0;
    letter-spacing: -0.02em;
    text-transform: uppercase;
}
.label {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-weight: 500;
}
.subtitle {
    font-size: 22px;
    color: var(--text-secondary);
    font-weight: 400;
    line-height: 1.55;
}
.body-text {
    font-size: 18px;
    color: var(--text-secondary);
    line-height: 1.68;
}
```

Rules for text:
- Headings should default to uppercase.
- Major titles should be tall, condensed, and vertically stacked when useful.
- Use strong alignment and line breaks to create poster-like impact.
- Avoid serif typography entirely in this theme.

<!-- @component:text-helpers:end -->

<!-- @component:dividers:start -->
### Dividers and Rules

```css
.divider {
    border: none;
    border-top: 1px solid rgba(17,17,17,0.16);
    margin: 24px 0;
}
.divider-wide {
    border: none;
    border-top: 4px solid var(--accent);
    width: 260px;
}
.heading-rule {
    border: none;
    border-bottom: 2px solid rgba(17,17,17,0.14);
    padding-bottom: 18px;
    margin-bottom: 26px;
}
```

Use thicker graphic rules on sparse slides and lighter rules on content slides.

<!-- @component:dividers:end -->

<!-- @component:icons:start -->
### Icons (Lucide)

Icons remain optional.

- Default icon color: `var(--accent)`
- Keep stroke icons simple and editorial
- Good choices: `arrow-up-right`, `circle`, `sparkles`, `target`, `book-open`, `activity`
- Do not overuse icons; typography should still dominate

<!-- @component:icons:end -->

<!-- @component:deco-fills:start -->
### Decorative Fills (.deco-circle, .deco-rule)

Decorative fills should echo the ribbon language from the reference image.

```css
.deco-circle { position: absolute; border-radius: 50%; pointer-events: none; z-index: 0; }
.deco-rule   { position: absolute; pointer-events: none; z-index: 0; }
.slide-canvas > *:not(.deco-circle):not(.deco-rule):not(.quote-deco) { position: relative; z-index: 1; }
```

Recommended usage:
- On title slides: use 2–3 oversized diagonal blocks or soft ribbon glows.
- On content slides: use at most one subtle blush, mint, or pale-blue block tucked into a corner.
- Section title slides may use vivid orange, mint, and pink gradients.

Suggested styles:
- `.deco-circle`: `background: radial-gradient(circle, rgba(244,90,42,0.30) 0%, rgba(244,90,42,0) 72%)`
- `.deco-rule`: `height: 6px; background: linear-gradient(90deg, var(--accent), var(--accent-2))`

<!-- @component:deco-fills:end -->

<!-- @section:components:end -->

<!-- @section:layouts:start -->

### Layout Primitives

All layout primitives remain unchanged.

#### Centered Stack

Use for cover, quote, closing, and section-divider slides. Same structure as original.

#### Top-Aligned Stack

Use for content-heavy report slides. Same structure as original.

#### Two-Column Grid (.two-col)

Keep exactly the same layout definition:

```css
.two-col       { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: stretch; max-width: 1600px; margin: 0 auto; flex: 1; }
.two-col-main  { display: flex; flex-direction: column; justify-content: center; }
.two-col-main h2 { font-size: 52px; margin-bottom: 16px; }
.two-col-main p  { font-size: 18px; color: var(--text-secondary); line-height: 1.68; }
.two-col-aside { display: flex; flex-direction: column; justify-content: center; }
.two-col-aside .card { flex: 1; }
```

#### Three-Column Grid

Keep same structure; only art changes.

```css
.card-grid  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1600px; margin: 0 auto; flex: 1; align-content: stretch; }
.stats-row  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; max-width: 1600px; margin: 0 auto; }
```

#### Horizontal Flow

Keep same structure.

<!-- @section:layouts:end -->

<!-- @section:charts:start -->

### Data Visualization (ECharts)

Charts must adopt the same editorial report look.

#### Shared chart styles

- **Color palette**: `['#F45A2A', '#82DCC2', '#F3B7D9', '#D6E4F5', '#111111']`
- **Background**: `'transparent'`
- **Axis labels / legend text**: `#5D5B56`, `14px`, `Inter`
- **Grid lines**: `rgba(17,17,17,0.10)`
- **Tooltip**: warm white background with thin dark border
- **Animation**: subtle fade only; no bouncy motion

#### Pie / Donut

- Donuts are encouraged for impact-score slides
- Use thin rings and generous whitespace
- Center labels should use `Oswald`
- Segment colors should prioritize orange, mint, pink, then pale blue
- Ring backgrounds should be very light neutral grey

#### Bar Charts

- Use flat fills, not gradients, unless the chart is on a cover or divider slide
- Prefer horizontal bars for rankings
- Use orange for primary series and mint/pink for secondary series
- Avoid rounded corners larger than `3px`

#### Line / Area Charts

- Line width: `2.5px`
- Use smooth curves only when it improves readability
- Area fills may use 8–14% opacity in mint, orange, or pink
- No glow effects

<!-- @section:charts:end -->

<!-- @section:guide:start -->

### Composition Guide

#### Overall Visual Behavior

- Cover slides: bold, graphic, asymmetrical, high color contrast
- Section slides: can use saturated ribbons and oversized typography
- Standard content slides: mostly pale paper backgrounds with one focal graphic accent
- Dense content slides: let typography and charts carry the slide; use minimal decoration

#### Common Recipes

| Content Pattern | Suggested Recipe | Editorial Ribbon Notes |
|---|---|---|
| 3–4 parallel features | 3-col grid + card ×3 | Use colored left-edge accents in cards |
| Key metrics | 3-col grid + stat-card ×3 | Large Oswald numerals, colored top bars |
| Narrative + evidence | two-col + large condensed title + card | Clean annual-report feel |
| Sequential process | horizontal flow + step-flow | Graphic circles and thicker gradient connectors |
| Memorable quote | centered stack + quote-block | Poster-like uppercase quote |
| Data-heavy insight | two-col or full-width chart | Keep backgrounds quiet |
| Section divider | centered stack + huge heading + ribbon background | Strong graphic page |

#### Element Usage Rules

- Typography should do most of the work.
- Use uppercase headlines generously.
- Use vivid accent color sparingly but deliberately.
- Keep content slides mostly light; do not flood every slide with strong orange/mint ribbons.
- Preserve the original spacing, grid logic, and component placement.

#### Common Mistakes

- Making every slide look like the cover
- Adding too many gradients inside content cards
- Using soft startup-style UI treatment instead of print-editorial sharpness
- Switching layout structure to imitate the reference — do not do this
- Over-rounding corners — keep corners mostly square
- Returning to monochrome minimalism — this theme needs controlled color

### Code Blocks (if any)

```css
pre, code {
    background: #F7F3EE;
    border: 1px solid rgba(17,17,17,0.10);
    border-radius: 0;
    font-family: 'SFMono-Regular', 'Menlo', ui-monospace, monospace;
    font-size: 14px;
    color: var(--text-primary);
}
```

### Do & Don't

- **Do** keep the original component and layout system intact
- **Do** use condensed editorial typography
- **Do** use pale paper backgrounds for most content slides
- **Do** use vivid orange/mint/pink accents for covers, dividers, and data highlights
- **Do** create strong poster-like hierarchy with line breaks and uppercase text
- **Do** use flat or lightly translucent cards with square edges
- **Don't** use serif fonts
- **Don't** use heavy glassmorphism
- **Don't** use neon or tech-blue UI styling
- **Don't** alter layout primitives or component HTML
- **Don't** make every slide dark; only covers/section dividers may be dark or heavily graphic

<!-- @section:guide:end -->
