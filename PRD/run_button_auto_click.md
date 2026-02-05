# Run Button Auto-Click Fix

## 问题描述

新版 Antigravity 升级后，Run 按钮无法自动点击。

## 根本原因分析

通过 CDP 连接调试发现：

1. **Run 按钮在 iframe 内部**
   - iframe id: `antigravity.agentPanel`
   - iframe src: `vscode-file://vscode-app/.../app/ext...`

2. **按钮选择器已变更**
   - 旧选择器: `.bg-ide-button-background` - ❌ 不再匹配
   - 新按钮结构:
     ```html
     <button class="flex items-center px-3 py-1 cursor-pointer transition-colors rounded-l hover:bg-primary-hover !px-2 !py-0.5 !font-normal rounded-sm">
       <span>Run</span>
       <span class="ml-0.5 opacity-40">⌥⏎</span>
     </button>
     ```
   - 父元素: `class="bg-primary text-primary-foreground"`

3. **代码逻辑问题**
   - `antigravityLoop()` 只使用 `.bg-ide-button-background` 选择器
   - 该选择器无法匹配新版 Run 按钮

---

## 修改方案

### [MODIFY] `main_scripts/full_cdp_script.js`

更新 `antigravityLoop()` 中的按钮选择器（约第 1100 行）：

```diff
- clicked = await performClick(['.bg-ide-button-background'], '#antigravity\\.agentPanel');
+ clicked = await performClick(['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'], '#antigravity\\.agentPanel');
```

同样更新静态轮询模式（约第 1286 行）：

```diff
- clicked = await performClick(['.bg-ide-button-background'], '#antigravity\\.agentPanel');
+ clicked = await performClick(['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'], '#antigravity\\.agentPanel');
```

---

### [MODIFY] `main_scripts/auto_accept.js`

更新 `accept/retry` 模式的选择器（第 19-21 行）：

```diff
  if (buttons.includes("accept") || buttons.includes("retry")) {
-     targetSelectors.push(".bg-ide-button-background", "button")
+     targetSelectors.push(".bg-ide-button-background", "button.cursor-pointer", ".bg-primary button", "button")
      panelSelector = "#antigravity\\.agentPanel"
  }
```

---

## 验证方法

1. 确保 Antigravity 开启了 remote debug 模式（端口 9000）
2. 在 Antigravity 中启动一个 agent 任务，等待出现 Run 按钮
3. 启用 Auto Accept 插件
4. 观察 Run 按钮是否被自动点击
5. 可以运行 `node test_scripts/cdp_run_button_detail.js` 来检查按钮状态
