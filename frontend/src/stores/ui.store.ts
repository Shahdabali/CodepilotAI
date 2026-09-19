import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppView = 'home' | 'task' | 'api-fetcher' | 'github'
export type WorkspaceTab = 'overview' | 'changes' | 'code' | 'terminal' | 'git'

interface UIStore {
  theme: 'dark' | 'light'
  currentView: AppView
  workspaceTab: WorkspaceTab
  sidebarCollapsed: boolean
  showTechnicalDetails: boolean
  selectedFile: string | null
  
  // Modals & Drawers
  commandPaletteOpen: boolean
  settingsOpen: boolean
  projectModalOpen: boolean
  projectModalTab: 'open' | 'clone' | 'create' | 'recent'
  shortcutsModalOpen: boolean
  /** Repository URL handed to the Clone tab (e.g. from the GitHub explorer). */
  cloneUrl: string

  // Backward compatibility fields for secondary components
  sidebarTab: 'files' | 'git' | 'history' | 'projects'
  centerTab: 'editor' | 'diff' | 'terminal' | 'agent'
  rightPanelVisible: boolean

  // Actions
  toggleTheme: () => void
  setCurrentView: (view: AppView) => void
  setWorkspaceTab: (tab: WorkspaceTab) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleTechnicalDetails: () => void
  setShowTechnicalDetails: (show: boolean) => void
  setSelectedFile: (path: string | null) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setProjectModalOpen: (open: boolean) => void
  setProjectModalTab: (tab: 'open' | 'clone' | 'create' | 'recent') => void
  openProjectModalWithTab: (tab: 'open' | 'clone' | 'create' | 'recent') => void
  setShortcutsModalOpen: (open: boolean) => void
  setCloneUrl: (url: string) => void
  /** Open the project dialog on the Clone tab with a repository pre-filled. */
  openCloneFor: (url: string) => void

  // Backward compatibility actions
  setSidebarTab: (tab: 'files' | 'git' | 'history' | 'projects') => void
  setCenterTab: (tab: 'editor' | 'diff' | 'terminal' | 'agent') => void
  setRightPanelVisible: (visible: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      currentView: 'home',
      workspaceTab: 'overview',
      sidebarCollapsed: false,
      showTechnicalDetails: false,
      selectedFile: null,
      
      commandPaletteOpen: false,
      settingsOpen: false,
      projectModalOpen: false,
      projectModalTab: 'open',
      shortcutsModalOpen: false,
      cloneUrl: '',

      // Defaults for compatibility
      sidebarTab: 'files',
      centerTab: 'editor',
      rightPanelVisible: true,

      toggleTheme: () =>
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark'
          const root = document.documentElement
          // Cross-fade the palette: the class must be on before the colours change.
          root.classList.add('cp-theme-switching')
          root.classList.toggle('dark', next === 'dark')
          setTimeout(() => root.classList.remove('cp-theme-switching'), 320)
          return { theme: next }
        }),

      setCurrentView: (currentView) => set({ currentView }),
      setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleTechnicalDetails: () => set((state) => ({ showTechnicalDetails: !state.showTechnicalDetails })),
      setShowTechnicalDetails: (showTechnicalDetails) => set({ showTechnicalDetails }),
      setSelectedFile: (selectedFile) => set({ selectedFile }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setProjectModalOpen: (projectModalOpen) => set({ projectModalOpen }),
      setProjectModalTab: (projectModalTab) => set({ projectModalTab }),
      openProjectModalWithTab: (tab) => set({ projectModalOpen: true, projectModalTab: tab }),
      setShortcutsModalOpen: (shortcutsModalOpen) => set({ shortcutsModalOpen }),
      setCloneUrl: (cloneUrl) => set({ cloneUrl }),
      openCloneFor: (cloneUrl) => set({ cloneUrl, projectModalOpen: true, projectModalTab: 'clone' }),

      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setCenterTab: (centerTab) => set({ centerTab }),
      setRightPanelVisible: (rightPanelVisible) => set({ rightPanelVisible }),
    }),
    {
      name: 'codepilot-ui-v2',
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
)
