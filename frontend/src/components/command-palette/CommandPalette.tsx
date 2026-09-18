import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { cn } from '@/lib/utils'

interface PaletteItem {
  id: string
  label: string
  description: string
  icon: string
  category: string
  action: () => void
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setCurrentView,
    setWorkspaceTab,
    setSettingsOpen,
    setProjectModalOpen,
    setShortcutsModalOpen
  } = useUIStore()

  const activeProject = useProjectStore((s) => s.activeProject)
  const { tasks, setActiveTask } = useTaskStore()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const allItems: PaletteItem[] = [
    {
      id: 'new-task',
      label: 'New Task',
      description: 'Go to command prompt to start a new task',
      icon: '⚡',
      category: 'Actions',
      action: () => {
        setCurrentView('home')
        setCommandPaletteOpen(false)
      },
    },
    {
      id: 'switch-project',
      label: 'Switch Project',
      description: 'Open, clone, or create a project workspace',
      icon: '📂',
      category: 'Actions',
      action: () => {
        setProjectModalOpen(true)
        setCommandPaletteOpen(false)
      },
    },
    {
      id: 'view-changes',
      label: 'View Changes (Diff)',
      description: 'Review code modifications from current task',
      icon: '📊',
      category: 'Views',
      action: () => {
        setCurrentView('task')
        setWorkspaceTab('changes')
        setCommandPaletteOpen(false)
      },
    },
    {
      id: 'view-code',
      label: 'Open Code Editor',
      description: 'Inspect and edit project source files',
      icon: '📄',
      category: 'Views',
      action: () => {
        setCurrentView('task')
        setWorkspaceTab('code')
        setCommandPaletteOpen(false)
      },
    },
    {
      id: 'view-terminal',
      label: 'Open Terminal',
      description: 'Interactive shell console',
      icon: '💻',
      category: 'Views',
      action: () => {
        setCurrentView('task')
        setWorkspaceTab('terminal')
        setCommandPaletteOpen(false)
      },
    },
    {
      id: 'settings',
      label: 'Open Settings',
      description: 'Configure autonomy, AI models, and preferences',
      icon: '⚙️',
      category: 'Preferences',
      action: () => {
        setSettingsOpen(true)
        setCommandPaletteOpen(false)
      },
    },
    {
      id: 'shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View list of all available shortcuts',
      icon: '⌨️',
      category: 'Preferences',
      action: () => {
        setShortcutsModalOpen(true)
        setCommandPaletteOpen(false)
      },
    },
    ...tasks.slice(0, 5).map((t) => ({
      id: `task-${t.id}`,
      label: t.command,
      description: `${t.mode} · ${t.status}`,
      icon: t.status === 'COMPLETED' ? '✓' : t.status === 'FAILED' ? '!' : '⏳',
      category: 'Recent Tasks',
      action: () => {
        setActiveTask(t)
        setCurrentView('task')
        setCommandPaletteOpen(false)
      },
    })),
  ]

  const filtered = query
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
      )
    : allItems

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        filtered[selected]?.action()
      } else if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    },
    [filtered, selected, setCommandPaletteOpen]
  )

  if (!commandPaletteOpen) return null

  const categories = [...new Set(filtered.map((i) => i.category))]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-subtle)]">
          <span className="text-[var(--text-muted)] text-sm">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, actions, recent tasks…"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No results for "{query}"
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat} className="mb-2">
                <div className="px-3 py-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  {cat}
                </div>
                {filtered
                  .filter((i) => i.category === cat)
                  .map((item) => {
                    const idx = filtered.indexOf(item)
                    const isSelected = idx === selected
                    return (
                      <button
                        key={item.id}
                        onClick={item.action}
                        onMouseEnter={() => setSelected(idx)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                          isSelected
                            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        )}
                      >
                        <span className="text-sm w-5 text-center shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-xs font-medium', isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
                            {item.label}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate">{item.description}</div>
                        </div>
                        {isSelected && (
                          <kbd className="text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 shrink-0">
                            ↵
                          </kbd>
                        )}
                      </button>
                    )
                  })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] flex gap-4 text-[11px] text-[var(--text-muted)]">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  )
}
