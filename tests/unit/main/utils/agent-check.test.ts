import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commandExists, checkAgents } from '../../../../src/main/utils/agent-check'

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

// Mock os module
vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('darwin'),
}))

import { execSync } from 'node:child_process'
import { platform } from 'node:os'

const mockExecSync = vi.mocked(execSync)
const mockPlatform = vi.mocked(platform)

describe('agent-check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('commandExists', () => {
    it('should return exists: true when command is found', () => {
      mockExecSync
        .mockReturnValueOnce('/usr/local/bin/node\n') // which command
        .mockReturnValueOnce('v18.0.0\n') // --version command

      const result = commandExists('node')

      expect(result).toEqual({
        exists: true,
        path: '/usr/local/bin/node',
        version: 'v18.0.0',
      })
    })

    it('should return exists: false when command is not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found')
      })

      const result = commandExists('nonexistent')

      expect(result).toEqual({ exists: false })
    })

    it('should handle missing version gracefully', () => {
      mockExecSync
        .mockReturnValueOnce('/usr/local/bin/myapp\n') // which command
        .mockImplementationOnce(() => {
          throw new Error('--version not supported')
        })

      const result = commandExists('myapp')

      expect(result).toEqual({
        exists: true,
        path: '/usr/local/bin/myapp',
        version: undefined,
      })
    })

    it('should use "where" command on Windows', () => {
      mockPlatform.mockReturnValue('win32')
      mockExecSync
        .mockReturnValueOnce('C:\\Program Files\\node\\node.exe\n')
        .mockReturnValueOnce('v18.0.0\n')

      commandExists('node')

      expect(mockExecSync).toHaveBeenCalledWith(
        'where node',
        expect.any(Object)
      )
    })

    it('should use "which" command on Unix-like systems', () => {
      mockPlatform.mockReturnValue('darwin')
      mockExecSync
        .mockReturnValueOnce('/usr/local/bin/node\n')
        .mockReturnValueOnce('v18.0.0\n')

      commandExists('node')

      expect(mockExecSync).toHaveBeenCalledWith(
        'which node',
        expect.any(Object)
      )
    })

    it('should truncate long version strings', () => {
      const longVersion = 'v'.padEnd(100, '1')
      mockExecSync
        .mockReturnValueOnce('/usr/local/bin/node\n')
        .mockReturnValueOnce(longVersion + '\n')

      const result = commandExists('node')

      expect(result.version?.length).toBeLessThanOrEqual(50)
    })

    it('should handle multiline which output', () => {
      mockExecSync
        .mockReturnValueOnce('/usr/local/bin/node\n/usr/bin/node\n')
        .mockReturnValueOnce('v18.0.0\n')

      const result = commandExists('node')

      // Should return first path
      expect(result.path).toBe('/usr/local/bin/node')
    })
  })

  describe('checkAgents', () => {
    it('should check all default agents', () => {
      // Mock all commands as not found for simplicity
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found')
      })

      const results = checkAgents()

      // Should have entries for each configured agent
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((r) => r.id && r.name && r.command)).toBe(true)
    })

    it('should mark installed agents correctly', () => {
      mockExecSync
        // First agent check (claude-code)
        .mockReturnValueOnce('/usr/local/bin/claude-code\n')
        .mockReturnValueOnce('1.0.0\n')
        // Second agent check - not found
        .mockImplementationOnce(() => {
          throw new Error('not found')
        })
        // Third agent check - not found
        .mockImplementationOnce(() => {
          throw new Error('not found')
        })
        // Fourth agent check - not found
        .mockImplementationOnce(() => {
          throw new Error('not found')
        })

      const results = checkAgents()

      // At least one should be installed
      const installedAgents = results.filter((r) => r.installed)
      expect(installedAgents.length).toBeGreaterThanOrEqual(1)
    })

    it('should include install hints', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found')
      })

      const results = checkAgents()

      // Check that at least some have install hints
      const withHints = results.filter((r) => r.installHint)
      expect(withHints.length).toBeGreaterThan(0)
    })
  })
})
