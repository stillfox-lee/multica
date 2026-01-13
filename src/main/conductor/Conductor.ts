/**
 * Conductor - Central orchestrator for ACP agent communication
 */
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
} from '@agentclientprotocol/sdk'
import { AgentProcess } from './AgentProcess'
import { SessionStore } from '../session/SessionStore'
import { DEFAULT_AGENTS } from '../config/defaults'
import type {
  AgentConfig,
  MulticaSession,
  SessionData,
  ListSessionsOptions,
} from '../../shared/types'

export interface SessionUpdateCallback {
  (update: SessionNotification): void
}

export interface ConductorEvents {
  onSessionUpdate?: SessionUpdateCallback
  onPermissionRequest?: (
    params: RequestPermissionRequest
  ) => Promise<RequestPermissionResponse>
}

export interface ConductorOptions {
  events?: ConductorEvents
  /** Skip session persistence (for CLI mode) */
  skipPersistence?: boolean
  /** Custom storage path for sessions */
  storagePath?: string
}

export class Conductor {
  private agentProcess: AgentProcess | null = null
  private connection: ClientSideConnection | null = null
  private currentAgentConfig: AgentConfig | null = null
  private events: ConductorEvents
  private sessionStore: SessionStore | null = null
  private skipPersistence: boolean

  // Current active Multica session ID
  private activeSessionId: string | null = null
  // In-memory session for CLI mode (when persistence is skipped)
  private inMemorySession: MulticaSession | null = null

  constructor(options: ConductorOptions = {}) {
    this.events = options.events ?? {}
    this.skipPersistence = options.skipPersistence ?? false
    if (!this.skipPersistence) {
      this.sessionStore = new SessionStore(options.storagePath)
    }
  }

  /**
   * Initialize the conductor (must be called before use in GUI mode)
   */
  async initialize(): Promise<void> {
    if (this.sessionStore) {
      await this.sessionStore.initialize()
    }
  }

