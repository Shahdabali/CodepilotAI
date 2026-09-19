import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  description?: string
  action?: { label: string; run: () => void }
}

interface ToastState {
  items: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>, ttl?: number) => number
  dismiss: (id: number) => void
}

let seq = 1

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (t, ttl = 3800) => {
    const id = seq++
    set((s) => ({ items: [...s.items.slice(-3), { ...t, id }] }))
    if (ttl > 0) setTimeout(() => get().dismiss(id), t.kind === 'error' ? Math.max(ttl, 6000) : ttl)
    return id
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}))

const push = (kind: ToastKind) => (title: string, description?: string, action?: ToastItem['action']) => useToastStore.getState().push({ kind, title, description, action })

export const toast = {
  success: push('success'),
  error: push('error'),
  info: push('info'),
  warning: push('warning'),
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
