# Revela

![Revela logo](assets/img/logo.png)

An [OpenCode](https://opencode.ai) plugin that turns your AI into a presentation designer. Describe your slides in conversation — Revela handles the rest and outputs a self-contained HTML file you can open in any browser.

---

## Install

### From npm _(coming soon)_

```bash
opencode plugin revela
```

### From source

```bash
git clone https://github.com/your-org/revela
cd revela
npm install
```

Create a wrapper file at `~/.config/opencode/plugins/revela.js`:

```js
export { default } from "/absolute/path/to/revela/index.ts";
```

Restart OpenCode. You should see `/revela` in the command palette.

---

## Commands

```
/revela                          show status and command reference
/revela enable                   turn on slide generation mode
/revela disable                  turn it off
/revela designs                  list installed designs
/revela designs <name>           switch to a design
/revela domains                  list installed domains
/revela domains <name>           switch to a domain
/revela designs-add <url>        install a design from a URL or github:user/repo
/revela domains-add <url>        install a domain from a URL or github:user/repo
```

Once enabled, just describe what you want. Revela will ask a few questions (topic, audience, slide count) and then generate the deck.

---

## Built-in Designs

Three designs available out of the box — switch with `/revela designs <name>`.

| default | minimal | editorial-ribbon |
|:---:|:---:|:---:|
| ![default](assets/img/slide-example-default.png) | ![minimal](assets/img/slide-example-minimal.png) | ![editorial-ribbon](assets/img/slide-example-ribbon.png) |

---

## Custom Designs

A design is a folder with a `DESIGN.md` file. The frontmatter tells Revela about it:

```yaml
---
name: my-design
description: Short description shown in /revela designs
author: you
version: 1.0.0
---
```

The body is injected into the AI's system prompt as visual style instructions — write it however you like. For larger designs, you can use the optional marker system to keep per-round token usage low:

```html
<!-- @section:global:start -->
Color palette, typography, core CSS...
<!-- @section:global:end -->

<!-- @section:components:start -->
<!-- @component:card:start -->
Card component HTML + CSS...
<!-- @component:card:end -->
<!-- @section:components:end -->
```

Revela automatically injects the `global` section every turn and builds a component index from the markers. Individual components are fetched on demand by the AI when it needs them, instead of flooding the context with thousands of tokens up front.

To install a design from a GitHub repo:

```
/revela designs-add github:your-org/your-design
```
