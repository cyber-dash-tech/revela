# Revela

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela)  [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-73%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)


<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela 是一款 [OpenCode](https://opencode.ai) 插件，让 AI 成为你的PPT助手。
用对话方式描述你的需求，Revela 会自动调研、分析、洞察，最后呈现你心中的PPT。



**[在线演示 — AI 权力转移](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)** · 一份由 Revela 全程生成的 5 页投资简报。

---

## 环境要求

- [OpenCode](https://opencode.ai)（Bun 运行时，`bun >= 1.0.0`）
- [Google Chrome](https://www.google.com/chrome/) 或 Chromium —— 自动布局 QA 功能必须
- Git —— 源码安装时需要

---

## 安装

### 方式一：通过 opencode.json（推荐）

在项目目录的 `opencode.json` 中添加 `plugin` 字段：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@cyber-dash-tech/revela"]
}
```

重启 OpenCode，插件会通过 Bun 自动下载安装。

如需全局安装（所有项目可用），在 `~/.config/opencode/opencode.json` 中添加同样的 `plugin` 配置。

### 方式二：国内网络安装

OpenCode 的插件安装器使用 Bun 的包管理器，**不支持 npm 镜像配置**（已知问题）。
如果直接安装失败，推荐以下方式：

**步骤 1**：用 npm 安装（支持国内镜像）

```bash
# 确认 npm 镜像已配置
npm config get registry   # 应为 https://registry.npmmirror.com/

# 全局安装到 opencode 配置目录
cd ~/.config/opencode
npm install @cyber-dash-tech/revela
```

**步骤 2**：创建本地插件入口文件

```bash
cat > ~/.config/opencode/plugins/revela.js << 'EOF'
export { default } from "/Users/<你的用户名>/.config/opencode/node_modules/@cyber-dash-tech/revela/index.ts";
EOF
```

**步骤 3**：确保 `~/.config/opencode/opencode.json` 中**没有** `plugin` 字段

（有 `plugin` 字段时，OpenCode 启动仍会尝试用 Bun 安装，绕过本地文件）

重启 OpenCode，`ctrl+p` 中看到 `/revela` 即安装成功。

### 方式三：源码安装

```bash
git clone https://github.com/cyber-dash-tech/revela
cd revela && npm install
```

创建 `~/.config/opencode/plugins/revela.js`：

```js
export { default } from "/path/to/revela/index.ts";
```

---

## 快速开始

启用opencode搜索功能（推荐）
```Bash
OPENCODE_ENABLE_EXA=1 opencode
```

在 opencode 中启动 Revela（默认关闭），将 primary agent 变为演讲稿设计专家
```
/revela enable
```

关闭当前会话中 Revela，primary agent 恢复正常
```
/revela disable
```

---

## 命令

```
/revela                          显示当前状态（启用/禁用、当前设计/领域）+ 帮助
/revela enable                   为当前会话启用幻灯片生成模式
/revela disable                  禁用

/revela designs                  列出已安装的设计
/revela designs <name>           切换设计（立即重建系统提示）
/revela designs-add <source>     从 URL、本地路径或 github:user/repo 安装设计

/revela domains                  列出已安装的领域
/revela domains <name>           切换领域
/revela domains-add <source>     从 URL、本地路径或 github:user/repo 安装领域
```

所有命令本地执行，零 LLM 消耗，即时响应。

---

## 内置设计模版

插件内置三套设计，用 `/revela designs <name>` 切换。

| 名称 | 说明 | 预览 |
|---|---|---|
| `aurora` | 颜色主题 — 极光, 高饱和度, ECharts 数据可视化 | ![default](assets/img/slide-example-aurora.jpg) |
| `summit` | 极简主义 - 户外，适合有丰富插图，Echart 数据可视化 | ![summit](assets/img/slide-example-summit.jpg) |

---

## 内置行业SOP

领域为 AI 的上下文提供特定行业的报告框架和术语。

| 名称 | 说明 |
|---|---|
| `general` | 无领域专化（默认） |
| `deeptech-investment` | VC/投资分析 —— 市场规模、技术成熟度、投资逻辑 |
| `consulting` | 战略咨询 —— Go/No-Go 报告、战略设计、信念转变框架 |

用 `/revela domains <name>` 切换。

---

## 工作区扫描与研究

启用 Revela 后，AI 可以：

- **扫描工作区**（`revela-workspace-scan` 工具）—— 自动发现项目目录中的 PDF、Word、Excel、PowerPoint、CSV 和 Markdown 文件。用 `@文件名` 引用，其内容会直接纳入幻灯片制作上下文。
- **并行研究**（通过 `revela-research` 子代理）—— 抓取目标 URL，将结构化研究结果保存到 `researches/<topic>/`，主代理随后将这些结果整合到幻灯片中。

支持 `@` 引用和自动文本提取的文件格式：`.pdf`、`.docx`、`.pptx`、`.xlsx`。

---

## 排版 QA

每次 AI 写入幻灯片文件时，Revela 会自动在 1920×1080 分辨率下运行基于 Puppeteer 的排版质检。发现问题后立即将报告反馈给 AI，AI 自行修正，无需人工干预。（**功能持续更新中 ...**）

每张幻灯片的检查项：

| 检查项 | 说明 |
|---|---|
| **填充率** | 内容必须占据足够的画布面积 |
| **底部留白** | 标记幻灯片底部的大片空白 |
| **溢出** | 超出画布边界的元素 |
| **不对称** | 并排列高度差异过大 |
| **密度失衡** | CSS `align-items: stretch` 列布局中隐藏的内容不平衡 |
| **稀疏** | 可见元素过少的幻灯片 |

结构性幻灯片（封面、目录、引言、总结、结语）设置 `slide-qa="false"`，自动豁免填充/间距检查。内容型幻灯片设置 `slide-qa="true"` 启用 QA 检查。

也可以手动触发：让 AI "对 slides/my-deck.html 运行 QA"，或直接使用 `revela-qa` 工具。

需要系统中已安装 Google Chrome 或 Chromium。

---

## 自定义模版

设计是包含 `DESIGN.md` 文件的文件夹，frontmatter 声明元数据：

```yaml
---
name: my-design
description: 在 /revela designs 中显示的简短说明
author: 你的名字
version: 1.0.0
---
```

文件体提供视觉风格指令，会被注入 AI 的系统提示。

### 按需加载标记系统（大型设计推荐）

用 HTML 注释标记将设计分为多个区块。每轮只注入 `global` 和 `layouts`，其余内容由 AI 按需拉取，大幅降低每轮 token 消耗。

```html
<!-- @section:global:start -->
色彩、字体、基础 CSS 变量、SlidePresentation JS 类、HTML 文档结构...
<!-- @section:global:end -->

<!-- @section:layouts:start -->
每张幻灯片通用的布局原语（双列、卡片网格等）...
<!-- @section:layouts:end -->

<!-- @section:components:start -->
<!-- @component:card:start -->
卡片组件的 HTML + CSS...
<!-- @component:card:end -->

<!-- @component:stat-card:start -->
数据卡片的 HTML + CSS...
<!-- @component:stat-card:end -->
<!-- @section:components:end -->

<!-- @section:charts:start -->
ECharts / 数据可视化规范...
<!-- @section:charts:end -->

<!-- @section:guide:start -->
排版规则、常用模式、正反案例...
<!-- @section:guide:end -->
```

**每轮注入**：`global`、`layouts` 和一份紧凑的组件索引表。

**按需获取**：单个组件详情、`charts`、`guide`。

没有标记时，整个 `DESIGN.md` 内容每轮全量注入（向后兼容）。

### 自定义模版安装

```
/revela designs-add github:your-org/your-design
/revela designs-add https://example.com/my-design.zip
/revela designs-add ./path/to/local/design-folder
```

---

## 自定义行业SOP

领域为 AI 增加特定行业的报告框架、术语和结构化指导。

文件夹结构：`<name>/INDUSTRY.md`，frontmatter 格式与设计相同。

```
/revela domains-add github:your-org/your-domain
```

---

## 日志

Revela 通过 [tslog](https://tslog.js.org/) 输出结构化 JSON 日志，写入 `stderr`。

开启详细调试输出：

```bash
REVELA_DEBUG=1 opencode
```

---

## 许可证

MIT —— 详见 [LICENSE](LICENSE)。
