# ACP 消息渲染实现

本文档描述 Multica 如何解析和渲染来自 ACP (Agent Client Protocol) 代理的消息。

## 架构概览

```
ACP 代理进程
       │
       ▼
┌─────────────────────────────┐
│  AcpClientFactory.ts        │  接收 SessionNotification
│  sessionUpdate 回调         │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  SessionStore.ts            │  使用序列号持久化
│  ~/.multica/sessions/data/  │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  主进程 (index.ts)          │  通过 IPC 广播
│  webContents.send()         │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  预加载 (preload/index.ts)  │  暴露 electronAPI
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  useApp.ts hook             │  累积 sessionUpdates 状态
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  ChatView.tsx               │  groupUpdatesIntoMessages()
│  ToolCallItem.tsx           │  渲染 UI 组件
└─────────────────────────────┘
```

## 会话更新类型

### ACP 标准类型

| 类型                  | 描述                                    | 来源    |
| --------------------- | ---------------------------------------- | ------- |
| `agent_message_chunk` | 来自代理的流式文本内容                    | ACP SDK |
| `agent_thought_chunk` | 代理的思考/推理过程（扩展思考）           | ACP SDK |
| `tool_call`           | 带有初始数据的工具调用事件                | ACP SDK |
| `tool_call_update`    | 工具状态更新（运行中/已完成/失败）        | ACP SDK |
| `plan`                | 来自 TodoWrite 工具的任务列表             | ACP SDK |

### Multica 自定义类型

| 类型                       | 描述                          | 用途                           |
| -------------------------- | ------------------------------ | ------------------------------ |
| `user_message`             | 用户输入消息                   | 内部存储，非 ACP 规范部分      |
| `error_message`            | 错误显示（如认证失败）          | UI 错误渲染                    |
| `askuserquestion_response` | 用户对问题响应的持久化          | 重启后状态恢复                 |

## 关键文件

| 文件                                           | 用途                                     |
| ---------------------------------------------- | ---------------------------------------- |
| `src/main/conductor/AcpClientFactory.ts`       | 创建 ACP 客户端，处理 sessionUpdate 回调  |
| `src/main/session/SessionStore.ts`             | 持久化消息，生成序列号                   |
| `src/main/index.ts`                            | 将 Conductor 连接到 Electron IPC         |
| `src/preload/index.ts`                         | 向渲染进程暴露 Electron API              |
| `src/renderer/src/hooks/useApp.ts`             | 订阅消息，管理状态                       |
| `src/renderer/src/components/ChatView.tsx`     | 解析更新，渲染消息                       |
| `src/renderer/src/components/ToolCallItem.tsx` | 渲染单个工具调用                         |
| `src/shared/ipc-channels.ts`                   | IPC 通道名称                             |

## 消息解析逻辑

### ChatView.tsx: groupUpdatesIntoMessages()

位置: `src/renderer/src/components/ChatView.tsx:168-490`

此函数将原始的 `StoredSessionUpdate[]` 转换为可显示的 `Message[]`：

1. **按序列号排序** - 确保并发更新的正确顺序
2. **根据 `update.sessionUpdate` 分发** - 分发到特定类型的处理
3. **累积块内容** - 文本/思考块在渲染前进行缓冲
4. **跟踪工具调用** - 存储在 `Map<toolCallId, ToolCall>` 中以进行原地更新

### 内容块类型

```typescript
type ContentBlock =
  | { type: 'text'; content: string }
  | { type: 'thought'; content: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'plan'; entries: PlanEntry[] }
  | { type: 'error'; errorType: 'auth' | 'general'; message: string; ... }
```

## 工具调用渲染

### 工具名称解析优先级

```typescript
// ChatView.tsx:299-300
const meta = update._meta as { claudeCode?: { toolName?: string } }

// 优先级顺序:
1. meta?.claudeCode?.toolName  // Claude Code 专用
2. update.kind                  // 标准 ACP kind (Codex 使用此字段)
3. update.title                 // 备用显示名称
```

### 支持的工具 (ToolCallItem.tsx)

