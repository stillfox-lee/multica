/**
 * Permission module type definitions
 */
import type { PermissionResponse, PermissionResponseData } from '../../shared/electron-api'

/**
 * Pending permission request with resolver function
 */
export interface PendingPermissionRequest {
  requestId: string
  resolve: (response: PermissionResponse) => void
}

/**
 * Parameters for G-3 AskUserQuestion handler
 */
export interface G3HandlerParams {
  acpSessionId: string
  toolCall: { rawInput?: unknown }
  responseData: PermissionResponseData
}

/**
 * Question tool update structure from session updates
 */
export interface QuestionToolUpdate {
  sessionUpdate?: string
  toolCallId?: string
  title?: string
  status?: string
  rawInput?: {
    questions?: Array<{
      question: string
      header?: string
      options?: Array<{ label: string; description?: string }>
    }>
  }
}

/**
 * Permission request parameters from ACP
 */
export interface PermissionRequestParams {
  sessionId: string
  toolCall: {
    toolCallId: string
    title?: string | null
    kind?: string | null
    status?: string | null
    rawInput?: unknown
  }
  options: Array<{
    optionId: string
    name: string
    kind?: string
  }>
}

/**
 * Permission response outcome
 */
export interface PermissionOutcome {
  outcome: {
    outcome: 'selected'
    optionId: string
    _meta?: {
      userAnswer?: string
      userAnswers?: Array<{ question: string; answer: string }>
      answerType?: 'multi-question' | 'multi-selected' | 'selected' | 'custom'
    }
  }
}
