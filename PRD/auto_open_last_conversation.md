# Antigravity 启动时自动打开最后一次对话 - 可行性分析报告

## 背景

用户希望使用 auto-accept-agent 插件在 Antigravity IDE 启动时自动恢复/打开最后一次进行的对话。

---

## 研究发现

### 1. 对话存储位置

Antigravity 的对话数据存储在本地文件系统：

| 类型 | 路径 |
|------|------|
| 对话文件 | `~/.gemini/antigravity/conversations/` |
| Brain 数据 | `~/.gemini/antigravity/brain/` |

**文件格式**: 可能是 JSONL (JSON Lines) 格式，每行一条对话记录。

### 2. 插件现有能力

auto-accept-agent 插件已具备以下关键能力：

| 能力 | 描述 | 状态 |
|------|------|------|
| CDP 注入 | 通过 Chrome DevTools Protocol 向 IDE 注入 JavaScript | ✅ 已有 |
| 面板交互 | 操作 `#antigravity\.agentPanel` 内的 UI 元素 | ✅ 已有 |
| 状态持久化 | 使用 VS Code Memento API 保存状态 | ✅ 已有 |
| 启动事件 | 监听 `onStartupFinished` 激活事件 | ✅ 已有 |

### 3. VS Code API 支持

- **Memento API**: 可用于保存 `lastConversationUrl` 等元数据
- **WebviewPanelSerializer**: 可恢复 WebView 状态

---

## 技术方案分析

### 方案 A: 通过 CDP 点击对话列表 (推荐)

```
启动流程:
1. 插件激活 (onStartupFinished)
2. 读取上次保存的 conversation ID
3. 通过 CDP 注入脚本查找对话标签
4. 模拟点击打开对应对话
```

**可行性**: ⭐⭐⭐⭐ (高)

**优点**:
- 复用现有的 CDP 注入基础设施
- 不依赖 Antigravity 内部 API
- 对 IDE 更新有一定兼容性

**缺点**:
- 需要等待 UI 完全加载
- 对话列表 DOM 结构可能变化
- 如果对话不在可见区域需要滚动

**技术实现要点**:
```javascript
// 1. 在 extension.js 中保存最后对话 ID
context.globalState.update('lastConversationId', conversationId);

// 2. 启动时通过 CDP 注入查找并点击
const script = `
  const tabs = document.querySelectorAll('[data-conversation-id]');
  const target = Array.from(tabs).find(t => 
    t.getAttribute('data-conversation-id') === '${lastId}'
  );
  if (target) target.click();
`;
```

---

### 方案 B: 读取本地对话文件 + 发送 VS Code 命令

```
启动流程:
1. 读取 ~/.gemini/antigravity/conversations/ 目录
2. 解析最近修改的对话文件获取 ID
3. 调用 Antigravity 内部命令打开对话
```

**可行性**: ⭐⭐⭐ (中)

**优点**:
- 不依赖 UI 元素存在
- 理论上更可靠

**缺点**:
- Antigravity 可能没有公开命令 API
- 文件格式可能变化或加密
- 需要探索具体命令名称

---

### 方案 C: 使用 VS Code URI 协议

```
启动流程:
1. 保存对话的 deep link URI
2. 启动时通过 vscode.env.openExternal() 打开
```

**可行性**: ⭐⭐ (低)

**优点**:
- 如果 Antigravity 支持 URI 协议则很简洁

**缺点**:
- 不确定 Antigravity 是否支持对话 URI
- 可能打开新窗口而非当前窗口

---

## 实现难点与风险

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| UI 加载时机 | agentPanel 可能尚未渲染 | 使用 MutationObserver 等待 |
| 选择器变化 | Antigravity 更新可能改变 DOM | 使用多个备选选择器 |
| 对话已删除 | 上次对话可能被用户删除 | 检查存在性后再操作 |
| 多窗口冲突 | 多个窗口可能保存不同对话 | 使用 workspaceState 替代 globalState |

---

## 结论与建议

### 可行性评估: ✅ 可行

基于以下事实:
1. 插件已有成熟的 CDP 注入和 agentPanel 操作能力
2. VS Code Memento API 可持久化对话 ID
3. 对话列表 UI 可通过 DOM 操作访问

### 推荐方案: 方案 A (CDP 点击对话列表)

### 实现步骤建议:

1. **追踪当前对话**: 在 `full_cdp_script.js` 中添加逻辑检测当前活动对话 ID/标题
2. **保存到 Memento**: 通过 CDP 回调将对话信息传递给 extension.js 保存
3. **启动时恢复**: 在 `activate()` 中添加恢复逻辑
4. **错误处理**: 对话不存在时静默失败或提示用户

### 需要进一步探索:

1. Antigravity 对话标签的具体 DOM 结构和属性
2. 是否有 `data-conversation-id` 或类似标识符
3. 对话切换时的事件/变化

---

## 下一步行动

如需继续，建议:
1. 连接到 Antigravity 的 CDP 端口
2. 检查对话面板的 DOM 结构
3. 编写原型代码验证方案可行性
