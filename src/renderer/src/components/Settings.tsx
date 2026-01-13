/**
 * Agent setup / Settings component
 * Minimalist design with bordered cards
 */
import { useState, useEffect } from 'react'
import type { AgentCheckResult } from '../../../shared/electron-api'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  currentAgentId: string | null
  onSwitchAgent: (agentId: string) => Promise<void>
}

// Agent icons mapping
const AGENT_ICONS: Record<string, string> = {
  opencode: '⌘',
  codex: '◈',
  gemini: '✦',
  claude: '◉',
}

export function Settings({ isOpen, onClose, currentAgentId, onSwitchAgent }: SettingsProps) {
  const [agents, setAgents] = useState<AgentCheckResult[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadAgents()
    }
  }, [isOpen])

  useEffect(() => {
    // Auto-select current agent or first installed agent
    if (agents.length > 0 && !selectedAgent) {
      const current = agents.find(a => a.id === currentAgentId && a.installed)
      const firstInstalled = agents.find(a => a.installed)
      setSelectedAgent(current?.id || firstInstalled?.id || null)
    }
  }, [agents, currentAgentId, selectedAgent])

  async function loadAgents() {
    setLoading(true)
    try {
      const results = await window.electronAPI.checkAgents()
      setAgents(results)
    } catch (err) {
      console.error('Failed to check agents:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleContinue() {
    if (!selectedAgent || switching) return

    // If already using this agent, just close
    if (selectedAgent === currentAgentId) {
      onClose()
      return
    }

    setSwitching(selectedAgent)
    try {
      await onSwitchAgent(selectedAgent)
      onClose()
    } catch (err) {
      console.error('Failed to switch agent:', err)
    } finally {
      setSwitching(null)
    }
  }

  if (!isOpen) return null

  const installedCount = agents.filter(a => a.installed).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl bg-[var(--color-background)] p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Set up agents</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Select a coding agent to use. Agents use local authentication.
          </p>
        </div>

        {/* Agent Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={agent.id === selectedAgent}
                onSelect={() => agent.installed && setSelectedAgent(agent.id)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={loadAgents}
            disabled={loading}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            Refresh
          </button>

          <button
            onClick={handleContinue}
            disabled={!selectedAgent || !!switching || installedCount === 0}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 font-medium text-[var(--color-primary-text)] transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            {switching ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Switching...
              </>
            ) : (
              <>
                Continue
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AgentCardProps {
  agent: AgentCheckResult
  isSelected: boolean
  onSelect: () => void
}

function AgentCard({ agent, isSelected, onSelect }: AgentCardProps) {
  const icon = AGENT_ICONS[agent.id] || '◇'

  return (
    <div
      onClick={onSelect}
      className={`flex items-start gap-4 rounded-lg border p-4 transition-all ${
        !agent.installed
          ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
          : isSelected
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] cursor-pointer'
            : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)] cursor-pointer'
      }`}
    >
      {/* Icon */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] text-lg">
        {icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--color-text)]">{agent.name}</span>
          {agent.installed && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--color-accent-muted)] px-2 py-0.5 text-xs text-[var(--color-accent)]">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              installed
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
          {getAgentDescription(agent.id)}
        </p>
        {!agent.installed && agent.installHint && (
          <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
            {agent.installHint}
          </p>
        )}
      </div>

      {/* Selection indicator */}
      <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        isSelected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
          : 'border-[var(--color-border)]'
      }`}>
        {isSelected && (
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </div>
  )
}

function getAgentDescription(agentId: string): string {
  const descriptions: Record<string, string> = {
    opencode: 'Terminal-based coding assistant',
    codex: 'OpenAI\'s coding agent CLI',
    gemini: 'Google\'s Gemini CLI agent',
    claude: 'Anthropic\'s Claude CLI',
  }
  return descriptions[agentId] || 'Coding assistant'
}
