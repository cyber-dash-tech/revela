# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-546%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="560" />
</p>

Revela 是一个 [OpenCode](https://opencode.ai) 插件，用来把本地材料和调研结果转成可追踪的叙事图谱，再基于这个图谱生成 brief 和 presentation deck。

叙事图谱用 graph 方式记录生成 brief 或 deck 所需的关键要素：受众、决策目标、论点、论据、资料来源、风险、潜在质疑和待补齐的信息。

## 安装

在 `opencode.json` 中加入 Revela：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@cyber-dash-tech/revela"]
}
```

重启 OpenCode。

如果想全局安装，把同样配置写到 `~/.config/opencode/opencode.json`。

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

## Quick Start：生成 HTML Deck

1. 从本地来源材料初始化 narrative workspace。

```text
/revela init
```

2. 补充缺失证据，并把有效 findings 绑定到 claims。

```text
/revela research
```

如果本地材料已经足够支撑 story，可以跳过这一步。

3. 在生成 deck 前检查 claim flow。

```text
/revela story
```

用它检查 audience、decision、claims、evidence、gaps、risks 和 objections。

4. 生成 HTML deck。

```text
/revela make --deck
```

Revela 会把 deck 写到 `decks/`，并使用当前 narrative、deck plan 和 active design。

5. Review 或修改 deck。

```text
/revela review --deck
```

详见 [Review Deck](#review-deck)。

6. 按需导出。

```text
/revela export --deck pdf decks/example.html
/revela export --deck pptx decks/example.html
```

## Review Deck

生成 HTML deck 后可以进入 Review：

```text
/revela review --deck
```

Review 会打开本地 deck 工作台，主要包含两种模式：

- Insight：解释选中的 slide 内容支持哪个 claim、有哪些 evidence、还剩哪些 caveat 或 gap，以及它在叙事里的作用。
- Comment：对 deck 发起定向修改，例如 layout、文案、层级、间距或视觉调整。
