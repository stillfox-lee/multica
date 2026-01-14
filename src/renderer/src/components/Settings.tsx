/**
 * Settings component - simplified agent selector
 * Using Linear-style design: minimal UI, direct interactions
 */
import { useState, useEffect } from 'react'
import type { AgentCheckResult } from '../../../shared/electron-api'
import { useTheme } from '../contexts/ThemeContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Sun, Moon, Monitor, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  currentAgentId: string | null
  onSwitchAgent: (agentId: string) => Promise<void>
}

type ThemeMode = 'light' | 'dark' | 'system'

export function Settings({ isOpen, onClose, currentAgentId, onSwitchAgent }: SettingsProps) {
  const [agents, setAgents] = useState<AgentCheckResult[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)
  const { mode, setMode } = useTheme()

  useEffect(() => {
    if (isOpen) {
      loadAgents()
    }
  }, [isOpen])

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

  async function handleSwitch(agentId: string) {
    if (switching || agentId === currentAgentId) return

    setSwitching(agentId)
    try {
      await onSwitchAgent(agentId)
    } catch (err) {
      console.error('Failed to switch agent:', err)
    } finally {
      setSwitching(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl h-[85vh] max-h-[85vh] overflow-y-auto content-start">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {/* Appearance Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Appearance</h2>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => value && setMode(value as ThemeMode)}
          >
            <ToggleGroupItem value="light" className="gap-2">
              <Sun className="h-4 w-4" />
              Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" className="gap-2">
              <Moon className="h-4 w-4" />
              Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="gap-2">
              <Monitor className="h-4 w-4" />
              System
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Separator */}
        <div className="border-t" />

        {/* Agent Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">AI Agent</h2>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {agents.map((agent) => (
                <AgentItem
                  key={agent.id}
                  agent={agent}
                  isActive={agent.id === currentAgentId}
                  isSwitching={switching === agent.id}
                  onSwitch={handleSwitch}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface AgentItemProps {
  agent: AgentCheckResult
  isActive: boolean
  isSwitching: boolean
  onSwitch: (agentId: string) => void
}

function AgentItem({ agent, isActive, isSwitching, onSwitch }: AgentItemProps) {
  const [expanded, setExpanded] = useState(false)

  const status = !agent.installed ? 'setup'
    : isActive ? 'active'
      : 'ready'

  const handleRowClick = () => {
    if (isSwitching) return

    if (status === 'ready') {
      onSwitch(agent.id)
    } else {
      setExpanded(!expanded)
    }
  }

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  return (
    <div
      className={cn(
        'rounded-md transition-colors duration-150 text-secondary-foreground hover:bg-muted/50 hover:text-foreground',
        status === 'active' && 'bg-muted text-foreground',
        status === 'setup' && 'opacity-60 hover:opacity-100'
      )}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={handleRowClick}
      >
        <button
          onClick={handleExpandClick}
          className="p-0.5 hover:bg-muted rounded text-muted-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <span className="flex-1 font-medium text-sm">{agent.name}</span>

        <span className={cn(
          'text-xs',
          status === 'active' ? 'text-green-600' : 'text-muted-foreground'
        )}>
          {isSwitching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : status === 'active' ? (
            'Active'
          ) : status === 'ready' ? (
            'Ready'
          ) : (
            'Setup required'
          )}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="pl-9 pr-3 pb-2 text-sm text-muted-foreground">
          {status === 'setup' && agent.installHint ? (
            <p className="text-xs">
              To install, run in Terminal: <code className="font-mono bg-muted px-1 py-0.5 rounded">{agent.installHint}</code>
            </p>
          ) : (
            <p className="text-xs">{getAgentDescription(agent.id)}</p>
          )}
        </div>
      )}
    </div>
  )
}

function getAgentDescription(agentId: string): string {
  const descriptions: Record<string, string> = {
    'claude-code': 'Best for complex reasoning tasks. By Anthropic.',
    opencode: 'Fast and lightweight. Open source.',
    codex: 'OpenAI\'s code assistant. By OpenAI.',
    gemini: 'Google\'s AI assistant. By Google.',
  }
  return descriptions[agentId] || 'AI coding assistant'
}
