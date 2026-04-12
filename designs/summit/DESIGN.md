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
- Body: `13px` to `15px`, line-height `1.6`
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
    padding: 56px 64px 64px;
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

<!-- @layout:cover:start qa=false -->
#### Cover

Opening spread with one dominant full-canvas hero field and a vertically centered reading field on the left. The left side should become a charcoal-toned editorial zone that fades gradually toward the right, so the opening copy sits in a clear reading field without turning into a boxed card. Keep the composition broad and architectural rather than modular.

Structural intent:
- Full-canvas hero field behind everything
- Left-side reading field for opening title and short supporting copy
- Quiet footer metadata at the bottom edge

Suggested components:
- Background hero field: often `full-bleed-media`
- Left reading field: often custom cover copy stack
- Footer metadata: often a minimal caption pair

These are recommendations, not hard requirements. The key rule is one dominant background field plus one clearly legible opening text zone.

```html
<section class="slide cover-slide" slide-qa="false" data-index="0">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <div class="hero-field" style="position:absolute;inset:0;">
        <!-- Recommended: one dominant hero component filling the full canvas -->
        <div class="full-bleed-media" style="height:100%;">
          <img src="https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1800&auto=format&fit=crop" alt="Mountain landscape">
        </div>
      </div>
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(23,20,17,0.94) 0%,rgba(23,20,17,0.9) 28%,rgba(23,20,17,0.68) 48%,rgba(23,20,17,0.3) 68%,rgba(23,20,17,0) 100%);"></div>
      <div style="position:relative;display:flex;flex-direction:column;justify-content:center;height:100%;padding:84px 96px;color:#f7f4ee;">
        <!-- Opening reading field: keep copy short and vertically centered -->
        <div style="max-width:1020px;display:flex;flex-direction:column;justify-content:center;gap:22px;min-height:620px;">
          <p class="eyebrow reveal" style="color:rgba(247,244,238,0.72);">Climate Report 2026</p>
          <h1 class="reveal" style="max-width:1120px;color:#f7f4ee;font-size:120px;line-height:0.9;letter-spacing:-0.03em;text-transform:uppercase;">Ascending Through Constraint</h1>
          <p class="reveal" style="max-width:540px;font-size:20px;line-height:1.55;color:rgba(247,244,238,0.82);">An annual review of product, footprint, and material transition.</p>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;">
          <p class="caption reveal" style="color:rgba(247,244,238,0.72);">Summit / Field Notes</p>
          <p class="caption reveal" style="color:rgba(247,244,238,0.72);">Chamonix, France</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

##### Tips
- **Z-index stacking is mandatory.** Always declare explicit z-index for all three layers: hero background `z-index:0`, gradient overlay `z-index:1`, foreground content `z-index:2`. Relying on DOM order alone is fragile — `.full-bleed-media` creates a new stacking context that can trap the image above the overlay.
- **Overlay direction.** Use a diagonal gradient (`linear-gradient(105deg, ...)`) fading from left-dark to right-transparent so the left reading field stays legible without boxing the text in a card.
- **All text must be white-family.** Headings `#f7f4ee`, body `rgba(247,244,238,0.72)`, captions/eyebrows `rgba(247,244,238,0.50–0.55)`.
- **Page number.** Use `.page-number--light` since the background is always dark.
- **No legacy page numbers.** Do not embed a manual page number string inside the layout HTML. The `.page-number` div handles all numbering.
<!-- @layout:cover:end -->

<!-- @layout:toc:start qa=false -->
#### TOC

Table-of-contents spread with one dominant visual field on the left and one narrow index panel on the right. The left field should fully occupy its column; do not treat it like an inset card. The right side should feel like a printed annual-report contents panel with tight typography, dense list structure, a short intro note, and a small footer.

Structural intent:
- Left column: dominant visual field
- Right column: narrow TOC panel
- Thin accent rule inside the panel to establish page rhythm

Suggested components:
- Left visual field: often `full-bleed-media`
- Right TOC panel: often a custom contents stack
- Footer line: often compact report metadata + page number

These are recommendations, not hard requirements. The key rule is a broad visual field paired with a disciplined narrow index panel.

