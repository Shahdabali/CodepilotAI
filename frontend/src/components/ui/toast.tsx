import React from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { springSnappy } from '@/lib/motion'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number
  dismiss: (id: number) => void
}

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++
    const duration = t.duration ?? (t.kind === 'error' ? 7000 : 4000)
    // Newest first, capped so a burst of errors can't bury the screen.
    set((s) => ({ toasts: [{ ...t, id, duration }, ...s.toasts].slice(0, 4) }))
    if (duration > 0) timers.set(id, setTimeout(() => get().dismiss(id), duration))
    return id
  },
  dismiss: (id) => {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

/** Imperative helpers usable from anywhere (stores, event handlers, effects). */
export const toast = {
  success: (title: string, description?: string, extra?: Partial<Pick<Toast, 'action' | 'duration'>>) =>
    useToastStore.getState().push({ kind: 'success', title, description, ...extra }),
  error: (title: string, description?: string, extra?: Partial<Pick<Toast, 'action' | 'duration'>>) =>
    useToastStore.getState().push({ kind: 'error', title, description, ...extra }),
  info: (title: string, description?: string, extra?: Partial<Pick<Toast, 'action' | 'duration'>>) =>
    useToastStore.getState().push({ kind: 'info', title, description, ...extra }),
  warning: (title: string, description?: string, extra?: Partial<Pick<Toast, 'action' | 'duration'>>) =>
    useToastStore.getState().push({ kind: 'warning', title, description, ...extra }),
}

const ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-[var(--success)]" />,
  error: <XCircle size={16} className="text-[var(--danger)]" />,
  info: <Info size={16} className="text-[var(--accent-text)]" />,
  warning: <AlertTriangle size={16} className="text-[var(--warning)]" />,
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
            transition={springSnappy}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 pr-9 shadow-[var(--shadow-pop)]'
            )}
          >
            <span className="mt-0.5 shrink-0">{ICON[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-snug text-[var(--text-primary)]">{t.title}</p>
              {t.description && <p className="mt-0.5 break-words text-xs leading-relaxed text-[var(--text-secondary)]">{t.description}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                  className="mt-1.5 text-xs font-semibold text-[var(--accent-text)] hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X size={13} />
            </button>
            {t.duration > 0 && (
              <motion.span
                aria-hidden
                className="absolute bottom-0 left-0 h-0.5 bg-[var(--accent-text)] opacity-40"
                initial={{ width: '100%' }}
                animate={{ width: 0 }}
                transition={{ duration: t.duration / 1000, ease: 'linear' }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
