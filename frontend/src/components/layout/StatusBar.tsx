import React from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { cn, getStatusColor } from '@/lib/utils'

export function StatusBar() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const activeTask = useTaskStore((s) => s.activeTask)
  const { selectedFile } = useUIStore()

  return (
    <div className="flex items-center justify-between h-6 px-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0 text-[10px] text-[var(--text-muted)]">
      {/* Left */}
      <div className="flex items-center gap-3">
        {activeProject && (
          <span className="font-mono">
            📁 {activeProject.name}
          </span>
        )}
        {selectedFile && (
          <span className="font-mono truncate max-w-[300px]">
            {selectedFile.split(/[\\/]/).slice(-2).join('/')}
          </span>
        )}
      </div>

      {/* Center — task stage */}
      {activeTask && (
        <div className="flex items-center gap-1.5 absolute left-1/2 -translate-x-1/2">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            activeTask.status === 'RUNNING' ? 'bg-blue-400 animate-pulse' :
            activeTask.status === 'COMPLETED' ? 'bg-green-400' :
            activeTask.status === 'FAILED' ? 'bg-red-400' : 'bg-[var(--text-muted)]'
          )} />
          <span className={cn('font-medium', getStatusColor(activeTask.status))}>
            {activeTask.currentStage
              ? `${activeTask.currentStage.charAt(0) + activeTask.currentStage.slice(1).toLowerCase()}`
              : activeTask.status}
          </span>
          {activeTask.iterationCount > 0 && (
            <span className="text-[var(--text-muted)]">· iter {activeTask.iterationCount}</span>
          )}
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-3">
        {activeProject?.language && <span>{activeProject.language}</span>}
        {activeProject?.framework && <span>{activeProject.framework}</span>}
        <span>CodePilot AI v0.1</span>
      </div>
    </div>
  )
}
