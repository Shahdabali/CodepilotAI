import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { cn } from '@/lib/utils'
import type { AgentMode } from '@/types'

interface PaletteItem {
  id: string
  label: string
  description: string
  icon: string
  category: string
  action: () => void
}

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setSidebarTab, setCenterTab } = useUIStore()
  const activeProject = useProjectStore((s) => s.activeProject)
  const tasks = useTaskStore((s) => s.tasks)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const allItems: PaletteItem[] = [
    { id: 'build', label: 'Build a feature', description: 'Scaffold and implement new functionality', icon: '🏗️', category: 'Commands', action: () => { setCenterTab('editor'); setCommandPaletteOpen(false) } },
    { id: 'fix', label: 'Fix errors', description: 'Find and repair bugs in the project', icon: '🔧', category: 'Commands', action: () => { setCommandPaletteOpen(false) } },
    { id: 'optimize', label: 'Optimize project', description: 'Analyze and improve performance', icon: '⚡', category: 'Commands', action: () => { setCommandPaletteOpen(false) } },
    { id: 'test', label: 'Run tests', description: 'Execute all tests and show results', icon: '🧪', category: 'Commands', action: () => { setCommandPaletteOpen(false) } },
    { id: 'review', label: 'Review code', description: 'Perform an AI code review', icon: '👀', category: 'Commands', action: () => { setCommandPaletteOpen(false) } },
    { id: 'refactor', label: 'Refactor code', description: 'Improve structure without changing behavior', icon: '♻️', category: 'Commands', action: () => { setCommandPaletteOpen(false) } },
    { id: 'explain', label: 'Explain architecture', description: 'Get an explanation of the codebase', icon: '📖', category: 'Commands', action: () => { setCommandPaletteOpen(false) } },
    { id: 'terminal', label: 'Open Terminal', description: 'Switch to terminal view', icon: '💻', category: 'Navigation', action: () => { setCenterTab('terminal'); setCommandPaletteOpen(false) } },
    { id: 'diff', label: 'View Diff', description: 'See file changes from active task', icon: '📊', category: 'Navigation', action: () => { setCenterTab('diff'); setCommandPaletteOpen(false) } },
    { id: 'files', label: 'Show Files', description: 'Open file explorer', icon: '📂', category: 'Navigation', action: () => { setSidebarTab('files'); setCommandPaletteOpen(false) } },
    { id: 'git', label: 'Show Git', description: 'Open git panel', icon: '🌿', category: 'Navigation', action: () => { setSidebarTab('git'); setCommandPaletteOpen(false) } },
    { id: 'history', label: 'Task History', description: 'See past agent tasks', icon: '📜', category: 'Navigation', action: () => { setSidebarTab('history'); setCommandPaletteOpen(false) } },
    ...tasks.slice(0, 5).map((t) => ({
      id: `task-${t.id}`,
      label: t.command,
      description: `${t.mode} · ${t.status}`,
      icon: t.status === 'COMPLETED' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳',
      category: 'Recent Tasks',
      action: () => { setCommandPaletteOpen(false) },
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)]">
          <span className="text-[var(--text-muted)]">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, files, tasks…"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="text-xs text-[var(--text-muted)] border border-[var(--border-color)] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">No results for "{query}"</div>
          ) : (
            categories.map((cat) => (
              <div key={cat}>
                <div className="px-4 py-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-primary)]/30">
                  {cat}
                </div>
                {filtered
                  .filter((i) => i.category === cat)
                  .map((item) => {
                    const idx = filtered.indexOf(item)
                    return (
                      <button
                        key={item.id}
                        onClick={item.action}
                        onMouseEnter={() => setSelected(idx)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          idx === selected ? 'bg-[var(--accent)]/15' : 'hover:bg-[var(--bg-tertiary)]'
                        )}
                      >
                        <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-sm font-medium', idx === selected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
                            {item.label}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">{item.description}</div>
                        </div>
                        {idx === selected && (
                          <kbd className="text-xs text-[var(--text-muted)] border border-[var(--border-color)] rounded px-1.5 py-0.5 shrink-0">↵</kbd>
                        )}
                      </button>
                    )
                  })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-color)] flex gap-4 text-xs text-[var(--text-muted)]">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  )
}
