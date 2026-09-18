import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useTaskStore } from '@/stores/task.store'
import { useProjectStore } from '@/stores/project.store'
import type { FileDiff } from '@/types'
import { cn } from '@/lib/utils'

export function DiffViewer() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const activeTask = useTaskStore((s) => s.activeTask)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)

  const { data: diffs = [], isLoading } = useQuery({
    queryKey: ['diffs', activeTask?.id],
    queryFn: () => api.tasks.getDiffs(activeTask!.id),
    enabled: !!activeTask?.id,
  })

  const totalAdditions = diffs.reduce((s, d) => s + d.additions, 0)
  const totalDeletions = diffs.reduce((s, d) => s + d.deletions, 0)

  const currentDiff = selectedFile
    ? diffs.find((d) => d.filePath === selectedFile)
    : diffs[0]

  async function handleRollback() {
    if (!activeTask) return
    setRejecting(true)
    try {
      await api.tasks.rollback(activeTask.id)
    } catch {
      // ignore
    } finally {
      setRejecting(false)
    }
  }

  if (!activeTask) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] flex-col gap-3">
        <div className="text-5xl opacity-30">📊</div>
        <p className="text-sm">No active task</p>
        <p className="text-xs opacity-60">Start a task to see file changes</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (diffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] flex-col gap-3">
        <div className="text-4xl opacity-30">✨</div>
        <p className="text-sm">No file changes yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
          </span>
          <span className="text-xs text-green-400">+{totalAdditions}</span>
          <span className="text-xs text-red-400">-{totalDeletions}</span>
        </div>
        <button
          onClick={handleRollback}
          disabled={rejecting}
          className="text-xs px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
        >
          {rejecting ? 'Rolling back…' : 'Rollback all'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File list */}
        <div className="w-48 border-r border-[var(--border-color)] overflow-y-auto shrink-0 bg-[var(--bg-secondary)]">
          {diffs.map((diff) => (
            <button
              key={diff.filePath}
              onClick={() => setSelectedFile(diff.filePath)}
              className={cn(
                'w-full px-3 py-2 text-left text-xs border-b border-[var(--border-color)]/50 transition-colors',
                (selectedFile === diff.filePath || (!selectedFile && diff === diffs[0]))
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              )}
            >
              <div className="font-mono truncate">{diff.filePath.split('/').pop() || diff.filePath.split('\\').pop()}</div>
              <div className="flex gap-2 mt-0.5">
                {diff.isNew && <span className="text-green-400">NEW</span>}
                {diff.isDeleted && <span className="text-red-400">DEL</span>}
                {!diff.isNew && !diff.isDeleted && (
                  <>
                    <span className="text-green-400">+{diff.additions}</span>
                    <span className="text-red-400">-{diff.deletions}</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto p-0 font-mono text-xs">
          {currentDiff && <DiffContent diff={currentDiff} />}
        </div>
      </div>
    </div>
  )
}

function DiffContent({ diff }: { diff: FileDiff }) {
  const lines = diff.diff.split('\n')
  return (
    <div className="min-w-0">
      <div className="px-3 py-1.5 text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)]/50 border-b border-[var(--border-color)] sticky top-0">
        {diff.filePath}
      </div>
      {lines.map((line, i) => {
        const isAdd = line.startsWith('+') && !line.startsWith('+++')
        const isDel = line.startsWith('-') && !line.startsWith('---')
        const isHunk = line.startsWith('@@')
        return (
          <div
            key={i}
            className={cn(
              'px-3 py-0.5 leading-5 whitespace-pre-wrap break-all',
              isAdd && 'bg-green-500/10 text-green-300',
              isDel && 'bg-red-500/10 text-red-300',
              isHunk && 'bg-[var(--accent)]/10 text-[var(--accent)] text-xs py-1',
              !isAdd && !isDel && !isHunk && 'text-[var(--text-secondary)]'
            )}
          >
            {line || ' '}
          </div>
        )
      })}
    </div>
  )
}
