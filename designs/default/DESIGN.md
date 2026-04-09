---
name: default
description: Clean modern dark theme — works for any topic
author: slides-it
version: 1.0.0
preview: https://raw.githubusercontent.com/slides-it/slides-it/main/slides_it/designs/default/preview.png
---

## Visual Style — Aurora Theme

Apply this visual style when generating all slides in this session.

### Color Palette

```css
:root {
    --bg-primary:    #030712;      /* deep night sky */
    --bg-secondary:  #0f172a;      /* slightly lighter */
    --bg-card:       rgba(30, 41, 59, 0.6);  /* translucent card */
    --text-primary:  #f8fafc;
    --text-secondary:#94a3b8;
    --accent:        #22d3ee;       /* cyan aurora */
    --accent-2:      #a78bfa;      /* violet aurora */
    --accent-3:      #34d399;      /* emerald highlight */
    --border:        rgba(34, 211, 238, 0.15);
    --glow:          rgba(34, 211, 238, 0.25);
}
```

### Typography

- **Display font**: `Clash Display` (headings) — load from Fontshare
- **Body font**: `Satoshi` (body, captions) — load from Fontshare
- Font link tag:
  ```html
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500&display=swap">
  ```
- Title size (h1): `80px`, weight 700
- Section heading (h2): `38px`, weight 600
- Subtitle size: `24px`
- Body size: `18px`
- Label: `13px`, letter-spacing `0.12em`, uppercase
- Card title: `22px`, weight 600
- Card body: `17px`
- Stat number: `64px`, weight 700
- Stat label: `15px`, uppercase
- Text shadow on titles: `0 0 40px rgba(34, 211, 238, 0.3)` (subtle glow)
- Line-height: `1.1` (h1), `1.2` (h2), `1.6` (subtitle, body-text), `1.7` (card-body, evidence-list)
- Letter-spacing: `-0.02em` (h1), `-0.01em` (h2), `0.12em` (label), `0.06em` (stat-label)
- Subtitle: weight 400
- Body / card-body: weight 400
- Stat label: weight 500

All sizes are fixed `px` — designed for the 1920×1080 canvas. JS `transform: scale()`
handles viewport adaptation. **Never use `clamp()` or viewport-relative units.**

### Background Layers (Order: back to front)

**Layer 1 — Base gradient:**
```css
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse 120% 80% at 50% 0%, #1e1b4b 0%, #030712 60%);
    z-index: -3;
}
```

**Layer 2 — Noise texture:**
```css
body::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity: 0.03;
    z-index: -2;
    pointer-events: none;
}
```

**Layer 3 — Aurora ribbons (3 layers, different colors/speeds):**
```css
.aurora-1, .aurora-2, .aurora-3 {
    position: fixed;
    width: 150%;
    height: 60%;
    filter: blur(80px);
    opacity: 0.6;
    animation: aurora-drift 25s ease-in-out infinite alternate;
    z-index: -1;
    pointer-events: none;
}
.aurora-1 {
    top: -10%;
    left: -25%;
    background: linear-gradient(135deg, #22d3ee 0%, transparent 60%);
    animation-duration: 28s;
}
.aurora-2 {
    top: 20%;
    right: -30%;
    background: linear-gradient(225deg, #a78bfa 0%, transparent 50%);
    animation-duration: 35s;
    animation-delay: -10s;
}
.aurora-3 {
    top: 40%;
    left: 10%;
    background: linear-gradient(90deg, #34d399 0%, transparent 40%);
    animation-duration: 22s;
    animation-delay: -5s;
    opacity: 0.4;
}
@keyframes aurora-drift {
    0% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(30px, -20px) scale(1.1); }
    100% { transform: translate(-20px, 20px) scale(0.95); }
}
```

