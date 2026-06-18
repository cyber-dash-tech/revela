---
name: lucent-dark
description: Dark luminous report design with midnight analytical pages, blue-violet gradients, and high-contrast data-forward layouts
author: cyber-dash
version: 1.0.0
preview:
---

## Visual Style - Lucent Dark

Lucent Dark is a high-contrast executive report design for analytical and strategic decks. It uses midnight pages, restrained glass textures, crisp Chinese/English typography, and blue-violet-cyan accent gradients. The design is optimized for source-backed narrative, charts, Sankey flows, tables, recommendation cards, and polished cover/closing moments.

<!-- @design:foundation:start -->

### Foundation

Use a fixed `1920px` x `1080px` `.slide-canvas` inside a dark navy browser frame. Scale the canvas with JavaScript transform on viewport resize. Keep all dimensions fixed in pixels; do not use viewport-scaled typography.

```css
:root {
  --bg-frame: #07111f;
  --bg-page: #f7f9fc;
  --bg-page-alt: #eef3f9;
  --surface: #ffffff;
  --surface-tint: #f1f6fc;
  --surface-blue: #e7f0fb;
  --text-primary: #101a2b;
  --text-secondary: #42526a;
  --text-muted: #7b8aa0;
  --line: rgba(44, 70, 108, 0.14);
  --line-strong: rgba(44, 70, 108, 0.28);
  --accent-primary: #315eea;
  --accent-secondary: #6e5df6;
  --accent-cyan: #18a8d8;
  --accent-coral: #f06370;
  --accent-soft: #dbe8ff;
  --shadow-soft: rgba(30, 65, 130, 0.13);
  --font-display: DengXian, "Microsoft YaHei", "PingFang SC", Arial, ui-sans-serif, sans-serif;
  --font-body: DengXian, "Microsoft YaHei", "PingFang SC", Arial, ui-sans-serif, sans-serif;
  --grid-margin-x: 72px;
  --grid-margin-y: 56px;
  --grid-columns: 12;
  --grid-gutter: 24px;
  --grid-safe-top: 56px;
  --grid-safe-bottom: 64px;
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-5: 48px;
  --space-6: 72px;
  --font-size-caption: 16px;
  --font-size-body: 22px;
  --font-size-body-small: 18px;
  --font-size-h3: 31px;
  --font-size-h2: 52px;
  --font-size-hero: 104px;
  --surface-radius: 8px;
  --surface-radius-large: 12px;
}
```

Design contract:
- Grid: content slides use a 12-column mental grid inside `--grid-margin-x` / `--grid-margin-y`; layout slots should align to declared grid rails or documented column ratios.
- Safe area: titles, body slots, source notes, page numbers, and logos stay inside the safe area unless a `hero` layout owns a full-bleed image.
- Spacing: use the `--space-*` scale and keep dense report pages on an 8px rhythm; do not hand-tune every card with unrelated gaps.
- Type scale: use the declared fixed-pixel type tokens for the 1920x1080 canvas; do not use `clamp()`, viewport units, or negative tracking.
- Surfaces: cards and panels use `--surface`, `--line`, `--shadow-soft`, and radius tokens; avoid new one-off glass/orb treatments outside Lucent's supplied assets.
- Chart tokens: ECharts use `--accent-primary`, `--accent-secondary`, `--accent-cyan`, `--accent-coral`, transparent backgrounds, muted axes, and explicit container heights.

Asset policy:
- Use `assets/cover-background.jpg` and `assets/closing-background.jpg` for full-bleed hero backgrounds.
- Use `assets/toc-orb.png` only when transparency is needed for the Lucent glass orb.
- Use `assets/soft-texture.jpg`, `assets/card-lens.jpg`, and `assets/report-visual.jpg` as subtle report accents; never inline base64 images in generated decks.

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

### Rules

- Use Lucent for strategy, operating review, research synthesis, market diagnosis, and data-backed decision decks.
- Prefer bright report pages with subtle radial accents. Reserve dark full-bleed imagery for cover, section divider, and closing slides.
- Put the slide-level title in each layout's title slot or hero text area. Do not hide the main claim inside a card.
- Treat the design as a measurable report system: every content layout should expose clear grid rails, stable slot dimensions, and a visible reading order.
- Use declared spacing/type/surface tokens before adding local CSS. Local overrides should serve a documented state such as dense table, long title, or mixed-language body copy.
- Preview examples should mark every layout with `data-preview-layout="<layout-name>"` and every component with `data-preview-component="<component-name>"`.
- Use `box` for one idea, evidence item, operating gap, risk, or action. Use 2-4 boxes on dense synthesis slides.
- Use ECharts for all data charts, including Sankey. Do not fake charts with CSS shapes.
- Keep typography quiet and legible: large claim headings, compact metadata, and source notes in muted color.
- Avoid decorative orbs except the Lucent glass assets provided in `assets/`; do not create new gradient blobs.
- All image assets in design previews must be local package assets under `designs/lucent-dark/assets/`.

<!-- @design:rules:end -->

<!-- @design:layouts:start -->

<!-- @layout:cover:start qa=false -->
Full-bleed opening slide with one dominant background image, dark overlay, and bottom-left hero title. Slots: `hero`.
<!-- @layout:cover:end -->

<!-- @layout:toc:start qa=true -->
Two-column table of contents with a left title rail, right numbered agenda, and optional glass orb. Slots: `left`, `list`, `asset`.
<!-- @layout:toc:end -->

<!-- @layout:report-story:start qa=true -->
Report slide with top title block and a two-column body for narrative text plus supporting media or evidence. Slots: `title`, `left`, `right`.
<!-- @layout:report-story:end -->

<!-- @layout:card-grid:start qa=true -->
Top title block with three card columns. Use for insight clusters, operating gaps, or comparison. Slots: `title`, `cards`.
<!-- @layout:card-grid:end -->

