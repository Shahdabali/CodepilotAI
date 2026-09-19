import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CornerDownLeft,
  FileCode2,
  FolderOpen,
  Github,
  Home,
  Keyboard,
  Moon,
  Network,
  Search,
  Settings,
  Split,
  Sun,
  Terminal as TerminalIcon,
  type LucideIcon,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { useGithub } from '@/features/github/store'
import { parseRepoInput } from '@/features/github/lib/parse'
import { Modal } from '@/components/ui/Modal'
import { StatusGlyph } from '@/components/ui/StatusGlyph'
import { Kbd } from '@/components/ui/primitives'
import { springSnappy } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface PaletteItem {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  category: string
  action: () => void
}

const icon = (Icon: LucideIcon) => <Icon size={15} />

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setCurrentView,
    setWorkspaceTab,
    setSettingsOpen,
    setShortcutsModalOpen,
    openProjectModalWithTab,
    theme,
    toggleTheme,
  } = useUIStore()

  const activeProject = useProjectStore((s) => s.activeProject)
  const { tasks, setActiveTask } = useTaskStore()
  const openGithub = useGithub((s) => s.open)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const close = () => setCommandPaletteOpen(false)
  const run = (fn: () => void) => () => {
    fn()
    close()
  }

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [
      { id: 'home', label: 'Go to Home', description: 'Describe a new task', icon: icon(Home), category: 'Navigate', action: run(() => setCurrentView('home')) },
      { id: 'github', label: 'Open GitHub Explorer', description: 'Browse repositories, READMEs, files, commits and issues', icon: icon(Github), category: 'Navigate', action: run(() => setCurrentView('github')) },
      { id: 'api-fetcher', label: 'Open API Fetcher', description: 'Build, send and debug HTTP requests, and generate integration code', icon: icon(Network), category: 'Navigate', action: run(() => setCurrentView('api-fetcher')) },
      { id: 'switch-project', label: activeProject ? 'Switch project' : 'Open a project', description: 'Open, clone, or create a project workspace', icon: icon(FolderOpen), category: 'Project', action: run(() => openProjectModalWithTab(activeProject ? 'recent' : 'open')) },
      { id: 'view-changes', label: 'View changes (diff)', description: 'Review code modifications from the current task', icon: icon(Split), category: 'Task', action: run(() => (setCurrentView('task'), setWorkspaceTab('changes'))) },
      { id: 'view-code', label: 'Open code editor', description: 'Inspect and edit project source files', icon: icon(FileCode2), category: 'Task', action: run(() => (setCurrentView('task'), setWorkspaceTab('code'))) },
      { id: 'view-terminal', label: 'Open terminal', description: 'Interactive shell in the project folder', icon: icon(TerminalIcon), category: 'Task', action: run(() => (setCurrentView('task'), setWorkspaceTab('terminal'))) },
      { id: 'theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', description: 'Change the colour theme', icon: theme === 'dark' ? icon(Sun) : icon(Moon), category: 'Preferences', action: run(toggleTheme) },
      { id: 'settings', label: 'Open settings', description: 'Autonomy, AI providers and preferences', icon: icon(Settings), category: 'Preferences', action: run(() => setSettingsOpen(true)) },
      { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'See every shortcut', icon: icon(Keyboard), category: 'Preferences', action: run(() => setShortcutsModalOpen(true)) },
    ]

    // What was typed can itself be a repository — offer to open it.
    const parsed = parseRepoInput(query)
    if (parsed.kind === 'repo') {
      list.unshift({
        id: 'gh-open',
        label: `Open ${parsed.owner}/${parsed.repo} on GitHub`,
        description: 'Explore its README, files, commits and issues',
        icon: icon(Github),
        category: 'GitHub',
        action: run(() => (openGithub(query), setCurrentView('github'))),
      })
    } else if (parsed.kind === 'search' && query.trim().length > 1) {
      list.push({
        id: 'gh-search',
        label: `Search GitHub for “${query.trim()}”`,
        description: 'Find repositories',
        icon: icon(Search),
        category: 'GitHub',
        action: run(() => (openGithub(query), setCurrentView('github'))),
      })
    }

    for (const t of tasks.slice(0, 6)) {
      list.push({
        id: `task-${t.id}`,
        label: t.command,
        description: `${t.mode.toLowerCase()} · ${t.status.toLowerCase()}`,
        icon: <StatusGlyph status={t.status} size={15} />,
        category: 'Recent tasks',
        action: run(() => (setActiveTask(t), setCurrentView('task'))),
      })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tasks, activeProject, theme])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.filter((i) => i.category !== 'GitHub')
    return items.filter((i) => i.category === 'GitHub' || i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
  }, [items, query])

  useEffect(() => setSelected(0), [query])
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelected(0)
    }
  }, [commandPaletteOpen])

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[selected]?.action()
    }
  }

  const categories = [...new Set(filtered.map((i) => i.category))]

  return (
    <Modal open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} title="Command palette" description="Search commands, repositories and recent tasks" placement="top" className="max-w-xl">
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
        <Search size={16} className="shrink-0 text-[var(--text-muted)]" />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={filtered[selected] ? `palette-opt-${filtered[selected].id}` : undefined}
          aria-label="Search commands"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search commands, or paste a GitHub repo…"
          className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div ref={listRef} id="palette-list" role="listbox" aria-label="Results" className="max-h-[22rem] overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-muted)]">No results for “{query}”</div>
        ) : (
          categories.map((cat) => (
            <div key={cat} role="group" aria-label={cat} className="mb-1.5">
              <div className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{cat}</div>
              {filtered
                .filter((i) => i.category === cat)
                .map((item) => {
                  const idx = filtered.indexOf(item)
                  const active = idx === selected
                  return (
                    <button
                      key={item.id}
                      id={`palette-opt-${item.id}`}
                      data-index={idx}
                      role="option"
                      aria-selected={active}
                      type="button"
                      onClick={item.action}
                      onMouseMove={() => setSelected(idx)}
                      className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left"
                    >
                      {active && <motion.span layoutId="palette-active" transition={springSnappy} className="absolute inset-0 rounded-lg bg-[var(--accent-subtle)]" />}
                      <span className={cn('relative flex h-6 w-6 shrink-0 items-center justify-center', active ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]')}>{item.icon}</span>
                      <span className="relative min-w-0 flex-1">
                        <span className={cn('block truncate text-[13px] font-medium', active ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]')}>{item.label}</span>
                        <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{item.description}</span>
                      </span>
                      {active && <CornerDownLeft size={13} className="relative shrink-0 text-[var(--text-muted)]" />}
                    </button>
                  )
                })}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> select
        </span>
        <span className="ml-auto">Ctrl+K</span>
      </div>
    </Modal>
  )
}
