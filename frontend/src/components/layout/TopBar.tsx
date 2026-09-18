import React from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { cn } from '@/lib/utils'

export function TopBar() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const { theme, toggleTheme, setSettingsOpen, setCommandPaletteOpen, setRightPanelVisible, rightPanelVisible } = useUIStore()
  const activeTask = useTaskStore((s) => s.activeTask)

  return (
    <div className="flex items-center h-10 px-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0 gap-3">
      {/* Logo */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[var(--accent)] text-base">⚡</span>
        <span className="text-sm font-semibold text-[var(--text-primary)]">CodePilot</span>
        <span className="text-xs text-[var(--accent)] font-bold">AI</span>
      </div>

      <div className="h-4 w-px bg-[var(--border-color)]" />

      {/* Project name */}
      {activeProject ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Project:</span>
          <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[180px]">
            {activeProject.name}
          </span>
          {activeProject.language && (
            <span className="text-[10px] bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[var(--text-muted)] font-mono shrink-0">
              {activeProject.language}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs text-[var(--text-muted)]">No project open</span>
      )}

      {/* Task status indicator */}
      {activeTask && (
        <div className="flex items-center gap-1.5 ml-2">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            activeTask.status === 'RUNNING' ? 'bg-blue-400 animate-pulse' :
            activeTask.status === 'COMPLETED' ? 'bg-green-400' :
            activeTask.status === 'FAILED' ? 'bg-red-400' : 'bg-[var(--text-muted)]'
          )} />
          <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">
            {activeTask.currentStage ?? activeTask.status}
          </span>
        </div>
      )}

      {/* Right controls */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {/* Command palette shortcut */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)] transition-colors"
        >
          <span>⌘</span>
          <span className="hidden sm:inline">Ctrl+K</span>
        </button>

        {/* Toggle agent panel */}
        <button
          onClick={() => setRightPanelVisible(!rightPanelVisible)}
          title="Toggle agent panel"
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded text-sm transition-colors',
            rightPanelVisible ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
          )}
        >
          🤖
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title="Toggle theme"
          className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          ⚙️
        </button>
      </div>
    </div>
  )
}
