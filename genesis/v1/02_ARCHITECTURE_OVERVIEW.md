# 架构概览 — Auto Accept Agent v8.9.16

**日期**: 2026-02-19
**状态**: 当前架构快照

---

## 1. 系统全景图

```
┌──────────────────────────────────────────────────────────────────────┐
│                      VS Code / Antigravity / Cursor IDE             │
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────────────────────────┐   │
│  │   extension.js   │────▶│          main_scripts/               │   │
│  │   (主入口)        │     │                                      │   │
│  │   activate()     │     │  ┌──────────────┐  ┌──────────────┐  │   │
│  │   handleToggle() │     │  │ cdp-handler  │  │  relauncher  │  │   │
│  │   startPolling() │     │  │ (WebSocket)  │  │ (跨平台重启) │  │   │
│  │   updateStatus() │     │  └──────┬───────┘  └──────────────┘  │   │
│  │                  │     │         │                             │   │
│  └────────┬─────────┘     │         │ CDP (port 9000±3)          │   │
│           │               │         ▼                             │   │
│  ┌────────▼─────────┐     │  ┌──────────────────────────────┐    │   │
│  │ settings-panel   │     │  │   full_cdp_script.js         │    │   │
│  │ (WebView)        │     │  │   (浏览器端注入脚本)           │    │   │
│  │ Pro 许可证        │     │  │                              │    │   │
│  │ 统计展示          │     │  │   ┌───────────┐ ┌─────────┐  │    │   │
│  └──────────────────┘     │  │   │ Analytics │ │ Overlay │  │    │   │
│                           │  │   │ (统计)    │ │ (UI层)  │  │    │   │
│  ┌──────────────────┐     │  │   └───────────┘ └─────────┘  │    │   │
│  │ utils/           │     │  │                              │    │   │
│  │ localization.js  │     │  │   auto_accept / performClick │    │   │
│  └──────────────────┘     │  └──────────────────────────────┘    │   │
│                           └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. 系统定义

### SYS-001: 扩展生命周期管理 (Extension Lifecycle)

| 属性 | 值 |
|------|------|
| **ID** | SYS-001 |
| **职责** | 扩展激活/停用、状态栏管理、命令注册、用户偏好持久化 |
| **源码目录** | `extension.js` |
| **技术栈** | VS Code Extension API, Memento API |
| **架构模式** | Event-driven, State Machine |

### SYS-002: CDP 通信层 (CDP Communication)

| 属性 | 值 |
|------|------|
| **ID** | SYS-002 |
| **职责** | WebSocket 连接管理、端口检测、脚本注入、结果回收 |
| **源码目录** | `main_scripts/cdp-handler.js` |
| **技术栈** | WebSocket (`ws`), Chrome DevTools Protocol |
| **架构模式** | Client-Server (CDP), Connection Pool |

### SYS-003: 浏览器端注入脚本 (Browser-side Injection)

| 属性 | 值 |
|------|------|
| **ID** | SYS-003 |
| **职责** | DOM 操作、按钮点击、面板滚动、叠加层 UI、统计追踪 |
| **源码目录** | `main_scripts/full_cdp_script.js` |
| **技术栈** | Vanilla JS, MutationObserver, IIFE |
| **架构模式** | Monolithic Bundle, Module Pattern |

### SYS-004: 跨平台重启器 (Cross-platform Relauncher)

| 属性 | 值 |
|------|------|
| **ID** | SYS-004 |
| **职责** | IDE 快捷方式修改、CDP 端口参数注入、IDE 重启 |
| **源码目录** | `main_scripts/relauncher.js` |
| **技术栈** | Node.js `child_process`, PowerShell, AppleScript |
| **架构模式** | Strategy Pattern (per-platform) |

### SYS-005: 设置面板 (Settings Panel)

| 属性 | 值 |
|------|------|
| **ID** | SYS-005 |
| **职责** | WebView UI 渲染、Pro 许可证验证 (Stripe)、设置管理 |
| **源码目录** | `settings-panel.js`, `config.js` |
| **技术栈** | VS Code WebView API, HTML/CSS/JS, REST API |
| **架构模式** | Message Passing (extension ↔ webview) |

### SYS-006: 统计分析 (Analytics)

| 属性 | 值 |
|------|------|
| **ID** | SYS-006 |
| **职责** | 点击追踪、ROI 计算、会话统计、离开操作通知 |
| **源码目录** | `main_scripts/analytics/` |
| **技术栈** | Vanilla JS, VS Code Memento |
| **架构模式** | Observer + Collector |

---

## 3. 核心组件表

| 组件 | 文件 | 行数 | 职责 |
|------|------|------|------|
| `activate()` | extension.js | ~220 行 | 扩展入口，注册命令/事件 |
| `CDPHandler` | cdp-handler.js | 459 行 | CDP 连接与脚本注入 |
| `full_cdp_script` | full_cdp_script.js | 1614 行 | 浏览器端所有逻辑 |
| `Relauncher` | relauncher.js | 508 行 | 跨平台重启管理 |
| `SettingsPanel` | settings-panel.js | 815 行 | 设置 WebView |
| `Loc` | utils/localization.js | ~100 行 | 国际化 |

---

## 4. 系统间通信协议

```
extension.js ──── (Node.js require) ────▶ CDPHandler
                                          │
                                          │ WebSocket (CDP Protocol)
                                          ▼
                                   full_cdp_script.js (浏览器端)
                                          │
                                          │ Runtime.evaluate (返回 JSON)
                                          ▼
extension.js ◀── (CDP evaluate result) ── CDPHandler

extension.js ──── (postMessage) ──────▶ SettingsPanel (WebView)
extension.js ◀── (onDidReceiveMessage) ─ SettingsPanel (WebView)
```

| 通信 | 协议 | 方向 | 数据格式 |
|------|------|------|----------|
| Extension → CDP | WebSocket | 双向 | CDP JSON-RPC |
| Extension → WebView | `postMessage` | 双向 | JSON |
| Extension → IDE | VS Code API | 单向 | API 调用 |
| CDP Script → DOM | querySelector | 单向 | DOM 操作 |

---

## 5. 构建与打包

| 步骤 | 命令 | 产物 |
|------|------|------|
| 编译 | `npm run compile` | `dist/extension.js` (esbuild bundle) |
| 打包 | `npm run package` | `auto-accept-agent-*.vsix` |
| 测试 | `npm test` | 集成测试结果 |