<!-- @layout:chart-with-takeaways:start qa=true -->
Top title block with a dominant chart on the left and stacked takeaway cards on the right. Slots: `title`, `chart`, `takeaways`.
<!-- @layout:chart-with-takeaways:end -->

<!-- @layout:sankey:start qa=true -->
Top title block with a wide Sankey chart and a right explanation column. Slots: `title`, `sankey`, `takeaways`.
<!-- @layout:sankey:end -->

<!-- @layout:table:start qa=true -->
Top title block with one large table panel and explanatory reading notes. Slots: `title`, `table`.
<!-- @layout:table:end -->

<!-- @layout:roadmap:start qa=true -->
Top title block with a horizontal four-phase roadmap across the body. Slots: `title`, `roadmap`.
<!-- @layout:roadmap:end -->

<!-- @layout:recommendation:start qa=true -->
Three-column recommendation page with primary recommendation, reasoning, and next steps. Slots: `recommendation`, `rationale`, `steps`.
<!-- @layout:recommendation:end -->

<!-- @layout:closing:start qa=false -->
Full-bleed closing slide with a background image, soft overlay, and concise final title. Slots: `hero`.
<!-- @layout:closing:end -->

<!-- @design:layouts:end -->

<!-- @design:components:start -->

<!-- @component:hero:start -->
Full-canvas image-backed hero with `.hero`, `.hero-bg`, `.hero-shade`, and `.hero-title`. Use only for cover, section divider, and closing slides.
<!-- @component:hero:end -->

<!-- @component:toc:start -->
Lucent agenda component using `.toc-wrap`, `.toc-title`, `.toc-list`, and optional `.toc-orb`. Use for navigation, not for normal text-heavy content.
<!-- @component:toc:end -->

<!-- @component:text-panel:start -->
Focused text module for setup, reading guidance, and narrative explanation. Use inside report layouts or boxes.
<!-- @component:text-panel:end -->

<!-- @component:box:start -->
Card/group primitive for insights, evidence, operating gaps, recommendations, and rationale. Use `.box`, `.insight-card`, or `.rec-panel` depending on density.
<!-- @component:box:end -->

<!-- @component:media:start -->
Image frame for screenshots, report visuals, diagrams, and supporting photography. Use local assets and keep evidence visuals readable.
<!-- @component:media:end -->

<!-- @component:stat-card:start -->
Compact metric tile with `.stat-card` and `.stat-value`. Use for one number plus one interpretation line.
<!-- @component:stat-card:end -->

<!-- @component:echart-panel:start -->
Chart frame with `.echart-panel`, `.chart-header`, `.echart-container`, and caption/source text. Use ECharts after DOM initialization and call resize on viewport changes. Sankey charts are an `echart-panel` usage pattern, not a separate primary component; keep the chart wide, labels muted, and interpretation in the layout's takeaway slot.
<!-- @component:echart-panel:end -->

<!-- @component:data-table:start -->
Structured table component with `.table-panel`, tabular numbers, muted headers, and right-aligned numeric columns.
<!-- @component:data-table:end -->

<!-- @component:roadmap-horizontal:start -->
Four-phase horizontal roadmap with alternating cards around a gradient axis. Use for staged plans, milestones, or migration paths. The dot is the milestone marker, not card decoration: place each marker on the shared axis and connect the card back to that marker so the phase label, card, and axis read as one anchored event.
<!-- @component:roadmap-horizontal:end -->

<!-- @component:steps:start -->
Ordered action list for next steps. Keep it short: three to five steps, each with a number and one concise action.
<!-- @component:steps:end -->

<!-- @component:page-number:start -->
Small absolute page number utility. Use muted color on report pages and light color on dark hero pages.
<!-- @component:page-number:end -->

<!-- @component:brand-watermark:start -->
Small top-right logo or brand mark. Keep it clear, restrained, and never use logos as decorative backgrounds.
<!-- @component:brand-watermark:end -->

<!-- @design:components:end -->

<!-- @design:page-templates:start -->

### Page Template Mapping

Lucent skins Revela built-in page templates without owning their semantic structure. The template renderer owns required fields, DOM skeletons, and template QA; Lucent supplies bright report surfaces, blue-violet-cyan accents, fixed-pixel typography, and local assets.

- `cover`, `section-divider`, `closing`: use full-bleed hero treatment with Lucent package assets.
- `agenda`, `executive-summary`, `problem-context`, `key-message-evidence`, `claim-supporting-visual`: use report-story/card-grid language with quiet surfaces.
- `metric-highlight`, `chart-takeaways`, `table-comparison`: use data-forward Lucent panels with explicit interpretation regions.
- `milestone`: map to the horizontal roadmap visual system. Dots remain milestone anchors inside each milestone item; do not absolutely position detached decorative dots.
- `timeline`: map to the vertical timeline visual system. Dots remain event anchors inside each timeline item; do not absolutely position detached decorative dots.
- `process-steps`, `recommendation-decision`, `risks-tradeoffs`: use recommendation and steps surfaces with no nested card-in-card framing.

<!-- @design:page-templates:end -->

<!-- @design:chart-rules:start -->

### Chart Rules

- Use ECharts for line, bar, and Sankey charts.
- Initialize charts after `SlidePresentation` setup and resize them on `window.resize`.
- Use Lucent chart colors: `#315eea`, `#6e5df6`, `#18a8d8`, `#f06370`, and muted text `#7b8aa0`.
- Keep chart backgrounds transparent and place charts inside stable `.echart-container` regions with explicit height or flex sizing.
- Sankey charts inside `echart-panel` should use low-curvature links, restrained labels, and a separate takeaway column for interpretation.

<!-- @design:chart-rules:end -->
