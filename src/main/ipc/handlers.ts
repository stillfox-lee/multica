/**
 * IPC handlers for main process
 * Registers all IPC handlers for communication with renderer process
 */
import { ipcMain, dialog, clipboard, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { DEFAULT_AGENTS } from '../config/defaults'
import { checkAgents } from '../utils/agent-check'
import type { Conductor } from '../conductor/Conductor'
import type { ListSessionsOptions, MulticaSession } from '../../shared/types'
import type { FileTreeNode, DetectedApp } from '../../shared/electron-api'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export function registerIPCHandlers(conductor: Conductor): void {
  // --- Agent handlers (per-session) ---

  ipcMain.handle(IPC_CHANNELS.AGENT_PROMPT, async (_event, sessionId: string, content: string) => {
    const stopReason = await conductor.sendPrompt(sessionId, content)
    return { stopReason }
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_CANCEL, async (_event, sessionId: string) => {
    await conductor.cancelRequest(sessionId)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_STATUS, async () => {
    // Return status of all running sessions
    const runningSessionIds = conductor.getRunningSessionIds()
    const processingSessionIds = conductor.getProcessingSessionIds()
    return {
      runningSessions: runningSessionIds.length,
      sessionIds: runningSessionIds,
      processingSessionIds,
    }
  })

  // --- Session handlers ---

  ipcMain.handle(
    IPC_CHANNELS.SESSION_CREATE,
    async (_event, workingDirectory: string, agentId: string) => {
      const config = DEFAULT_AGENTS[agentId]
      if (!config) {
        throw new Error(`Unknown agent: ${agentId}`)
      }
      return conductor.createSession(workingDirectory, config)
    }
  )

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (_event, options?: ListSessionsOptions) => {
    return conductor.listSessions(options)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET, async (_event, sessionId: string) => {
    return conductor.getSessionData(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_LOAD, async (_event, sessionId: string) => {
    return conductor.loadSession(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_RESUME, async (_event, sessionId: string) => {
    return conductor.resumeSession(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_event, sessionId: string) => {
    await conductor.deleteSession(sessionId)
    return { success: true }
  })

  ipcMain.handle(
    IPC_CHANNELS.SESSION_UPDATE,
    async (_event, sessionId: string, updates: Partial<MulticaSession>) => {
      return conductor.updateSessionMeta(sessionId, updates)
    }
  )

  // --- Configuration handlers ---

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    return {
      version: '0.1.0',
      defaultAgentId: 'opencode', // Default agent for new sessions
      agents: DEFAULT_AGENTS,
      ui: {
        theme: 'system',
        fontSize: 14,
      },
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, async (_event, config: unknown) => {
    // TODO: Implement config persistence
    console.log(`[IPC] config:update`, config)
    return config
  })

  // --- Dialog handlers ---

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Working Directory',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  // --- System handlers ---

  ipcMain.handle(IPC_CHANNELS.SYSTEM_CHECK_AGENTS, async () => {
    return checkAgents()
  })

  // --- File tree handlers ---

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIRECTORY, async (_event, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      const nodes: FileTreeNode[] = entries.map((entry) => {
        const fullPath = path.join(dirPath, entry.name)
        const isDirectory = entry.isDirectory()
        const ext = isDirectory ? undefined : path.extname(entry.name).toLowerCase().slice(1)
        return {
          name: entry.name,
          path: fullPath,
          type: isDirectory ? 'directory' : 'file',
          extension: ext || undefined,
        }
      })

      // Sort: directories first, then files, both alphabetical
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      return nodes
    } catch (error) {
      console.error(`[IPC] Failed to list directory: ${dirPath}`, error)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.FS_DETECT_APPS, async () => {
    const apps: DetectedApp[] = [
      { id: 'finder', name: 'Finder' },
    ]

    // App definitions to check
    const appChecks = [
      { id: 'cursor', name: 'Cursor', appName: 'Cursor.app' },
      { id: 'vscode', name: 'VS Code', appName: 'Visual Studio Code.app' },
      { id: 'xcode', name: 'Xcode', appName: 'Xcode.app' },
      { id: 'ghostty', name: 'Ghostty', appName: 'Ghostty.app' },
      { id: 'iterm', name: 'iTerm', appName: 'iTerm.app' },
    ]

    const homeDir = process.env.HOME || ''

    for (const app of appChecks) {
      const systemPath = `/Applications/${app.appName}`
      const userPath = `${homeDir}/Applications/${app.appName}`

      if (fs.existsSync(systemPath) || fs.existsSync(userPath)) {
        apps.push({ id: app.id, name: app.name })
      }
    }

    // Terminal is always available
    apps.push({ id: 'terminal', name: 'Terminal' })
    apps.push({ id: 'copy-path', name: 'Copy path' })

    return apps
  })

  ipcMain.handle(
    IPC_CHANNELS.FS_OPEN_WITH,
    async (_event, options: { path: string; appId: string }) => {
      const { path: filePath, appId } = options

      try {
        switch (appId) {
          case 'finder':
            // Reveal in Finder
            shell.showItemInFolder(filePath)
            break
          case 'cursor':
            await execAsync(`open -a "Cursor" "${filePath}"`)
            break
          case 'vscode':
            await execAsync(`open -a "Visual Studio Code" "${filePath}"`)
            break
          case 'xcode':
            await execAsync(`open -a "Xcode" "${filePath}"`)
            break
          case 'ghostty':
            // For terminals, open the directory (not file)
            const ghosttyDir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath)
            await execAsync(`open -a "Ghostty" "${ghosttyDir}"`)
            break
          case 'iterm':
            const itermDir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath)
            await execAsync(`open -a "iTerm" "${itermDir}"`)
            break
          case 'terminal':
            const termDir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath)
            await execAsync(`open -a "Terminal" "${termDir}"`)
            break
          case 'copy-path':
            clipboard.writeText(filePath)
            break
          default:
            console.warn(`[IPC] Unknown app ID: ${appId}`)
        }
      } catch (error) {
        console.error(`[IPC] Failed to open with ${appId}:`, error)
        throw error
      }
    }
  )

  console.log('[IPC] All handlers registered')
}