| toolName                      | 图标          | 显示              |
| ----------------------------- | ------------- | ----------------- |
| `read`                        | FileText      | 读取文件          |
| `write`                       | FilePen       | 写入文件          |
| `edit`                        | FilePen       | 编辑文件          |
| `bash`, `execute`             | Terminal      | 终端命令          |
| `grep`                        | Search        | 内容搜索          |
| `glob`                        | Search        | 文件模式匹配      |
| `search`                      | Search        | 通用搜索          |
| `websearch`                   | Globe         | 网络搜索          |
| `webfetch`, `fetch`           | Globe         | 获取 URL          |
| `task`                        | Bot           | 子代理任务        |
| `todowrite`                   | ListTodo      | 任务列表          |
| `askuserquestion`, `question` | MessageSquare | 用户提示          |
| (默认)                        | Circle        | 未知工具          |

## 代理特定差异

### Claude Code vs Codex vs OpenCode

| 特性             | Claude Code                 | Codex                | OpenCode            |
| ---------------- | --------------------------- | -------------------- | ------------------- |
| 工具名称来源     | `_meta.claudeCode.toolName` | `kind` 字段          | `kind` 或 `title`   |
| 命令执行         | `bash`                      | `execute`            | 各异                |
| 问题工具         | `AskUserQuestion`           | -                    | `question`          |
| 更新中的 kind    | 有时                        | 是（仅 tool_call）   | 各异                |

### Codex Kind 缓存

Codex 的 `tool_call_update` 事件不包含 `kind` 字段，只有初始的 `tool_call` 包含。`useApp.ts:145-155` 中的解决方案：

```typescript
// 从 tool_call 事件缓存 kind
if (update?.sessionUpdate === 'tool_call' && toolCallId && update?.kind) {
  toolKindMapRef.current.set(toolCallId, kind)
}

// 为 tool_call_update 检索缓存的 kind
if (update?.sessionUpdate === 'tool_call_update' && toolCallId) {
  const storedKind = toolKindMapRef.current.get(toolCallId)
  // 使用 storedKind 决定文件树刷新
}
```

## 序列号系统

### 用途

处理无序到达的并发异步更新。

### 实现

- `SessionStore.ts` 分配单调递增的序列号
- `ChatView.tsx:171-178` 在处理前按序列号排序更新
- 确保无论到达顺序如何都能正确重建消息

## 内部消息

带有 `_internal: true` 的消息会发送给代理，但**不会在 UI 中显示**：

```typescript
// ChatView.tsx:227-233
const userUpdate = update as { content?: unknown; _internal?: boolean }
if (userUpdate._internal) {
  break // 跳过内部消息 - 不在 UI 中显示
}
```

由 G-3 机制用于 AskUserQuestion 答案。

## 错误处理

### 认证错误

在 `useApp.ts:342-366` 中检测并转换为 `error_message` 更新：

```typescript
if (isAuthError(errorMessage)) {
  const errorUpdate = {
    sessionUpdate: 'error_message',
    errorType: 'auth',
    agentId: currentSession.agentId,
    authCommand: AGENT_AUTH_COMMANDS[agentId],
    message: errorMessage
  }
  setSessionUpdates((prev) => [...prev, errorUpdate])
}
```

### 一般错误

`Conductor.ts:402-441` 将错误转换为 `agent_message_chunk` 进行内联显示。

## 添加新代理支持

要支持新的 ACP 代理：

1. **工具名称映射**: 在 `ToolCallItem.tsx` 的 `getDisplayInfo()` 中添加 case
2. **问题工具**: 在 `tool-names.ts` 的 `QUESTION_TOOL_NAMES` 中添加工具名称
3. **认证命令**: 在 `config/defaults.ts` 的 `AGENT_AUTH_COMMANDS` 中添加
4. **Kind 缓存**: 如果代理在更新中不包含 `kind`，使用 Codex 模式

## 性能考虑

1. **序列号排序**: O(n log n) 排序，防止竞态条件
2. **工具调用引用更新**: Map 中的相同对象引用，触发 React 重新渲染
3. **块累积**: 减少流式传输期间的组件重新渲染
4. **可折叠消息**: 包含 2+ 个工具/思考的消息在完成时折叠
