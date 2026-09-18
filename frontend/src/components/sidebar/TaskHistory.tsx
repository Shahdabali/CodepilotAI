import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { cn, formatDate, getStatusDot } from '@/lib/utils'
import type { Task } from '@/types'

export function TaskHistory() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const setActiveTask = useTaskStore((s) => s.setActiveTask)
  const activeTask = useTaskStore((s) => s.activeTask)

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', activeProject?.id],
    queryFn: () => api.tasks.list(activeProject!.id),
    enabled: !!activeProject,
    refetchInterval: activeTask?.status === 'RUNNING' ? 2000 : false,
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1.5 border-b border-[var(--border-color)]">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">History</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-6">No tasks yet</p>
        ) : (
          tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => setActiveTask(task)}
              className={cn(
                'w-full px-2 py-2 text-left border-b border-[var(--border-color)]/40 hover:bg-[var(--bg-tertiary)] transition-colors',
                activeTask?.id === task.id && 'bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', getStatusDot(task.status))} />
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{task.mode}</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-auto">{formatDate(task.createdAt)}</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-snug line-clamp-2">{task.command}</p>
              {task.filesChanged.length > 0 && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  {task.filesChanged.length} file{task.filesChanged.length !== 1 ? 's' : ''} changed
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
