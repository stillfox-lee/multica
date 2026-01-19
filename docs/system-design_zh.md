# ACP GUI 客户端 - 系统设计文档

> **版本**: 1.0
> **日期**: 2026年1月
> **状态**: 草稿

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [目标和非目标](#2-目标和非目标)
3. [背景](#3-背景)
4. [系统架构](#4-系统架构)
5. [组件设计](#5-组件设计)
6. [数据流](#6-数据流)
7. [接口定义](#7-接口定义)
8. [技术栈](#8-技术栈)
9. [实现阶段](#9-实现阶段)
10. [安全考虑](#10-安全考虑)
11. [未来路线图](#11-未来路线图)
12. [未解决问题](#12-未解决问题)
13. [附录](#13-附录)

---

## 1. 执行摘要

本文档描述了一个基于 Electron 的 GUI 应用程序的系统设计，该应用程序为与 ACP 兼容的编码代理（如 opencode、Codex CLI、Gemini CLI 等）的交互提供统一界面。

该应用程序作为一个 **ACP 客户端**，通过 [Agent Client Protocol](https://agentclientprotocol.com/) 生成和与编码代理通信，使用户能够利用 AI 驱动的代码辅助，而无需绑定到特定的 IDE 或编辑器。

**核心价值主张**: 一个独立的、与编辑器无关的 GUI，允许非开发者用户通过简单的聊天界面与强大的编码代理交互，并具有在不同 ACP 兼容代理之间切换的灵活性。

---

## 2. 目标和非目标

### 2.1 目标

| ID  | 目标                                             | 优先级 |
| --- | ------------------------------------------------ | ------ |
| G1  | 提供清晰、直观的聊天界面用于与编码代理交互        | P0     |
| G2  | 支持 ACP 协议用于代理通信                         | P0     |
| G3  | 实现不同 ACP 兼容代理之间的无缝切换               | P1     |
| G4  | 在对话内的交互之间维护会话上下文                  | P0     |
| G5  | 支持流式响应以实现实时反馈                        | P0     |
| G6  | 为扩展性设计（未来的 LLM Provider 集成、文件系统控制） | P1   |

### 2.2 非目标 (V1)

| ID  | 非目标                     | 理由                                   |
| --- | -------------------------- | -------------------------------------- |
| NG1 | 构建全功能的代码编辑器     | 超出范围；专注于代理交互                |
| NG2 | 直接 LLM API 调用（LLM Provider）| 推迟到未来版本                      |
| NG3 | 多代理编排                 | V1 一次只支持一个代理                  |
| NG4 | 远程代理支持               | 首先专注于本地子进程代理                |
| NG5 | 用户认证/云同步            | V1 桌面优先，仅本地                     |

---

## 3. 背景

### 3.1 什么是 ACP？

**Agent Client Protocol (ACP)** 是由 Zed Industries 和 JetBrains 开发的开放标准，用于标准化代码编辑器/IDE 与 AI 编码代理之间的通信。它类似于用于 AI 代理的 Language Server Protocol (LSP)。

**关键特性**:

- 基于 **JSON-RPC 2.0** 构建
- 通过 **stdio**（标准输入/输出）传输本地代理
- **双向** 通信（客户端和代理都可以发起请求）
- 通过通知支持 **流式传输**
- 在适用的情况下重用 **MCP (Model Context Protocol)** 数据类型

### 3.2 为什么要构建这个？

当前的编码代理（Claude Code、Codex、opencode 等）通常通过以下方式访问：

- 终端/CLI 界面
- IDE 特定插件
- Web 界面

这给以下用户带来了摩擦：

- 希望 AI 代码辅助的非开发者
- 偏好专用 GUI 而非终端的用户
- 希望在不同代理之间切换而无需更改工具的用户

我们的应用程序通过提供一个与任何 ACP 兼容代理一起工作的 **独立 GUI** 来解决这些差距。

### 3.3 目标用户

| 用户类型                      | 需求                                    |
| ----------------------------- | ---------------------------------------- |
| 非开发者创作者                | 简单的界面，无需终端知识                 |
| 尝试不同代理的开发者          | 在 opencode、Codex、Gemini CLI 之间轻松切换 |
| 评估编码代理的团队            | 一致的界面用于比较                       |

---

## 4. 系统架构

### 4.1 高层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Electron 应用程序                           │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    渲染进程 (React)                           │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │  聊天视图   │  │   设置      │  │  文件更改审核       │   │  │
│  │  │             │  │    视图     │  │       (V2)          │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  │                                                               │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│                              │ IPC (contextBridge)                  │
│                              │                                      │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │                      主进程                                   │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                     Conductor                           │  │  │
│  │  │                                                         │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │  │
│  │  │  │   会话       │  │    代理      │  │    配置       │  │  │  │
│  │  │  │   管理器     │  │   生命周期   │  │   管理器      │  │  │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │  │
│  │  │                                                         │  │  │
│  │  └─────────────────────────┬───────────────────────────────┘  │  │
│  │                            │                                  │  │
│  │                            │ ACP (JSON-RPC over stdio)        │  │
│  │                            │                                  │  │
│  │  ┌─────────────────────────▼───────────────────────────────┐  │  │
│  │  │              ACP 代理 (子进程)                           │  │  │
│  │  │                                                         │  │  │
│  │  │     opencode acp  |  codex --acp  |  gemini-cli acp    │  │  │
│  │  │                                                         │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 架构原则

| 原则                   | 描述                                              |
| ---------------------- | ------------------------------------------------- |
| **关注点分离**         | GUI 逻辑在渲染进程中，代理通信在主进程中          |
| **协议合规**           | 严格遵守 ACP 规范                                 |
| **可扩展性**           | 接口设计为未来扩展                                 |
| **简单优先**           | V1 专注于核心功能，复杂度最小                      |
| **用户安全**           | 文件操作需要显式批准（V2）                         |

---

## 5. 组件设计

### 5.1 渲染进程组件

#### 5.1.1 聊天视图

**职责**: 显示对话历史并处理用户输入。

```typescript
// 组件结构
src/renderer/
├── components/
│   ├── ChatView/
│   │   ├── ChatView.tsx          // 主容器
│   │   ├── MessageList.tsx       // 可滚动的消息历史
│   │   ├── MessageItem.tsx       // 单个消息渲染
│   │   ├── InputArea.tsx         // 带发送按钮的用户输入
│   │   └── StreamingIndicator.tsx // 输入/思考指示器
│   └── ...
```

**关键特性**:

- 代理响应的 Markdown 渲染
- 代码语法高亮
- 流式文本显示（逐 token）
- 文件更改的可视化差异（V2）

#### 5.1.2 设置视图

**职责**: 代理配置和应用偏好设置。

```typescript
interface AgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

interface AppSettings {
  activeAgentId: string
  agents: AgentConfig[]
  theme: 'light' | 'dark' | 'system'
  workingDirectory: string
}
```

#### 5.1.3 IPC 桥接（预加载）

**职责**: 渲染进程和主进程之间的安全通信。

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 代理通信
  sendPrompt: (sessionId: string, content: string) =>
    ipcRenderer.invoke('agent:prompt', sessionId, content),

  cancelRequest: (sessionId: string) => ipcRenderer.invoke('agent:cancel', sessionId),

  // 会话管理
  createSession: (workingDirectory: string) =>
    ipcRenderer.invoke('session:create', workingDirectory),

  closeSession: (sessionId: string) => ipcRenderer.invoke('session:close', sessionId),

  // 代理生命周期
  switchAgent: (agentId: string) => ipcRenderer.invoke('agent:switch', agentId),

  // 事件监听器
  onAgentMessage: (callback: (event: ACPEvent) => void) =>
    ipcRenderer.on('agent:message', (_, event) => callback(event)),

  onAgentError: (callback: (error: Error) => void) =>
    ipcRenderer.on('agent:error', (_, error) => callback(error))
})
```

---

### 5.2 主进程组件

#### 5.2.1 Conductor

**职责**: 所有代理相关操作的中央协调器。

```typescript
// src/main/conductor/Conductor.ts

import { ACPClient } from '@anthropic/acp-sdk' // 假设的包名

class Conductor {
  private client: ACPClient | null = null
  private sessions: Map<string, Session> = new Map()
  private config: ConductorConfig

  constructor(config: ConductorConfig) {
    this.config = config
  }

  /**
   * 将配置的 ACP 代理作为子进程启动
   */
  async startAgent(agentId: string): Promise<void> {
    const agentConfig = this.config.agents[agentId]
    if (!agentConfig) {
      throw new Error(`未知代理: ${agentId}`)
    }

    // 如果正在运行，停止现有代理
    await this.stopAgent()

    // 使用子进程传输初始化 ACP 客户端
    this.client = new ACPClient({
      transport: 'stdio',
      command: agentConfig.command,
      args: agentConfig.args,
      env: agentConfig.env
    })

    // 执行 ACP 初始化握手
    await this.client.initialize({
      clientInfo: {
        name: 'ACP-GUI',
        version: '1.0.0'
      },
      capabilities: {
        // 声明客户端能力
      }
    })
  }

  /**
   * 停止当前代理子进程
   */
  async stopAgent(): Promise<void> {
    if (this.client) {
      await this.client.dispose()
      this.client = null
    }
  }

  /**
   * 创建新的对话会话
   */
  async createSession(workingDirectory: string): Promise<string> {
    if (!this.client) {
      throw new Error('没有正在运行的代理')
    }

    const session = await this.client.createSession({
      workingDirectory
    })

    this.sessions.set(session.id, session)
    return session.id
  }

  /**
   * 向代理发送提示
   */
  async sendPrompt(
    sessionId: string,
    content: string,
    onUpdate: (update: SessionUpdate) => void
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`未知会话: ${sessionId}`)
    }

    // 发送提示并处理流式更新
    await session.prompt({
      content: [{ type: 'text', text: content }],
      onUpdate
    })
  }

  /**
   * 取消正在进行的请求
   */
  async cancelRequest(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await session.cancel()
    }
  }
}
```

#### 5.2.2 会话存储（已实现）

**职责**: 持久化和管理带有对话历史的会话数据。

**存储结构**:

```
~/.multica/sessions/
├── index.json              # 会话列表索引（快速加载）
└── data/
    └── {session-id}.json   # 完整会话数据 + 更新
```

**关键设计决策**:

- **客户端存储**: Multica 存储原始 ACP `session/update` 数据
- **代理无关**: 每个代理（opencode、codex、gemini）管理自己的内部状态
- **恢复行为**: 创建新的 ACP 会话，仅在 UI 中显示存储的历史

```typescript
// src/main/session/SessionStore.ts

interface MulticaSession {
  id: string // Multica 生成的 UUID
  agentSessionId: string // 代理返回的会话 ID
  agentId: string // 使用的代理（opencode/codex/gemini）
  workingDirectory: string
  createdAt: string // ISO 8601
  updatedAt: string
  status: 'active' | 'completed' | 'error'
  title?: string
  messageCount: number
}

interface StoredSessionUpdate {
  timestamp: string
  update: SessionNotification // 原始 ACP 数据
}

interface SessionData {
  session: MulticaSession
  updates: StoredSessionUpdate[]
}

class SessionStore {
  async initialize(): Promise<void>
  async create(params: CreateSessionParams): Promise<MulticaSession>
  async list(options?: ListSessionsOptions): Promise<MulticaSession[]>
  async get(sessionId: string): Promise<SessionData | null>
  async appendUpdate(sessionId: string, update: SessionNotification): Promise<void>
  async updateMeta(sessionId: string, updates: Partial<MulticaSession>): Promise<MulticaSession>
  async delete(sessionId: string): Promise<void>
}
```

**会话恢复流程**:

1. 从 SessionStore 加载会话数据
2. 如果代理未运行则启动
3. 创建新的 ACP 会话（代理没有之前对话的记忆）
4. 更新 `agentSessionId` 映射
5. UI 显示存储的对话历史

#### 5.2.3 配置管理器

**职责**: 持久化和检索应用配置。

```typescript
// src/main/config/ConfigManager.ts

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

interface Config {
  version: string
  activeAgentId: string
  agents: Record<string, AgentConfig>
  ui: UIConfig
}

const DEFAULT_CONFIG: Config = {
  version: '1.0.0',
  activeAgentId: 'opencode',
  agents: {
    opencode: {
      id: 'opencode',
      name: 'OpenCode',
      command: 'opencode',
      args: ['acp'],
      enabled: true
    },
    codex: {
      id: 'codex',
      name: 'Codex CLI',
      command: 'codex',
      args: ['--acp'],
      enabled: true
    },
    gemini: {
      id: 'gemini',
      name: 'Gemini CLI',
      command: 'gemini',
      args: ['acp'],
      enabled: true
    }
  },
  ui: {
    theme: 'system',
    fontSize: 14
  }
}

class ConfigManager {
  private configPath: string
  private config: Config

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json')
    this.config = DEFAULT_CONFIG
  }

  async load(): Promise<Config> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) }
    } catch (error) {
      // 如果文件不存在则使用默认配置
      await this.save()
    }
    return this.config
  }

  async save(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2))
  }

  get(): Config {
    return this.config
  }

  async update(partial: Partial<Config>): Promise<Config> {
    this.config = { ...this.config, ...partial }
    await this.save()
    return this.config
  }
}
```

---

### 5.3 未来组件（V2+）

#### 5.3.1 文件系统提供者

**职责**: 使用用户批准调解文件系统访问。

```typescript
// src/main/filesystem/FileSystemProvider.ts

interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'list'
  path: string
  content?: string
}