**Layer 4 — Stars (optional, sparse):**
```css
.stars {
    position: fixed;
    inset: 0;
    background-image: radial-gradient(1px 1px at 20% 30%, white 50%, transparent),
                      radial-gradient(1px 1px at 40% 70%, white 50%, transparent),
                      radial-gradient(1.5px 1.5px at 60% 20%, white 50%, transparent),
                      radial-gradient(1px 1px at 80% 60%, white 50%, transparent);
    opacity: 0.7;
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
  1920×1080 canvas area. Avoid large empty zones. Use taller cards (`min-height`),
  larger stat numbers, wider grids, and generous card padding to occupy available
  space. Content should feel comfortably placed, not floating in emptiness — but
  preserve enough breathing room to maintain elegance.
  - **Content slides** (Feature Cards, Stats, Two-Column, Step Flow): grid/flex
    containers should stretch toward the canvas edges. Cards should have ample
    internal padding and body text so they feel substantial.
  - **Sparse slides** (Cover, Quote, Closing): add decorative fills — aurora-colored
    gradient circles (`position: absolute`, low opacity), extra accent lines,
    corner geometric shapes, or large background `"` marks for quotes. These
    anchor the composition without overcrowding the message.
  - **Never** leave more than ~20% of the canvas visually empty on any slide.
- Title slide: large centered heading + glowing accent line beneath
- Content slides: heading top-left, content below with glassmorphism cards

### HTML Structure

Every generated presentation must use this exact HTML skeleton:

```html
<!DOCTYPE html>
<html lang="{language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{Presentation Title}</title>
    <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500&display=swap">
    <script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>
    <!-- <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>  ← only if charts needed -->
    <style>/* all CSS here */</style>
</head>
<body>
    <!-- Aurora background layers -->
    <div class="aurora-1"></div>
    <div class="aurora-2"></div>
    <div class="aurora-3"></div>
    <div class="stars"></div>

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
    font-family: 'Satoshi', ui-sans-serif, sans-serif;
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
    height: 3px;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    width: 0%;
    z-index: 100;
    transition: width 0.2s ease;
    box-shadow: 0 0 8px var(--glow);
}
```

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
    border: 1px solid rgba(34, 211, 238, 0.4);
    background: transparent;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s, border-color 0.2s;
}
.nav-dots button.active {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 6px var(--glow);
}
```

#### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
    .aurora-1, .aurora-2, .aurora-3 {
        animation: none;
        opacity: 0.3;
    }
    .reveal {
        transition: opacity 0.4s ease;
        transform: none !important;
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

    /* Reveal animations on scroll */
    setupIntersectionObserver() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.querySelectorAll('.reveal, .title-reveal').forEach(el => el.classList.add('visible'));
                    /* If animateCounters is defined, call it for stat cards */
                    if (typeof animateCounters === 'function') animateCounters(e.target);
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
1. `lucide.createIcons();` to render Lucide icons
2. Counter animation function (if stat cards with `data-target` are present)
3. ECharts initialization (if charts are present)
4. Inline editing code (see SKILL.md)

### Component Library

These are independent, composable building blocks. Mix them freely on any slide —
they are not locked to specific layouts.

#### Reveal Animation (.reveal)

Add `.reveal` to any element that should animate on scroll. JS adds `.visible`
via IntersectionObserver. Use `.title-reveal` for cover/closing slide headings.

```css
.reveal {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal.visible {
    opacity: 1;
    transform: translateY(0);
}
/* Stagger children */
.reveal:nth-child(1) { transition-delay: 0s; }
.reveal:nth-child(2) { transition-delay: 0.1s; }
.reveal:nth-child(3) { transition-delay: 0.1s; }
.reveal:nth-child(4) { transition-delay: 0.2s; }
.reveal:nth-child(5) { transition-delay: 0.3s; }
.reveal:nth-child(6) { transition-delay: 0.4s; }

.title-reveal {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
    transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
.title-reveal.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
}
```

#### Showcase (.showcase)

Semi-transparent container that frames a component or image with padding and
visual depth. Use inside `.two-col-aside`, `.two-col-main`, or as a standalone
wrapper when a component needs a "stage" rather than sitting directly on the
slide background. Vertically and horizontally centers its content.

```css
.showcase {
    padding: 32px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
}
```

#### Card (.card)

Glassmorphism container for any grouped content — features, evidence, info blocks.

```html
<div class="card">
    <i data-lucide="sparkles" class="card-icon"></i>
    <p class="card-label">Label</p>
    <p class="card-title">Title</p>
    <p class="card-body">Body text describing the item.</p>
</div>
```

All inner elements are optional — use only what the content needs.

```css
.card {
    background: var(--bg-card);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 36px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
}
.card:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--glow);
    border-color: var(--glow);
}
.card-icon        { width: 32px; height: 32px; color: var(--accent); margin-bottom: 16px; transition: transform 0.2s ease; }
.card:hover .card-icon { transform: scale(1.15); }
.card-label       { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; font-weight: 500; }
.card-title       { font-family: 'Clash Display', sans-serif; font-size: 22px; margin-bottom: 12px; font-weight: 600; }
.card-body        { font-size: 17px; color: var(--text-secondary); line-height: 1.7; flex: 1; }
```

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
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
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
    padding: 16px 20px;
    font-size: 14px;
    color: var(--text-secondary);
    background: var(--bg-card);
    backdrop-filter: blur(12px);
}
```

