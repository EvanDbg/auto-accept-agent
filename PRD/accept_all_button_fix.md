# Accept All 按钮未被自动点击 — 根因分析与修复方案

## 问题描述

Accept All 按钮存在于界面上（diff editor 区域），Auto Accept 已开启且正在运行，但按钮没有被自动点击。

## 根因分析

### 诊断数据

通过 CDP 扫描确认：
- Accept All 按钮：`<SPAN>` 标签，class 包含 `bg-ide-button-background`
- 位置：(1809, 922)，尺寸 68x18，**在 diff editor 区域**
- `isAcceptButton()` 所有检查都 **通过** ✅
- Auto Accept 状态：`isRunning: true`, `autoAcceptFileEdits: true`
- `inPanel: false` — **按钮不在 agentPanel 内部** ⚠️

### 根本原因

**`staticLoop`（非后台模式轮询）缺少全局 file-edit 扫描。**

| 代码路径 | 全局 file-edit 扫描 | Panel-scoped 扫描 |
|----------|---------------------|-------------------|
| `antigravityLoop` (后台模式) | ✅ Line 1421-1433 | ✅ Line 1402-1404 |
| `staticLoop` (普通模式) | ❌ **缺失** | ✅ Line 1613-1615 |

`staticLoop`（line 1605-1637）只做了 panel-scoped 搜索：

```javascript
// Line 1613-1615 - 只搜索 agentPanel 内部
clicked = await performClick(
    ['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'],
    getAgentPanelSelector()  // ← 限定范围！
);
```

而 Accept All 按钮在 **diff editor 区域**（agentPanel 外部），所以永远找不到。

`antigravityLoop` 在 panel-scoped 搜索之后，额外做了一次全局扫描：

```javascript
// Line 1421-1433 - 全局扫描，不限制 panel
const fileEditClicked = await performClick(
    ['.bg-ide-button-background', 'button.keep-changes', '[class*="bg-ide-button"]'],
    null  // 全局搜索
);
```

但 `staticLoop` 完全缺少这段逻辑。

---

## 修改方案

### [MODIFY] `main_scripts/full_cdp_script.js`

在 `staticLoop` 的 panel-scoped 搜索之后，添加与 `antigravityLoop` 相同的全局 file-edit 扫描：

```diff
  if (ide === 'antigravity') {
      clicked = await performClick(['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'], getAgentPanelSelector());
  } else {
      clicked = await performClick(['button', '[class*="button"]', '[class*="anysphere"]'], '#workbench\\.parts\\.auxiliarybar');
  }

+ // ALWAYS scan for file-edit buttons globally (Accept all / Accept Changes)
+ // These buttons appear in the diff editor area, outside the agent panel
+ {
+     const fileEditClicked = await performClick(
+         ['.bg-ide-button-background', 'button.keep-changes', '[class*="bg-ide-button"]'],
+         null  // global scan, not scoped to panel
+     );
+     if (fileEditClicked > 0) {
+         clicked += fileEditClicked;
+         log('[StaticPoll] Clicked ' + fileEditClicked + ' file-edit button(s) (global scan)');
+     }
+ }

  // 智能间隔：连续没有点击时增加间隔
```

## 验证方法

1. 修改后重新打包 (`npm run compile`) 或重载扩展
2. 开启 Auto Accept（非后台模式）
3. 发送一个会产生文件编辑的 agent 任务
4. 观察 Accept All 按钮是否被自动点击
5. 运行 `node test_scripts/cdp_test_accept_all.js` 确认按钮被检测到
