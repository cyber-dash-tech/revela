# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-615%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="560" />
</p>

Revela 可在 [OpenCode](https://opencode.ai) 和 Codex 中使用，把来源材料、调研、数据和用户意图转成可信、可追踪、可直接用于决策沟通的 narrative artifact。

它的 narrative workspace 会记录生成 brief 或 deck 所需的关键要素：受众、决策目标、论点、论据、资料来源、风险、潜在质疑和待补齐的信息。

## 安装

### OpenCode

通过 `opencode.json` 安装 npm package `@cyber-dash-tech/revela`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@cyber-dash-tech/revela"]
}
```

重启 OpenCode。

如果想全局安装，把同样配置写到 `~/.config/opencode/opencode.json`。

### Codex

通过 Codex Git marketplace 安装 Revela：

```bash
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v0.17.10
codex plugin add revela@revela
```

Git marketplace 安装的是 Codex plugin 壳、skills、hooks 和 MCP 配置。Codex 第一次启动 Revela MCP server 时，会运行 `npx -y @cyber-dash-tech/revela@0.17.10 mcp`，由 npm 获取已发布 package 及其 dependencies。

不需要在 Codex marketplace clone 里运行 `bun install`。

安装后开启一个新的 Codex thread，让 Codex 加载 Revela 的 skills、MCP tools 和 hooks。

## 内置设计

Revela 内置多个 deck design：

### [summit](designs/summit/preview.html)

<p align="center">
  <img src="assets/img/summit-01.jpg" alt="Summit design preview 1" width="32%" />
  <img src="assets/img/summit-02.jpg" alt="Summit design preview 2" width="32%" />
  <img src="assets/img/summit-03.jpg" alt="Summit design preview 3" width="32%" />
</p>

### [monet](designs/monet/preview.html)

<p align="center">
  <img src="assets/img/monet-01.jpg" alt="Monet design preview 1" width="32%" />
  <img src="assets/img/monet-02.jpg" alt="Monet design preview 2" width="32%" />
  <img src="assets/img/monet-03.jpg" alt="Monet design preview 3" width="32%" />
</p>

`starter` 是简洁默认演示风格。

切换设计：

```text
/revela design --use summit
```

在 Codex 中，可以直接让 Revela 列出或切换 design；生成 deck 时会使用 active design。

## Domains

Domain 提供特定场景的叙事 guidance，例如 consulting、product 或 investor communication。需要让 Revela 按具体沟通场景调整 story framing 时使用。

```text
/revela domain
```

在 Codex 中，可以直接让 Revela 列出或切换 domain；active domain 会用于 init、research 和 story 阶段的叙事 framing。

## Quick Start

在包含来源材料的 workspace 中打开 Codex，然后按下面步骤逐条发送 prompt。

1. 先选择 domain，让 Revela 按你的沟通场景 framing 受众、决策、风险和潜在质疑。

```text
revela，use consulting as domain.
```

2. 再选择 design，让后续生成的 deck 使用指定视觉风格。

```text
revela，use summit as design.
```

3. 从本地材料初始化 narrative。Init 负责基于 workspace 做 grounding 并暴露 gap；它不替代 research 步骤。

```text
revela，帮我 init 这个 workspace，先读本地材料。
```

4. 针对 gap 做 research，并且只把来源明确支持的 evidence 绑定回 narrative。

```text
revela，research 当前 gaps，只绑定 source-supported evidence。
```

5. 生成 deck 前先读 Story，检查 claim flow、证据支撑、caveats、unsupported scope 和 open gaps。

```text
revela，先给我看 Story，再 make deck。
```

6. 先创建或更新 deck plan，明确 slide 顺序、章节结构、evidence trace、caveats 和 visual intent，再生成 HTML。

```text
revela，生成 HTML 前先 create or update deck plan。
```

7. 基于当前 deck plan 和 canonical narrative 生成 HTML deck。

```text
revela，基于当前 deck plan 和 narrative make deck。
```

8. Review 生成后的 deck，检查 traceability、diagnostics，并做定向修改。

```text
revela，review 生成好的 deck。
```

9. QA 通过后导出 PDF。

```text
revela，把 deck export 成 PDF。
```

10. QA 通过后导出可编辑 PPTX。

```text
revela，把 deck export 成 PPTX。
```

## Review Deck

生成 HTML deck 后可以进入 Review：

```text
/revela review --deck
```

Review 会打开本地 deck 工作台，主要包含两种模式：

- Insight：解释选中的 slide 内容支持哪个 claim、有哪些 evidence、还剩哪些 caveat 或 gap，以及它在叙事里的作用。
- Comment：对 deck 发起定向修改，例如 layout、文案、层级、间距或视觉调整。
