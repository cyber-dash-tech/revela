# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-451%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela 是一个 [OpenCode](https://opencode.ai) 插件，用来把工作区来源材料、调研、证据和用户意图转成可信的叙事型沟通 artifact。
它的第一个 render target 仍然是 HTML slide deck：启动 Revela workflow command 之后，agent 可以完成调研、结构设计、HTML 写作、QA、检查、refine 和导出。

**[在线演示 — AI 权力转移](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)**

---

## 它能做什么

- 为 `/revela init`、`/revela story`、`/revela make --deck` 等显式命令注入一次性 workflow instructions
- 只有在显式运行 `/revela make --deck` 时，才切换到 deck-render prompt mode
- 支持工作区文档扫描，以及 `.pdf`、`.docx`、`.pptx`、`.xlsx` 的透明文本提取和嵌入素材缓存提取
- 存在 `revela-narrative/` 时，将它作为可编辑 Markdown narrative vault，并让 `DECKS.json` 作为兼容/render-state mirror
- 先检查 narrative readiness，再用独立 deck/artifact gate 保护 deck HTML 写入
- 记录 review snapshots，避免重要状态变化后旧的 ready 结果继续默默授权写入 deck HTML
- 把 HTML deck、PDF 和 PPTX 视为来自同一 workspace state 的 render targets，而不是互相孤立的输出文件
- agent 每次写入、patch 或 edit `decks/*.html` 时自动执行快速 design compliance 检查
- 为已有 deck 打开可视化评论编辑器，用户可以 Ctrl/Cmd + 点击元素，并把精确修改意见发回 OpenCode
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

---

## 快速开始

在新项目里可以先准备工作区：

```text
/revela init
```

如有需要，先切换 design 或 domain：

```text
/revela design
/revela design --use summit
/revela domain --use deeptech-investment
```

然后先打磨、调研或检查 story。叙事 ready 并获得批准后，再生成 deck：

```text
/revela story
/revela research
/revela make --deck
```

需要导出时，可以手动调用，也可以让 agent 直接导出：

```text
/revela export --deck pdf decks/humanoid-robotics.html
/revela export --deck pptx decks/humanoid-robotics.html
```

---

## 命令

```text
/revela                          show REVELA help

/revela init                     初始化或刷新 narrative workspace state
/revela research                 调研、绑定证据，并减少 story gaps/caveats
/revela story                    打开只读 story workspace UI
/revela make --deck              从已批准 story 生成 deck
/revela make --brief [file.md]   从已批准 story 渲染 executive brief
/revela review --deck            打开统一的 deck 阅读、洞察和评论 workspace
/revela export --deck pdf [file] 将 HTML deck 导出为同目录 PDF
/revela export --deck pptx [file] [--notes] 将 HTML deck 导出为可编辑 PPTX

/revela design                   列出已安装 design
/revela design --use <name>      激活某个 design
/revela design --new <name>      通过 AI 创建一个自定义 design
/revela design --edit <name>     通过 AI 调整已有自定义 design
/revela design --preview [name]  在浏览器中打开 design preview
/revela design --add <source>    从 URL、本地路径或 github:user/repo 安装 design
/revela design --rm <name>       删除已安装 design

/revela domain                   列出已安装 domain
/revela domain --use <name>      激活某个 domain
/revela domain --add <source>    从 URL、本地路径或 github:user/repo 安装 domain
/revela domain --rm <name>       删除已安装 domain
```

大多数 `/revela` 命令都在本地执行，不消耗 LLM token。`/revela init`、`/revela research`、`/revela story`、`/revela make --deck`、`/revela design --new`、`/revela design --edit` 和 `/revela export --deck pptx --notes` 会启动 AI 辅助流程，因为它们需要读取或更新项目状态。这些 workflow command 只在可见聊天里显示短意图，详细内部说明通过一次性的 system-prompt command intent 注入。`/revela review --deck` 是统一的 post-artifact workspace，会打开一个本地浏览器 workspace，里面有 Comment 和 Insight 两个 tab，并共享同一套 Cmd/Ctrl-click 元素引用。Comment 会把精准修改评论发回当前 OpenCode 会话；Insight 会把 grounded selection context 发给当前 OpenCode 会话，并渲染本地化的 Narrative Reading、Exploratory Reading、Source、Purpose 卡片。确定性预处理保留为 fallback context，而不是默认先展示的 UI。如果生成结果缺少较新的 reading 卡片，Review 会保留确定性 Narrative Reading 和 Exploratory Reading，而不是丢掉这些上下文。Narrative Reading 还会显示所选 canonical claim 的 artifact coverage，包括每个已记录 artifact 是否包含该 claim，以及 coverage 是 current、stale、partial 还是 missing。Exploratory Reading 明确是非官方阅读辅助，只能基于已记录 claim、evidence、caveat、objection、risk 和 artifact coverage。它没有聊天框，也不会修改 deck。`/revela edit` 和 `/revela inspect` 不再是公开命令；请使用 `/revela review --deck`。`/revela refine --deck` 仍作为兼容 alias 保留。

