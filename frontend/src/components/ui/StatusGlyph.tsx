import React from 'react'
import { AlertCircle, Ban, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types'

/** One consistent status indicator for tasks: spinning ring, check, alert, ban, or a quiet dot. */
export function StatusGlyph({ status, size = 14, className }: { status: TaskStatus; size?: number; className?: string }) {
  const label = status.toLowerCase()
  if (status === 'RUNNING' || status === 'PENDING') {
    return (
      <span role="img" aria-label={label} className={cn('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
        <span
          className="block animate-spin rounded-full border-2 border-[var(--accent-text)] border-t-transparent"
          style={{ width: size - 2, height: size - 2 }}
        />
      </span>
    )
  }
  const common = { size, className: cn('shrink-0', className), role: 'img', 'aria-label': label } as const
  if (status === 'COMPLETED') return <CheckCircle2 {...common} className={cn(common.className, 'text-[var(--success)]')} />
  if (status === 'FAILED') return <AlertCircle {...common} className={cn(common.className, 'text-[var(--danger)]')} />
  if (status === 'CANCELLED') return <Ban {...common} className={cn(common.className, 'text-[var(--warning)]')} />
  return <Circle {...common} className={cn(common.className, 'text-[var(--text-muted)]')} />
}
