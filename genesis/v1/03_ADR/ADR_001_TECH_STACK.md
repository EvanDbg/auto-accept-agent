# ADR-001: 技术栈选择

**日期**: 2026-02-19 (基于项目创建时的技术决策)
**状态**: 已采纳

## 背景

Auto Accept Agent 需要与 VS Code / Antigravity / Cursor IDE 深度集成，自动化 AI 代理的审批按钮操作。

## 决策

| 维度 | 选择 | 备选 | 理由 |
|------|------|------|------|
| **运行时** | VS Code Extension API | Language Server Protocol | 需要直接操作 IDE UI，LSP 无法访问 WebView |
| **通信协议** | Chrome DevTools Protocol (CDP) | VS Code API | VS Code API 无法操作 Antigravity 面板内的 DOM |
| **WebSocket 库** | `ws` | `socket.io` | 轻量级、原生 CDP 兼容、无额外依赖 |
| **打包工具** | esbuild | webpack, rollup | 构建速度快、零配置、VS Code 扩展场景最优 |
| **浏览器端脚本** | Vanilla JS (IIFE) | TypeScript | 注入脚本需要最小化依赖，IIFE 确保隔离 |
| **国际化** | VS Code l10n API | i18next | 原生集成，无需额外库 |
| **许可证验证** | Stripe + REST API | Gumroad, LemonSqueezy | 成熟支付平台，API 完善 |
| **语言** | JavaScript (CommonJS) | TypeScript | 快速迭代，减少编译步骤 |

## 后果

### 正面
- 零编译步骤、快速开发迭代
- CDP 提供完整的浏览器 DOM 操作能力
- esbuild 构建时间 < 1s

### 负面
- 无类型检查，重构风险较高
- 单体注入脚本 (`full_cdp_script.js` 1600+ 行) 维护成本增加
- 依赖 CDP 端口暴露，需要用户配置启动参数