Sizing: set `width` and `height` on `.image-card` via inline style to control
aspect ratio. Typical: `width:100%; height:400px` in a column, or
`width:480px; height:320px` standalone.

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
    padding-left: 36px;
    padding-right: 36px;
}
.card-img .card-title { padding-top: 24px; }
.card-img .card-body  { padding-bottom: 36px; }
```

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
    border: 2px solid var(--border);
    box-shadow: 0 0 12px var(--glow);
    flex-shrink: 0;
}
.avatar-sm { width: 48px; height: 48px; }
.avatar-lg { width: 96px; height: 96px; }
```

Pair with card text for team slides: avatar left, name + role right. Or use
in a horizontal row for a team overview.

#### Stat Card (.stat-card)

Large metric display. Use `data-target` for counter animation, `.gradient-text` on numbers.

```html
<div class="stat-card">
    <div class="stat-number gradient-text" data-target="85" data-suffix="%">0</div>
    <div class="stat-label">Growth Rate</div>
    <div class="stat-desc">Year over year revenue increase</div>
</div>
```

```css
.stat-card {
    background: var(--bg-card);
    backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 48px 40px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
.stat-number { font-family: 'Clash Display', sans-serif; font-size: 64px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; margin-bottom: 12px; }
.stat-label  { font-size: 15px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; margin-bottom: 12px; }
.stat-desc   { font-size: 15px; color: var(--text-secondary); line-height: 1.5; opacity: 0.7; }
```

Counter animation JS: iterate elements with `data-target`, count from 0 to target on `.visible`.

#### Quote Block (.quote-block)

```html
<div class="quote-deco">&ldquo;</div>
<div class="quote-block">
    <blockquote>&ldquo;The quote text goes here.&rdquo;</blockquote>
    <cite>Attribution</cite>
</div>
```

```css
.quote-block            { display: flex; flex-direction: column; justify-content: center; border-left: 3px solid var(--accent); padding: 24px 32px; background: rgba(34,211,238,0.06); border-radius: 0 8px 8px 0; }
.quote-block blockquote { font-size: 36px; font-style: italic; line-height: 1.5; margin-bottom: 16px; text-shadow: 0 0 30px rgba(34,211,238,0.15); }
.quote-block cite       { font-size: 14px; color: var(--accent); letter-spacing: 0.08em; text-transform: uppercase; font-style: normal; }
.quote-deco             { position: absolute; font-family: 'Clash Display', sans-serif; font-size: 300px; line-height: 1; color: var(--accent); opacity: 0.06; pointer-events: none; z-index: 0; }
```

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
.step-circle    { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; font-family: 'Clash Display', sans-serif; font-size: 24px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px -8px rgba(34,211,238,0.5); flex-shrink: 0; }
.step-connector { flex: 0 0 32px; height: 2px; background: var(--border); margin-top: 32px; align-self: flex-start; box-shadow: 0 0 6px rgba(34,211,238,0.1); }
.step-title     { font-size: 20px; font-weight: 600; }
.step-desc      { font-size: 16px; color: var(--text-secondary); line-height: 1.6; max-width: 200px; }
```

#### Evidence List (.evidence-list)

Styled bullet list. Use inside `.card`, `.two-col-main`, or any container.

```html
<ul class="evidence-list">
    <li>First piece of evidence or supporting point</li>
    <li>Second supporting point</li>