interface FileSystemProvider {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  listDirectory(path: string): Promise<string[]>
}

// V1: 直接传递（代理处理文件操作）
class DirectFileSystemProvider implements FileSystemProvider {
  // 代理通过自己的文件系统工具直接访问
}

// V2: 带有 UI 批准的权限访问
class PermissionedFileSystemProvider implements FileSystemProvider {
  constructor(private approvalCallback: (op: FileOperation) => Promise<boolean>) {}

  async writeFile(path: string, content: string): Promise<void> {
    const approved = await this.approvalCallback({
      type: 'write',
      path,
      content
    })

    if (!approved) {
      throw new Error('用户拒绝了文件写入操作')
    }

    await fs.writeFile(path, content)
  }

  // ... 其他方法
}
```

#### 5.3.2 LLM 提供者

**职责**: 用于轻量级任务的直接 LLM API 调用。

```typescript
// src/main/llm/LLMProvider.ts (V2+)

interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>
  stream(prompt: string, onToken: (token: string) => void): Promise<void>
}

interface LLMConfig {
  provider: 'openrouter' | 'openai' | 'anthropic'
  apiKey: string
  model: string
}

// 推迟到 V2 - Conductor 将在 ACP 代理和直接 LLM 调用之间路由
```

---

## 6. 数据流

### 6.1 用户提示流程（正常路径）

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌─────────────┐
│   用户   │     │ 渲染进程  │     │   主进程   │     │ ACP 代理    │
└────┬─────┘     └────┬─────┘     └─────┬─────┘     └──────┬──────┘
     │                │                 │                  │
     │ 1. 输入提示    │                 │                  │
     │───────────────>│                 │                  │
     │                │                 │                  │
     │                │ 2. IPC invoke   │                  │
     │                │ 'agent:prompt'  │                  │
     │                │────────────────>│                  │
     │                │                 │                  │
     │                │                 │ 3. JSON-RPC      │
     │                │                 │ session/prompt   │
     │                │                 │ (via stdin)      │
     │                │                 │─────────────────>│
     │                │                 │                  │
     │                │                 │ 4. session/update│
     │                │                 │ notifications    │
     │                │                 │ (via stdout)     │
     │                │                 │<─ ─ ─ ─ ─ ─ ─ ─ ─│
     │                │                 │                  │
     │                │ 5. IPC 事件    │                  │
     │                │ 'agent:message' │                  │
     │                │<─ ─ ─ ─ ─ ─ ─ ─ │                  │
     │                │                 │                  │
     │ 6. 流式        │                 │                  │
     │    UI 更新     │                 │                  │
     │<─ ─ ─ ─ ─ ─ ─ ─│                 │                  │
     │                │                 │                  │
```