```html
<section class="slide" slide-qa="false" data-index="N">
  <div class="slide-canvas">
    <div class="page reveal" style="padding:0;overflow:hidden;">
      <div style="display:grid;grid-template-columns:8fr 4fr;height:100%;">
        <div class="hero-field" style="height:100%;">
          <!-- Recommended: one visual component that fills the entire left column -->
          <div class="full-bleed-media" style="height:100%;">
            <img src="https://images.unsplash.com/photo-1522163182402-834f871fd851?q=80&w=1800&auto=format&fit=crop" alt="Climbers resting on a steep alpine wall at sunrise">
          </div>
        </div>
        <div style="background:var(--bg-page);height:100%;padding:42px 38px 30px;display:flex;">
          <div style="width:3px;background:var(--accent-gold);flex:0 0 3px;"></div>
          <div style="padding-left:22px;display:flex;flex-direction:column;justify-content:space-between;flex:1;">
            <div>
              <!-- TOC content stack: title, intro note, and dense chapter list -->
              <h2 style="font-size:34px;line-height:0.94;letter-spacing:-0.03em;text-transform:uppercase;max-width:220px;">Table of Contents</h2>
              <p style="margin-top:18px;font-size:11px;line-height:1.55;letter-spacing:0.08em;text-transform:none;color:var(--text-secondary);max-width:250px;">Short introductory note describing the scope of the sections that follow.</p>
              <ol style="list-style:none;display:flex;flex-direction:column;gap:10px;margin-top:24px;">
                <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span>01</span><span>Chapter title or section theme</span></li>
                <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span>02</span><span>Chapter title or section theme</span></li>
                <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span>03</span><span>Chapter title or section theme</span></li>
                <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--line);padding-bottom:8px;"><span>04</span><span>Chapter title or section theme</span></li>
                <li style="display:grid;grid-template-columns:26px 1fr;gap:12px;font-size:11px;line-height:1.45;text-transform:uppercase;letter-spacing:0.06em;"><span>05</span><span>Chapter title or section theme</span></li>
              </ol>
            </div>
            <div style="display:flex;flex-direction:column;gap:14px;">
              <div class="rule"></div>
              <div>
                <p class="caption">Panel note</p>
                <p style="margin-top:10px;font-size:11px;line-height:1.55;color:var(--text-secondary);max-width:250px;">Optional supporting note, report description, or small contextual paragraph.</p>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:end;">
                <p class="caption">Report footer metadata</p>
                <p style="font-family:'IBM Plex Sans Condensed', 'Inter', sans-serif;font-size:15px;line-height:1;font-weight:600;letter-spacing:0.02em;color:var(--text-primary);">3</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

##### Tips
- **TOC entry numbers (01, 02 …) must be `font-weight:700`.** They anchor each row visually; without bold, they dissolve into the lighter entry text.
- **Remove any legacy manual page number** inside the TOC panel footer. All slides use `.page-number` at the canvas level; a hand-written number string in the panel footer will duplicate or conflict with it.
- **accent-gold divider line.** The vertical 3px rule uses `var(--accent-gold)`. Do not substitute another color — it is the primary editorial accent in Summit.
<!-- @layout:toc:end -->

<!-- @layout:narrative-hero-right:start qa=true -->
#### Narrative Hero Right

Structural spread with a dense narrative panel on the left and one fully filled hero field on the right. This is not a content-locked media layout: the right field can be an image, a chart-led visual, or another dominant block that fully occupies its column.

Structural intent:
- Left side: dense reading surface
- Right side: dominant hero field
- Strong asymmetry between reading weight and visual weight

Suggested components:
- Left narrative panel: often `report-text-panel`
- Right hero field: often `full-bleed-media`

These are recommendations, not hard requirements. The key rule is structural contrast: one disciplined reading surface on one side, one dominant hero field on the other.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;overflow:hidden;background:var(--bg-frame);">
      <div style="display:grid;grid-template-columns:4.2fr 7.8fr;height:100%;">
        <div class="report-text-panel report-text-panel--dark reveal">
          <!-- Narrative panel: use dense copy, structured notes, or another reading-first component. -->
          <div style="max-width:420px;">
            <p class="eyebrow" style="color:rgba(243,238,230,0.72);">Section label / annual review</p>
            <h2 style="margin-top:16px;font-size:60px;line-height:0.92;letter-spacing:-0.03em;text-transform:uppercase;color:#f7f4ee;max-width:360px;">Narrative heading</h2>
            <p style="margin-top:20px;font-size:13px;line-height:1.58;color:rgba(243,238,230,0.84);max-width:390px;">Use this side for the main reading load: compact explanation, factual notes, or structured narrative that supports the hero field without competing with it.</p>
            <p style="margin-top:16px;font-size:13px;line-height:1.58;color:rgba(243,238,230,0.78);max-width:390px;">The specific content can vary. What matters is that this panel remains the primary reading surface and the opposite side remains the dominant visual field.</p>
          </div>
          <div class="report-panel-footer" style="color:rgba(243,238,230,0.68);">
            <p class="caption">Summit / Climate Report 2026</p>
            <p class="caption">03</p>
          </div>
        </div>
        <div class="hero-field reveal">
          <!-- Hero field: use one dominant visual component that fully fills this region. -->
          <div class="full-bleed-media" style="height:100%;">
            <img src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1800&auto=format&fit=crop" alt="Mountain meadow and stream under dramatic alpine sky">
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

##### Tips
- **Grid container must use `flex:1;min-height:0`**, not `height:100%`. Using `height:100%` on the two-column grid causes content overflow when text is dense.
- **Narrow left panel (4.2fr) is not suited for charts or wide tables.** The text panel occupies the compressed column. Do not attempt to squeeze a bar chart or a data table with many columns into the 4.2fr side — they need horizontal room to read correctly.
- **Dark panel variant.** When the left panel uses a dark background (or a background image with overlay), override CSS variables on the container: `--text-primary`, `--text-secondary`, `--text-muted`, `--line`, `--line-strong` — all set to white-family values. This lets child components inherit correct colors automatically. Use `.page-number--light` for the page number.
- **Background image inside dark panel.** Place `img` absolutely at `z-index:0`, dark overlay at `z-index:1`, text content at `z-index:2`. Same three-layer rule as cover.
<!-- @layout:narrative-hero-right:end -->

<!-- @layout:narrative-hero-left:start qa=true -->
#### Narrative Hero Left

Mirror of `narrative-hero-right`: hero field on the left, narrative panel on the right. The left side remains a structural hero field rather than a fixed media slot, and the right side remains a compact reading surface rather than a fixed article template.

Structural intent:
- Left side: dominant hero field
- Right side: compact reading surface
- Same asymmetry as `narrative-hero-right`, but reversed

Suggested components:
- Left hero field: often `full-bleed-media`
- Right narrative panel: often `report-text-panel`

These are recommendations, not hard requirements. Keep the hero side visually dominant and the narrative side compact, disciplined, and subordinate in visual weight.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page alt" style="padding:0;overflow:hidden;background:var(--bg-page-alt);">
      <div style="display:grid;grid-template-columns:7.8fr 4.2fr;height:100%;">
        <div class="hero-field reveal">
          <!-- Hero field: use one dominant visual component that fully fills this region. -->
          <div class="full-bleed-media" style="height:100%;">
            <img src="https://images.unsplash.com/photo-1454496522488-7a8e488e8606?q=80&w=1800&auto=format&fit=crop" alt="Snow ridge landscape under alpine light">
          </div>
        </div>
        <div class="report-text-panel report-text-panel--light reveal">
          <!-- Narrative panel: use compact explanation, notes, or another reading-first component. -->
          <div style="max-width:390px;">
            <p class="eyebrow" style="color:var(--text-muted);">Section label / annual review</p>
            <h2 style="margin-top:16px;font-size:60px;line-height:0.92;letter-spacing:-0.03em;text-transform:uppercase;color:var(--text-primary);max-width:340px;">Narrative heading</h2>
            <p style="margin-top:20px;font-size:13px;line-height:1.58;color:var(--text-secondary);max-width:360px;">Use the light-side version when the hero field should dominate and the reading panel should feel quieter, more open, and more paper-like.</p>
            <p style="margin-top:16px;font-size:13px;line-height:1.58;color:var(--text-secondary);max-width:360px;">This layout mirrors `narrative-hero-right`. The exact content may vary, but the hierarchy should remain stable: dominant hero field, compact reading panel.</p>
          </div>
          <div class="report-panel-footer" style="color:var(--text-muted);">
            <p class="caption">Summit / Climate Report 2026</p>
            <p class="caption">04</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

##### Tips
- **Same grid/flex rule as `narrative-hero-right`.** Use `flex:1;min-height:0` on the two-column grid container, not `height:100%`.
- **Narrow right panel (4.2fr) has the same chart/table restriction.** Do not place a bar chart or wide data table in the 4.2fr right column — it will overflow or become illegible.
- **Dark panel on right side.** Same CSS variable override pattern applies: set `--text-primary` etc. to white-family values on the panel container, then all child components inherit automatically.
- **Background image inside left hero column.** When the hero column contains a `flow-vertical` or other component over a background image, use the three-layer z-index pattern: background `z-index:0`, dark overlay `z-index:1`, content `z-index:2`. Set all text to white-family inline.
<!-- @layout:narrative-hero-left:end -->

<!-- @layout:three-highlights:start qa=true -->
#### Three Highlights

An annual-report highlight spread with a small report-style title and clearly unequal text density across the three columns. The center column is the narrative spine; the left and right columns are shorter supporting modules. Do not make the three columns feel like equal cards or mirrored modules.

Structural intent:
- Left column: supporting proof block
- Center column: main reading column
- Right column: supporting proof block

Suggested content behavior:
- The two outer columns are usually shorter, simpler, and more image- or proof-led.
- The center column usually carries the densest explanation, evidence, or narrative logic.
- Any of the three columns may use image, text, stats, or another editorial module if the hierarchy stays intact.

These are recommendations, not hard requirements. Choose components based on reading weight and visual hierarchy, not on a fixed left/center/right recipe.

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page">
      <p class="eyebrow reveal">Highlights</p>
      <h2 class="reveal" style="margin-top:12px;font-size:25px;line-height:1.02;letter-spacing:0.015em;text-transform:uppercase;max-width:440px;">Climate action highlights</h2>
      <div class="rule" style="margin:18px 0 26px;"></div>
      <div style="display:grid;grid-template-columns:3.8fr 5.4fr 3.8fr;gap:34px;align-items:start;flex:1;">
        <div class="reveal" style="padding-top:12px;border-top:1px solid var(--line-strong);display:flex;flex-direction:column;gap:14px;">
          <!-- Left support block: use any short proof-oriented component or simple custom stack. -->
          <div class="media-frame" style="height:240px;">
            <img src="https://images.unsplash.com/photo-1454496522488-7a8e488e8606?q=80&w=1200&auto=format&fit=crop" alt="Snow ridge in alpine light">
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;max-width:250px;">
            <p class="caption">Support theme</p>
            <h3 style="font-size:18px;line-height:1.08;max-width:240px;">Short proof statement for the left column.</h3>
            <p style="font-size:13px;line-height:1.48;max-width:250px;">Keep this column concise so it supports the page argument instead of competing with the center narrative.</p>
          </div>
        </div>
        <div class="reveal" style="padding-top:12px;border-top:1px solid var(--line-strong);display:flex;flex-direction:column;gap:18px;">
          <!-- Center narrative spine: this should be the densest reading zone on the page. -->
          <div style="max-width:100%;display:flex;flex-direction:column;gap:14px;">
            <p class="caption">Narrative spine</p>
            <h3 style="font-size:21px;line-height:1.06;max-width:360px;">Main explanatory statement for the center column.</h3>
            <p style="font-size:13px;line-height:1.5;max-width:360px;">Use this column for the clearest explanation, evidence sequence, or report-style body copy. It should carry more reading weight than either outer column.</p>
            <p style="font-size:13px;line-height:1.5;max-width:360px;">The lower block can hold supporting media, a small chart, a stat module, or another proof element, as long as the center column remains the main narrative anchor.</p>
          </div>
          <div class="media-frame" style="height:208px;">
            <img src="https://images.unsplash.com/photo-1464823063530-08f10ed1a2dd?q=80&w=1200&auto=format&fit=crop" alt="Mountain landscape with distant ridge line">
          </div>
          <p class="media-caption">Optional proof block / media / chart / supporting evidence</p>
        </div>
        <div class="reveal" style="padding-top:12px;border-top:1px solid var(--line-strong);display:flex;flex-direction:column;gap:14px;">
          <!-- Right support block: keep it brief and subordinate to the center narrative. -->
          <div class="media-frame" style="height:240px;">
            <img src="https://images.unsplash.com/photo-1519904981063-b0cf448d479e?q=80&w=1200&auto=format&fit=crop" alt="Hiker in alpine basin">
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;max-width:245px;">
            <p class="caption">Support theme</p>
            <h3 style="font-size:18px;line-height:1.08;max-width:230px;">Short proof statement for the right column.</h3>
            <p style="font-size:13px;line-height:1.48;max-width:245px;">This side can be image-led, stat-led, or text-led, but should remain secondary in reading priority.</p>
          </div>
          <p class="media-caption">Optional caption / source / field note</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

##### Tips
- **Three columns must use `align-items:stretch;min-height:0`** on the grid container. Using `align-items:start` causes column underfill — the shorter columns stop short and leave a blank band at the bottom.
- **Unequal density is intentional.** The center column carries the narrative spine and will be noticeably taller. Do not equalize copy length across all three columns; the height imbalance is part of the editorial rhythm.
- **Do not set fixed heights on editorial components inside this layout.** Let `editorial-image-top` and `editorial-text-top` fill height via flexbox stretch.
<!-- @layout:three-highlights:end -->

<!-- @layout:closing:start qa=false -->
#### Closing

Closing spread with one dominant full-canvas field, a restrained sign-off zone, and minimal footer/contact information. Treat it as a final atmospheric page rather than a content-heavy layout.

Structural intent:
- Full-canvas dominant field
- Small closing statement or sign-off zone
- Minimal footer or contact metadata

Suggested components:
- Background field: often `full-bleed-media`
- Closing statement: often a short custom copy stack
- Footer metadata: often a minimal caption pair

These are recommendations, not hard requirements. The key rule is to end on one calm dominant field with only the lightest layer of supporting information.

```html
<section class="slide" slide-qa="false" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;">
      <div class="hero-field" style="position:absolute;inset:0;">
        <!-- Recommended: one dominant field component filling the full canvas -->
        <div class="full-bleed-media" style="height:100%;">
          <img src="https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=80&w=1800&auto=format&fit=crop" alt="Snowy summit at dusk">
        </div>
      </div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.04) 10%,rgba(0,0,0,0.4) 100%);"></div>
      <div style="position:relative;display:flex;flex-direction:column;justify-content:space-between;height:100%;padding:72px 84px;color:#f7f4ee;">
        <div class="chevron-divider reveal" style="color:rgba(247,244,238,0.7);">Summit</div>
        <div style="max-width:760px;">
          <h1 class="reveal" style="color:#f7f4ee;">The work continues beyond the page.</h1>
          <p class="reveal" style="margin-top:20px;color:rgba(247,244,238,0.82);max-width:480px;">Use the closing slide as a final dominant-field impression with only the lightest sign-off information.</p>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:end;gap:24px;">
          <p class="caption reveal" style="color:rgba(247,244,238,0.72);">summit.example.com</p>
          <p class="caption reveal" style="color:rgba(247,244,238,0.72);">@summit.field</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

