import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import type { FileDiff } from '@/types'
import { cn } from '@/lib/utils'
import { Check, X, RotateCcw, FileText, CheckCircle2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'

export function DiffViewer() {
  const activeTask = useTaskStore((s) => s.activeTask)
  const { setWorkspaceTab } = useUIStore()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [reverting, setReverting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [confirmingRevert, setConfirmingRevert] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const { data: diffs = [], isLoading, refetch } = useQuery({
    queryKey: ['diffs', activeTask?.id],
    queryFn: () => api.tasks.getDiffs(activeTask!.id),
    enabled: !!activeTask?.id,
  })

  const totalAdditions = diffs.reduce((s, d) => s + d.additions, 0)
  const totalDeletions = diffs.reduce((s, d) => s + d.deletions, 0)

  const currentDiff = selectedFile
    ? diffs.find((d) => d.filePath === selectedFile)
    : diffs[0]

  const handleAccept = () => {
    setAccepted(true)
    setActionMessage('Changes accepted and kept in project.')
    setTimeout(() => setActionMessage(null), 3500)
  }

  const handleRevert = async () => {
    if (!activeTask) return
    setReverting(true)
    setActionMessage(null)
    try {
      await api.tasks.rollback(activeTask.id)
      setActionMessage('All changes reverted back to previous state.')
      toast.success('Changes reverted', 'The files are back to how they were before this task.')
      refetch()
    } catch (err: any) {
      setActionMessage('Failed to revert changes.')
      toast.error('Could not revert the changes', err?.message)
    } finally {
      setReverting(false)
      setConfirmingRevert(false)
    }
  }

  if (!activeTask) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] flex-col gap-2 p-6">
        <p className="text-sm font-medium">No active task</p>
        <p className="text-xs">Run a task to review generated code changes.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (diffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] flex-col gap-2 p-6">
        <p className="text-sm font-medium">No file changes recorded</p>
        <p className="text-xs">This task did not modify any files.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      {/* Review Actions Top Bar */}
      <div className="h-12 px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {diffs.length} {diffs.length === 1 ? 'file' : 'files'} changed
          </span>
          <span className="text-xs font-mono font-medium text-[var(--success)]">
            +{totalAdditions}
          </span>
          <span className="text-xs font-mono font-medium text-[var(--danger)]">
            -{totalDeletions}
          </span>
          {actionMessage && (
            <span className="text-xs text-[var(--accent)] animate-in fade-in ml-2">
              {actionMessage}
            </span>
          )}
        </div>

        {/* [ Accept ] [ Reject ] [ Revert ] Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepted}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--success)]/15 text-[var(--success)] hover:bg-[var(--success)]/25 border border-[var(--success)]/30 transition-colors disabled:opacity-50"
          >
            <Check size={13} />
            <span>{accepted ? 'Accepted' : 'Accept'}</span>
          </button>
          {confirmingRevert ? (
            <div className="flex items-center gap-1.5" role="alertdialog" aria-label="Confirm revert">
              <span className="text-xs text-[var(--text-secondary)]">Restore every file to before this task?</span>
              <button
                type="button"
                onClick={handleRevert}
                disabled={reverting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--danger)] text-white hover:brightness-110 transition disabled:opacity-50"
              >
                <RotateCcw size={13} />
                <span>{reverting ? 'Reverting…' : 'Yes, revert'}</span>
              </button>
              <button type="button" onClick={() => setConfirmingRevert(false)} disabled={reverting} className="px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                Keep changes
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRevert(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 border border-[var(--danger)]/20 transition-colors"
            >
              <RotateCcw size={13} />
              <span>Revert</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Diff Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Navigator Sidebar */}
        <div className="w-56 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-y-auto shrink-0 py-1">
          {diffs.map((diff) => {
            const fileName = diff.filePath.split(/[\\/]/).pop() || diff.filePath
            const isSelected = selectedFile === diff.filePath || (!selectedFile && diff === diffs[0])

            return (
              <button
                key={diff.filePath}
                onClick={() => setSelectedFile(diff.filePath)}
                className={cn(
                  'w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between gap-2',
                  isSelected
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium border-l-2 border-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={13} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="truncate font-mono text-[11px]">{fileName}</span>
                </div>
                <div className="flex items-center gap-1 font-mono text-[10px] shrink-0">
                  {diff.isNew ? (
                    <span className="text-[var(--success)] font-semibold">NEW</span>
                  ) : diff.isDeleted ? (
                    <span className="text-[var(--danger)] font-semibold">DEL</span>
                  ) : (
                    <>
                      <span className="text-[var(--success)]">+{diff.additions}</span>
                      <span className="text-[var(--danger)]">-{diff.deletions}</span>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Diff Hunks Display */}
        <div className="flex-1 overflow-auto bg-[var(--bg-input)] font-mono text-xs p-2">
          {currentDiff && <DiffHunks diff={currentDiff} />}
        </div>
      </div>
    </div>
  )
}

function DiffHunks({ diff }: { diff: FileDiff }) {
  // Tolerate either field name, and drop createPatch's "Index / === / --- / +++" preamble so the view starts at the first hunk.
  const raw = (diff.diff ?? (diff as { patch?: string }).patch ?? '').split('\n')
  const firstHunk = raw.findIndex((l) => l.startsWith('@@'))
  const lines = (firstHunk > 0 ? raw.slice(firstHunk) : raw).filter((l) => !l.startsWith('\\ No newline'))
  if (lines.length && lines[lines.length - 1] === '') lines.pop()

  return (
    <div className="min-w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="px-3.5 py-2 text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-card)] border-b border-[var(--border-subtle)] flex items-center justify-between">
        <span className="truncate">{diff.filePath}</span>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[var(--success)] font-mono">+{diff.additions}</span>
          <span className="text-[var(--danger)] font-mono">-{diff.deletions}</span>
        </div>
      </div>

      <div className="divide-y divide-[var(--border-subtle)]/30">
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++')
          const isDel = line.startsWith('-') && !line.startsWith('---')
          const isHunk = line.startsWith('@@')

          return (
            <div
              key={i}
              className={cn(
                'px-3.5 py-1 leading-relaxed whitespace-pre-wrap break-all flex items-start gap-3',
                isAdd && 'bg-[var(--success)]/10 text-[var(--success)] font-medium',
                isDel && 'bg-[var(--danger)]/10 text-[var(--danger)] line-through opacity-80',
                isHunk && 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold text-[11px] py-1.5',
                !isAdd && !isDel && !isHunk && 'text-[var(--text-secondary)]'
              )}
            >
              <span className="w-8 text-[10px] text-[var(--text-muted)] select-none text-right shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 font-mono">{line || ' '}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
