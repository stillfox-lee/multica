/**
 * AcpClientFactory - Creates ACP SDK Client implementations
 *
 * Handles session update notifications and permission requests from agents.
 */
import type {
  Client,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk'
import type { SessionStore } from '../session/SessionStore'

export interface AcpClientCallbacks {
  onSessionUpdate?: (update: SessionNotification) => void
  onPermissionRequest?: (
    params: RequestPermissionRequest
  ) => Promise<RequestPermissionResponse>
}

export interface AcpClientFactoryOptions {
  sessionStore: SessionStore | null
  callbacks: AcpClientCallbacks
}

/**
 * Create an ACP Client implementation for a session
 *
 * @param sessionId - The Multica session ID (used for persistence)
 * @param options - Factory options including store and callbacks
 */
export function createAcpClient(
  sessionId: string,
  options: AcpClientFactoryOptions
): Client {
  const { sessionStore, callbacks } = options

  return {
    // Handle session updates from agent
    sessionUpdate: async (params: SessionNotification) => {
      // Log the update type
      const update = params.update
      if ('sessionUpdate' in update) {
        const updateType = update.sessionUpdate
        if (updateType === 'agent_message_chunk') {
          const contentType = update.content?.type || 'unknown'
          console.log(`[ACP] Session ${sessionId} update: ${updateType} (${contentType})`)
        } else if (updateType === 'tool_call') {
          console.log(`[ACP] Session ${sessionId} update: ${updateType} - ${update.title} [${update.status}]`)
        } else if (updateType === 'tool_call_update') {
          console.log(`[ACP] Session ${sessionId} update: ${updateType} [${update.status}]`)
        } else {
          console.log(`[ACP] Session ${sessionId} update: ${updateType}`, update)
        }
      } else {
        console.log(`[ACP] Session ${sessionId} update (raw):`, params)
      }

      // Store raw update to SessionStore (if available)
      if (sessionStore) {
        try {
          await sessionStore.appendUpdate(sessionId, params)
        } catch (err) {
          console.error('[Conductor] Failed to store session update:', err)
        }
      }

      // Trigger UI callback
      if (callbacks.onSessionUpdate) {
        callbacks.onSessionUpdate(params)
      }
    },

    // Handle permission requests from agent
    requestPermission: async (
      params: RequestPermissionRequest
    ): Promise<RequestPermissionResponse> => {
      if (callbacks.onPermissionRequest) {
        return callbacks.onPermissionRequest(params)
      }
      // Default: auto-approve (V1 simplification)
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