##### Tips
- **Same three-layer z-index rule as cover.** Background image `z-index:0`, dark gradient overlay `z-index:1`, foreground text content `z-index:2`. Explicit declarations required.
- **Use a bottom-to-top gradient** so the sign-off zone at the bottom has the strongest dark backing and the image shows through at the top.
- **All text white-family.** Headings `#f7f4ee`, body `rgba(247,244,238,0.72)`, captions `rgba(247,244,238,0.50)`. Use `.page-number--light`.
- **Keep content minimal.** Closing is atmospheric — resist adding data tables or flow components here.
<!-- @layout:closing:end -->

<!-- @layout:narrative-hero-left-dark:start qa=true -->
#### Narrative Hero Left Dark

Wide visual field on the left (7.8fr), dark `report-text-panel` on the right (4.2fr). Use when the primary visual element — a chart, data visualisation, or full-bleed image — should occupy most of the canvas, while contextual narrative text sits in a compact dark panel on the right.

Structural intent:
- Left side: dominant visual field (echart-panel, full-bleed-media, or other wide component)
- Right side: dark compact reading surface (`report-text-panel--dark`)
- Inverts the typical text-left convention; places analysis beside the data rather than before it

Suggested components:
- Left: `echart-panel` (data visualisation), `full-bleed-media` (photography)
- Right: `report-text-panel--dark`