---

## 工作原理

显式 Revela workflow command 会把一次性 command instructions 追加到当前 agent 的 system prompt 中。你不需要先运行 ambient enable/disable；公开入口都在 `/revela` help 中列出。

默认 prompt 是 narrative-first：它遵循 `Init -> Research -> Story -> Make -> Review -> Export`，关注受众信念变化、decision/action、thesis、claims、证据边界、objections、risks、research gaps 和 approval。Active design CSS、layout catalog、component index、chart rules 和 deck HTML skeleton 在 `/revela make --deck` 切换到 deck-render mode 或 `/revela design` 进入显式设计工作流前不会注入。

Deck-render mode 由 2 层组成：

1. `skill/SKILL.md` - 核心 deck-render 流程
2. 当前 active design - 视觉系统、layout、component 和图表规则

Active domain 只进入 narrative pipeline。它帮助 `init`、`research`、`story`
形成 canonical narrative；`make --deck` 只渲染已批准的 narrative，不再重复注入完整 domain prompt。

持久化配置保存在 `~/.config/revela/config.json`。
显式 workflow command 会自动选择 narrative 或 deck-render prompt mode。

### Workspace State

存在 `revela-narrative/` 时，它就是 Revela 可编辑的 Markdown narrative vault，用来保存 audience、decision、thesis、claims、evidence nodes、objections、risks、research gaps 和 typed narrative relations。

`DECKS.json` 仍然是 Revela 的兼容状态和 render-state 文件。它仍然保存在工作区根目录，也仍然可以理解为当前 deck 项目的状态入口；但当 vault 存在时，顶层 `narrative` 是从 Markdown 编译得到的 mirror，不再是主要编辑面。

状态中会记录：

- 工作区来源材料和可复用的 extraction cache 路径
- 调研计划、已保存 findings，以及精简的 action provenance
- 编译得到的 canonical narrative mirror、approvals、objections、risks、slide specs、claim candidates 和 evidence trace
- active HTML deck 以及派生 PDF、PPTX 等 render targets
- 带 input hash 的 review snapshots，使重要状态变化后旧的 readiness 自动变 stale

已有的根目录 `DECKS.json` 工作区继续兼容。`revela-decks` 的 `exportNarrativeVault` action 可以把已有 canonical narrative state 导出到 `revela-narrative/`，同时不会把 approvals、render targets、review snapshots 或 artifact coverage 搬进 Markdown。生成缓存位于 `.opencode/revela/narrative-cache/`，不应手工编辑。`writeReadiness.status: "ready"` 只代表 deck/artifact readiness，永远不等于 narrative approval。

Deck 仍然是主要 authored artifact，但现在它是从同一份 workspace state 渲染出来的目标之一。后续 briefs、appendix material、Evidence Inspector views、Q&A 和 interactive reading layers 都可以复用同一套来源/证据逻辑，而不是各自生成孤立内容。

---

## 推荐使用流程

把 Revela 当成 narrative-first artifact workflow：

1. 新项目或工作区明显变化时，运行 `/revela init`。
2. 如果 story gaps 或 unsupported central claims 需要外部证据，用 `/revela research` 定向调研；它应循环执行 research、证据绑定、claim/relation 收窄和 re-review，直到公开调研无法继续改善状态。
3. 用 `/revela story` 打开 story workspace UI，查看 claim flow、证据、caveats、research gaps、approval state 和 artifact coverage。
4. 批准 narrative 或要求修改。如果需要在完整战略批准前渲染，必须记录 explicit render override。
5. 运行 `/revela make --deck`，把已批准 narrative 编译成 deck slide specs 并进入 deck-render mode，或运行 `/revela make --brief` 渲染 executive brief。
6. 只在 deck handoff 阶段选择或确认 design；`/revela make --deck` 会在 deck plan 确认后运行 deck/artifact gate。
7. 只有 artifact gate ready 后，才让 agent 把 HTML deck 写到 `decks/` 下。
8. 用 `/revela review --deck` 对选中 deck 元素做可视化评论、精准修改、只读 Narrative Reading、有边界的 Exploratory Reading、Source、Purpose 洞察，以及 claim-to-artifact coverage 查看。
9. post-artifact 修改统一使用 `/revela review --deck`；`/revela edit` 和 `/revela inspect` 不再是公开命令。
10. 用 `/revela export --deck pdf <file>` 或 `/revela export --deck pptx <file>` 导出。

