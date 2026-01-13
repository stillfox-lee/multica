/**
 * Session types for Multica
 */
import type { SessionNotification } from '@agentclientprotocol/sdk'

/**
 * Multica Session - client-side session representation
 */
export interface MulticaSession {
  // Identity
  id: string // Multica-generated UUID
  agentSessionId: string // Agent-returned session ID

  // Association
  agentId: string // Agent used (opencode/codex/gemini)
  workingDirectory: string

  // Timestamps
  createdAt: string // ISO 8601
  updatedAt: string // Last activity time

  // State
  status: 'active' | 'completed' | 'error'

  // Metadata
  title?: string // User-defined or auto-generated title
  messageCount: number // Message count for list display
}

/**
 * Session Update - stores raw ACP session/update data
 */
export interface StoredSessionUpdate {
  timestamp: string // Receive time
  update: SessionNotification // Raw ACP data
}

/**
 * Complete session data (for persistence)
 */
export interface SessionData {
  session: MulticaSession
  updates: StoredSessionUpdate[]
}

/**
 * Parameters for creating a new session
 */
export interface CreateSessionParams {
  agentSessionId: string
  agentId: string
  workingDirectory: string
}

/**
 * Options for listing sessions
 */
export interface ListSessionsOptions {
  agentId?: string // Filter by agent
  status?: MulticaSession['status']
  limit?: number
  offset?: number
}
