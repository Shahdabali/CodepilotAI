import React from 'react'
import { useUIStore } from '@/stores/ui.store'
import { X, Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { key: 'Ctrl/Cmd + Enter', action: 'Run Agent Command' },
  { key: 'Ctrl/Cmd + K', action: 'Open Global Command Palette' },
  { key: 'Ctrl/Cmd + B', action: 'Toggle Minimal Sidebar' },
  { key: 'Ctrl/Cmd + P', action: 'Quick File Search' },
  { key: 'Ctrl/Cmd + S', action: 'Save File in Code Editor' },
  { key: 'Esc', action: 'Close Modal / Dropdown' },
]

export function ShortcutsModal() {
  const { shortcutsModalOpen, setShortcutsModalOpen } = useUIStore()

  if (!shortcutsModalOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => setShortcutsModalOpen(false)}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={() => setShortcutsModalOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 divide-y divide-[var(--border-subtle)]">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-2.5 text-xs">
              <span className="text-[var(--text-secondary)]">{s.action}</span>
              <kbd className="px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] shadow-xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] text-center">
          <p className="text-[11px] text-[var(--text-muted)]">
            Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px]">Esc</kbd> anytime to dismiss
          </p>
        </div>
      </div>
    </div>
  )
}
