# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-730%20passing-brightgreen)](tests/) [![Codex MCP](https://img.shields.io/badge/Codex-MCP-blue)](https://github.com/openai/codex) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo-wordmark.png" alt="Revela" width="320" />
</p>

Revela 是 Codex plugin，用来把来源材料、调研、数据和用户意图转成可信、可追踪、可直接用于决策沟通的 deck artifact。

在你的本地 workspace 中，Revela 会审阅本地资料、保存 source-linked research、生成明确的 `deck-plan.md`、产出 HTML deck，并以可在 Codex Browser 打开的 website card 交付以便 annotation，并支持 PDF/PPTX/PNG 导出。

## 安装

### Codex

环境要求：

- 需要已安装 Codex CLI，并且 shell 中可以执行 `codex`。
- 环境中需要可以执行 `bun`；Revela 会从已安装的 Codex plugin cache 中运行 `bun ./mcp/revela-server.ts` 来启动 MCP server。

可选的安装前检查：

```bash
codex --version
codex exec --help
bun --version
```

如果 npm package 检查时报 npm cache 权限错误，可以修复 cache owner，或在本地检查时使用可写 cache：

```bash
sudo chown -R "$(id -u):$(id -g)" ~/.npm
npm_config_cache=/tmp/revela-npm-cache bun run smoke:mcp-pack
```

通过 Codex Git marketplace 安装 Revela：

```bash
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v0.18.16
codex plugin add revela@revela
```

Git marketplace 安装的是 Codex plugin 壳、skills、hooks 和 MCP 配置。Codex 启动 Revela MCP server 时，会从已安装的 plugin cache 中运行 `bun ./mcp/revela-server.ts`，并解析该 marketplace checkout 中的 runtime。

不需要在 Codex marketplace clone 里运行 `bun install`。

安装后开启一个新的 Codex thread，让 Codex 加载 Revela 的 skills、MCP tools 和 hooks。

Codex 使用八个 Revela skills：`revela` 路由下一步 workflow，`revela-spec` 产出根目录 `spec.md`，`revela-helper` 查看状态和 active design/domain，`revela-design` 创建、验证、激活 custom design，`revela-domain` 创建、验证、激活 custom narrative domain，`revela-research` 调研本地与网络资料、保存到 `researches/`，并产出 design-aware `deck-plan.md` handoff；`revela-make-deck` 基于已有 plan 生成 HTML deck artifact，并在 QA 通过后以 Codex Browser website card 形式交付，`revela-export` 导出 PDF/PPTX/PNG。

如果要按发布路径做本地验证，运行 `bun run smoke:mcp-pack`。它会把当前 checkout 打成临时 npm tarball，解包后通过打包出的 Codex plugin launcher 路径启动 MCP server，不需要先发布到 registry。

#### Codex 升级

在 Codex 中，可以让 Revela 检查当前 runtime version；plugin 会调用 `revela_doctor` 并报告正在运行的 `version`。

如果要固定到某个 release tag，按该 tag 重新安装 plugin：

```bash
codex plugin remove revela@revela
codex plugin marketplace remove revela
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref vX.Y.Z
codex plugin add revela@revela
```

如果 marketplace entry 本来就有意跟踪 branch 或 movable ref，升级 marketplace clone 后重新添加 plugin：

```bash
codex plugin marketplace upgrade revela
codex plugin add revela@revela
```

Git marketplace ref 和 `.mcp.json` plugin launcher 属于同一个 release artifact。升级后开启一个新的 Codex thread，让 Codex 重新加载 Revela skills、MCP tools、hooks 和 runtime launcher。

## 内置设计

Revela 内置多个 deck design：

### [summit](designs/summit/preview.html)

<p align="center">
  <img src="assets/img/summit-01.jpg" alt="Summit design cover preview" width="32%" />
  <img src="assets/img/summit-02.jpg" alt="Summit design narrative layout preview" width="32%" />
  <img src="assets/img/summit-03.jpg" alt="Summit design timeline preview" width="32%" />
</p>

### [monet](designs/monet/preview.html)

<p align="center">
  <img src="assets/img/monet-01.jpg" alt="Monet design cover preview" width="32%" />
  <img src="assets/img/monet-02.jpg" alt="Monet design narrative layout preview" width="32%" />
  <img src="assets/img/monet-03.jpg" alt="Monet design timeline preview" width="32%" />
</p>

### [lucent](designs/lucent/preview.html)

<p align="center">
  <img src="assets/img/lucent-01.jpg" alt="Lucent design cover preview" width="32%" />
  <img src="assets/img/lucent-02.jpg" alt="Lucent design narrative layout preview" width="32%" />
  <img src="assets/img/lucent-03.jpg" alt="Lucent design roadmap preview" width="32%" />
</p>

`starter` 是简洁默认演示风格。

在 Codex 中切换 design，可以这样问：

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，use summit as design.

在 Codex 中，可以直接让 Revela 列出或切换 design；生成 deck 时会使用 active design。

## Domains

Domain 提供特定场景的沟通 guidance，例如 consulting、product 或 investor communication。需要让 Revela 按具体沟通场景调整 deck framing 时使用。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，列出 available domains。

在 Codex 中，可以直接让 Revela 列出或切换 domain；active domain 会用于 init、research 和 deck planning 阶段的 framing。

## Quick Start

在包含来源材料的 workspace 中打开 Codex，然后按下面步骤逐条发送 prompt。

1. 先选择 domain，让 Revela 按你的沟通场景 framing 受众、决策、风险和潜在质疑。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，use consulting as domain.

2. 再选择 design，让后续生成的 deck 使用指定视觉风格。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，use summit as design.

3. 如果需要不同的视觉方向，可以创建一个自定义 design。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，创建一个名为 neon-finance 的新 design：金融仪表盘风格，深色界面、精密网格、亮绿色重点色。

Revela 可能会继续询问参考图、风格约束或禁忌项，然后创建并校验 design。创建完成后再切换使用：

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，使用 neon-finance 作为 design。

4. 初始化本地 material intake。Init 会扫描、抽取并审阅 workspace source；它不会创建 Narrative Vault。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，帮我 init 这个 workspace，先读本地材料。

5. 针对 deck 所需输入做 research，并保存带来源的 findings。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，research 这个 deck 需要的公开证据、案例和 source。

6. 先创建或更新 deck plan，明确 slide 顺序、章节结构、source links、unresolved inputs、source limitations 和 visual intent，再生成 HTML。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，生成 HTML 前先 create or update deck plan。

7. 基于当前 deck plan 生成 HTML deck。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，基于当前 deck plan make deck。

8. make-deck 完成后，从 website card 打开生成的 deck，并在 Codex Browser 中做 annotation 和定向修改。

使用 Codex Browser 原生 annotation 工具标注打开的 HTML deck。

9. QA 通过后导出 PDF。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，把 deck export 成 PDF。

10. QA 通过后导出可编辑 PPTX。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，把 deck export 成 PPTX。

11. QA 通过后导出每页 PNG。

> [$revela:revela](/Users/mengdigao/.codex/plugins/cache/revela/revela/0.18.16/skills/revela/SKILL.md)，把 deck export 成 PNG。

## Annotate Deck

`revela-make-deck` 生成 HTML deck 且 Artifact QA 通过后，会在对话中回复可用 Codex Browser 打开的 website card。使用 Codex Browser 原生 annotation 工具标注 layout、文案、层级、间距或视觉修改。