### 6.2 代理切换流程

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌─────────────┐
│   用户   │     │ 渲染进程  │     │   主进程   │     │ 新代理      │
└────┬─────┘     └────┬─────┘     └─────┬─────┘     └──────┬──────┘
     │                │                 │                  │
     │ 1. 选择新代理  │                 │                  │
     │───────────────>│                 │                  │
     │                │                 │                  │
     │                │ 2. IPC invoke   │                  │
     │                │ 'agent:switch'  │                  │
     │                │────────────────>│                  │
     │                │                 │                  │
     │                │                 │ 3. 终止旧        │
     │                │                 │    代理进程      │
     │                │                 │──────X           │
     │                │                 │                  │
     │                │                 │ 4. 生成新        │
     │                │                 │    代理          │
     │                │                 │─────────────────>│
     │                │                 │                  │
     │                │                 │ 5. ACP           │
     │                │                 │    initialize    │
     │                │                 │<────────────────>│
     │                │                 │                  │
     │                │ 6. 成功         │                  │
     │                │<────────────────│                  │
     │                │                 │                  │
     │ 7. UI 已更新   │                 │                  │
     │<───────────────│                 │                  │
```

### 6.3 ACP 消息类型

| 方向            | 方法                          | 用途                           |
| --------------- | ----------------------------- | ------------------------------ |
| 客户端 → 代理   | `initialize`                  | 握手和能力交换                 |
| 客户端 → 代理   | `session/new`                 | 创建新对话                     |
| 客户端 → 代理   | `session/prompt`              | 发送用户消息                   |
| 客户端 → 代理   | `session/cancel`              | 取消正在进行的请求             |
| 代理 → 客户端   | `session/update`（通知）      | 流式响应内容                   |
| 代理 → 客户端   | `client/requestPermission`    | 请求文件/工具批准              |

---

## 7. 接口定义

### 7.1 IPC 通道

```typescript
// src/shared/ipc-channels.ts

