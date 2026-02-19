# AGENTS.md - AI 协作协议

> **"如果你正在阅读此文档，你就是那个智能体 (The Intelligence)。"**
> 
> 这个文件是你的**锚点 (Anchor)**。它定义了项目的法则、领地的地图，以及记忆协议。
> 当你唤醒（开始新会话）时，**请首先阅读此文件**。

---

## 🧠 30秒恢复协议 (Quick Recovery)

**当你开始新会话或感到"迷失"时，立即执行**:

1. **读取 .agent/rules/agents.md** → 获取项目地图
2. **查看下方"当前状态"** → 找到最新架构版本
3. **读取 `genesis/v{N}/05_TASKS.md`** → 了解当前待办
4. **开始工作**

---

## 🗺️ 地图 (领地感知)

以下是这个项目的组织方式：

| 路径 | 描述 | 访问协议 |
|------|------|----------|
| `extension.js` | **主入口**。VS Code 扩展激活/停用逻辑。 | 通过 Task 读/写。 |
| `main_scripts/` | **核心模块**。CDP 通信、脚本注入、重启器、分析。 | 通过 Task 读/写。 |
| `settings-panel.js` | **设置面板**。WebView UI + Pro 许可证管理。 | 通过 Task 读/写。 |
| `config.js` | **配置**。Stripe 链接等常量。 | 通过 Task 读/写。 |
| `utils/` | **工具库**。国际化 (i18n) 等。 | 通过 Task 读/写。 |
| `l10n/` | **本地化资源**。中英文翻译文件。 | 通过 Task 读/写。 |
| `PRD/` | **需求文档**。功能需求与可行性分析。 | 只读参考。 |
| `genesis/` | **设计演进史**。版本化架构状态 (v1, v2...)。 | **只读**(旧版) / **写一次**(新版)。 |
| `genesis/v{N}/` | **当前真理**。最新的架构定义。 | 永远寻找最大的 `v{N}`。 |
| `.agent/workflows/` | **工作流**。`/genesis`, `/blueprint` 等。 | 通过 `view_file` 阅读。 |
| `.agent/skills/` | **技能库**。原子能力。 | 通过 `view_file` 调用。 |

---

## 📍 当前状态 (由 Workflow 自动更新)

> **注意**: 此部分由 `/genesis` 和 `/blueprint` 自动维护。

- **最新架构版本**: `genesis/v1`
- **活动任务清单**: `genesis/v1/05_TASKS.md`
- **待办任务数**: -
- **最近一次更新**: `2026-02-19`

---

## 🌳 项目结构 (Project Tree)

```text
auto-accept-agent/
├── .agent/                          # AI 工作流框架
│   ├── rules/agents.md              # 本文件 (AI 锚点)
│   ├── workflows/                   # 工作流 (genesis, blueprint, etc.)
│   └── skills/                      # 技能库 (11 个可复用技能)
├── genesis/                         # 架构演进文档
│   └── v1/                          # 当前版本
├── PRD/                             # 产品需求文档
│   ├── run_button_auto_click.md     # Run 按钮修复 PRD
│   ├── auto_open_last_conversation.md # 自动打开对话 PRD
│   └── panel-scroll-fix.md          # 面板滚动修复 PRD
├── extension.js                     # 🔑 主入口 (activate/deactivate)
├── main_scripts/                    # 核心模块
│   ├── full_cdp_script.js           # 🔑 CDP 注入的浏览器端脚本
│   ├── cdp-handler.js               # CDP WebSocket 通信管理
│   ├── relauncher.js                # 跨平台 IDE 重启器
│   ├── auto_accept.js               # 按钮自动点击逻辑
│   ├── overlay.js                   # 后台模式 UI 叠加层
│   ├── antigravity_background_poll.js # 后台轮询
│   ├── main.js                      # 脚本入口
│   ├── selector_finder.js           # 选择器查找
│   ├── simple_poll.js               # 简单轮询
│   ├── utils.js                     # 工具函数
│   └── analytics/                   # 统计分析模块
│       ├── index.js                 # 分析入口
│       ├── state.js                 # 状态管理
│       ├── focus.js                 # 焦点检测
│       ├── trackers/                # 追踪器
│       └── reporters/               # 报告器
├── settings-panel.js                # 设置面板 WebView
├── config.js                        # 配置常量
├── utils/
│   └── localization.js              # 国际化工具
├── l10n/                            # 本地化文件
├── media/                           # 图标资源
├── dist/                            # 构建产物
├── scripts/                         # 构建脚本
├── test_scripts/                    # 测试脚本 (26 个)
├── package.json                     # 扩展清单
└── README.md                        # 项目说明
```

---

## 🧭 导航指南 (Navigation Guide)

| 系统 | 源码路径 | 设计文档 |
|------|----------|----------|
| 扩展生命周期 | `extension.js` | `genesis/v1/04_SYSTEM_DESIGN/` |
| CDP 通信 | `main_scripts/cdp-handler.js` | `genesis/v1/04_SYSTEM_DESIGN/` |
| 浏览器端注入 | `main_scripts/full_cdp_script.js` | `genesis/v1/04_SYSTEM_DESIGN/` |
| 平台重启器 | `main_scripts/relauncher.js` | `genesis/v1/04_SYSTEM_DESIGN/` |
| 设置面板 | `settings-panel.js` | `genesis/v1/04_SYSTEM_DESIGN/` |
| 统计分析 | `main_scripts/analytics/` | `genesis/v1/04_SYSTEM_DESIGN/` |

- **在新架构就绪前**: 请勿大规模修改代码。
- **遇到架构问题**: 请查阅 `genesis/v{N}/03_ADR/`。

---

## 🛠️ 工作流注册表

| 工作流 | 触发时机 | 产出 |
|--------|---------|------|
| `/genesis` | 新项目 / 重大重构 | PRD, Architecture, ADRs |
| `/scout` | 变更前 / 接手项目 | `genesis/v{N}/00_SCOUT_REPORT.md` |
| `/design-system` | genesis 后 | 04_SYSTEM_DESIGN/*.md |
| `/blueprint` | genesis 后 | 05_TASKS.md |
| `/change` | 微调已有任务 | 更新 TASKS + SYSTEM_DESIGN (仅修改) + CHANGELOG |
| `/explore` | 调研时 | 探索报告 |
| `/challenge` | 决策前质疑 | 07_CHALLENGE_REPORT.md |
| `/craft` | 创建工作流/技能/提示词 | Workflow / Skill / Prompt 文档 |
| `/package-extension` | 打包 VSIX | 构建产物 |

---

## 📜 宪法 (The Constitution)

1. **版本即法律**: 不"修补"架构文档，只"演进"。变更必须创建新版本。
2. **显式上下文**: 决策写入 ADR，不留在"聊天记忆"里。
3. **交叉验证**: 编码前对照 `05_TASKS.md`。我在做计划好的事吗？
4. **美学**: 文档应该是美的。善用 Markdown 和 Emoji。

---

> **状态自检**: 准备好了？读取上方"当前状态"指引的架构文档并开始吧。