```html
<section class="slide" slide-qa="true" data-index="N">
  <div class="slide-canvas">
    <div class="page" style="padding:0;overflow:hidden;background:var(--bg-frame);">
      <div style="display:grid;grid-template-columns:7.8fr 4.2fr;flex:1;min-height:0;">
        <div class="echart-panel reveal">
          <!-- Wide visual field: echart-panel, full-bleed-media, or similar -->
          <div class="echart-panel-header">
            <p class="eyebrow">Section label</p>
            <h3>Chart title</h3>
            <p class="chart-subtitle">Subtitle or data source note</p>
          </div>
          <div class="echart-container" id="chart-id"></div>
          <p class="chart-caption">Data source · Verification note</p>
        </div>
        <div class="report-text-panel report-text-panel--dark reveal">
          <div style="max-width:420px;">
            <p class="eyebrow" style="color:rgba(243,238,230,0.6);">Section · Topic</p>
            <h2 style="margin-top:16px;font-size:52px;line-height:0.9;letter-spacing:-0.03em;text-transform:uppercase;color:#f7f4ee;max-width:380px;">Narrative heading</h2>
            <div style="width:40px;height:2px;background:var(--accent-gold);margin:20px 0;"></div>
            <p style="margin-top:0;font-size:13px;line-height:1.6;color:rgba(243,238,230,0.84);max-width:390px;">Primary interpretive text. Explains what the chart shows and why the trend matters.</p>
            <p style="margin-top:16px;font-size:13px;line-height:1.6;color:rgba(243,238,230,0.76);max-width:390px;">Supporting detail. Methodology notes, caveats, or forward-looking context.</p>
          </div>
          <div class="report-panel-footer" style="color:rgba(243,238,230,0.5);">
            <p class="caption">Organisation · Report title</p>
            <p class="caption">NN</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```
