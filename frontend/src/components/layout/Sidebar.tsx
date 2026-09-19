import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronsUpDown,
  FolderGit2,
  Github,
  Home,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useUIStore, type AppView } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { api } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { springSnappy } from '@/lib/motion'
import { useMedia } from '@/hooks/useMedia'
import { BrandMark, Wordmark } from '@/components/ui/Brand'
import { StatusGlyph } from '@/components/ui/StatusGlyph'
import { Skeleton } from '@/components/ui/primitives'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  view: AppView
  badge?: string
}

export function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const currentView = useUIStore((s) => s.currentView)
  const setCurrentView = useUIStore((s) => s.setCurrentView)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const openProjectModalWithTab = useUIStore((s) => s.openProjectModalWithTab)

  const activeProject = useProjectStore((s) => s.activeProject)
  const { tasks, tasksLoaded, activeTask, setActiveTask } = useTaskStore()

  const { data: providersData, isLoading: providersLoading } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: api.ai.getProviders,
    staleTime: 30000,
  })

  const configured = providersData?.providers?.filter((p) => p.isConfigured) ?? []
  const routing = providersData?.routingMode ?? 'auto'
  const providerLabel =
    routing === 'auto'
      ? `Auto router · ${configured.length} provider${configured.length === 1 ? '' : 's'}`
      : (providersData?.providers?.find((p) => p.id === routing)?.name ?? routing)

  const nav: NavItem[] = [
    { id: 'home', label: 'Home', icon: Home, view: 'home' },
    { id: 'github', label: 'GitHub Explorer', icon: Github, view: 'github', badge: 'New' },
    { id: 'api-fetcher', label: 'API Fetcher', icon: Network, view: 'api-fetcher' },
    ...(activeTask ? [{ id: 'task', label: 'Current task', icon: Play, view: 'task' as AppView }] : []),
  ]

  // On phones the sidebar is always the icon rail — the full 264px would leave no room for the page.
  const narrow = useMedia('(max-width: 767px)')
  const collapsed = sidebarCollapsed || narrow

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 264 }}
      transition={springSnappy}
      aria-label="Sidebar"
      className="z-30 flex h-full shrink-0 select-none flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]"
    >
      {/* Brand + collapse */}
      <div className={cn('flex h-12 shrink-0 items-center border-b border-[var(--border-subtle)]', collapsed ? 'justify-center' : 'justify-between pl-4 pr-2')}>
        <button type="button" onClick={() => setCurrentView('home')} className="flex items-center gap-2.5 rounded-lg" aria-label="CodePilot AI — home">
          <BrandMark size={26} />
          {!collapsed && <Wordmark />}
        </button>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar (Ctrl+B)"
            title="Collapse sidebar (Ctrl+B)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {collapsed && !narrow && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Expand sidebar (Ctrl+B)"
          title="Expand sidebar (Ctrl+B)"
          className="mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* Workspace switcher */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => openProjectModalWithTab(activeProject ? 'recent' : 'open')}
          title={activeProject ? `${activeProject.name} — switch project` : 'Open a project'}
          aria-label={activeProject ? `Project ${activeProject.name}. Switch project` : 'Open a project'}
          className={cn(
            'group flex w-full items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-left hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
            collapsed ? 'h-10 justify-center' : 'gap-2.5 px-2.5 py-2'
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-text)]">
            <FolderGit2 size={15} />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--text-primary)]">
                  {activeProject ? activeProject.name : 'No project open'}
                </span>
                <span className="block truncate text-[11px] leading-tight text-[var(--text-muted)]">
                  {activeProject ? [activeProject.language, activeProject.framework].filter(Boolean).join(' · ') || 'Workspace' : 'Click to open or clone one'}
                </span>
              </span>
              <ChevronsUpDown size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
            </>
          )}
        </button>
      </div>

      {/* Primary navigation */}
      <nav aria-label="Primary" className="space-y-0.5 px-3 pt-3">
        {nav.map((item) => {
          const active = currentView === item.view
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentView(item.view)}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'relative flex h-9 w-full items-center rounded-lg text-[13px] font-medium',
                collapsed ? 'justify-center' : 'gap-2.5 px-2.5',
                active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              )}
            >
              {active && (
                <motion.span layoutId="sidebar-active" transition={springSnappy} className="absolute inset-0 rounded-lg bg-[var(--bg-card)] ring-1 ring-inset ring-[var(--border-subtle)]">
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[var(--accent-text)]" />
                </motion.span>
              )}
              <Icon size={16} className={cn('relative z-10 shrink-0', active ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]')} />
              {!collapsed && <span className="relative z-10 flex-1 truncate text-left">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="relative z-10 rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-[var(--accent-text)]">
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Recent tasks */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {!collapsed && (
          <>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Recent tasks</span>
              {tasks.length > 0 && <span className="font-mono text-[10.5px] text-[var(--text-muted)]">{tasks.length}</span>}
            </div>

            {activeProject && !tasksLoaded ? (
              <div className="space-y-1.5 px-1" aria-busy>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9" style={{ opacity: 1 - i * 0.25 }} />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <p className="px-1 text-xs leading-relaxed text-[var(--text-muted)]">
                {activeProject ? 'Nothing yet — describe a task on the Command screen.' : 'Open a project to see its tasks.'}
              </p>
            ) : (
              <ul className="space-y-0.5">
                <AnimatePresence initial={false}>
                  {tasks.slice(0, 10).map((task) => {
                    const selected = activeTask?.id === task.id && currentView === 'task'
                    return (
                      <motion.li
                        key={task.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={springSnappy}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTask(task)
                            setCurrentView('task')
                          }}
                          title={task.command}
                          aria-current={selected ? 'true' : undefined}
                          className={cn(
                            'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left',
                            selected ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-hover)]'
                          )}
                        >
                          <StatusGlyph status={task.status} size={14} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className={cn('block truncate text-xs leading-snug', selected ? 'font-medium text-[var(--accent-text)]' : 'text-[var(--text-primary)]')}>
                              {task.command}
                            </span>
                            <span className="block text-[10.5px] leading-tight text-[var(--text-muted)]">
                              {task.mode.toLowerCase()} · {formatDate(task.createdAt)}
                            </span>
                          </span>
                        </button>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}
          </>
        )}
      </div>

      {/* Footer: honest AI status + settings */}
      <div className="space-y-1 border-t border-[var(--border-subtle)] p-3">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={collapsed ? (configured.length ? providerLabel : 'No AI provider configured — open Settings') : undefined}
          className={cn(
            'flex w-full items-center rounded-lg text-left hover:bg-[var(--bg-hover)]',
            collapsed ? 'h-9 justify-center' : 'gap-2.5 px-2 py-1.5'
          )}
        >
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              providersLoading ? 'bg-[var(--text-muted)]' : configured.length ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'
            )}
            aria-hidden
          />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium leading-tight text-[var(--text-primary)]">
                {providersLoading ? 'Checking AI…' : configured.length ? 'AI ready' : 'No AI provider'}
              </span>
              <span className="block truncate text-[10.5px] leading-tight text-[var(--text-muted)]">
                {providersLoading ? ' ' : configured.length ? providerLabel : 'Add an API key in Settings'}
              </span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title={collapsed ? 'Settings (Ctrl+,)' : undefined}
          className={cn(
            'flex w-full items-center rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            collapsed ? 'h-9 justify-center' : 'gap-2.5 px-2 py-1.5'
          )}
        >
          <Settings size={16} className="shrink-0 text-[var(--text-muted)]" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Settings</span>
              <kbd className="font-mono text-[10px] text-[var(--text-muted)]">Ctrl ,</kbd>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  )
}
