import React from 'react'
import { AlertTriangle, RefreshCw, SearchX, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { useNow } from '@/hooks/useNow'
import { GithubApiError } from '../api'

function untilReset(resetAt: number, now: number): string {
  const s = Math.max(0, Math.round(resetAt - now / 1000))
  if (s <= 0) return 'now'
  const m = Math.floor(s / 60)
  return m >= 1 ? `in ${m} min` : `in ${s}s`
}

/** One place that turns any GitHub failure into a clear message and, when it makes sense, a retry. */
export function ErrorNotice({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const err = error instanceof GithubApiError ? error : null
  const rateLimited = err?.code === 'RATE_LIMITED' && err.resetAt
  const now = useNow(!!rateLimited, 1000)

  const Icon = err?.code === 'NOT_FOUND' ? SearchX : err?.code === 'NETWORK' || err?.code === 'TIMEOUT' ? WifiOff : AlertTriangle
  const title =
    err?.code === 'NOT_FOUND'
      ? 'Not found'
      : err?.code === 'RATE_LIMITED'
        ? 'GitHub rate limit reached'
        : err?.code === 'NETWORK' || err?.code === 'TIMEOUT'
          ? 'Can’t reach GitHub'
          : 'Something went wrong'
  const message = err?.message ?? (error instanceof Error ? error.message : 'Unexpected error')

  return (
    <div role="alert" className={`mx-auto flex max-w-lg flex-col items-center text-center ${compact ? 'py-8' : 'py-16'}`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--warning)]">
        <Icon size={20} />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{message}</p>
      {rateLimited && err?.resetAt && (
        <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">Resets {untilReset(err.resetAt, now)}</p>
      )}
      {onRetry && err?.code !== 'NOT_FOUND' && (
        <Button className="mt-4" size="sm" onClick={onRetry}>
          <RefreshCw size={12} /> Try again
        </Button>
      )}
    </div>
  )
}