export const IPC_CHANNELS = {
  // 代理通信
  AGENT_PROMPT: 'agent:prompt',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_SWITCH: 'agent:switch',
  AGENT_MESSAGE: 'agent:message',
  AGENT_ERROR: 'agent:error',
  AGENT_STATUS: 'agent:status',

  // 会话管理
  SESSION_CREATE: 'session:create',
  SESSION_CLOSE: 'session:close',
  SESSION_LIST: 'session:list',

  // 配置
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',

  // 文件系统（V2）
  FILE_APPROVAL_REQUEST: 'file:approval-request',
  FILE_APPROVAL_RESPONSE: 'file:approval-response'
} as const
```

### 7.2 共享类型

```typescript
// src/shared/types.ts

// 代理配置
export interface AgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

// 会话状态
export interface SessionInfo {
  id: string
  workingDirectory: string
  agentId: string
  createdAt: string
  isActive: boolean
}

// UI 消息类型
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: MessageContent[]
  timestamp: string
  status: 'pending' | 'streaming' | 'complete' | 'error'
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'diff'; filePath: string; hunks: DiffHunk[] }
  | { type: 'tool_call'; name: string; status: 'pending' | 'approved' | 'denied' | 'complete' }

// 代理状态
export type AgentStatus =
  | { state: 'stopped' }
  | { state: 'starting'; agentId: string }
  | { state: 'running'; agentId: string; sessionCount: number }
  | { state: 'error'; error: string }

