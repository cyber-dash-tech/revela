# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-125%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela 是一个 [OpenCode](https://opencode.ai) 插件，可以把你当前使用的 agent 变成 HTML 幻灯片生成器。
在当前会话中启用之后，agent 可以完成调研、结构设计、HTML 写作、QA 和导出。

**[在线演示 — AI 权力转移](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)**

---

## 它能做什么

- 通过 `/revela enable` 向当前 agent 注入演示文稿专用 system prompt
- prompt 由 3 层组成：核心 skill、当前 domain、当前 design
- 支持工作区文档扫描，以及 `.pdf`、`.docx`、`.pptx`、`.xlsx` 的透明文本提取和嵌入素材缓存提取
- agent 每次写入 `decks/*.html` 时自动执行布局 QA
- 支持导出成 PDF 和可编辑 PPTX
- design 和 domain 的切换都在本地完成，不消耗 LLM token

Revela 是一种工作模式，不是独立 agent。

---

## 环境要求

- [OpenCode](https://opencode.ai)
- Bun 运行时 `>= 1.0.0`
- [Google Chrome](https://www.google.com/chrome/) 或 Chromium，用于 QA、PDF 导出和 PPTX 导出
- Git，用于源码安装

---

## 安装

### 标准安装

在 `opencode.json` 的 `plugin` 数组中加入 `@cyber-dash-tech/revela`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@cyber-dash-tech/revela"]
}
```

然后重启 OpenCode。

如果想全局安装，可以把同样配置写到 `~/.config/opencode/opencode.json`。

OpenCode `v1.14.22+` 在插件安装时已经会遵循 `.npmrc` 设置，因此默认应优先使用
`plugin` 字段直接安装。

### 本地 wrapper 安装

如果你的环境里直接安装仍然受阻，或者你想在开发时直接运行本地源码仓库，可以使用本地 wrapper。

```bash
git clone https://github.com/cyber-dash-tech/revela
cd revela
npm install
```

创建 `~/.config/opencode/plugins/revela.js`：

```js
export { default } from "/absolute/path/to/revela/index.ts";
```

如果使用本地 wrapper，记得把 `opencode.json` 里的 `@cyber-dash-tech/revela` `plugin` 配置删掉，否则 OpenCode 仍可能尝试用 Bun 安装。

### 中国大陆网络说明

在 OpenCode `v1.14.22` 之前，插件安装在某些环境下可能不会遵循镜像相关的 registry 设置。
从 `v1.14.22+` 开始，直接安装应当会遵循 `.npmrc`。如果在你的本地网络或环境里仍然安装失败，再使用上面的本地 wrapper 方案作为 fallback。

---

## 快速开始

先在当前会话中启用 Revela：

```text
/revela enable
```

如有需要，先切换 design 或 domain：

```text
/revela designs
/revela designs summit
/revela domains deeptech-investment
```

然后直接给 agent 一个 deck 任务：

```text
Create a 6-slide HTML deck on humanoid robotics supply chains. Cite the main market drivers, use the active design faithfully, and save the result to decks/humanoid-robotics.html.
```

需要导出时：

```text
/revela pdf decks/humanoid-robotics.html
/revela pptx decks/humanoid-robotics.html
```

完成后关闭演示文稿模式：

```text
/revela disable
```

---

## 命令

```text
/revela                          显示当前状态与帮助
/revela enable                   为当前会话启用演示文稿模式
/revela disable                  关闭演示文稿模式

/revela designs                  列出已安装 design
/revela designs <name>           激活某个 design
/revela designs-add <source>     从 URL、本地路径或 github:user/repo 安装 design
/revela designs-rm <name>        删除已安装 design

/revela domains                  列出已安装 domain
/revela domains <name>           激活某个 domain
/revela domains-add <source>     从 URL、本地路径或 github:user/repo 安装 domain
/revela domains-rm <name>        删除已安装 domain

/revela pdf <file>               将 HTML deck 导出为同目录 PDF
/revela pptx <file>              将 HTML deck 导出为同目录可编辑 PPTX
```

所有 `/revela` 命令都在本地执行，不消耗 LLM token。

---

## 工作原理

启用 Revela 后，它会把一份动态生成的 prompt 追加到当前 agent 的 system prompt 中。

这份 prompt 由 3 层组成：

1. `skill/SKILL.md` - 核心幻灯片生成流程
2. 当前 active domain - 行业结构与术语
3. 当前 active design - 视觉系统、layout、component 和图表规则

持久化配置保存在 `~/.config/revela/config.json`。
是否启用 Revela 则只在当前会话生效。

---

## 调研与文件摄取

启用 Revela 后，agent 可以使用：

- `revela-workspace-scan` 扫描工作区中的 PDF、Office 文件、CSV、Markdown 和文本文件
- `revela-research` 子代理做定向网页调研
- `revela-research-save` 把结构化 findings 写入 `researches/<topic>/`

支持提取文本的入口：

- 在对话里 `@` 引用或直接粘贴文件
- 启用 Revela 后通过 `read` 工具访问文件

支持提取的文件类型：

- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`

这些提取过程对主 agent 是透明的。

---

## 布局 QA 与合规检查

每次 agent 写入 `decks/*.html` 时，Revela 都会自动在 `1920x1080` 下运行一轮基于 Puppeteer 的 QA。
报告会立刻返回，便于 agent 继续修正。

当前 QA 维度：

| 维度 | 检查内容 |
|---|---|
| `overflow` | 元素是否超出 slide canvas |
| `balance` | 是否过稀、重心偏移、底部留白过大 |
| `symmetry` | 并列列之间的高度或密度是否明显失衡 |
| `rhythm` | 垂直堆叠元素之间的间距节奏是否不稳定 |
| `compliance` | 是否使用了 active design 之外的 class 或新增 CSS 规则 |

每张 slide 都必须声明 `slide-qa="true"` 或 `slide-qa="false"`。

- `slide-qa="true"` 适用于内容型页面，执行完整 QA
- `slide-qa="false"` 适用于封面、目录、引用、总结、结尾等结构型页面

也可以手动调用 `revela-qa` 工具执行 QA。

---

## Designs 与 Domains

用 `/revela designs` 和 `/revela domains` 查看你当前环境里实际安装的内容。

仓库内置的 domains：

| 名称 | 说明 |
|---|---|
| `general` | 不做领域专化 |
| `deeptech-investment` | VC / 投资分析：市场规模、技术成熟度、护城河与投资逻辑 |
| `consulting` | 战略咨询：go/no-go 判断、战略设计与 belief-change 报告 |

仓库中的 design 示例：

| 名称 | 说明 | 预览 |
|---|---|---|
| `summit` | 年报式 editorial 风格，适合图像更丰富、叙事感更强的商业表达 | ![summit](assets/img/slide-example-summit.jpg) |
| `monet` | 更轻、更安静的 serif 视觉系统，适合带有 art direction 气质的商业叙事 | 仓库内含 `DESIGN.md` |

---

## 自定义 Designs

自定义 design 本质上是一个包含 `DESIGN.md` 的文件夹。目录名通常会成为安装后的 design 名称，
除非安装器从来源中推断出其他名称。

推荐目录结构：

```text
my-design/
├── DESIGN.md
└── preview.html        可选，但推荐，方便人工预览
```

`DESIGN.md` 顶部使用 frontmatter：

```yaml
---
name: my-design
description: 在 /revela designs 中显示的简短说明
author: you
version: 1.0.0
---
```

### 最小可用示例

下面是一个最小但可工作的 `DESIGN.md` 结构。它至少给模型提供了明确的视觉系统、一个 layout 和一个可复用 component。

```md
---
name: alpine-brief
description: Minimal editorial design for strategy decks
author: you
version: 1.0.0
---

## Visual Style

Apply this visual style to every slide in the deck.

<!-- @design:foundation:start -->
### Color Palette

```css
:root {
  --bg: #f6f2ea;
  --surface: #fffdf8;
  --text-primary: #1c1a17;
  --text-secondary: #625b52;
  --accent: #8a6a45;
  --line: rgba(28, 26, 23, 0.14);
  --font-display: 'IBM Plex Sans Condensed', 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

### Typography

- 标题使用 `--font-display`
- 正文使用 `--font-body`
- 所有尺寸都固定为 `px`，基于 `1920x1080` 画布设计

### HTML Structure

- 每张 slide 都必须使用 `<section class="slide" slide-qa="true|false">`
- 每张 slide 内都必须有一个 `.slide-canvas`
- 所有 CSS 放在一个 `<style>` 块里，所有 JS 放在一个 `<script>` 块里
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
### Composition Rules

- 使用偏暖的浅色背景和克制的棕色强调色
- 文字列保持偏窄，给足留白
- 避免 glow、glassmorphism、neon gradient 和 dashboard 风格
<!-- @design:rules:end -->

<!-- @design:layouts:start -->
<!-- @layout:cover:start qa=false -->
### Cover layout

- 居中的标题堆叠
- 顶部有小号 eyebrow
- 标题下方有一条细的强调色分隔线
<!-- @layout:cover:end -->

<!-- @layout:two-col:start qa=true -->
### Two-column layout

- 左列负责论点，右列负责证据
- 推荐比例：`5 / 7`
- 左列宽度尽量控制在 `520px` 以内，保证段落可读性
<!-- @layout:two-col:end -->
<!-- @design:layouts:end -->

<!-- @design:components:start -->
<!-- @component:stat-card:start -->
### Stat card (`.stat-card`)

```html
<div class="stat-card">
  <div class="stat-label">Revenue CAGR</div>
  <div class="stat-value">27%</div>
  <div class="stat-note">2024-2028E</div>
</div>
```

```css
.stat-card {
  border-top: 1px solid var(--line);
  padding-top: 18px;
}

.stat-label {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.stat-value {
  margin-top: 10px;
  font-family: var(--font-display);
  font-size: 72px;
  line-height: 0.95;
}

.stat-note {
  margin-top: 8px;
  font-size: 16px;
  color: var(--text-secondary);
}
```
<!-- @component:stat-card:end -->
<!-- @design:components:end -->
```

### Marker 体系

对于较大的 design，建议使用 marker 体系，这样 Revela 可以把常驻 prompt 控制在较小体积，
只在需要时按需读取 layout / component 细节：

```html
<!-- @design:foundation:start -->
Foundation rules
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
Design rules
<!-- @design:rules:end -->

<!-- @design:layouts:start -->
<!-- @layout:cover:start qa=false -->
Layout details
<!-- @layout:cover:end -->
<!-- @design:layouts:end -->

<!-- @design:components:start -->
<!-- @component:card:start -->
Component details
<!-- @component:card:end -->
<!-- @design:components:end -->

<!-- @design:chart-rules:start -->
Chart rules
<!-- @design:chart-rules:end -->
```

各类 marker 的职责：

- `@design:foundation`：设计 token、HTML 骨架、CSS 基础、字体、间距、页面 framing
- `@design:rules`：构图原则、do / don't、art direction 限制、交互规则
- `@design:layouts`：具名 layout 配方，例如 `cover`、`toc`、`two-col`、`data-vis`
- `@design:components`：可复用组件，例如 `card`、`stat-card`、`quote-block`
- `@design:chart-rules`：只有图表页才需要的图表规范

Layout marker 编写建议：

- 名称保持稳定、简单，例如 `cover`、`two-col`、`stats`、`timeline`
- 内容密集型 layout 用 `qa=true`，结构型或刻意稀疏的 layout 用 `qa=false`
- 每个 layout 都写成配方：用途、推荐结构、推荐比例、已知约束

Component marker 编写建议：

- 至少提供一个具体 HTML 示例
- 明确列出组件依赖的 CSS class 名
- 尽量复用少量稳定 class，不要堆太多一次性 class

Prompt 注入规则：

- 常驻注入：`@design:foundation`、`@design:rules`、layout index、component index
- 按需获取：单个 `@layout:*`、单个 `@component:*`、`@design:chart-rules`

如果 design 没有 marker，Revela 会退回到整份 `DESIGN.md` 全量注入。

### 实际编写建议

- 把不可妥协的规则放进 `foundation` 和 `rules`，不要只藏在某个 layout 里
- layout 名称尽量语义化，因为模型在 layout index 里首先看到的就是这些名字
- 如果定义了自定义 CSS class，记得在 `DESIGN.md` 里写出来；QA 会检查 design 词汇表之外的新 class
- 如果条件允许，最好同时提供 `preview.html`，方便人工预览和验收

安装自定义 design：

```text
/revela designs-add github:your-org/your-design
/revela designs-add https://example.com/my-design.zip
/revela designs-add ./path/to/local/design-folder
```

---

## 自定义 Domains

自定义 domain 是一个包含 `INDUSTRY.md` 的文件夹。

```text
/revela domains-add github:your-org/your-domain
```

`INDUSTRY.md` 是为兼容历史版本保留的文件名。

---

## 导出

PDF 导出：

```text
/revela pdf decks/my-deck.html
```

可编辑 PPTX 导出：

```text
/revela pptx decks/my-deck.html
```

两种导出都会把结果写到源 HTML deck 同目录。

---

## 开发

```bash
bun test
bun run typecheck
```

开启详细日志：

```bash
REVELA_DEBUG=1 opencode
```

---

## 许可证

MIT - 见 [LICENSE](LICENSE)
