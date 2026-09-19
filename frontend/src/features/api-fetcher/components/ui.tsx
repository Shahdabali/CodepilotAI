import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Dialog from '@radix-ui/react-dialog'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Copy, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyText } from '../lib/download'
import { toast } from '../toast'
import { statusText, statusTone } from '../lib/format'
import type { HttpMethod } from '../types'

// ── Tooltip ──────────────────────────────────────────────────────────────────

export const TipProvider = ({ children }: { children: React.ReactNode }) => (
  <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
    {children}
  </Tooltip.Provider>
)

export function Tip({ label, children, side = 'bottom', shortcut }: { label: React.ReactNode; children: React.ReactElement; side?: 'top' | 'bottom' | 'left' | 'right'; shortcut?: string }) {
  if (!label) return children
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={6} className="af-tip">
          {label}
          {shortcut && <span className="af-kbd ml-2">{shortcut}</span>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

// ── Buttons ──────────────────────────────────────────────────────────────────

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'lg'; loading?: boolean }

export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'default', size = 'md', loading, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn('af-btn', variant === 'primary' && 'af-btn-primary', variant === 'danger' && 'af-btn-danger', variant === 'ghost' && 'af-btn-ghost', size === 'sm' && 'af-btn-sm', size === 'lg' && 'af-btn-lg', className)}
      {...rest}
    >
      {loading && <span className="af-spinner" />}
      {children}
    </button>
  )
})

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; tone?: 'danger'; tipSide?: 'top' | 'bottom' | 'left' | 'right' }>(function IconButton(
  { label, shortcut, tone, tipSide, className, children, type = 'button', ...rest },
  ref
) {
  return (
    <Tip label={label} shortcut={shortcut} side={tipSide}>
      <button ref={ref} type={type} aria-label={label} data-tone={tone} className={cn('af-icon-btn', className)} {...rest}>
        {children}
      </button>
    </Tip>
  )
})

export function useCopy(resetMs = 1400) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = useCallback(
    async (text: string, message = 'Copied to clipboard') => {
      const ok = await copyText(text)
      if (ok) {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), resetMs)
        toast.success(message)
      } else toast.error('Copy failed', 'Your browser blocked clipboard access.')
    },
    [resetMs]
  )
  return { copied, copy }
}

export function CopyButton({ text, label = 'Copy', className, message }: { text: string | (() => string); label?: string; className?: string; message?: string }) {
  const { copied, copy } = useCopy()
  return (
    <IconButton label={label} className={className} onClick={() => copy(typeof text === 'function' ? text() : text, message)}>
      {copied ? <Check size={14} className="text-[var(--af-ok)]" /> : <Copy size={14} />}
    </IconButton>
  )
}

// ── Badges ───────────────────────────────────────────────────────────────────

export const MethodBadge = ({ method, className }: { method: HttpMethod | string; className?: string }) => (
  <span className={cn('af-method', `af-m-${method}`, className)}>{method === 'DELETE' ? 'DEL' : method}</span>
)

export function StatusBadge({ status, statusLabel, error }: { status: number | null | undefined; statusLabel?: string | null; error?: boolean }) {
  if (!status || error) return <span className="af-badge" data-tone="err">ERR</span>
  return (
    <span className="af-badge af-mono" data-tone={statusTone(status)} title={`${status} ${statusText(status, statusLabel ?? undefined)}`}>
      {status}
    </span>
  )
}

export const Badge = ({ tone, children, className, title }: { tone?: 'ok' | 'info' | 'warn' | 'err' | 'accent'; children: React.ReactNode; className?: string; title?: string }) => (
  <span className={cn('af-badge', className)} data-tone={tone} title={title}>
    {children}
  </span>
)

export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="af-kbd">{children}</kbd>

// ── Feedback ─────────────────────────────────────────────────────────────────

export const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => <div className={cn('af-skeleton', className)} style={style} />

export const Spinner = ({ className }: { className?: string }) => <span className={cn('af-spinner', className)} />

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="af-empty af-fade-in">
      {icon && <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--af-sunken)] text-[var(--af-text-3)]">{icon}</div>}
      <div className="text-[12.5px] font-semibold text-[var(--af-text-2)]">{title}</div>
      {description && <div className="max-w-[300px] text-[11.5px] leading-relaxed">{description}</div>}
      {action}
    </div>
  )
}

