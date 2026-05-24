# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-609%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

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
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref main
codex plugin add revela@revela
```

如果需要固定版本，把 `main` 换成 release tag。

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

## Domains

Domain 提供特定场景的叙事 guidance，例如 consulting、product 或 investor communication。需要让 Revela 按具体沟通场景调整 story framing 时使用。

```text
/revela domain
```

## Quick Start

从本地来源材料和沟通意图开始，让 Revela 识别受众、决策目标、论点、论据、风险、潜在质疑和信息缺口。

证据不足时，用 research 补充 findings，并只把被来源明确支持的部分绑定回 narrative。渲染前先阅读 Story view，检查 claim flow、证据支撑、caveat 和 open gap。

当 story 已经适合呈现时，从 canonical narrative 生成 deck 或 brief。之后用 Insight 理解 artifact 的支撑关系和可追踪性，用 Comment 做定向修改，需要分享文件时再导出为 PDF 或 PPTX。

## Review Deck

生成 HTML deck 后可以进入 Review：

```text
/revela review --deck
```

Review 会打开本地 deck 工作台，主要包含两种模式：

- Insight：解释选中的 slide 内容支持哪个 claim、有哪些 evidence、还剩哪些 caveat 或 gap，以及它在叙事里的作用。
- Comment：对 deck 发起定向修改，例如 layout、文案、层级、间距或视觉调整。
