/**
 * Global UI state management using Zustand
 * Stores all UI-related state like panel visibility, etc.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIStore {
  // Sidebar state
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Right panel state
  rightPanelOpen: boolean
  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Sidebar - default open
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Right panel - default open
      rightPanelOpen: true,
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
    }),
    {
      name: 'ui-state', // localStorage key
    }
  )
)
