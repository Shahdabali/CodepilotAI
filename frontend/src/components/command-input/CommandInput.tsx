import React, { useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { api } from '@/lib/api'
import { cn, getLanguageIcon } from '@/lib/utils'
import type { AgentMode } from '@/types'

const MODES: { id: AgentMode; label: string; icon: string; description: string }[] = [
  { id: 'BUILD', label: 'Build', icon: '🏗️', description: 'Scaffold and implement new features' },
  { id: 'FIX', label: 'Fix', icon: '🔧', description: 'Find and repair bugs' },
  { id: 'OPTIMIZE', label: 'Optimize', icon: '⚡', description: 'Improve performance and quality' },
  { id: 'EXPLAIN', label: 'Explain', icon: '📖', description: 'Explain code and architecture' },
  { id: 'TEST', label: 'Test', icon: '🧪', description: 'Generate and run tests' },
  { id: 'REFACTOR', label: 'Refactor', icon: '♻️', description: 'Improve structure without changing behavior' },
  { id: 'REVIEW', label: 'Review', icon: '👀', description: 'Perform a code review' },
  { id: 'AUTONOMOUS', label: 'Auto', icon: '🤖', description: 'Full pipeline, minimal interaction' },
]

const EXAMPLES = [
  'Build a REST API for user authentication using JWT tokens.',
  'Find why this application is slow and optimize it.',
  'Fix all TypeScript errors in this project.',
  'Add comprehensive unit tests to the auth module.',
  'Refactor the database layer to use the repository pattern.',
  'Review the code for security vulnerabilities.',
]

export function CommandInput() {
  const [command, setCommand] = useState('')
  const [mode, setMode] = useState<AgentMode>('BUILD')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * EXAMPLES.length))

  const activeProject = useProjectStore((s) => s.activeProject)
  const activeTask = useTaskStore((s) => s.activeTask)
  const addTask = useTaskStore((s) => s.addTask)
  const setCenterTab = useUIStore((s) => s.setCenterTab)
  const setRightPanelVisible = useUIStore((s) => s.setRightPanelVisible)

  const isRunning = activeTask?.status === 'RUNNING' || activeTask?.status === 'PENDING'

  const handleSubmit = useCallback(async () => {
    if (!command.trim() || !activeProject || loading) return
    setLoading(true)
    setError(null)
    try {
      const task = await api.tasks.create(activeProject.id, { command: command.trim(), mode })
      addTask(task)
      setCommand('')
      setCenterTab('agent')
      setRightPanelVisible(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [command, activeProject, mode, loading, addTask, setCenterTab, setRightPanelVisible])

  const handleCancel = useCallback(async () => {
    if (!activeTask) return
    try {
      await api.tasks.cancel(activeTask.id)
    } catch {
      // ignore
    }
  }, [activeTask])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
      {/* Mode selector */}
      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            title={m.description}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors',
              mode === m.id
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]'
            )}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* Command textarea */}
      <div className="relative">
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder={EXAMPLES[placeholderIdx]}
          rows={3}
          className={cn(
            'w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 pr-20 text-sm',
            'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
            'focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]',
            'resize-none transition-colors font-sans',
            isRunning && 'opacity-50 cursor-not-allowed'
          )}
        />

        {/* Submit / Cancel button */}
        <div className="absolute right-2 bottom-2">
          {isRunning ? (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/30 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!command.trim() || !activeProject || loading}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                command.trim() && activeProject && !loading
                  ? 'bg-[var(--accent)] text-white hover:opacity-90'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
              )}
            >
              {loading ? (
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>▶</span>
              )}
              <span>{loading ? 'Starting…' : 'Execute'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-2">
          {activeProject && (
            <span className="text-xs text-[var(--text-muted)]">
              {getLanguageIcon(activeProject.language)} {activeProject.name}
            </span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
        <span className="text-xs text-[var(--text-muted)]">Ctrl+Enter to execute</span>
      </div>
    </div>
  )
}
