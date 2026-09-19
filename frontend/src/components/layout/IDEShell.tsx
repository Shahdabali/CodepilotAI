import React, { Suspense, lazy, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { HomeScreen } from '@/components/home/HomeScreen'
import { TaskWorkspace } from '@/components/task/TaskWorkspace'
import { ProjectModal } from '@/components/project/ProjectModal'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ShortcutsModal } from '@/components/help/ShortcutsModal'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { Toaster } from '@/components/ui/toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { Skeleton } from '@/components/ui/primitives'
import { useUIStore } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { useAgentSSE } from '@/hooks/useAgent'
import { useBootstrap } from '@/hooks/useBootstrap'
import { viewVariants } from '@/lib/motion'

// Loaded on demand so the heavy editors and generators don't weigh down the rest of the app.
const ApiFetcherView = lazy(() => import('@/features/api-fetcher/components/ApiFetcherView'))
const GithubView = lazy(() => import('@/features/github/components/GithubView'))

function ViewFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-8" role="status" aria-label={`Loading ${label}`}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  )
}

export default function IDEShell() {
  const currentView = useUIStore((s) => s.currentView)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setShortcutsModalOpen = useUIStore((s) => s.setShortcutsModalOpen)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const activeTask = useTaskStore((s) => s.activeTask)

  useBootstrap()

  // Only running tasks stream; finished ones are rebuilt from their stored steps.
  const live = !!activeTask && (activeTask.status === 'RUNNING' || activeTask.status === 'PENDING')
  useAgentSSE(activeTask?.id ?? null, live)

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      // Ctrl+K: Command Palette (the API Fetcher owns Ctrl+K for its own search)
      if (e.key.toLowerCase() === 'k' && currentView !== 'api-fetcher') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
      // Ctrl+B: Toggle Sidebar
      else if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
      // Ctrl+/: Shortcuts Help
      else if (e.key === '/') {
        e.preventDefault()
        setShortcutsModalOpen(true)
      }
      // Ctrl+,: Settings
      else if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentView, toggleSidebar, setCommandPaletteOpen, setShortcutsModalOpen, setSettingsOpen])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app)] font-sans text-[var(--text-primary)] antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--on-accent)]"
      >
        Skip to content
      </a>

      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main id="main" className="relative flex h-full flex-1 flex-col overflow-hidden" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentView}
              variants={viewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex h-full min-h-0 w-full flex-1 flex-col"
            >
              <ErrorBoundary resetKey={currentView} label="this view">
                {currentView === 'home' ? (
                  <HomeScreen />
                ) : currentView === 'api-fetcher' ? (
                  <Suspense fallback={<ViewFallback label="API Fetcher" />}>
                    <ApiFetcherView />
                  </Suspense>
                ) : currentView === 'github' ? (
                  <Suspense fallback={<ViewFallback label="GitHub Explorer" />}>
                    <GithubView />
                  </Suspense>
                ) : (
                  <TaskWorkspace />
                )}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Global Modals & Overlays */}
      <ProjectModal />
      <SettingsPanel />
      <ShortcutsModal />
      <CommandPalette />
      <Toaster />
    </div>
  )
}
