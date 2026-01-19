# Multica 架构概览

> 本文档描述 Multica 的实际实现架构，包括各组件的职责和协同关系。
> 设计层面的文档请参考 [system-design.md](./system-design.md)

---

## 目录

1. [整体架构](#1-整体架构)
2. [技术栈](#2-技术栈)
3. [目录结构](#3-目录结构)
4. [Electron 进程架构](#4-electron-进程架构)
5. [主进程核心组件](#5-主进程核心组件)
6. [渲染进程组件](#6-渲染进程组件)
7. [预加载脚本](#7-预加载脚本)
8. [IPC 通信](#8-ipc-通信)
9. [ACP 协同机制](#9-acp-协同机制)
10. [数据流](#10-数据流)
11. [状态管理](#11-状态管理)
12. [安全设计](#12-安全设计)

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Multica (Electron App)                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Renderer Process (React)                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ChatView  │  │Sidebar   │  │FileTree  │  │PermissionDialog  │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  │                              │                                        │   │
│  │                    ┌─────────▼─────────┐                              │   │
│  │                    │   Zustand Stores  │                              │   │
│  │                    │  (状态管理)        │                              │   │
│  │                    └─────────┬─────────┘                              │   │
│  └──────────────────────────────┼──────────────────────────────────────┘   │
│                                 │ IPC (contextBridge)                       │
│                                 │                                           │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │                           Main Process                              │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │                      Conductor (门面)                        │  │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │  │   │
│  │  │  │Session       │  │AgentProcess  │  │Permission    │      │  │   │
│  │  │  │Lifecycle     │  │Manager       │  │Manager       │      │  │   │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘      │  │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │  │   │
│  │  │  │PromptHandler │  │SessionStore  │  │G3Workaround  │      │  │   │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘      │  │   │
│  │  └─────────────────────────────┬────────────────────────────────┘  │   │
│  │                                │                                    │   │
│  └────────────────────────────────┼────────────────────────────────────┘   │
│                                   │ ACP (JSON-RPC over stdio)              │
│                                   │                                         │
│  ┌────────────────────────────────▼─────────────────────────────────────┐  │
│  │                     ACP Agents (Child Processes)                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │  │
│  │  │opencode acp │  │claude-code  │  │codex-acp    │  ...              │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 技术栈

| 层级 | 技术 | 版本 | 用途 |
|-----|------|------|------|
| **桌面框架** | Electron | 39.2.6 | 跨平台桌面应用 |
| **前端框架** | React | 19.2.1 | UI 渲染 |
| **开发语言** | TypeScript | 5.9.3 | 类型安全 |
| **构建工具** | electron-vite | - | 快速开发和构建 |
| **状态管理** | Zustand | 5.0.10 | 轻量级状态管理 |
| **样式** | Tailwind CSS | 4.1.18 | UI 样式 |
| **协议 SDK** | @agentclientprotocol/sdk | 0.13.0 | ACP 协议实现 |
| **Markdown** | react-markdown | 10.1.0 | 富文本渲染 |
| **测试** | Vitest | 4.0.17 | 单元测试 |

---

## 3. 目录结构

```
multica/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 入口，应用启动
│   │   ├── conductor/           # 核心协调器模块
│   │   │   ├── Conductor.ts     # 主协调器 (门面模式)
│   │   │   ├── AgentProcessManager.ts  # 代理进程管理
│   │   │   ├── AgentProcess.ts  # 单个代理进程封装
│   │   │   ├── SessionLifecycle.ts    # 会话生命周期
│   │   │   ├── PromptHandler.ts  # 提示处理
│   │   │   ├── G3Workaround.ts  # G-3 权限机制
│   │   │   ├── historyReplay.ts # 历史回放
│   │   │   └── AcpClientFactory.ts  # ACP 客户端工厂
│   │   ├── session/              # 会话存储
│   │   │   └── SessionStore.ts
│   │   ├── permission/           # 权限管理
│   │   │   ├── PermissionManager.ts
│   │   │   ├── AskUserQuestionHandler.ts
│   │   │   └── types.ts
│   │   ├── ipc/                  # IPC 处理器
│   │   │   └── handlers.ts
│   │   ├── config/               # 配置管理
│   │   ├── updater/              # 自动更新
│   │   └── utils/                # 工具函数
│   │
│   ├── preload/                  # 预加载脚本
│   │   └── index.ts              # 通过 contextBridge 暴露 API
│   │
│   ├── renderer/                 # React 前端
│   │   ├── src/
│   │   │   ├── components/       # UI 组件
│   │   │   ├── hooks/            # React Hooks
│   │   │   ├── stores/           # Zustand 状态管理
│   │   │   └── contexts/         # React Context
│   │   └── index.html
│   │
│   └── shared/                   # 共享代码
│       ├── types.ts              # 共享类型
│       ├── constants.ts          # 常量
│       └── ipc-channels.ts       # IPC 通道定义
│
├── resources/                    # 应用资源
├── docs/                         # 文档
└── electron.vite.config.ts       # Vite 配置
```

---

## 4. Electron 进程架构

### 4.1 进程模型

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • 应用生命周期管理                                   │    │
│  │  • 窗口管理                                          │    │
│  │  • 代理进程启动/停止                                  │    │
│  │  • ACP 通信                                          │    │
│  │  • 文件系统访问                                      │    │
│  │  • IPC 请求处理                                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ IPC (invoke/handle/send/on)
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Preload Script (Isolated Context)              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • contextBridge.exposeInMainWorld('electronAPI')   │    │
│  │  • 类型安全的 API 暴露                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ window.electronAPI.*
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Renderer Process (Web Context)                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • React UI 组件                                     │    │
│  │  • 用户交互                                          │    │
│  │  • 状态管理 (Zustand)                                │    │
│  │  • 无 Node.js 直接访问                               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 安全配置

```typescript
// webPreferences 安全配置
{
  nodeIntegration: false,      // 禁用 Node.js 集成
  contextIsolation: true,      // 启用上下文隔离
  sandbox: true,               // 启用沙箱模式
  preload: preloadPath         // 加载预加载脚本
}
```

---

## 5. 主进程核心组件

### 5.1 Conductor (协调器)

**职责**: 中央门面，协调所有模块

```typescript
class Conductor {
  // 核心模块
  private agentProcessManager: AgentProcessManager
  private sessionLifecycle: SessionLifecycle
  private promptHandler: PromptHandler
  private g3Workaround: G3Workaround
  private sessionStore: ISessionStore | null

  // 对外 API
  async createSession(params): Promise<MulticaSession>
  async resumeSession(sessionId: string): Promise<void>
  async deleteSession(sessionId: string): Promise<void>
  async switchSessionAgent(sessionId: string, agentId: string): Promise<void>
  async sendPrompt(sessionId: string, content: MessageContent[]): Promise<void>
  async cancelRequest(sessionId: string): Promise<void>
}
```

**设计模式**: 门面模式 (Facade Pattern)

### 5.2 AgentProcessManager (代理进程管理器)

**职责**: 管理所有代理进程的生命周期

```typescript
class AgentProcessManager {
  // 会话到代理的映射
  private sessions: Map<string, SessionAgent>

  async start(sessionId, config, cwd, isResumed): Promise<AgentStartResult>
  async stop(sessionId: string): Promise<void>
  get(sessionId: string): SessionAgent | undefined
}
```

**SessionAgent 结构**:
```typescript
interface SessionAgent {
  agentProcess: AgentProcess          // 子进程封装
  connection: ClientSideConnection    // ACP 连接
  agentConfig: AgentConfig            // 代理配置
  agentSessionId: string              // 代理会话 ID
  needsHistoryReplay: boolean         // 是否需要历史回放
}
```

### 5.3 AgentProcess (代理进程)

**职责**: 封装单个代理子进程

```typescript
class AgentProcess {
  private process: ChildProcess | null

  async start(): Promise<void>
  async stop(): Promise<void>
  getStdinWeb(): WritableStream<Uint8Array>
  getStdoutWeb(): ReadableStream<Uint8Array>

  onExit(callback: (code: number | null, signal: NodeJS.Signals | null) => void): void
}
```

**进程启动**:
```typescript
this.process = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'inherit'],  // stdin/stdout 管道，stderr 继承
  env: { ...process.env, ...env, PATH: getEnhancedPath() }
})
```

### 5.4 SessionLifecycle (会话生命周期)

**职责**: 管理会话的完整生命周期

```
创建 → 加载 → 恢复 → 活跃 → 停止/删除
```

**懒加载机制**: 会话创建时不启动代理，首次发送提示时才启动

```typescript
async ensureAgentForSession(sessionId: string): Promise<SessionAgent> {
  const existing = this.agentProcessManager.get(sessionId)
  if (existing) return existing

  // 首次启动代理
  const { agentSessionId } = await this.agentProcessManager.start(
    sessionId, agentConfig, cwd, true  // isResumed = true
  )
}
```

### 5.5 PromptHandler (提示处理器)

**职责**: 处理用户提示的发送和响应

```typescript
class PromptHandler {
  async sendPrompt(sessionId: string, content: MessageContent[], options?: PromptOptions): Promise<void>
  async cancel(sessionId: string): Promise<void>
}
```

**历史回放机制**: 恢复会话时将历史记录注入到新代理

```typescript
if (sessionAgent.needsHistoryReplay && this.sessionStore) {
  const data = await this.sessionStore.get(sessionId)
  const history = formatHistoryForReplay(data.updates)
  promptContent = [{ type: 'text', text: history }, ...promptContent]
}
```

### 5.6 SessionStore (会话存储)

**职责**: 持久化会话数据

**存储结构**:
```
~/.multica/sessions/
├── index.json              # 会话列表索引
└── data/
    └── {session-id}.json   # 完整会话数据
```

**原子写入** (防止并发问题):
```typescript
private async atomicWrite(lockKey, filePath, getData) {
  const tempPath = `${filePath}.tmp.${Date.now()}.${randomUUID()}`
  const data = await getData()
  await writeFile(tempPath, data)
  await rename(tempPath, filePath)
}
```

**序列号系统** (处理并发更新):
```typescript
async appendUpdate(sessionId, update: SessionNotification) {
  const currentSeq = this.sequenceCounters.get(sessionId) ?? 0
  const nextSeq = currentSeq + 1
  this.sequenceCounters.set(sessionId, nextSeq)

  return { sequenceNumber: nextSeq, ... }
}
```

### 5.7 PermissionManager (权限管理器)

**职责**: 处理 ACP 权限请求

```typescript
class PermissionManager {
  async handlePermissionRequest(params: RequestPermissionRequest): Promise<boolean>
  handlePermissionResponse(response: PermissionResponse): void
}
```

---

## 6. 渲染进程组件

### 6.1 组件树结构

```
App (ThemeProvider)
└── AppContent
    ├── AppSidebar (会话列表侧边栏)
    ├── StatusBar (状态栏)
    ├── ChatView (聊天视图)
    │   ├── MessageList (消息列表)
    │   ├── MessageItem (单条消息)
    │   └── PermissionDialog (权限对话框)
    ├── MessageInput (消息输入)
    ├── RightPanel (右侧面板)
    │   └── FileTree (文件树)
    └── Modals (全局模态框)
        ├── Settings (设置)
        └── DeleteSession (删除确认)
```

### 6.2 Zustand Stores

#### useApp (核心业务状态)

```typescript
interface AppState {
  // 会话状态
  sessions: MulticaSession[]
  currentSession: MulticaSession | null
  sessionUpdates: StoredSessionUpdate[]

  // Agent 状态
  runningSessionsStatus: RunningSessionsStatus
  isProcessing: boolean
  isInitializing: boolean

  // 方法
  createSession: (cwd: string, agentId: string) => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  sendPrompt: (content: string) => Promise<void>
  cancelRequest: () => Promise<void>
}
```

#### useUIStore (UI 状态)

```typescript
interface UIStore {
  sidebarOpen: boolean
  sidebarWidth: number
  rightPanelOpen: boolean
  rightPanelWidth: number

  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
}
```

#### usePermissionStore (权限状态)

```typescript
interface PermissionStore {
  pendingRequests: PermissionRequest[]
  respondedRequests: Map<string, RespondedRequest>
  currentQuestionIndex: number
  collectedAnswers: QuestionAnswer[]

  addPendingRequest: (request: PermissionRequest) => void
  respondToRequest: (optionId: string, data?: PermissionResponseData) => void
}
```

---

## 7. 预加载脚本

**职责**: 安全地暴露主进程 API 给渲染进程

```typescript
// src/preload/index.ts
const electronAPI: ElectronAPI = {
  // 会话管理
  createSession: (cwd, agentId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE, cwd, agentId),
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST),
  resumeSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESUME, sessionId),

  // Agent 通信
  sendPrompt: (sessionId, content) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_PROMPT, sessionId, content),
  cancelRequest: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL, sessionId),

  // 事件监听
  onAgentMessage: (callback) => {
    const handler = (_event, message) => callback(message)
    ipcRenderer.on(IPC_CHANNELS.AGENT_MESSAGE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_MESSAGE, handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
```

---

## 8. IPC 通信

### 8.1 IPC 通道分类

```typescript
export const IPC_CHANNELS = {
  // Agent 通信
  AGENT_PROMPT: 'agent:prompt',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_MESSAGE: 'agent:message',
  AGENT_STATUS: 'agent:status',

  // 会话管理
  SESSION_CREATE: 'session:create',
  SESSION_LIST: 'session:list',
  SESSION_LOAD: 'session:load',
  SESSION_RESUME: 'session:resume',
  SESSION_DELETE: 'session:delete',
  SESSION_SWITCH_AGENT: 'session:switch-agent',

  // 权限请求
  PERMISSION_REQUEST: 'permission:request',
  PERMISSION_RESPONSE: 'permission:response',

  // 文件系统
  FS_LIST_DIRECTORY: 'fs:list-directory',
  FS_OPEN_WITH: 'fs:open-with',

  // 自动更新
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install'
}
```

### 8.2 通信模式

**双向请求-响应** (ipcRenderer.invoke / ipcMain.handle):
```typescript
// 渲染进程
const session = await window.electronAPI.createSession(cwd, agentId)

// 主进程
ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async (_event, cwd, agentId) => {
  return await conductor.createSession({ cwd, agentId })
})
```

**单向发送** (ipcRenderer.send / ipcMain.on):
```typescript
// 渲染进程
window.electronAPI.respondToPermission(response)

// 主进程
ipcMain.on(IPC_CHANNELS.PERMISSION_RESPONSE, (_event, response) => {
  permissionManager.handlePermissionResponse(response)
})
```

**异步事件** (ipcRenderer.on / webContents.send):
```typescript
// 主进程
mainWindow.webContents.send(IPC_CHANNELS.AGENT_MESSAGE, message)

// 渲染进程
window.electronAPI.onAgentMessage((message) => {
  // 处理消息
})
```

---

## 9. ACP 协同机制

### 9.1 ACP 客户端工厂

```typescript
// AcpClientFactory.ts
export function createAcpClient(sessionId, options) {
  return {
    // 处理会话更新通知
    sessionUpdate: async (params: SessionNotification) => {
      // 存储到 SessionStore
      const storedUpdate = await sessionStore.appendUpdate(sessionId, params)

      // 触发 UI 回调
      callbacks.onSessionUpdate?.(params, storedUpdate.sequenceNumber)
    },

    // 处理权限请求
    requestPermission: async (params: RequestPermissionRequest) => {
      return callbacks.onPermissionRequest?.(params) ?? autoApprove
    }
  }
}
```

### 9.2 代理启动流程

```
1. AgentProcess.start() → 启动子进程
2. 创建 NDJSON 流 (stdin/stdout)
3. 创建 ClientSideConnection
4. connection.initialize() → ACP 握手
5. connection.newSession() → 创建 ACP 会话
```

### 9.3 流式响应处理

```
Agent stdout → NDJSON 解析 → session/update 通知
                                ↓
                         AcpClientFactory.sessionUpdate
                                ↓
                         SessionStore.appendUpdate
                                ↓
                         IPC → Renderer → UI 更新
```

### 9.4 AskUserQuestion (G-3 机制)

由于 ACP 的 AskUserQuestion 工具只返回"用户已回答"的问题，需要通过 G-3 机制注入实际答案：

```
1. 代理发起权限请求
2. 显示 UI 对话框
3. 用户选择答案
4. 存储到 pendingAnswers
5. 取消当前请求
6. 重新提示，注入用户答案
7. 代理现在能看到实际选择
```

---

## 10. 数据流

### 10.1 用户提示流程

```
用户输入
  ↓
MessageInput.sendPrompt()
  ↓
useApp.sendPrompt()
  ↓
window.electronAPI.sendPrompt() [IPC]
  ↓
Conductor.sendPrompt()
  ↓
PromptHandler.sendPrompt()
  ↓
AgentProcessManager.get(sessionId)
  ↓
ClientSideConnection.prompt()
  ↓
[JSON-RPC over stdio] → ACP Agent
  ↓
session/update notifications ←
  ↓
AcpClientFactory.sessionUpdate
  ↓
SessionStore.appendUpdate (存储)
  ↓
ConductorEvents.onSessionUpdate
  ↓
IPC → Renderer
  ↓
useApp 处理消息更新
  ↓
ChatView 重新渲染
```

### 10.2 会话恢复流程

```
用户选择历史会话
  ↓
useApp.selectSession()
  ↓
window.electronAPI.resumeSession() [IPC]
  ↓
Conductor.resumeSession()
  ↓
SessionLifecycle.ensureAgentForSession()
  ↓
AgentProcessManager.start() (isResumed=true)
  ↓
启动新 ACP 会话 (代理无记忆)
  ↓
SessionStore.get(sessionId) → 获取历史
  ↓
下次 sendPrompt 时注入历史记录
  ↓
UI 显示历史消息
```

---

## 11. 状态管理

### 11.1 状态流转

```
┌─────────────────────────────────────────────────────────────────┐
│                         Renderer State                          │
│                                                                  │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   useApp    │ ←──→ │permissionSt │ ←──→ │  uiStore    │     │
│  │  (会话/Agent) │     │  (权限请求)  │      │  (UI布局)   │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│         ↑                                            ↑          │
│         │ IPC Events                                 │          │
│         │                                            │          │
└─────────┼────────────────────────────────────────────┼──────────┘
          │                                            │
          │ IPC                                        │
          ↓                                            │
┌─────────────────────────────────────────────────────────────────┐
│                      Main Process State                          │
│                                                                  │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │ Conductor   │      │SessionStore │      │Permission   │     │
│  │ (运行时状态) │      │ (持久化)     │      │Manager      │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 同步策略

- **会话列表**: 主进程存储，渲染进程通过 IPC 获取
- **当前会话**: 双向同步，渲染进程缓存当前会话的更新
- **权限请求**: 渲染进程管理队列，响应后通过 IPC 发送到主进程
- **UI 状态**: 纯渲染进程，使用 persist 中件同步到 localStorage

---

## 12. 安全设计

### 12.1 进程隔离

- `contextIsolation: true` - 预加载脚本在独立上下文运行
- `nodeIntegration: false` - 渲染进程无法直接访问 Node.js
- `sandbox: true` - 渲染进程运行在沙箱中

### 12.2 API 暴露原则

- 只暴露必要的 API
- 所有 API 通过 contextBridge 暴露
- 使用 TypeScript 类型定义确保类型安全

### 12.3 路径验证

```typescript
function isValidPath(inputPath: string): boolean {
  if (!path.isAbsolute(inputPath)) return false
  const resolved = path.resolve(inputPath)
  return resolved === inputPath
}
```

### 12.4 进程管理

- 代理进程以独立子进程运行
- 设置 5 秒超时的优雅关闭
- 超时后使用 SIGKILL 强制终止

---

## 附录

### A. 关键文件索引

| 组件 | 文件路径 |
|-----|---------|
| Conductor | `src/main/conductor/Conductor.ts` |
| AgentProcessManager | `src/main/conductor/AgentProcessManager.ts` |
| SessionLifecycle | `src/main/conductor/SessionLifecycle.ts` |
| PromptHandler | `src/main/conductor/PromptHandler.ts` |
| SessionStore | `src/main/session/SessionStore.ts` |
| PermissionManager | `src/main/permission/PermissionManager.ts` |
| IPC Handlers | `src/main/ipc/handlers.ts` |
| Preload | `src/preload/index.ts` |
| useApp | `src/renderer/src/hooks/useApp.ts` |
| UIStore | `src/renderer/src/stores/uiStore.ts` |
| PermissionStore | `src/renderer/src/stores/permissionStore.ts` |

### B. 外部参考

- [Agent Client Protocol](https://agentclientprotocol.com/)
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)
- [system-design.md](./system-design.md) - 设计文档
- [acp-message-rendering.md](./acp-message-rendering.md) - 消息渲染规范
