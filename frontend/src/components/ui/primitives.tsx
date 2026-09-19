import React, { useId } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { springSnappy } from '@/lib/motion'

/* ── Button ─────────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-card)]',
  secondary:
    'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)]',
  ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
  danger: 'bg-[var(--danger)] text-white hover:brightness-110',
}
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 rounded-lg px-2.5 text-xs',
  md: 'h-9 gap-2 rounded-xl px-3.5 text-[13px]',
  lg: 'h-11 gap-2 rounded-xl px-5 text-sm',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, className, children, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'cp-press inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" />}
      {children}
    </button>
  )
})

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'cp-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/* ── Small pieces ──────────────────────────────────────────────────────────── */

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-card)] px-1 font-mono text-[10px] font-medium text-[var(--text-secondary)]',
        className
      )}
    >
      {children}
    </kbd>
  )
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} aria-hidden />
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('cp-skeleton', className)} style={style} aria-hidden />
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const tones = {
    neutral: 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
    accent: 'bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[color-mix(in_srgb,var(--accent-text)_28%,transparent)]',
    success: 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]',
    warning: 'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]',
    danger: 'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] font-medium leading-none', tones[tone], className)}>
      {children}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ── Segmented control (animated pill) ─────────────────────────────────────── */

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  hint?: string
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentedOption<T>[]
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const group = useId()
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative rounded-[10px] font-medium',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                transition={springSnappy}
                className="absolute inset-0 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Tabs with a sliding underline ─────────────────────────────────────────── */

export interface TabItem<T extends string> {
  value: T
  label: React.ReactNode
  badge?: React.ReactNode
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: TabItem<T>[]
  ariaLabel: string
  className?: string
}) {
  const group = useId()
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = items[(index + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
    onChange(next.value)
    refs.current[next.value]?.focus()
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex items-center gap-1 border-b border-[var(--border-subtle)]', className)}>
      {items.map((item, i) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[item.value] = el
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium',
              active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {item.label}
            {item.badge}
            {active && (
              <motion.span
                layoutId={`tab-${group}`}
                transition={springSnappy}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent-text)]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
