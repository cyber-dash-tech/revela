# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-110%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela 是一个 [OpenCode](https://opencode.ai) 插件，可以把你当前使用的 agent 变成 HTML 幻灯片生成器。
在当前会话中启用它之后，agent 可以完成调研、结构设计、HTML 写作和自动 QA，并把结果输出到 `slides/*.html`。

**[在线演示 — AI 权力转移](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)** · 一份使用 Revela 生成的 5 页投资简报。

---

## Revela 是什么

Revela 是一种工作模式，不是一个独立聊天 agent。

- `/revela enable` 会把演示文稿生成专用的 system prompt 注入到当前 agent
- prompt 由 3 层组成：核心 skill、当前 domain、当前 design
- agent 可以扫描工作区文件、委托网页调研、生成 HTML 幻灯片，并自动执行布局 QA
- design 和 domain 的切换都在本地完成，并会立即重建 active prompt

---

## 环境要求

- [OpenCode](https://opencode.ai)
- Bun 运行时（`bun >= 1.0.0`）
- [Google Chrome](https://www.google.com/chrome/) 或 Chromium，用于布局 QA 和 PDF 导出
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

重启 OpenCode 后，插件会通过 Bun 自动安装。

如果想全局安装，可以把同样的 `plugin` 配置写到 `~/.config/opencode/opencode.json`。

### 本地 wrapper 安装

以下情况建议直接使用本地 wrapper：

- Bun 插件安装不稳定或被网络环境阻塞
- 你在中国大陆网络环境下使用 OpenCode
- 你希望直接运行本地源码仓库

源码安装方式：

```bash
git clone https://github.com/cyber-dash-tech/revela
cd revela
npm install
```

创建 `~/.config/opencode/plugins/revela.js`：

```js
export { default } from "/absolute/path/to/revela/index.ts";
```

如果走本地 wrapper 方案，确保 `~/.config/opencode/opencode.json` 里不要同时保留 `@cyber-dash-tech/revela` 的 `plugin` 配置，否则 OpenCode 启动时仍会尝试用 Bun 安装。

### 中国大陆网络说明

OpenCode 的 npm 插件安装依赖 Bun，而 Bun 可能不会遵循 npm mirror 配置。如果直接安装失败，优先使用上面的本地 wrapper 方案，或者先把包安装到 `~/.config/opencode/`，再手动创建本地插件入口文件。

---

## 快速开始

启动 OpenCode：

```bash
opencode
```

在当前会话中启用 Revela：

```text
/revela enable
```

然后直接给 agent 一个幻灯片任务，例如：

```text
Create a 6-slide HTML deck on humanoid robotics supply chains. Use the summit design, cite the main market drivers, and save the result to slides/humanoid-robotics.html.
```

如果需要，把生成好的 HTML 导出为 PDF：

```text
/revela pdf slides/humanoid-robotics.html
```

关闭 Revela，让当前 agent 回到普通模式：

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
```

所有 `/revela` 命令都在本地执行，不消耗 LLM token。

---

## 工作原理

启用 Revela 后，它会把一份动态生成的 prompt 追加到当前 agent 的 system prompt 中。

这份 prompt 由 3 层组成：

1. `skill/SKILL.md`：核心幻灯片生成流程
2. 当前 active domain：行业结构与术语
3. 当前 active design：视觉语言、layout、component 和图表规则

当前 design 和 domain 会持久化到 `~/.config/revela/config.json`。是否启用 Revela 则是会话级状态，不会跨会话持久化。

---

## 调研与文件摄取

启用 Revela 后，agent 可以使用：

- `revela-workspace-scan` 扫描工作区中的 PDF、Office 文件、CSV、Markdown 和文本文件
- `revela-research` 子代理抓取目标网页，并把结构化结果保存到 `researches/<topic>/`
- `revela-research-save` 按 research axis 写入单个 findings 文件

支持 `@` 引用和自动文本提取的文件类型：

- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`

Revela 会在主 agent 处理这些文件前，先透明地完成文本提取。

---

## 布局 QA 与合规检查

每次 agent 写入 `slides/*.html` 时，Revela 都会自动在 `1920x1080` 分辨率下运行一轮基于 Puppeteer 的 QA。
报告会立刻反馈给 agent，用于继续修正布局或 design compliance 问题。

当前 QA 维度如下：

| 维度 | 检查内容 |
|---|---|
| `overflow` | 元素是否超出 slide canvas |
| `balance` | 是否过稀、重心偏移、底部留白过大等 |
| `symmetry` | 并列列之间的高度或密度是否明显失衡 |
| `rhythm` | 垂直堆叠元素之间的间距节奏是否不稳定 |
| `compliance` | 是否使用了 active design 之外的 class 或新增 CSS 规则 |

每张 slide 都必须显式声明 `slide-qa="true"` 或 `slide-qa="false"`。

- `slide-qa="true"`：适用于内容型页面，执行完整 QA
- `slide-qa="false"`：适用于封面、目录、引用、总结、结尾等结构型页面

`compliance` 不是软建议，而是生成流程的一部分。如果 agent 发明了 design 之外的 class 或 CSS rule，QA 会直接指出并要求修正。

也可以手动调用 `revela-qa` 工具执行 QA。

---

## 内置 Designs

使用 `/revela designs <name>` 切换。

| 名称 | 说明 | 预览 |
|---|---|---|
| `aurora` | 深色 executive 风格，信息密度更高，适合结构化商业表达和 ECharts 数据可视化 | ![aurora](assets/img/slide-example-aurora.jpg) |
| `summit` | 年报式 editorial 风格，适合图像丰富、叙事感更强的商业表达 | ![summit](assets/img/slide-example-summit.jpg) |

---

## 内置 Domains

使用 `/revela domains <name>` 切换。

| 名称 | 说明 |
|---|---|
| `general` | 不做领域专化 |
| `deeptech-investment` | VC / 投资分析：市场规模、技术成熟度、护城河与投资逻辑 |
| `consulting` | 战略咨询：go/no-go 判断、战略设计与 belief-change 报告 |

---

## 自定义 Designs

自定义 design 是一个包含 `DESIGN.md` 的文件夹，文件头使用 frontmatter：

```yaml
---
name: my-design
description: 在 /revela designs 中显示的简短说明
author: you
version: 1.0.0
---
```

文件正文定义 agent 可使用的视觉系统。

### Marker 体系

对于较大的 design，建议使用当前 marker 格式：

```html
<!-- @design:foundation:start -->
色彩、字体、CSS 变量、HTML 外壳、基础 JS...
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
构图规则、正反案例、design 特定约束...
<!-- @design:rules:end -->

<!-- @design:layouts:start -->
<!-- @layout:cover:start qa=false -->
Layout 详情...
<!-- @layout:cover:end -->

<!-- @layout:two-col:start qa=true -->
Layout 详情...
<!-- @layout:two-col:end -->
<!-- @design:layouts:end -->

<!-- @design:components:start -->
<!-- @component:card:start -->
Component HTML + CSS...
<!-- @component:card:end -->

<!-- @component:stat-card:start -->
Component HTML + CSS...
<!-- @component:stat-card:end -->
<!-- @design:components:end -->

<!-- @design:chart-rules:start -->
图表规则...
<!-- @design:chart-rules:end -->
```

Prompt 注入行为如下：

- 常驻注入：`@design:foundation`、`@design:rules`、layout index、component index
- 按需获取：单个 `@layout:*`、单个 `@component:*`、`@design:chart-rules`

如果 design 没有 marker，Revela 会退回到整份 `DESIGN.md` 全量注入。

### 给 design 作者的 compliance 说明

Revela 会从 design 中提取允许使用的 CSS class vocabulary，并在 QA 的 compliance 维度里做校验。如果 agent 发明了新的 class 或 CSS rule，QA 会直接报出。

### 安装自定义 Design

```text
/revela designs-add github:your-org/your-design
/revela designs-add https://example.com/my-design.zip
/revela designs-add ./path/to/local/design-folder
```

---

## 自定义 Domains

自定义 domain 是一个包含 `INDUSTRY.md` 的文件夹，frontmatter 结构与 design 类似。

```text
/revela domains-add github:your-org/your-domain
```

`INDUSTRY.md` 是为了兼容历史版本而保留的文件名。

---

## PDF 导出

把生成好的 HTML deck 导出为 PDF：

```text
/revela pdf slides/my-deck.html
```

Revela 会通过 Chrome / Chromium 渲染每一页 slide，并在同目录生成最终 PDF。

---

## 日志

Revela 使用 [tslog](https://tslog.js.org/) 输出结构化日志。开启详细调试输出：

```bash
REVELA_DEBUG=1 opencode
```

---

## 许可证

MIT，详见 [LICENSE](LICENSE).
