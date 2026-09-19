import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Keyboard, Moon, Search, Settings, Sun } from 'lucide-react'
import { useUIStore, type AppView } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { useProjectStore } from '@/stores/project.store'
import { StatusGlyph } from '@/components/ui/StatusGlyph'
import { IconButton, Kbd } from '@/components/ui/primitives'

const VIEW_TITLE: Record<AppView, string> = {
  home: 'Home',
  task: 'Task',
  github: 'GitHub Explorer',
  'api-fetcher': 'API Fetcher',
}

export function TopBar() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const currentView = useUIStore((s) => s.currentView)
  const setCurrentView = useUIStore((s) => s.setCurrentView)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setShortcutsModalOpen = useUIStore((s) => s.setShortcutsModalOpen)
  const activeTask = useTaskStore((s) => s.activeTask)
  const activeProject = useProjectStore((s) => s.activeProject)

  const live = activeTask && (activeTask.status === 'RUNNING' || activeTask.status === 'PENDING')
  const dark = theme === 'dark'

  return (
    <header className="z-40 flex h-12 w-full shrink-0 select-none items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 shrink items-center gap-1.5 text-[13px] md:flex md:w-56 lg:w-72">
        <span className="max-w-[140px] truncate text-[var(--text-muted)]">{activeProject?.name ?? 'No project'}</span>
        <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" />
        <span className="truncate font-medium text-[var(--text-primary)]">{VIEW_TITLE[currentView]}</span>
      </nav>

      {/* Search / command palette */}
      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="group flex h-8 w-full max-w-md items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-left text-[13px] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
          aria-label="Open command palette"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 truncate">Search commands, tasks, projects…</span>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <AnimatePresence>
          {live && (
            <motion.button
              key="live"
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => setCurrentView('task')}
              title="View the running task"
              className="mr-1 hidden h-8 max-w-[220px] items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] lg:flex"
            >
              <StatusGlyph status="RUNNING" size={12} />
              <span className="truncate">{activeTask!.command}</span>
            </motion.button>
          )}
        </AnimatePresence>

        <IconButton label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
          <span className="relative block h-4 w-4 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={dark ? 'sun' : 'moon'}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotate: -70, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 70, opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.18 }}
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </motion.span>
            </AnimatePresence>
          </span>
        </IconButton>
        <IconButton label="Keyboard shortcuts (Ctrl+/)" onClick={() => setShortcutsModalOpen(true)}>
          <Keyboard size={16} />
        </IconButton>
        <IconButton label="Settings (Ctrl+,)" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} />
        </IconButton>
      </div>
    </header>
  )
}
