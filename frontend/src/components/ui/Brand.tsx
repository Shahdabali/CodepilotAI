import React from 'react'
import { cn } from '@/lib/utils'

/**
 * The in-app brand mark, drawn in code so it follows the theme. (The bitmap logo has a dark wordmark that
 * disappears on the dark theme; it stays as the favicon.)
 */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="CodePilot AI"
      className={cn('shrink-0', className)}
    >
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--accent)" />
      <path d="M11 10.5 18 16l-7 5.5" fill="none" stroke="var(--on-accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 22h4.5" stroke="var(--on-accent)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1 whitespace-nowrap text-[15px] font-semibold tracking-tight text-[var(--text-primary)]', className)}>
      CodePilot
      <span className="rounded bg-[var(--accent-subtle)] px-1 py-px font-mono text-[10px] font-semibold tracking-normal text-[var(--accent-text)]">AI</span>
    </span>
  )
}
