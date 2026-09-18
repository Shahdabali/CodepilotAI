import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project.store'
import { cn } from '@/lib/utils'

export function GitPanel() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['git-status', activeProject?.id],
    queryFn: () => api.git.getStatus(activeProject!.id),
    enabled: !!activeProject,
    refetchInterval: 5000,
  })

  async function handleCommit() {
    if (!activeProject || !commitMsg.trim()) return
    setCommitting(true)
    setError(null)
    try {
      await api.git.commit(activeProject.id, commitMsg.trim())
      setCommitMsg('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      refetch()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCommitting(false)
    }
  }

  if (!activeProject) {
    return <div className="p-3 text-xs text-[var(--text-muted)]">No project open</div>
  }

  if (isLoading) {
    return <div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!status?.isRepo) {
    return <div className="p-3 text-xs text-[var(--text-muted)]">Not a git repository</div>
  }

  const allChanges = [
    ...status.staged.map((f) => ({ file: f, state: 'staged' as const })),
    ...status.unstaged.map((f) => ({ file: f, state: 'unstaged' as const })),
    ...status.untracked.map((f) => ({ file: f, state: 'untracked' as const })),
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border-color)]">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Git</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] font-mono">
            🌿 {status.branch ?? 'detached'}
          </span>
          <button onClick={() => refetch()} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs p-0.5">↻</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {allChanges.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-6">No changes</p>
        ) : (
          <div className="py-1">
            {allChanges.map(({ file, state }) => (
              <div key={`${state}-${file}`} className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--bg-tertiary)] text-xs">
                <span className={cn(
                  'font-mono text-[10px] px-1 rounded shrink-0',
                  state === 'staged' ? 'text-green-400 bg-green-500/10' :
                  state === 'untracked' ? 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]' :
                  'text-yellow-400 bg-yellow-500/10'
                )}>
                  {state === 'staged' ? 'S' : state === 'untracked' ? 'U' : 'M'}
                </span>
                <span className="font-mono text-[var(--text-secondary)] truncate">{file.split(/[\\/]/).pop()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-color)] p-2 shrink-0">
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message…"
          rows={2}
          className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
        />
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        {success && <p className="text-xs text-green-400 mt-1">Committed ✓</p>}
        <button
          onClick={handleCommit}
          disabled={!commitMsg.trim() || committing}
          className="mt-1.5 w-full py-1 rounded bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {committing ? 'Committing…' : 'Commit'}
        </button>
      </div>
    </div>
  )
}
