import React from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import {
  Plus,
  FolderOpen,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Code2
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

export function Sidebar() {
  const {
    theme,
    toggleTheme,
    sidebarCollapsed,
    toggleSidebar,
    setCurrentView,
    setSettingsOpen,
    setProjectModalOpen,
    setShortcutsModalOpen,
    currentView
  } = useUIStore()

  const { activeProject, projects } = useProjectStore()
  const { tasks, activeTask, setActiveTask } = useTaskStore()

  const handleNewTask = () => {
    setCurrentView('home')
  }

  const handleSelectTask = (task: typeof tasks[0]) => {
    setActiveTask(task)
    setCurrentView('task')
  }

  return (
    <aside
      className={cn(
        'h-screen flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] select-none transition-all duration-200 z-30 shrink-0',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-[var(--border-subtle)]">
        {!sidebarCollapsed ? (
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2.5 px-1 py-1 rounded hover:opacity-80 transition-opacity text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              ⚡
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
                CodePilot <span className="text-[var(--accent)] text-xs font-bold">AI</span>
              </span>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setCurrentView('home')}
            className="w-full flex justify-center py-1"
            title="CodePilot AI Home"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              ⚡
            </div>
          </button>
        )}

        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Primary Action: + New Task */}
      <div className="p-3">
        <button
          onClick={handleNewTask}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-all',
            'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm active:scale-[0.98]',
            sidebarCollapsed ? 'px-0' : 'px-3'
          )}
          title="New Task (Ctrl+N)"
        >
          <Plus size={16} strokeWidth={2.5} />
          {!sidebarCollapsed && <span>New Task</span>}
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {/* Project Section */}
        <div>
          {!sidebarCollapsed && (
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                Project
              </span>
              <button
                onClick={() => setProjectModalOpen(true)}
                className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                Switch
              </button>
            </div>
          )}

          {activeProject ? (
            <button
              onClick={() => setProjectModalOpen(true)}
              className={cn(
                'w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors',
                'bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
              )}
              title={sidebarCollapsed ? `${activeProject.name} (${activeProject.language || 'Project'})` : undefined}
            >
              <div className="w-7 h-7 rounded bg-[var(--bg-hover)] flex items-center justify-center shrink-0 text-[var(--text-secondary)]">
                <FolderOpen size={14} />
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {activeProject.name}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                    {activeProject.language || 'Ready'}
                  </p>
                </div>
              )}
            </button>
          ) : (
            <button
              onClick={() => setProjectModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
              title="Add Project"
            >
              <FolderOpen size={14} />
              {!sidebarCollapsed && <span>+ Add Project</span>}
            </button>
          )}
        </div>

        {/* Recent Tasks Section */}
        <div>
          {!sidebarCollapsed && (
            <div className="px-2 mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                Recent Tasks
              </span>
              {tasks.length > 0 && (
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  {tasks.length}
                </span>
              )}
            </div>
          )}

          {tasks.length === 0 ? (
            !sidebarCollapsed && (
              <p className="text-xs text-[var(--text-muted)] px-2 py-3 text-center leading-relaxed">
                No tasks yet. Describe what to build above!
              </p>
            )
          ) : (
            <div className="space-y-0.5">
              {tasks.slice(0, 10).map((task) => {
                const isSelected = activeTask?.id === task.id && currentView === 'task'
                const isRunning = task.status === 'RUNNING' || task.status === 'PENDING'
                const isComplete = task.status === 'COMPLETED'
                const isFailed = task.status === 'FAILED'

                return (
                  <button
                    key={task.id}
                    onClick={() => handleSelectTask(task)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left text-xs transition-colors',
                      isSelected
                        ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    )}
                    title={task.command}
                  >
                    <div className="shrink-0">
                      {isRunning && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                      )}
                      {isComplete && (
                        <CheckCircle2 size={13} className="text-[var(--success)]" />
                      )}
                      {isFailed && (
                        <AlertCircle size={13} className="text-[var(--danger)]" />
                      )}
                      {!isRunning && !isComplete && !isFailed && (
                        <Clock size={13} className="text-[var(--text-muted)]" />
                      )}
                    </div>
                    {!sidebarCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs leading-snug">{task.command}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                          {formatDate(task.createdAt)}
                        </p>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Utility Section */}
      <div className="p-2 border-t border-[var(--border-subtle)] space-y-0.5">
        <button
          onClick={() => setSettingsOpen(true)}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors',
            sidebarCollapsed && 'justify-center px-0'
          )}
          title="Settings (Ctrl+,)"
        >
          <Settings size={15} />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>

        <button
          onClick={() => setShortcutsModalOpen(true)}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors',
            sidebarCollapsed && 'justify-center px-0'
          )}
          title="Keyboard Shortcuts"
        >
          <HelpCircle size={15} />
          {!sidebarCollapsed && <span>Help & Shortcuts</span>}
        </button>

        <button
          onClick={toggleTheme}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors',
            sidebarCollapsed && 'justify-center px-0'
          )}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {!sidebarCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
      </div>
    </aside>
  )
}
