# Panel 滚动修复方案 (v2)

## 问题描述

当 "1 Step Requires Input" 提示出现时，Run 或 Always Allow 按钮可能在视口外，导致自动点击失败。

---

## 解决方案

**触发条件**：检测页面中是否存在 "Step Requires Input" 文本

**处理逻辑**：
1. 在每个循环周期开始时检测 "Step Requires Input" 文本
2. 如果检测到，滚动 panel 到底部
3. 继续执行原有的按钮点击逻辑

---

## 修改范围

| 文件 | 修改内容 |
|------|---------|
| `main_scripts/full_cdp_script.js` | 新增检测函数、滚动函数，修改 `antigravityLoop` |

---

## 新增代码

### 1. `hasStepRequiresInput()` 检测函数

检测 panel 内是否存在 "Step Requires Input" 或 "Requires Input" 文本。

### 2. `scrollPanelToBottom(panelSelector)` 滚动函数

滚动指定面板到底部，等待 200ms 让 DOM 更新。

### 3. 修改 `antigravityLoop()`

在 `performClick` 调用前添加检测和滚动逻辑。

---

## 预估工作量

- 代码修改：~30 行
- 测试验证：手动测试
