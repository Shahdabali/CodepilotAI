import React, { useEffect, useRef } from 'react'
import { useTaskStore } from '@/stores/task.store'
import type { AgentEvent, AgentStage } from '@/types'
import { cn, getStageIcon, formatDate } from '@/lib/utils'

const STAGES: AgentStage[] = [
  'UNDERSTANDING', 'PLANNING', 'INSPECTING', 'IMPLEMENTING',
  'RUNNING', 'TESTING', 'DEBUGGING', 'OPTIMIZING', 'VERIFYING',
]

function stageLabel(s: AgentStage) {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

export function AgentPanel() {
  const activeTask = useTaskStore((s) => s.activeTask)
  const agentEvents = useTaskStore((s) => s.agentEvents)
  const logRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [agentEvents])

  if (!activeTask) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] flex-col gap-3">
        <div className="text-5xl opacity-20">🤖</div>
        <p className="text-sm font-medium">No active task</p>
        <p className="text-xs opacity-60">Enter a command below to get started</p>
      </div>
    )
  }

  const currentStage = activeTask.currentStage
  const isComplete = activeTask.status === 'COMPLETED'
  const isFailed = activeTask.status === 'FAILED'

  const stageStatuses = STAGES.map((stage) => {
    const events = agentEvents.filter((e) => e.stage === stage)
    if (currentStage === stage && !isComplete && !isFailed) return 'active'
    if (events.some((e) => e.type === 'error') || (isFailed && currentStage === stage)) return 'failed'
    if (isComplete || (currentStage && STAGES.indexOf(currentStage) > STAGES.indexOf(stage))) return 'done'
    return 'pending'
  })

  const filesChanged = [...new Set(
    agentEvents
      .filter((e) => e.type === 'file_change' && e.data?.filePath)
      .map((e) => e.data!.filePath as string)
  )]

  const errorEvents = agentEvents.filter((e) => e.type === 'error')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Task header */}
      <div className="px-3 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            isComplete ? 'bg-green-500/20 text-green-400' :
            isFailed ? 'bg-red-500/20 text-red-400' :
            'bg-[var(--accent)]/20 text-[var(--accent)]'
          )}>
            {activeTask.mode}
          </span>
          {activeTask.iterationCount > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              Iteration {activeTask.iterationCount}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-primary)] font-medium leading-snug line-clamp-2">
          {activeTask.command}
        </p>
      </div>

      {/* Stage progress */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] shrink-0">
        <div className="flex flex-col gap-1">
          {STAGES.map((stage, i) => {
            const status = stageStatuses[i]
            return (
              <div key={stage} className="flex items-center gap-2">
                <div className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px]',
                  status === 'done' && 'bg-green-500/20 text-green-400',
                  status === 'active' && 'bg-[var(--accent)]/20 text-[var(--accent)]',
                  status === 'failed' && 'bg-red-500/20 text-red-400',
                  status === 'pending' && 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                )}>
                  {status === 'done' ? '✓' :
                   status === 'failed' ? '✗' :
                   status === 'active' ? '●' : '○'}
                </div>
                <span className={cn(
                  'text-xs',
                  status === 'active' ? 'text-[var(--accent)] font-medium' :
                  status === 'done' ? 'text-[var(--text-secondary)]' :
                  status === 'failed' ? 'text-red-400' :
                  'text-[var(--text-muted)]'
                )}>
                  {stageLabel(stage)}
                </span>
                {status === 'active' && (
                  <div className="w-3 h-3 ml-auto border border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Scrollable log */}
      <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {agentEvents.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-4">Waiting for agent…</p>
        ) : (
          agentEvents.map((event, i) => (
            <EventRow key={i} event={event} />
          ))
        )}
      </div>

      {/* Footer: files changed + errors */}
      {(filesChanged.length > 0 || errorEvents.length > 0) && (
        <div className="border-t border-[var(--border-color)] px-3 py-2 shrink-0 bg-[var(--bg-secondary)]">
          {filesChanged.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                📝 Files changed ({filesChanged.length})
              </p>
              {filesChanged.map((f) => (
                <p key={f} className="text-xs font-mono text-[var(--text-muted)] truncate">
                  {f.split(/[\\/]/).pop()}
                </p>
              ))}
            </div>
          )}
          {errorEvents.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1">⚠ Errors</p>
              {errorEvents.slice(-2).map((e, i) => (
                <p key={i} className="text-xs text-red-300 truncate">{e.message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completion summary */}
      {isComplete && activeTask.summary && (
        <div className="border-t border-green-500/30 px-3 py-2 bg-green-500/5 shrink-0">
          <p className="text-xs font-semibold text-green-400 mb-1">✅ Task Complete</p>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{activeTask.summary}</p>
        </div>
      )}
    </div>
  )
}

function EventRow({ event }: { event: AgentEvent }) {
  const icon =
    event.type === 'error' ? '❌' :
    event.type === 'file_change' ? '📝' :
    event.type === 'command_run' ? '▶' :
    event.type === 'test_result' ? '🧪' :
    event.type === 'complete' ? '✅' :
    event.type === 'stage_change' ? getStageIcon(event.stage) : '›'

  return (
    <div className={cn(
      'flex items-start gap-2 text-xs leading-relaxed py-0.5',
      event.type === 'error' ? 'text-red-300' :
      event.type === 'complete' ? 'text-green-300' :
      event.type === 'stage_change' ? 'text-[var(--accent)] font-medium' :
      'text-[var(--text-secondary)]'
    )}>
      <span className="shrink-0 mt-0.5 w-3 text-center">{icon}</span>
      <span className="flex-1 break-words">{event.message}</span>
    </div>
  )
}
