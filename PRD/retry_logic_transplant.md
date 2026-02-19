# Retry 逻辑移植 — 从上游 conversation-flow 检测

## 背景

从 michaelbarrera21/auto-accept-agent 上游移植 retry 重构逻辑（4 个 commit），将旧的 error-container-based 检测升级为 conversation-flow-based 检测。

## 改动范围

文件: `main_scripts/full_cdp_script.js`

### 新增函数
- `findContinueReference()` — 跨 iframe 搜索对话中的 "Continue" 文本锚点

### 替换函数
- `detectSuccessSignalAfter()` — 多信号检测（Thinking、isolate、fade-in、prose、content-row）
- `detectFailureSignalAfter()` — Retry 弹窗重现检测（跨 iframe）
- `observeRetryOutcome()` — 两阶段检测 + 全局锁管理

### 参数变更
- `RETRY_OBSERVATION_TIMEOUT`: 10s → 15s
- 新增 `retryObservationInProgress` 全局锁
- `performClick()` 中 Retry 处理：锁在延迟前获取，防止竞态条件

## 来源 Commits
- `56b3fb2` feat: Improve retry success detection by tracking conversation flow (v8.9.7)
- `740c3d6` fix: improve retry observation logic
- `e0d22cb` fix: use getDocuments() for cross-iframe search, add global retry lock
- `aac02f2` fix: acquire retry lock before delay to prevent race condition (v8.9.12)