Rules:
- Left column must carry strong visual mass: a full-bleed image, a donut chart, a candlestick chart, or a combined chart-over-image. A lone bar chart leaves too much empty background and must not be used here.
- If the primary data visual is a bar chart, use `narrative-hero-right` instead (chart occupies the right 7.8fr column, text on the left).
- Right dark panel follows the same rules as `narrative-hero-right`'s dark variant.

##### Tips
- **Wide left column (7.8fr) is not an exception for bar charts.** Even though the column is wide, a standalone vertical bar chart leaves dead background space and looks unanchored. Donut, candlestick, and area charts fill the column more naturally and read better at large scale.
- **`narrative-hero-right` is the bar-chart layout.** When the data requires a bar chart, flip to `narrative-hero-right` so the chart sits in the right 7.8fr column with ample horizontal room.
- **Right dark panel CSS variable override.** Set `--text-primary`, `--text-secondary`, `--text-muted`, `--line`, `--line-strong` to white-family values on the right panel container, then child components inherit automatically without per-element inline styles.
- **ECharts on dark left column.** Use `backgroundColor:'transparent'` in `setOption` and override axis label / legend colors to `rgba(247,244,238,0.7)` in the chart option.
<!-- @layout:narrative-hero-left-dark:end -->

<!-- @layout:split-dashboard:start qa=true -->
#### Split Dashboard

