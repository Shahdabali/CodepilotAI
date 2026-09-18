import React, { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { HomeScreen } from '@/components/home/HomeScreen'
import { TaskWorkspace } from '@/components/task/TaskWorkspace'
import { ProjectModal } from '@/components/project/ProjectModal'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ShortcutsModal } from '@/components/help/ShortcutsModal'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { useUIStore } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { useAgentSSE } from '@/hooks/useAgent'

export default function IDEShell() {
  const { currentView, toggleSidebar, setCommandPaletteOpen, setShortcutsModalOpen } = useUIStore()
  const activeTask = useTaskStore((s) => s.activeTask)

  // Listen to live agent events for active task
  useAgentSSE(activeTask?.id ?? null)

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
      // Ctrl+B: Toggle Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
      // Ctrl+/: Shortcuts Help
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setShortcutsModalOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar, setCommandPaletteOpen, setShortcutsModalOpen])

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[var(--bg-app)] text-[var(--text-primary)] font-sans antialiased">
      {/* Minimal Collapsible Sidebar */}
      <Sidebar />

      {/* Main Experience View */}
      <main className="flex-1 h-screen overflow-hidden flex flex-col relative">
        {currentView === 'home' ? <HomeScreen /> : <TaskWorkspace />}
      </main>

      {/* Global Modals & Overlays */}
      <ProjectModal />
      <SettingsPanel />
      <ShortcutsModal />
      <CommandPalette />
    </div>
  )
}
