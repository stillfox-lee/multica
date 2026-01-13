/**
 * Chat view component - displays messages and tool calls
 */
import { useEffect, useRef } from 'react'
import type { StoredSessionUpdate } from '../../../shared/types'

interface ChatViewProps {
  updates: StoredSessionUpdate[]
  isProcessing: boolean
  hasSession: boolean
  onNewSession?: () => void
}

export function ChatView({ updates, isProcessing, hasSession, onNewSession }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [updates])

  // Group updates into messages
  const messages = groupUpdatesIntoMessages(updates)

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-bold">Multica</h1>
          <p className="mb-4 text-[var(--color-text-muted)]">
            {hasSession
              ? 'Start a conversation with your coding agent'
              : 'Create a session to start chatting'}
          </p>
          {!hasSession && onNewSession && (
            <button
              onClick={onNewSession}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)]"
            >
              New Session
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <LoadingDots />
            <span className="text-sm">Agent is thinking...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  thought: string
  toolCalls: ToolCall[]
}

interface ToolCall {
  id: string
  title: string
  status: string
  kind?: string
  input?: string
  output?: string
}

function groupUpdatesIntoMessages(updates: StoredSessionUpdate[]): Message[] {
  const messages: Message[] = []
  let currentAssistantContent = ''
  let currentThought = ''
  let currentToolCalls: ToolCall[] = []
  const toolCallMap = new Map<string, ToolCall>()

  for (const stored of updates) {
    // The stored.update is SessionNotification which has { sessionId, update }
    const notification = stored.update
    const update = notification?.update
    if (!update || !('sessionUpdate' in update)) {
      continue
    }

    switch (update.sessionUpdate) {
      case 'user_message' as string:
        // Flush any pending assistant message
        if (currentAssistantContent || currentThought || currentToolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: currentAssistantContent,
            thought: currentThought,
            toolCalls: currentToolCalls,
          })
          currentAssistantContent = ''
          currentThought = ''
          currentToolCalls = []
          toolCallMap.clear()
        }
        // Add user message
        {
          const userUpdate = update as { content?: { type: string; text: string } }
          if (userUpdate.content?.type === 'text') {
            messages.push({
              role: 'user',
              content: userUpdate.content.text,
              thought: '',
              toolCalls: [],
            })
          }
        }
        break

      case 'agent_message_chunk':
        // APPEND chunks instead of replacing
        if ('content' in update && update.content?.type === 'text') {
          currentAssistantContent += update.content.text
        }
        break

      case 'agent_thought_chunk':
        // Accumulate thought chunks
        if ('content' in update && update.content?.type === 'text') {
          currentThought += update.content.text
        }
        break

      case 'tool_call':
        if ('toolCallId' in update) {
          const toolCall: ToolCall = {
            id: update.toolCallId,
            title: update.title || 'Tool Call',
            status: update.status || 'pending',
            kind: update.kind,
            input: typeof update.rawInput === 'string'
              ? update.rawInput
              : update.rawInput && Object.keys(update.rawInput).length > 0
                ? JSON.stringify(update.rawInput, null, 2)
                : undefined,
          }
          toolCallMap.set(update.toolCallId, toolCall)
          currentToolCalls = Array.from(toolCallMap.values())
        }
        break

      case 'tool_call_update':
        if ('toolCallId' in update) {
          // Get or create the tool call entry
          const existingTool = toolCallMap.get(update.toolCallId)
          if (existingTool) {
            if (update.status) existingTool.status = update.status
            if (update.title) existingTool.title = update.title
            if (update.rawInput && Object.keys(update.rawInput).length > 0) {
              existingTool.input = typeof update.rawInput === 'string'
                ? update.rawInput
                : JSON.stringify(update.rawInput, null, 2)
            }
            if (update.rawOutput) {
              existingTool.output = typeof update.rawOutput === 'string'
                ? update.rawOutput
                : JSON.stringify(update.rawOutput, null, 2)
            }
          } else {
            // Create new entry if we see update before the initial tool_call
            const newTool: ToolCall = {
              id: update.toolCallId,
              title: update.title || 'Tool Call',
              status: update.status || 'pending',
              kind: update.kind ?? undefined,
            }
            if (update.rawInput && Object.keys(update.rawInput).length > 0) {
              newTool.input = typeof update.rawInput === 'string'
                ? update.rawInput
                : JSON.stringify(update.rawInput, null, 2)
            }
            toolCallMap.set(update.toolCallId, newTool)
          }
          currentToolCalls = Array.from(toolCallMap.values())
        }
        break
    }
  }

  // Flush any remaining assistant content
  if (currentAssistantContent || currentThought || currentToolCalls.length > 0) {
    messages.push({
      role: 'assistant',
      content: currentAssistantContent.trim(),
      thought: currentThought.trim(),
      toolCalls: currentToolCalls,
    })
  }

  return messages
}

interface MessageBubbleProps {
  message: Message
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // User message - bubble style
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-[var(--color-surface)] px-4 py-3 text-sm">
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant message - flat list style
  return (
    <div className="space-y-2">
      {/* Thought */}
      {message.thought && (
        <ThoughtLine text={message.thought} />
      )}

      {/* Tool calls */}
      {message.toolCalls.map((tc) => (
        <ToolCallLine key={tc.id} toolCall={tc} />
      ))}

      {/* Text content */}
      {message.content && (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </div>
      )}
    </div>
  )
}