Full-canvas layout split horizontally: a process flow band on top, and a two-column data zone below (table + chart). Use when you need to combine a narrative sequence with quantitative data in a single slide.

Structure:
- **Top band** (`.split-top`): `flow-horizontal` spanning full width, typically 4 steps.
- **Bottom zone** (`.split-bottom`): CSS grid, `5fr 7fr` — left holds a `data-table`, right holds an `echart-panel`.

```html
<section class="slide" data-index="N" slide-qa="true">
  <div class="slide-canvas">
    <div class="split-dashboard">

      <!-- Top band: flow-horizontal -->
      <div class="split-top">
        <p class="slide-eyebrow">Phase / Section Label</p>
        <div class="flow-horizontal">
          <div class="flow-item">
            <div class="flow-number">01</div>
            <div class="flow-body">
              <h4>Step One</h4>
              <p>Short description of this phase or action.</p>
            </div>
          </div>
          <div class="flow-item">
            <div class="flow-number">02</div>
            <div class="flow-body">
              <h4>Step Two</h4>
              <p>Short description of this phase or action.</p>
            </div>
          </div>
          <div class="flow-item">
            <div class="flow-number">03</div>
            <div class="flow-body">
              <h4>Step Three</h4>
              <p>Short description of this phase or action.</p>
            </div>
          </div>
          <div class="flow-item">
            <div class="flow-number">04</div>
            <div class="flow-body">
              <h4>Step Four</h4>
              <p>Short description of this phase or action.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom zone: table left, chart right -->
      <div class="split-bottom">
        <!-- Left: data-table -->
        <div class="split-table-col">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>2024</th>
                  <th>2025</th>
                  <th>2026</th>
                  <th>YoY</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Apparel</td>
                  <td>18.4</td>
                  <td>16.1</td>
                  <td>14.2</td>
                  <td class="delta positive">−12%</td>
                </tr>
                <tr>
                  <td>Footwear</td>
                  <td>9.7</td>
                  <td>8.4</td>
                  <td>7.3</td>
                  <td class="delta positive">−13%</td>
                </tr>
                <tr>
                  <td>Accessories</td>
                  <td>4.2</td>
                  <td>3.9</td>
                  <td>3.4</td>
                  <td class="delta positive">−13%</td>
                </tr>
                <tr class="subtotal">
                  <td>Total (kt CO₂e)</td>
                  <td>32.3</td>
                  <td>28.4</td>
                  <td>24.9</td>
                  <td class="delta positive">−12%</td>
                </tr>
              </tbody>
            </table>
            <p class="table-caption">Thousands of tonnes CO₂e · Scope 1+2+3 combined</p>
          </div>
        </div>

        <!-- Right: echart-panel -->
        <div class="echart-panel split-chart-col">
          <div class="echart-header">
            <p class="echart-title">Internal Carbon Price</p>
            <p class="echart-subtitle">USD / tonne CO₂e · 2022–2026</p>
          </div>
          <div class="echart-container" id="chart-candlestick"></div>
        </div>
      </div>

    </div>
  </div>
</section>
```