// 文件操作批准（V2）
export interface FileApprovalRequest {
  requestId: string
  operation: 'read' | 'write' | 'delete'
  path: string
  content?: string
  reason?: string
}

export interface FileApprovalResponse {
  requestId: string
  approved: boolean
  remember?: 'once' | 'session' | 'always'
}
```

### 7.3 Electron API（渲染进程）

```typescript
// src/shared/electron-api.d.ts

export interface ElectronAPI {
  // 代理通信
  sendPrompt(sessionId: string, content: string): Promise<void>
  cancelRequest(sessionId: string): Promise<void>
  switchAgent(agentId: string): Promise<void>

  // 会话管理
  createSession(workingDirectory: string): Promise<SessionInfo>
  closeSession(sessionId: string): Promise<void>
  listSessions(): Promise<SessionInfo[]>

  // 配置
  getConfig(): Promise<AppConfig>
  updateConfig(config: Partial<AppConfig>): Promise<AppConfig>

  // 事件监听器
  onAgentMessage(callback: (message: AgentMessage) => void): () => void
  onAgentStatus(callback: (status: AgentStatus) => void): () => void
  onAgentError(callback: (error: Error) => void): () => void

  // 文件批准（V2）
  onFileApprovalRequest(callback: (request: FileApprovalRequest) => void): () => void
  respondToFileApproval(response: FileApprovalResponse): Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

---

## 8. 技术栈

### 8.1 核心技术

| 层级               | 技术                     | 理由                                    |
| ------------------ | ------------------------ | --------------------------------------- |
| **框架**           | Electron 28+             | 跨平台桌面应用，成熟的生态系统           |
| **渲染器**         | React 18 + TypeScript    | 基于 UI 组件，强类型                    |
| **样式**           | Tailwind CSS             | 快速 UI 开发，一致的设计                |
| **状态**           | Zustand                  | 轻量级、简单的状态管理                  |
| **IPC**            | Electron IPC + contextBridge | 安全的渲染器-主进程通信            |
| **ACP**            | @acp/typescript-sdk      | 官方 ACP 协议实现                       |
| **Markdown**       | react-markdown + rehype  | 富文本渲染                              |
| **代码高亮**       | Shiki                    | VS Code 质量的语法高亮                  |

### 8.2 开发工具

| 工具              | 用途                    |
| ----------------- | ----------------------- |
| Vite              | 渲染器的快速打包        |
| electron-builder  | 应用打包和分发          |
| ESLint + Prettier | 代码质量                |
| Vitest            | 单元测试                |
| Playwright        | 端到端测试              |

### 8.3 项目结构

```
acp-gui/
├── package.json
├── electron-builder.yml
├── vite.config.ts
├── tsconfig.json
│
├── src/
│   ├── main/                      # Electron 主进程
│   │   ├── index.ts               # 入口点
│   │   ├── conductor/
│   │   │   ├── Conductor.ts
│   │   │   ├── SessionManager.ts
│   │   │   └── index.ts
│   │   ├── config/
│   │   │   └── ConfigManager.ts
│   │   ├── ipc/
│   │   │   └── handlers.ts        # IPC 处理器注册
│   │   └── utils/
│   │
│   ├── preload/                   # 预加载脚本
│   │   └── index.ts
│   │
│   ├── renderer/                  # React 应用
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatView/
│   │   │   ├── Settings/
│   │   │   ├── Sidebar/
│   │   │   └── common/
│   │   ├── hooks/
│   │   │   ├── useAgent.ts
│   │   │   └── useSession.ts
│   │   ├── stores/
│   │   │   ├── chatStore.ts
│   │   │   └── settingsStore.ts
│   │   └── styles/
│   │
│   └── shared/                    # 共享类型和常量
│       ├── types.ts
│       ├── ipc-channels.ts
│       └── electron-api.d.ts
│
├── resources/                     # 应用图标、资源
│
└── tests/
    ├── unit/
    └── e2e/
```

---

## 9. 实现阶段

### 第一阶段：基础（第 1-2 周）

**目标**: 具有 ACP 集成的基础 Electron 应用

| 任务 | 描述                 | 交付物                              |
| ---- | --------------------- | ----------------------------------- |
| 1.1  | 项目脚手架           | Electron + React + TypeScript 设置  |
| 1.2  | IPC 层               | 带 contextBridge 的预加载脚本        |
| 1.3  | Conductor 基础       | 生成 opencode acp 子进程            |
| 1.4  | ACP 握手             | initialize + session/new            |
| 1.5  | 最小 UI              | 输入框 + 消息显示                   |

**里程碑**: 向 opencode 发送提示并显示响应

### 第二阶段：核心功能（第 3-4 周）

**目标**: 功能完整的聊天体验

| 任务 | 描述             | 交付物                    |
| ---- | ----------------- | ------------------------- |
| 2.1  | 流式支持         | 实时 token 显示           |
| 2.2  | 会话管理         | 多个对话                  |
| 2.3  | Markdown 渲染    | 富响应格式                |
| 2.4  | 代码高亮         | 代码块语法高亮            |
| 2.5  | 取消支持         | 中止正在进行的请求        |

**里程碑**: 具有流式传输的完整聊天体验

### 第三阶段：完善和配置（第 5-6 周）

**目标**: 生产就绪的 V1

| 任务 | 描述             | 交付物                      |
| ---- | ----------------- | --------------------------- |
| 3.1  | 设置 UI          | 代理配置界面                |
| 3.2  | 代理切换         | 无缝代理更改                |
| 3.3  | 错误处理         | 优雅的错误恢复              |
| 3.4  | 持久化           | 配置和会话存储              |
| 3.5  | 打包             | 可分发的应用构建            |

**里程碑**: V1.0 发布

### 第四阶段：V2 功能（未来）

| 功能              | 描述                        |
| ----------------- | -------------------------- |
| 文件批准 UI       | 审查和批准文件操作         |
| LLM 提供者        | 用于简单任务的直接 API 调用 |
| 多代理            | 并发代理会话               |
| 历史搜索          | 搜索过去的对话             |
| 插件              | 用户可安装的扩展            |

---

## 10. 安全考虑

### 10.1 Electron 安全最佳实践

| 实践              | 实现                                       |
| ----------------- | ------------------------------------------ |
| 上下文隔离        | webPreferences 中的 `contextIsolation: true` |
| Node 集成         | 渲染器中的 `nodeIntegration: false`         |
| 预加载脚本        | 使用 contextBridge 进行 IPC                 |
| 远程模块          | 已禁用（已弃用）                            |
| 沙箱              | 渲染器的 `sandbox: true`                    |

```typescript
// src/main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: path.join(__dirname, '../preload/index.js')
  }
})
```

### 10.2 代理安全

| 关注点            | 缓解措施                         |
| ----------------- | -------------------------------- |
| 文件系统访问      | V2: 显式批准 UI                  |
| 网络访问          | 代理特定；在设置中记录           |
| 命令执行          | V2: 终端命令批准                 |
| 数据泄露          | V1 仅本地；无云同步              |

### 10.3 配置安全

| 数据             | 存储               | 加密               |
| ---------------- | ------------------ | ------------------ |
| 代理配置         | 本地 JSON          | 无（无密钥）       |
| API 密钥（V2）   | electron-store     | 系统密钥链         |
| 会话历史         | 本地 SQLite（未来）| 可选              |

---

## 11. 未来路线图

### 11.1 V2 功能

```
┌─────────────────────────────────────────────────────────────────┐
│                          V2 架构                                │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     渲染进程                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │  聊天视图   │  │  批准       │  │  文件浏览器     │   │  │
│  │  │             │  │   对话框    │  │   (只读)        │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      主进程                                │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                    Conductor                        │  │  │
│  │  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │  │  │
│  │  │  │  路由器    │  │    ACP     │  │     LLM      │  │  │  │
│  │  │  │            │  │   适配器   │  │   提供者     │  │  │  │
│  │  │  └────────────┘  └────────────┘  └──────────────┘  │  │  │
│  │  │                                                     │  │  │
│  │  │  ┌──────────────────────────────────────────────┐  │  │  │
│  │  │  │          文件系统提供者                       │  │  │  │
│  │  │  │        （带批准工作流）                       │  │  │  │
│  │  │  └──────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 功能路线图

| 版本   | 功能                                          |
| ------ | --------------------------------------------- |
| V1.0   | 基本聊天、opencode 支持、代理切换             |
| V1.1   | 会话持久化、对话历史                           |
| V2.0   | 文件批准 UI、LLM 提供者集成                    |
| V2.1   | MCP 服务器支持、工具市场                       |
| V3.0   | 多代理编排、自定义工作流                       |

### 11.3 平台扩展

| 平台            | 时间线   | 说明                                 |
| --------------- | -------- | ------------------------------------ |
| macOS           | V1.0     | 主要开发平台                         |
| Windows         | V1.0     | Electron 跨平台                      |
| Linux           | V1.0     | AppImage 分发                        |
| Web（远程代理） | V3.0+    | 当 ACP 远程支持成熟时                 |

---

## 12. 未解决问题

| ID  | 问题                                                          | 状态      | 决策                                                                                                                   |
| --- | ------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Q1  | 官方 ACP TypeScript SDK 包名称？                               | ✅ 已解决 | `@agentclientprotocol/sdk`                                                                                              |
| Q2  | V1 是否应支持多个并发会话？                                    | ✅ 已解决 | 是，SessionStore 支持多个会话                                                                                            |
| Q3  | 如何优雅地处理代理崩溃？                                       | 未解决   | 自动重启并通知                                                                                                          |
| Q4  | 对话历史存储格式？                                             | ✅ 已解决 | JSON 文件（index.json + 每会话数据文件）                                                                                |
| Q5  | 工作目录应该是每个会话还是全局？                               | ✅ 已解决 | 每个会话                                                                                                                |
| Q6  | Multica 是否应在恢复时恢复代理内部状态？                       | 未解决   | 当前：否。创建新的 ACP 会话，仅 UI 显示历史。未来：如果代理支持，考虑 `session/load`                                     |

---

## 13. 附录

### 13.1 ACP 协议参考

**初始化握手**:

```json
// 客户端 → 代理
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientInfo": {
      "name": "ACP-GUI",
      "version": "1.0.0"
    },
    "capabilities": {}
  }
}

