import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SidebarTab = 'files' | 'git' | 'history' | 'projects'
type CenterTab = 'editor' | 'diff' | 'terminal' | 'agent'

interface UIStore {
  theme: 'dark' | 'light'
  sidebarTab: SidebarTab
  centerTab: CenterTab
  rightPanelVisible: boolean
  commandPaletteOpen: boolean
  selectedFile: string | null
  settingsOpen: boolean
  toggleTheme: () => void
  setSidebarTab: (tab: SidebarTab) => void
  setCenterTab: (tab: CenterTab) => void
  setSelectedFile: (path: string | null) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setRightPanelVisible: (visible: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarTab: 'files',
      centerTab: 'editor',
      rightPanelVisible: true,
      commandPaletteOpen: false,
      selectedFile: null,
      settingsOpen: false,

      toggleTheme: () =>
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark'
          document.documentElement.classList.toggle('dark', next === 'dark')
          return { theme: next }
        }),

      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setCenterTab: (centerTab) => set({ centerTab }),
      setSelectedFile: (selectedFile) => set({ selectedFile, centerTab: 'editor' }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setRightPanelVisible: (rightPanelVisible) => set({ rightPanelVisible }),
    }),
    {
      name: 'codepilot-ui',
      partialize: (s) => ({ theme: s.theme, rightPanelVisible: s.rightPanelVisible }),
    }
  )
)