```css
.split-dashboard {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
}

.split-top {
    flex: 0 0 auto;
    padding-bottom: 36px;
    border-bottom: 1px solid var(--line-strong);
}

.split-top .slide-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 24px;
}

.split-bottom {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 5fr 7fr;
    gap: 56px;
    padding-top: 36px;
    align-items: start;
}

.split-table-col {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.split-chart-col {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.split-chart-col .echart-container {
    flex: 1;
    min-height: 0;
    height: 100%;
}
```

Rules:
- The top band should contain exactly one `flow-horizontal` with 4 items (5 is acceptable for very short copy).
- The bottom left column uses `data-table` for tabular data with `delta` markers.
- The bottom right column uses `echart-panel` — set the chart container to `height: 100%` rather than a fixed pixel height.
- Use `slide-qa="true"` on this layout since the two-column bottom zone requires symmetry checking.
- The eyebrow label in `.split-top` establishes section context; keep it short (1–4 words).

##### Tips
- **Dark background variant: flat overlay, not gradient.** When placing a background image behind all content, use a flat semi-transparent overlay `rgba(14,12,10,0.70–0.78)` rather than a directional gradient. Directional gradients create bright zones that make the text in either the table or chart area hard to read.
- **CSS variable override at the dashboard level.** Set `--text-primary`, `--text-secondary`, `--text-muted`, `--line`, `--line-strong` to white-family values on the `.split-dashboard` container (`color:#f7f4ee`). This single override cascades into `flow-horizontal`, `data-table`, and `echart-panel` headers automatically.
- **Bottom columns: `align-items:end`** aligns the table's bottom edge with the chart's bottom edge, which reads as a unified data zone. Avoid `align-items:stretch` unless both columns have equal natural height.
- **flow-horizontal step copy must be short.** Each step body gets one column width. Long paragraphs in any step will overflow the column and break alignment. Trim to 1–3 sentences maximum.
- **`data-table-wrap` dark overrides.** Set `--accent-earth` → `var(--accent-gold)` so col-highlight headers remain legible on dark. Set `--accent-olive` → a lighter shade (e.g., `#8faf7e`) since the default olive green is too dark on a dark background. Also override `.table-caption` color explicitly: `rgba(247,244,238,0.45)`.
- **Page number.** Use `.page-number--light` on any dark-background version of this layout.
<!-- @layout:split-dashboard:end -->

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
    display: flex;
    align-items: flex-start;
    width: 100%;
}

.flow-horizontal .flow-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-right: 40px;
    border-right: 1px solid var(--line-strong);
    margin-right: 40px;
}