// 代理 → 客户端
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "serverInfo": {
      "name": "opencode",
      "version": "0.1.0"
    },
    "capabilities": {
      "streaming": true,
      "tools": ["file", "terminal", "search"]
    }
  }
}
```

**会话创建**:

```json
// 客户端 → 代理
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/new",
  "params": {
    "workingDirectory": "/Users/user/projects/myapp"
  }
}

// 代理 → 客户端
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "sessionId": "sess_abc123"
  }
}
```

**发送提示**:

```json
// 客户端 → 代理
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_abc123",
    "content": [
      {
        "type": "text",
        "text": "将登录函数重构为使用 async/await"
      }
    ]
  }
}
```

**流式更新（通知）**:

```json
// 代理 → 客户端（无 id = 通知）
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "content": [
      {
        "type": "text",
        "text": "我将重构登录函数..."
      }
    ],
    "done": false
  }
}
```

### 13.2 参考

- [Agent Client Protocol 规范](https://agentclientprotocol.com/)
- [ACP GitHub 仓库](https://github.com/agentclientprotocol/agent-client-protocol)
- [OpenCode 文档](https://opencode.ai/docs/)
- [Electron 安全最佳实践](https://www.electronjs.org/docs/latest/tutorial/security)
- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

### 13.3 术语表

| 术语          | 定义                                                        |
| ------------- | ----------------------------------------------------------- |
| **ACP**       | Agent Client Protocol - 标准化编辑器-代理通信                |
| **MCP**       | Model Context Protocol - 标准化 AI 的工具/数据访问           |
| **Conductor** | 管理代理生命周期和通信的中央组件                            |
| **Session**   | 与代理的单个对话上下文                                      |
| **IPC**       | Electron 进程间通信                                         |
| **stdio**     | 用于子进程通信的标准输入/输出流                             |

---

_文档结束_