// Thought line - inline display
function ThoughtLine({ text }: { text: string }) {
  const truncated = text.length > 80 ? text.slice(0, 77) + '...' : text
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
      <span className="opacity-60">⊛</span>
      <span className="font-medium">Thinking</span>
      <span className="rounded bg-[var(--color-surface)] px-2 py-0.5 font-mono text-xs">
        {truncated}
      </span>
    </div>
  )
}

// Tool call line - inline display
function ToolCallLine({ toolCall }: { toolCall: ToolCall }) {
  const { icon, action, detail } = parseToolCall(toolCall)

  const isRunning = toolCall.status === 'running' || toolCall.status === 'in_progress' || toolCall.status === 'pending'
  const isFailed = toolCall.status === 'failed'

  return (
    <div className={`flex items-center gap-2 text-sm ${isFailed ? 'text-red-400' : 'text-[var(--color-text-muted)]'}`}>
      {/* Icon */}
      <span className="w-4 text-center font-mono opacity-60">{icon}</span>

      {/* Action */}
      <span className={isRunning ? '' : ''}>{action}</span>

      {/* Detail in code pill */}
      {detail && (
        <span className="rounded bg-[var(--color-surface)] px-2 py-0.5 font-mono text-xs truncate max-w-[300px]">
          {detail}
        </span>
      )}

      {/* Running indicator */}
      {isRunning && <LoadingDots />}
    </div>
  )
}

interface ParsedToolCall {
  icon: string
  action: string
  detail?: string
}

function parseToolCall(toolCall: ToolCall): ParsedToolCall {
  const title = toolCall.title?.toLowerCase() || ''
  const kind = toolCall.kind?.toLowerCase() || ''

  // Try to extract file path from input
  let filePath: string | undefined
  if (toolCall.input) {
    try {
      const parsed = JSON.parse(toolCall.input)
      filePath = parsed.file_path || parsed.path || parsed.filePath || parsed.pattern
    } catch {
      // Not JSON, might be a direct path
      if (toolCall.input.startsWith('/') || toolCall.input.includes('.')) {
        filePath = toolCall.input.split('\n')[0].trim()
      }
    }
  }

  // Determine icon and action based on kind/title
  if (kind === 'search' || title.includes('glob') || title.includes('search') || title.includes('grep')) {
    return {
      icon: '◎',
      action: title.includes('glob') ? 'Search files' : 'Search',
      detail: filePath || extractPathFromTitle(toolCall.title),
    }
  }

  if (title.includes('list') || title.startsWith('ls')) {
    return {
      icon: '▤',
      action: 'List',
      detail: extractPathFromTitle(toolCall.title),
    }
  }

  if (title.includes('read')) {
    return {
      icon: '◔',
      action: 'Read',
      detail: filePath || extractPathFromTitle(toolCall.title),
    }
  }

  if (title.includes('write') || title.includes('create')) {
    // Try to get line count from output
    let lineCount = ''
    if (toolCall.output) {
      const lines = toolCall.output.split('\n').length
      if (lines > 1) lineCount = `${lines} lines`
    }
    return {
      icon: '▤',
      action: lineCount ? `Write ${lineCount}` : 'Write',
      detail: filePath || extractPathFromTitle(toolCall.title),
    }
  }

  if (title.includes('edit') || title.includes('replace')) {
    return {
      icon: '✎',
      action: 'Edit',
      detail: filePath || extractPathFromTitle(toolCall.title),
    }
  }

  if (title.startsWith('run') || kind === 'bash' || kind === 'shell') {
    const cmd = extractCommandFromTitle(toolCall.title)
    return {
      icon: '>_',
      action: getCommandDescription(toolCall.title),
      detail: cmd,
    }
  }

  // Default
  return {
    icon: '◇',
    action: toolCall.title || toolCall.kind || 'Tool',
    detail: filePath,
  }
}

function extractPathFromTitle(title?: string): string | undefined {
  if (!title) return undefined
  // Look for path-like strings
  const match = title.match(/\/[\w\-./]+/)
  return match ? match[0] : undefined
}

function extractCommandFromTitle(title?: string): string | undefined {
  if (!title) return undefined
  // Remove "Run " prefix and get the command
  if (title.toLowerCase().startsWith('run ')) {
    const cmd = title.slice(4).trim()
    // Truncate if too long
    return cmd.length > 50 ? cmd.slice(0, 47) + '...' : cmd
  }
  return undefined
}

function getCommandDescription(title?: string): string {
  if (!title) return 'Run command'
  const lower = title.toLowerCase()

  if (lower.includes('mkdir')) return 'Create directory'
  if (lower.includes('rm ')) return 'Remove'
  if (lower.includes('mv ')) return 'Move'
  if (lower.includes('cp ')) return 'Copy'
  if (lower.includes('npm') || lower.includes('pnpm') || lower.includes('yarn')) return 'Package manager'
  if (lower.includes('git')) return 'Git'
  if (lower.includes('python')) return 'Run Python'
  if (lower.includes('node')) return 'Run Node'
  if (lower.includes('perl')) return 'Run Perl'

  return 'Run command'
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: '300ms' }} />
    </span>
  )
}