普通聊天不需要 ambient command。需要 Revela 工作流时，直接运行对应的 `/revela ...` 显式命令。

`/revela story` 打开只读 story workspace UI，用于检查受众不清、缺信念变化、缺 decision/action、thesis 弱、central claims 无证据、evidence 弱、unsupported scope、objection 未处理、缺风险/假设处理、approval stale 或缺 approval。它不检查 design/layout readiness，也不会写最终 deck。

如果 Revela 阻止写入 deck，直接让 agent 继续 `/revela make --deck`，根据报告补齐 artifact 缺口后再写。这样可以避免在 slide specs、evidence projection、design/layout readiness、review snapshot 和 deck HTML contract 还不完整时覆盖真实 deck 文件。

---

## 调研与文件摄取

在 Revela workflow 中，agent 可以使用：

- `revela-workspace-scan` 扫描工作区中的 PDF、Office 文件、CSV、Markdown 和文本文件
- `revela-research` 子代理做定向网页调研
- `revela-research-save` 把结构化 findings 写入 `researches/<topic>/`
- `revela-research-images-list` 从 `researches/<topic>/*.md` 中提取结构化图片候选
- `revela-media-batch-save` 批量保存选中的调研图片素材到工作区 assets
- `revela-media-save` 把选中的本地或远程图片保存为 `assets/<topic>/media/` 下的可复用素材

支持提取文本的入口：

- 在对话里 `@` 引用或直接粘贴文件
- 在 Revela workflow 或 ambient mode 中通过 `read` 工具访问文件

支持提取的文件类型：

- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`

这些提取过程对主 agent 是透明的。

---

## 布局 QA 与合规检查

每次 agent 写入、patch 或 edit `decks/*.html` 时，Revela 都会自动运行快速静态 design compliance 检查。
手动 `revela-qa` 工具以及 PDF/PPTX 导出前置检查会额外在 `1920x1080` 下运行基于 Puppeteer 的 overflow 检查。

当前 QA 检查：

| 维度 | 检查内容 |
|---|---|
| `overflow` | 元素是否超出 slide canvas |
| `compliance` | 是否使用了 active design 之外的 class 或新增 CSS 规则 |

每张 slide 都必须声明 `slide-qa="true"` 或 `slide-qa="false"`。
当前 QA 路径将其保留为 deck metadata，不再启用额外的主观平衡或间距检查。

也可以手动调用 `revela-qa` 工具执行 QA。

---

## Designs 与 Domains

用 `/revela design` 和 `/revela domain` 查看你当前环境里实际安装的内容。旧的 `/revela designs*` 和 `/revela domains*` 命令只显示迁移帮助，不再执行旧行为。

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

你也可以让 Revela 交互式创建一个新的本地 design：

```text
/revela design --new my-design
```

Agent 会先询问你的审美参考，整理设计 brief 并等待确认，然后把 `DESIGN.md` 和 `preview.html` 保存到本地 Revela designs 目录。对 AI 生成的 design，`preview.html` 是必需验收面：它必须包含 cover 和 closing 页，并且必须展示所有 `@component:*`，否则 `revela-designs-author` 不会接受这个包。默认结构底座是内部中性 `starter` design，它不会出现在普通 design 列表中。只有当你明确想从 `summit` 或 `monet` 的具体风格派生时，才建议使用 `--base summit` 或 `--base monet`。

调整已有本地 design：

```text
/revela design --edit my-design
```

Agent 会询问你想修改什么，读取当前 design，整理 edit brief 并等待确认，然后通过受控 authoring tool 覆盖保存本地 design 包。

在浏览器中打开某个 design 的 preview：

```text
/revela design --preview my-design
```

省略 name 时会打开当前 active design 的 preview。如果该 design 没有 `preview.html`，Revela 会提示没有可用 preview。

推荐目录结构：

```text
my-design/
├── DESIGN.md
└── preview.html        AI 生成 design 必需
```

`DESIGN.md` 顶部使用 frontmatter：

```yaml
---
name: my-design
description: 在 /revela design 中显示的简短说明
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
- AI 生成的 design 必须在 `preview.html` 中包含 `<section class="slide" data-slide-role="cover">` 和 `<section class="slide" data-slide-role="closing">`
- AI 生成的 design 必须在 `preview.html` 中可视化展示每个 `@component:*`，并用 `data-preview-component="<component-name>"` 标记；否则 `revela-designs-author create/validate` 会失败
- 如果 design 支持图表样式，`preview.html` 应包含 3x3 ECharts 九宫格，至少展示 9 个 chart 示例；这是 agent 工作流的质量要求，不是硬校验 blocker

安装自定义 design：

```text
/revela design --add github:your-org/your-design
/revela design --add https://example.com/my-design.zip
/revela design --add ./path/to/local/design-folder
```

---

## 自定义 Domains

自定义 domain 是一个包含 `INDUSTRY.md` 的文件夹。

```text
/revela domain --add github:your-org/your-domain
```

`INDUSTRY.md` 是为兼容历史版本保留的文件名。

---

## 可视化编辑

正常的写后 review 和修改建议使用统一 refinement workspace：

```text
/revela review --deck
```

`/revela review --deck` 会打开 active HTML deck，并提供两个 tab。使用 `Ctrl`/`Cmd` + click 先引用 deck 元素，然后在 Comment 里快速写自然语言修改评论，或在 Insight 里做只读 Narrative Reading、有边界的 Exploratory Reading、Source、Purpose 和 artifact coverage 检查。Insight 不会修改 deck；真正的 mutation 仍然只走 Comment。这是 post-artifact 阅读、洞察和评论的推荐入口。

已移除命令：

```text
/revela edit
```

`/revela edit` 已移除。请使用 `/revela review --deck` 打开统一的阅读、洞察和评论 workspace。

使用 `Ctrl`/`Cmd` + 点击 deck 元素来引用它们，在 Comment tab 写一段自然语言评论，然后发送回 OpenCode。Revela 会把 deck 文件、slide 上下文、选中元素 metadata 和你的评论整理成结构化 edit prompt。

对应的 LLM tool：`revela-edit`，不需要 target。这个 tool 仍作为兼容入口保留，当你说“我要编辑这个 deck”时，agent 会打开 Review 的 Comment mode。

对于已有 HTML deck，`/revela review --deck` 会自动准备必要的最小项目上下文，让后续精准修改仍然经过正常安全检查。

---

## Evidence Inspector

用 `/revela review --deck` 做 evidence insight 和 narrative reading。已移除的兼容命令：

```text
/revela inspect
```

`/revela inspect` 不再打开独立 inspector shell。请使用 `/revela review --deck` 的 Insight tab。Insight tab 会在固定 Source 和 Purpose 卡片之外显示 Narrative Reading 和 Exploratory Reading 卡片。当选中元素能映射到 canonical narrative state 时，Narrative Reading 会保留 canonical claim id、evidence binding id、supported scope、unsupported scope、caveat、objection、risk 和 artifact coverage。Coverage 会显示所选 claim 是否出现在已记录的 deck/brief/export artifact 中，以及这些 artifact 相对当前 narrative hash 是 current、stale、partial 还是 missing。Exploratory Reading 提供非官方的 objection prep、audience reframing 边界、appendix leads 和 meeting-prep cues，并且只能使用同一份已记录 context。使用 `Ctrl`/`Cmd` + click 引用 deck 元素，然后点击 `Get Insight`。请求处理期间，deck 选择会被锁定。

Insight 不是聊天，也没有自由输入框。它不会修改 `DECKS.json` 或 deck HTML。它使用已记录的 slide spec、narrative state 和 slide-level evidence trace 作为 grounded context。Insight 的用户界面是 LLM-first：先显示 reading/loading 状态，再渲染结构化生成卡片。确定性预处理仍作为内部 fallback context，仅在生成失败或超时时显示。Insight tab 提供固定 display-language 下拉选项；语言只影响卡片文案，不会改变 claim id、evidence id、source path、URL、数字、引用或 canonical facts。如果旧版或不完整的生成结果只返回 Source/Purpose，Review 会保留确定性 reading 卡片，避免 generated insight 静默移除 claim、evidence boundary、artifact coverage 或 exploratory context。

Review 会使用 workspace state 中记录的 active HTML deck render target。Deck HTML 必须满足 Revela 的 slide identity contract：active artifact 中每个 `<section class="slide">` 都需要有正数、1-based 的 `data-slide-index`，并且要匹配当前 slide specs。无效的 active artifact 会在 review/export 工作流信任它之前被拒绝或报告。

---

## 导出

PDF 导出：

```text
/revela export --deck pdf decks/my-deck.html
```

对应的 LLM tool：`revela-pdf`，参数为 `{ "file": "decks/my-deck.html" }`。

可编辑 PPTX 导出：

```text
/revela export --deck pptx decks/my-deck.html
```

对应的 LLM tool：`revela-pptx`，参数为 `{ "file": "decks/my-deck.html" }`。

命令和 tool 都会把结果写到源 HTML deck 同目录。如果希望 agent 在 deck 工作流中自动完成导出，可以让它调用 tool，而不需要用户手动执行 `/revela export --deck pdf` 或 `/revela export --deck pptx`。

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