</ul>
```

```css
.evidence-list    { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.evidence-list li { padding-left: 18px; position: relative; font-size: 18px; color: var(--text-primary); line-height: 1.5; }
.evidence-list li::before { content: ''; position: absolute; left: 0; top: 0.55em; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
```

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

#### Text Helpers

```css
h1             { font-family: 'Clash Display', sans-serif; font-size: 80px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; text-shadow: 0 0 40px rgba(34,211,238,0.3); }
h2             { font-family: 'Clash Display', sans-serif; font-size: 38px; font-weight: 600; line-height: 1.2; }
.label         { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); font-weight: 500; }
.subtitle      { font-size: 24px; color: var(--text-secondary); line-height: 1.6; font-weight: 400; }
.body-text     { font-size: 18px; color: var(--text-secondary); line-height: 1.6; }
.gradient-text { background: linear-gradient(135deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
```

Use `.gradient-text` on 1–3 key words in a heading — never entire sentences. Max one per slide.

#### Accent Lines

```css
.accent-line      { width: 48px; height: 3px; background: linear-gradient(90deg, var(--accent), var(--accent-2)); border-radius: 2px; margin: 20px 0; }
.accent-line-wide { width: 200px; height: 2px; background: linear-gradient(90deg, var(--accent), transparent); border-radius: 2px; }
```

- `.accent-line` (short, gradient): decorative — place after headings to anchor the eye
- `.accent-line-wide` (long, fade-out): decorative — sparse slide bottoms

Use plain CSS `border-bottom` or `<hr>` for structural separation — not accent lines.

#### Icons (Lucide)

Load via CDN: `<script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>`
Use `<i data-lucide="icon-name" class="card-icon"></i>` and call `lucide.createIcons()` in JS.

- Icon color: `var(--accent)`, size: `2rem`, hover: `scale(1.15)` transition
- Choose abstractly: `sparkles` → innovation, `shield` → security, `zap` → performance,
  `layers` → architecture, `globe` → global, `bar-chart` → data
- Cards benefit most from icons. Stats and quotes: icons optional.

#### Decorative Fills (.deco-blob, .deco-line)

Positioned-absolute background elements behind content.

```css
.deco-blob { position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none; z-index: 0; }
.deco-line { position: absolute; pointer-events: none; z-index: 0; }

/* Ensure content stacks above decorative fills */
.slide-canvas > *:not(.deco-blob):not(.deco-line) { position: relative; z-index: 1; }
```

Set size, color, opacity, and position via inline styles:
- Typical `.deco-blob`: `width:300–500px; height:same; background:radial-gradient(circle, var(--accent) 0%, transparent 70%); opacity:0.06–0.10`
- Typical `.deco-line`: `width:120–200px; height:2px; background:linear-gradient(90deg, var(--accent-2), transparent); opacity:0.3–0.5`
- Sparse slides (cover, quote, closing): 2–3 deco elements
- Dense slides (grids, multi-column): 0–1 deco elements
- Never exceed 3 per slide

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
.two-col-main p  { font-size: 18px; color: var(--text-secondary); line-height: 1.7; }
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

#### Shared Aurora chart styles

All chart types share these aurora theme defaults:

- **Color palette**: `['#22d3ee', '#a78bfa', '#34d399']` (aurora accent triad).
  For >3 series, extend with `#f472b6` (pink) and `#fbbf24` (amber).
- **Background**: `'transparent'`
- **Axis labels / legend text**: `var(--text-secondary)` (`#94a3b8`), `14px` Satoshi font
- **Grid lines**: `var(--surface-2)` (`rgba(148,163,184,0.08)`) — barely visible
- **Animation**: enabled, `800ms`, `cubicOut` (consistent with aurora's motion philosophy)
- **Tooltip**: dark background (`var(--bg-card)`), `var(--text-primary)` text, subtle border

#### Pie / Donut

- Inner radius `55-65%` for donut; `0` for full pie
- `borderRadius: 6`, `borderColor: var(--bg-primary)`, `borderWidth: 3` for segment gaps
- Center label: large number/text in `var(--text-primary)`, Clash Display font
- Legend: bottom-aligned, `itemWidth: 12`, `itemGap: 20`
- Container: `280–360px` square is typical

#### Bar (vertical & horizontal)

- `borderRadius: [4, 4, 0, 0]` (rounded top caps for vertical; `[0, 4, 4, 0]` for horizontal)
- Bar width: `40-60%` of category gap — never touch adjacent bars
- Optional gradient fill: `linearGradient` from accent color at 80% opacity to 40% opacity
- For ≤5 categories: one color per bar from the aurora triad. For single-series: solid `var(--accent)`
- Axis line: `1px` `var(--surface-2)`. Tick marks: hidden

#### Line / Area

- Line width: `2-3px`, smooth curves (`smooth: true`)
- Optional glow: `shadowBlur: 8`, `shadowColor` matching line color at 40% opacity
- Area fill: `linearGradient` from line color at 20% opacity (top) to transparent (bottom)
- Data points: show on hover only (`symbol: 'none'`, `emphasis: { symbol: 'circle' }`)
- For multiple series: one color per series from aurora triad, distinguish with solid vs dashed

#### Integration rules

- Initialize charts inside a `window.addEventListener('load', ...)` or after DOM ready
- Use `echarts.init(container, null, { renderer: 'canvas' })` — canvas renderer for performance
- Charts must use the aurora color palette — never default ECharts colors
- Responsive: charts are inside the 1920×1080 canvas, scaled by JS `transform: scale()` —
  no need for ECharts `resize()` handling

### Composition Guide

#### Common Recipes

These are starting points — not constraints. Combine any components with any
layout primitive as the content demands.

| Content Pattern | Suggested Recipe | Aurora Notes |
|---|---|---|
| 3–4 parallel features | 3-col grid + card ×3 | Each card: Lucide icon + label + title + body |
| Key metrics (2–4 KPIs) | 3-col grid + stat-card ×3 | Counter animation, `.gradient-text` on numbers |
| Narrative + evidence | two-col + text in main, card with evidence-list in aside | Glassmorphism evidence card |
| Sequential process (3–5 steps) | horizontal flow + step-flow | Gradient circles, glowing connectors |
| Memorable quote | centered stack + quote-block + quote-deco | `border-left: 3px`, text glow |
| Single powerful statement / CTA | centered stack + large heading + deco fills | `.gradient-text`. Max once per deck. |
| Data visualization | any layout + chart-container | Chart type per data — see §Data Visualization |
| KPIs with trend context | 3-col grid + stat-cards, then chart below | Headline numbers + supporting chart |
| Team / people (3–4) | 3-col grid + card ×3 (no icons) | card-title → name, card-body → role |
| Before vs After | two-col + content per side | Heading + evidence-list each column |
| 6+ items on one topic | Split across 2 slides | Max 5 items per slide |

#### Element Usage Rules

**Gradient-text:** Apply to 1–3 key words in a heading — never entire sentences.
Typical: key metric (`$4.2B`), core concept (`actually impress`), CTA (`Get Started`).
Max one `.gradient-text` per slide.

**Accent lines:** `.accent-line` (short, after headings) and `.accent-line-wide`
(long, bottom of sparse slides) are decorative. Use plain `border-bottom` or
`<hr>` for structural separation.

**Icons (Lucide):** Choose abstractly: `sparkles` → innovation, `shield` → security,
`zap` → performance, `layers` → architecture, `globe` → global, `bar-chart` → data.
Cards benefit most from icons. Stats and quotes: icons optional.
When unsure, omit — a strong heading beats a generic icon.

**Card labels:** Short category words (`Visual`, `Motion`) for thematic grouping.
Sequential numbers (`01`, `02`, `03`) for ordered items. Omit when the title is clear.

**Decorative fills:** Sparse slides: 2–3 deco elements. Dense slides: 0–1. Never >3.

#### Common Mistakes

- Using stat cards for non-numeric content → use cards instead.
- Using bullet lists when cards or step-flow would be clearer.
- Putting a chart AND stat cards on the same slide without clear hierarchy → pick a primary.
- Always using donut charts for data → match chart type to data pattern (see §Data Visualization).
- Applying `.gradient-text` to entire sentences → limit to 1–3 key words.
- Adding Lucide icons to every element → reserve for cards and key callouts.
- Using the single-statement/CTA layout more than once per deck → it loses impact.
- Leaving more than ~20% of canvas visually empty → add deco fills or expand content.

### Code Blocks (if any)

```css
pre, code {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 14px;
    color: var(--accent);
}
```

### Do & Don't

- **Do** use the layered aurora background — it creates depth and atmosphere
- **Do** use glassmorphism cards with `backdrop-filter`
- **Do** keep accent colors to cyan/violet/emerald — stay in the aurora palette
- **Do** add subtle glow effects to titles and key elements
- **Don't** use bright white or pure black backgrounds
- **Don't** use more than 3 accent colors on a single slide
- **Don't** clutter slides — max 5 bullet points per slide
- **Don't** disable `prefers-reduced-motion` — provide smoother alternatives
