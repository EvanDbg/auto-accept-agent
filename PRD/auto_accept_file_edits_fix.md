# Auto Accept File Edits 兼容性修复

## 问题描述

Antigravity 升级后，"Auto Accept File Edits" 功能失效。

## 根因分析

| 项目 | 旧版 | 新版 |
|------|------|------|
| Accept All 按钮 | `<button>` | `<span class="bg-ide-button-background ...">` |
| Accept Changes 按钮 | 不存在 | `<button class="keep-changes primary">` |
| Agent 面板 | iframe-based | 普通 `<div>` (`#antigravity.agentViewContainerId`) |
| Accept All 位置 | 在面板内 | 在 diff review 区域（面板外部） |

`queryAll()` 函数在 `scopeSelector` 模式下只尝试 `contentDocument`（iframe），对普通 div 面板静默失败。

## 修复方案

### 1. `queryAll()` 增加 div 面板 fallback
### 2. `isAcceptButton()` / `isAcceptButtonCandidate()` 增加 `accept changes` pattern
### 3. `antigravityLoop()` 增加全局扫描 pass

## 验证结果

- ✅ CDP 扫描可检测到新版 `<span>` Accept all 按钮
- ✅ CDP 点击 Accept all 按钮成功
- ✅ 向下兼容旧版选择器
