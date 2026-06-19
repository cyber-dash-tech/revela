# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-772%20passing-brightgreen)](tests/) [![Codex MCP](https://img.shields.io/badge/Codex-MCP-blue)](https://github.com/openai/codex) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo-wordmark.png" alt="Revela" width="320" />
</p>

Revela 是 Codex plugin，用来把来源材料、调研、数据和用户意图转成可信、可追踪、可直接用于决策沟通的 deck。

在本地 workspace 中，Revela 帮 Codex agent 明确目标、整理材料、写 `deck-plan.md`、生成 `decks/*.html`、在 Codex Browser 中打开 deck 供用户审阅，并导出 PDF/PPTX/PNG。

## 安装

### Codex

这部分是给 Codex agent 看的安装说明：用户已经在 Codex 环境中，agent 负责安装或引导安装 Revela plugin。

环境要求：

- Codex 可以从 Git marketplace 安装 plugin。
- 环境中可以执行 `bun`；Revela plugin 会从已安装的 plugin cache 中运行 `bun ./mcp/revela-server.ts` 来启动 MCP server。

可选的安装前检查：

```bash
codex plugin --help
bun --version
```

如果 npm package 检查时报 npm cache 权限错误，可以修复 cache owner，或在本地检查时使用可写 cache：

```bash
sudo chown -R "$(id -u):$(id -g)" ~/.npm
npm_config_cache=/tmp/revela-npm-cache bun run smoke:mcp-pack
```

从 Codex Git marketplace 安装最新版 Revela：

```bash
codex plugin marketplace add https://github.com/cyber-dash-tech/revela
codex plugin add revela@revela
```

Git marketplace 安装的是 Codex plugin 壳、skills、hooks 和 MCP 配置。Codex 启动 Revela 时，会从已安装的 plugin cache 中运行 `bun ./mcp/revela-server.ts`，并解析 marketplace runtime。

不需要在 Codex marketplace clone 里运行 `bun install`。

安装后开启一个新的 Codex thread，让 Codex 加载 Revela 的 skills、MCP tools 和 hooks。

Codex 使用九个 Revela skills：`revela` 路由下一步 workflow，`revela-spec` 写根目录 `spec.md`，`revela-helper` 查看状态和 active design/domain，`revela-design` 创建、验证、激活 custom design，`revela-domain` 创建、验证、激活 custom narrative domain，`revela-research` 审阅材料、保存 findings、交付 `deck-plan.md`，`revela-make-deck` 生成 HTML deck，`revela-review` 在 Codex Browser 中直接打开 HTML deck，`revela-export` 导出 PDF/PPTX/PNG。

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

Revela 内置多个 deck design。Design preview 由内置 page-template preview fixture 加上当前 design CSS 生成。每组截图保留 cover，并选择更能体现该 design 特征的代表性 template 页面。

### starter

<p align="center">
  <img src="assets/img/starter-01.jpg" alt="Starter design cover preview" width="32%" />
  <img src="assets/img/starter-02.jpg" alt="Starter design executive-summary preview" width="32%" />
  <img src="assets/img/starter-03.jpg" alt="Starter design process-steps preview" width="32%" />
</p>

### summit

<p align="center">
  <img src="assets/img/summit-01.jpg" alt="Summit design cover preview" width="32%" />
  <img src="assets/img/summit-02.jpg" alt="Summit design agenda preview" width="32%" />
  <img src="assets/img/summit-03.jpg" alt="Summit design vertical timeline preview" width="32%" />
</p>

### monet

<p align="center">
  <img src="assets/img/monet-01.jpg" alt="Monet design cover preview" width="32%" />
  <img src="assets/img/monet-02.jpg" alt="Monet design claim-supporting-visual preview" width="32%" />
  <img src="assets/img/monet-03.jpg" alt="Monet design table-comparison preview" width="32%" />
</p>

### lucent

<p align="center">
  <img src="assets/img/lucent-01.jpg" alt="Lucent design cover preview" width="32%" />
  <img src="assets/img/lucent-02.jpg" alt="Lucent design chart-takeaways preview" width="32%" />
  <img src="assets/img/lucent-03.jpg" alt="Lucent design recommendation-decision preview" width="32%" />
</p>

### lucent-dark

<p align="center">
  <img src="assets/img/lucent-dark-01.jpg" alt="Lucent Dark design cover preview" width="32%" />
  <img src="assets/img/lucent-dark-02.jpg" alt="Lucent Dark design agenda preview" width="32%" />
  <img src="assets/img/lucent-dark-03.jpg" alt="Lucent Dark design horizontal milestone preview" width="32%" />
</p>

在 Codex 中切换 design，可以这样问：

> 使用 Revela 切换到 summit design。

在 Codex 中，可以直接让 Revela 列出或切换 design；新生成的 deck 会使用 active design。已有 deck 要带上文件路径，这样 Revela 会刷新该 deck 的本地 design snapshot，不重写 slide 内容：

> 使用 Revela 将 @decks/<file>.html 切换到 summit design。

## Domains

Domain 提供特定场景的沟通 guidance，例如 consulting、product 或 investor communication。需要让 Revela 按具体沟通场景调整 deck framing 时使用。

> 使用 Revela 列出 available domains。

在 Codex 中，可以直接让 Revela 列出或切换 domain；active domain 会用于 spec、plan 和 deck framing。

## Quick Start

在包含来源材料的 workspace 中打开 Codex，然后按下面流程推进。

1. **Spec**：确认目标、受众、输出形式、约束、语言、设计偏好和验收标准，并写入 `spec.md`。

> 使用 Revela 把这个目标整理成用于决策 deck 的 spec.md。先检查 workspace，只询问真正影响结果的缺失信息，并推荐下一步。

2. **Plan**：审阅材料、保存带来源的 findings，并产出 `deck-plan.md`。

> 使用 Revela 审阅材料，保存有用 findings，并为这个 deck 生成 deck-plan.md。

3. **Render Deck**：基于 `deck-plan.md` 生成 `decks/*.html`。

> 使用 Revela 根据 deck-plan.md render deck。

4. **Review**：在 Codex Browser 中直接打开 HTML deck。把 `@decks/<file>.html` 替换为实际生成的文件路径。

> 使用 Revela 在 Codex Browser 中 review @decks/<file>.html。

Review 时检查文案、论证节奏、层级、间距、图表、表格、视觉和导出前问题。如果需要诊断报告，再让 Revela 对同一个 deck 文件做 diagnose 或 QA。

5. **Export**：导出审阅后的 HTML deck。把 `@decks/<file>.html` 替换为实际生成的文件路径。

> 使用 Revela 导出 @decks/<file>.html 为 PDF。

> 使用 Revela 导出 @decks/<file>.html 为可编辑 PPTX。

> 使用 Revela 导出 @decks/<file>.html 为逐页 PNG。

可选前置设置：

- 使用 Revela 切换到 consulting domain。
- 使用 Revela 切换到 summit design。
- 使用 Revela 创建一个名为 neon-finance 的 custom design，风格是金融仪表盘、深色界面、精密网格和亮绿色重点色。