.flow-horizontal .flow-item:last-child {
    border-right: none;
    padding-right: 0;
    margin-right: 0;
}

.flow-horizontal .flow-number {
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
- Do not use arrowheads or chevrons between items; the thin vertical rule is the only connector.
- Number labels are report-style (`01`, `02`, `03`), not circles or bullets.
- Keep each item's body copy short — this is a reference summary, not a detailed explanation.

##### Tips
- **Dark background color overrides.** Flow-number: `border-color:rgba(247,244,238,0.3); color:rgba(247,244,238,0.6)`. Heading h4: `color:#f7f4ee`. Body p: `color:rgba(247,244,238,0.7)`. Apply inline on each element — CSS cascade does not automatically inherit from the slide background.
- **Step copy length directly affects column balance.** One step with a long paragraph will push its column taller than the others and break the horizontal rhythm. Trim all steps to roughly equal length (2–4 lines each).
- **Vertical rule connector.** The `border-right` on `.flow-item` is the visual connector. On dark backgrounds, override it to `border-right-color:rgba(247,244,238,0.15)`. Do not add custom decorative elements as connectors.
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

Annual-report format data table. Use for year-on-year comparisons, emissions data, supply chain figures, and any structured numeric dataset that requires legible column alignment.

```html
<div class="data-table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Scope</th>
        <th>2018</th>
        <th>2019</th>
        <th>2020</th>
        <th>2020 vs. 2019</th>
        <th>2020 vs. 2018</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>1,329.2</td>
        <td>1,273.4</td>
        <td>1,156.4</td>
        <td class="delta positive">+2%</td>
        <td class="delta positive">+7%</td>
      </tr>
      <tr>
        <td>2</td>
        <td>1,617.8</td>
        <td>1,432.9</td>
        <td>0.0</td>
        <td class="delta negative">−100%</td>
        <td class="delta negative">−100%</td>
      </tr>
      <tr class="subtotal">
        <td>1+2 (net)</td>
        <td>2,905.5</td>
        <td>3,286.3</td>
        <td>1,156.4</td>
        <td class="delta negative">−35%</td>
        <td class="delta negative">−58%</td>
      </tr>
    </tbody>
  </table>
  <p class="table-caption">Thousands of tonnes CO₂e · Source: Company Disclosures 2021</p>
</div>
```

```css
.data-table-wrap {
    width: 100%;
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
}

.data-table th:not(:first-child),
.data-table td:not(:first-child) {
    text-align: right;
}

.data-table tbody tr {
    border-bottom: 1px solid var(--line);
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
    border-bottom: none;
}

.data-table .delta {
    font-weight: 600;
}

.data-table .delta.positive {
    color: var(--accent-olive);
}

.data-table .delta.negative {
    color: var(--accent-danger);
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
- Use `.subtotal` on summary rows (totals, net figures) to apply heavier weight.
- `.delta.positive` and `.delta.negative` use Summit accent colours, not generic green/red.
- Include a `.table-caption` with the data source and unit.

##### Tips
- **Dark background: override CSS variables on `.data-table-wrap`.** Set `--text-primary:#f7f4ee`, `--text-secondary:rgba(247,244,238,0.7)`, `--text-muted:rgba(247,244,238,0.45)`, `--line:rgba(247,244,238,0.12)`, `--line-strong:rgba(247,244,238,0.28)`. All child elements (th, td, thead, tr) inherit these automatically via `var()` — no per-cell inline styles needed.
- **Col-highlight header on dark.** Override `--accent-earth` → `var(--accent-gold)` on `.data-table-wrap` so the highlighted column header remains visible. The default `--accent-earth` (#8d6a49) is too dark on dark backgrounds.
- **Delta positive on dark.** Override `--accent-olive` → a lighter value (e.g., `#8faf7e`) on `.data-table-wrap`. The default `--accent-olive` (#6f7562) reads as near-black on dark backgrounds.
- **`.table-caption` on dark.** Must be set explicitly: `color:rgba(247,244,238,0.45)`. It does not pick up the CSS variable override from `.data-table-wrap`.
- **`align-items:end` in split layouts.** When pairing `data-table` with a chart in a two-column zone, use `align-items:end` on the grid so the table bottom aligns with the chart bottom. This makes the two elements read as a unified data block.
<!-- @component:data-table:end -->

<!-- @design:components:end -->