export function Callout({ tone, icon, children, className }: { tone?: 'err' | 'warn' | 'info' | 'ok'; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('af-callout', className)} data-tone={tone}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// ── Tabs / segmented ─────────────────────────────────────────────────────────

export function TabBar<T extends string>({ tabs, value, onChange, className, right }: { tabs: Array<{ id: T; label: React.ReactNode; count?: number; dot?: boolean }>; value: T; onChange: (t: T) => void; className?: string; right?: React.ReactNode }) {
  return (
    <div className={cn('af-tabs', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} data-active={value === t.id} className="af-tab" onClick={() => onChange(t.id)}>
          {t.label}
          {!!t.count && <span className="af-tab-count">{t.count}</span>}
          {t.dot && <span className="h-1.5 w-1.5 rounded-full bg-[var(--af-accent-text)]" />}
        </button>
      ))}
      {right && <div className="ml-auto flex items-center gap-1 pr-2">{right}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ id: T; label: React.ReactNode }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="af-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} data-active={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const Toggle = ({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) => (
  <label className="flex cursor-pointer items-start gap-2.5">
    <input type="checkbox" className="af-check mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="min-w-0">
      <span className="block text-[12px] text-[var(--af-text)]">{label}</span>
      {description && <span className="block text-[11px] leading-snug text-[var(--af-text-3)]">{description}</span>}
    </span>
  </label>
)

export const Field = ({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <label className={cn('block', className)}>
    <span className="mb-1 block text-[11px] font-medium text-[var(--af-text-2)]">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[10.5px] leading-snug text-[var(--af-text-3)]">{hint}</span>}
  </label>
)

// ── Dialog ───────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  width = 560,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  width?: number
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="af-overlay" />
        <Dialog.Content className="af-dialog" style={{ ['--af-dialog-w' as string]: `${width}px` }}>
          <div className="af-dialog-head">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[14px] font-semibold text-[var(--af-text)]">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-[11.5px] text-[var(--af-text-3)]">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <button type="button" className="af-icon-btn" aria-label="Close">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <div className="af-dialog-body">{children}</div>
          {footer && <div className="af-dialog-foot">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      width={440}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[12px] leading-relaxed text-[var(--af-text-2)]">{description}</div>
    </Modal>
  )
}

// ── Menu ─────────────────────────────────────────────────────────────────────

export const Menu = Dropdown.Root
export const MenuTrigger = Dropdown.Trigger
export const MenuContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof Dropdown.Content>>(function MenuContent({ className, sideOffset = 4, ...rest }, ref) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content ref={ref} sideOffset={sideOffset} className={cn('af-menu', className)} {...rest} />
    </Dropdown.Portal>
  )
})
export const MenuItem = ({ icon, children, tone, ...rest }: React.ComponentPropsWithoutRef<typeof Dropdown.Item> & { icon?: React.ReactNode; tone?: 'danger' }) => (
  <Dropdown.Item className="af-menu-item" style={tone === 'danger' ? { color: 'var(--af-err)' } : undefined} {...rest}>
    {icon && <span className="grid w-4 place-items-center text-[var(--af-text-3)]">{icon}</span>}
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </Dropdown.Item>
)
export const MenuSeparator = () => <Dropdown.Separator className="af-menu-sep" />
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <Dropdown.Label className="af-menu-label">{children}</Dropdown.Label>
export const MenuSub = ({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <Dropdown.Sub>
    <Dropdown.SubTrigger className="af-menu-item">
      {icon && <span className="grid w-4 place-items-center text-[var(--af-text-3)]">{icon}</span>}
      <span className="flex-1">{label}</span>
      <ChevronRight size={13} className="text-[var(--af-text-3)]" />
    </Dropdown.SubTrigger>
    <Dropdown.Portal>
      <Dropdown.SubContent className="af-menu" sideOffset={6} style={{ maxHeight: 320, overflowY: 'auto' }}>
        {children}
      </Dropdown.SubContent>
    </Dropdown.Portal>
  </Dropdown.Sub>
)
export const MenuCheckboxItem = ({ checked, children, ...rest }: React.ComponentPropsWithoutRef<typeof Dropdown.CheckboxItem>) => (
  <Dropdown.CheckboxItem checked={checked} className="af-menu-item" {...rest}>
    <span className="grid w-4 place-items-center">{checked && <Check size={13} />}</span>
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </Dropdown.CheckboxItem>
)

/** Small "is the pointer/focus inside" helper used for inline rename inputs. */
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.focus()
    if (ref.current instanceof HTMLInputElement) ref.current.select()
  }, [])
  return ref
}
