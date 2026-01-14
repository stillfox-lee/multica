/**
 * Main App component
 */
import { useEffect } from 'react'
import { useApp } from './hooks/useApp'
import { ChatView, MessageInput, StatusBar } from './components'
import { AppSidebar } from './components/AppSidebar'
import { Modals } from './components/Modals'
import { ThemeProvider } from './contexts/ThemeContext'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useModalStore } from './stores/modalStore'

function AppContent(): React.JSX.Element {
  const {
    // State
    sessions,
    currentSession,
    sessionUpdates,
    agentStatus,
    isProcessing,
    error,

    // Actions
    createSession,
    selectSession,
    deleteSession,
    startAgent,
    stopAgent,
    switchAgent,
    sendPrompt,
    cancelRequest,
    clearError,
  } = useApp()

  const openModal = useModalStore((s) => s.openModal)

  // Auto-show new session dialog when agent is running but no session
  useEffect(() => {
    if (agentStatus.state === 'running' && !currentSession && sessions.length === 0) {
      openModal('newSession')
    }
  }, [agentStatus.state, currentSession, sessions.length, openModal])

  const handleNewSession = () => {
    openModal('newSession')
  }

  const handleCreateSession = async (cwd: string) => {
    // Ensure agent is running
    if (agentStatus.state !== 'running') {
      await startAgent('opencode')
    }
    await createSession(cwd)
  }

  const handleSelectSession = async (sessionId: string) => {
    // Ensure agent is running
    if (agentStatus.state !== 'running') {
      const session = sessions.find((s) => s.id === sessionId)
      if (session) {
        await startAgent(session.agentId)
      }
    }
    await selectSession(sessionId)
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between bg-red-600 px-4 py-2 text-sm text-white">
          <span>{error}</span>
          <button onClick={clearError} className="hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <SidebarProvider className="flex-1 overflow-hidden">
        {/* Sidebar */}
        <AppSidebar
          sessions={sessions}
          currentSessionId={currentSession?.id ?? null}
          onSelect={handleSelectSession}
          onNewSession={handleNewSession}
        />

        {/* Main area */}
        <main className="flex flex-1 flex-col">
          {/* Status bar */}
          <StatusBar
            agentStatus={agentStatus}
            currentSession={currentSession}
            onStartAgent={() => startAgent('opencode')}
            onStopAgent={stopAgent}
          />

          {/* Chat view */}
          <ChatView
            updates={sessionUpdates}
            isProcessing={isProcessing}
            hasSession={!!currentSession}
            onNewSession={handleNewSession}
          />

          {/* Input */}
          <MessageInput
            onSend={sendPrompt}
            onCancel={cancelRequest}
            isProcessing={isProcessing}
            disabled={!currentSession || agentStatus.state !== 'running'}
          />
        </main>
      </SidebarProvider>

      {/* Global modals */}
      <Modals
        currentAgentId={agentStatus.state === 'running' ? agentStatus.agentId : null}
        onSwitchAgent={switchAgent}
        onCreateSession={handleCreateSession}
        onDeleteSession={deleteSession}
      />
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