  /**
   * Start an ACP agent
   */
  async startAgent(config: AgentConfig): Promise<void> {
    console.log(`[Conductor] Starting agent: ${config.name} (${config.command} ${config.args.join(' ')})`)

    // Stop existing agent if running
    await this.stopAgent()

    // Start the agent subprocess
    this.agentProcess = new AgentProcess(config)
    await this.agentProcess.start()

    // Create ACP connection using the SDK
    const stream = ndJsonStream(
      this.agentProcess.getStdinWeb(),
      this.agentProcess.getStdoutWeb()
    )

    // Create client-side connection with our Client implementation
    this.connection = new ClientSideConnection((_agent) => this.createClient(), stream)

    console.log(`[Conductor] Sending ACP initialize request (protocol v${PROTOCOL_VERSION})`)

    // Initialize the ACP connection
    const initResult = await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        // Declare what capabilities we support
        fs: {
          readTextFile: false, // V2: implement file system access
          writeTextFile: false,
        },
        terminal: false, // V2: implement terminal support
      },
    })

    console.log(`[Conductor] ACP connected to ${config.name}`)
    console.log(`[Conductor]   Protocol version: ${initResult.protocolVersion}`)
    console.log(`[Conductor]   Agent info:`, initResult.agentInfo)
    this.currentAgentConfig = config

    // Handle agent process exit
    this.agentProcess.onExit((code, signal) => {
      console.log(`[Conductor] Agent exited (code: ${code}, signal: ${signal})`)
      this.connection = null
      this.agentProcess = null
    })
  }

  /**
   * Stop the current agent
   */
  async stopAgent(): Promise<void> {
    if (this.agentProcess) {
      console.log(`[Conductor] Stopping agent: ${this.currentAgentConfig?.name}`)
      await this.agentProcess.stop()
      this.agentProcess = null
      this.connection = null
      this.currentAgentConfig = null
      this.activeSessionId = null
      console.log(`[Conductor] Agent stopped`)
    }
  }

  /**
   * Create a new session with the agent
   */
  async createSession(cwd: string): Promise<MulticaSession> {
    if (!this.connection || !this.currentAgentConfig) {
      throw new Error('No agent is running')
    }

    // Create ACP session
    const result = await this.connection.newSession({
      cwd,
      mcpServers: [], // V2: support MCP servers
    })

    let session: MulticaSession

    if (this.sessionStore) {
      // Persist session
      session = await this.sessionStore.create({
        agentSessionId: result.sessionId,
        agentId: this.currentAgentConfig.id,
        workingDirectory: cwd,
      })
    } else {
      // CLI mode: in-memory session
      const { randomUUID } = await import('crypto')
      const now = new Date().toISOString()
      session = {
        id: randomUUID(),
        agentSessionId: result.sessionId,
        agentId: this.currentAgentConfig.id,
        workingDirectory: cwd,
        createdAt: now,
        updatedAt: now,
        status: 'active',
        messageCount: 0,
      }
      this.inMemorySession = session
    }

    this.activeSessionId = session.id
    console.log(`[Conductor] Created session: ${session.id} (agent: ${result.sessionId})`)

    return session
  }

  /**
   * Resume an existing session (for UI display only, agent state is not restored)
   */
  async resumeSession(sessionId: string): Promise<MulticaSession> {
    if (!this.sessionStore) {
      throw new Error('Session resumption not available in CLI mode')
    }

    const data = await this.sessionStore.get(sessionId)
    if (!data) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Ensure agent is started
    const agentConfig = DEFAULT_AGENTS[data.session.agentId]
    if (!agentConfig) {
      throw new Error(`Unknown agent: ${data.session.agentId}`)
    }

    if (!this.isAgentRunning() || this.currentAgentConfig?.id !== agentConfig.id) {
      await this.startAgent(agentConfig)
    }

    // Create new ACP session (agent doesn't know about previous conversation)
    const result = await this.connection!.newSession({
      cwd: data.session.workingDirectory,
      mcpServers: [],
    })

    // Update agentSessionId (new ACP session)
    const updatedSession = await this.sessionStore.updateMeta(sessionId, {
      agentSessionId: result.sessionId,
      status: 'active',
    })

    this.activeSessionId = sessionId
    console.log(`[Conductor] Resumed session: ${sessionId} (new agent session: ${result.sessionId})`)

    return updatedSession
  }

  /**
   * Send a prompt to the agent
   */
  async sendPrompt(sessionId: string, content: string): Promise<string> {
    if (!this.connection) {
      throw new Error('No agent is running')
    }

    // Get agentSessionId
    let agentSessionId: string

    if (this.sessionStore) {
      const data = await this.sessionStore.get(sessionId)
      if (!data) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      agentSessionId = data.session.agentSessionId
    } else if (this.inMemorySession && this.inMemorySession.id === sessionId) {
      agentSessionId = this.inMemorySession.agentSessionId
    } else {
      throw new Error(`Session not found: ${sessionId}`)
    }

    console.log(`[Conductor] Sending prompt to session ${agentSessionId}`)
    console.log(`[Conductor]   Content: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`)

    // Store user message before sending (so it appears in history)
    if (this.sessionStore && this.activeSessionId) {
      const userUpdate = {
        sessionId: agentSessionId,
        update: {
          sessionUpdate: 'user_message',
          content: { type: 'text', text: content },
        },
      }
      await this.sessionStore.appendUpdate(this.activeSessionId, userUpdate as any)
    }

    const result = await this.connection.prompt({
      sessionId: agentSessionId,
      prompt: [{ type: 'text', text: content }],
    })

    console.log(`[Conductor] Prompt completed with stopReason: ${result.stopReason}`)

    return result.stopReason
  }

  /**
   * Cancel an ongoing request
   */
  async cancelRequest(sessionId: string): Promise<void> {
    if (!this.connection) {
      return
    }

    // Get agentSessionId
    let agentSessionId: string | null = null

    if (this.sessionStore) {
      const data = await this.sessionStore.get(sessionId)
      if (data) {
        agentSessionId = data.session.agentSessionId
      }
    } else if (this.inMemorySession && this.inMemorySession.id === sessionId) {
      agentSessionId = this.inMemorySession.agentSessionId
    }

    if (agentSessionId) {
      console.log(`[Conductor] Cancelling request for session ${agentSessionId}`)
      await this.connection.cancel({ sessionId: agentSessionId })
      console.log(`[Conductor] Cancel request sent`)
    }
  }

  /**
   * Get session list
   */
  async listSessions(options?: ListSessionsOptions): Promise<MulticaSession[]> {
    if (!this.sessionStore) {
      return this.inMemorySession ? [this.inMemorySession] : []
    }
    return this.sessionStore.list(options)
  }

  /**
   * Get session complete data (including message history)
   */
  async getSessionData(sessionId: string): Promise<SessionData | null> {
    if (!this.sessionStore) {
      return null
    }
    return this.sessionStore.get(sessionId)
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (this.sessionStore) {
      await this.sessionStore.delete(sessionId)
    }
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null
    }
    if (this.inMemorySession?.id === sessionId) {
      this.inMemorySession = null
    }
  }

  /**
   * Update session metadata
   */
  async updateSessionMeta(
    sessionId: string,
    updates: Partial<MulticaSession>
  ): Promise<MulticaSession> {
    if (!this.sessionStore) {
      throw new Error('Session update not available in CLI mode')
    }
    return this.sessionStore.updateMeta(sessionId, updates)
  }

  /**
   * Get current agent info
   */
  getCurrentAgent(): AgentConfig | null {
    return this.currentAgentConfig
  }

  /**
   * Check if an agent is running
   */
  isAgentRunning(): boolean {
    return this.agentProcess?.isRunning() ?? false
  }

  /**
   * Get active session ID
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId
  }

  /**
   * Create the Client implementation for ACP SDK
   */
  private createClient(): Client {
    return {
      // Handle session updates from agent
      sessionUpdate: async (params: SessionNotification) => {
        // Log the update type
        const update = params.update
        if ('sessionUpdate' in update) {
          const updateType = update.sessionUpdate
          if (updateType === 'agent_message_chunk') {
            // Don't log full text chunks, just note they're arriving
            const contentType = update.content?.type || 'unknown'
            console.log(`[ACP] Session update: ${updateType} (${contentType})`)
          } else if (updateType === 'tool_call') {
            console.log(`[ACP] Session update: ${updateType} - ${update.title} [${update.status}]`)
          } else if (updateType === 'tool_call_update') {
            console.log(`[ACP] Session update: ${updateType} [${update.status}]`)
          } else {
            console.log(`[ACP] Session update: ${updateType}`, update)
          }
        } else {
          console.log(`[ACP] Session update (raw):`, params)
        }

        // Store raw update to SessionStore (if available)
        if (this.activeSessionId && this.sessionStore) {
          try {
            await this.sessionStore.appendUpdate(this.activeSessionId, params)
          } catch (err) {
            console.error('[Conductor] Failed to store session update:', err)
          }
        }

        // Trigger UI callback
        if (this.events.onSessionUpdate) {
          this.events.onSessionUpdate(params)
        }
      },

      // Handle permission requests from agent
      requestPermission: async (
        params: RequestPermissionRequest
      ): Promise<RequestPermissionResponse> => {
        if (this.events.onPermissionRequest) {
          return this.events.onPermissionRequest(params)
        }
        // Default: auto-approve (V1 simplification)
        // In production, this should prompt the user
        console.log(`[Conductor] Auto-approving: ${params.toolCall.title}`)
        return {
          outcome: {
            outcome: 'selected',
            optionId: params.options[0]?.optionId ?? '',
          },
        }
      },
    }
  }
}
