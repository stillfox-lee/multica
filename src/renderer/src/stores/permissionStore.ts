/**
 * Permission request state management
 */
import { create } from 'zustand'
import type { PermissionRequest, PermissionResponse } from '../../../shared/electron-api'

interface PermissionStore {
  // Current pending permission request
  pendingRequest: PermissionRequest | null

  // Set pending request
  setPendingRequest: (request: PermissionRequest | null) => void

  // Respond to permission request
  respondToRequest: (optionId: string) => void
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  pendingRequest: null,

  setPendingRequest: (request) => {
    console.log('[PermissionStore] Setting pending request:', request)
    set({ pendingRequest: request })
  },

  respondToRequest: (optionId) => {
    const { pendingRequest } = get()
    if (!pendingRequest) {
      console.warn('[PermissionStore] No pending request to respond to')
      return
    }

    console.log('[PermissionStore] Responding with optionId:', optionId)

    const response: PermissionResponse = {
      requestId: pendingRequest.requestId,
      optionId,
    }

    // Send response to main process
    window.electronAPI.respondToPermission(response)

    // Clear pending request
    set({ pendingRequest: null })
  },
}))
