import React from 'react'
import { Keyboard, X } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { Modal, ModalClose, ModalTitle } from '@/components/ui/Modal'
import { Kbd } from '@/components/ui/primitives'

// Only shortcuts that actually exist are listed here.
const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; action: string }> }> = [
  {
    title: 'Anywhere',
    items: [
      { keys: ['Ctrl', 'K'], action: 'Command palette (search, navigate, paste a GitHub repo)' },
      { keys: ['Ctrl', 'B'], action: 'Collapse or expand the sidebar' },
      { keys: ['Ctrl', ','], action: 'Open settings' },
      { keys: ['Ctrl', '/'], action: 'Show this list' },
      { keys: ['Esc'], action: 'Close a dialog' },
    ],
  },
  {
    title: 'Home & editor',
    items: [
      { keys: ['Ctrl', 'Enter'], action: 'Run the task you typed' },
      { keys: ['Ctrl', 'S'], action: 'Save the file open in the code editor' },
    ],
  },
  {
    title: 'API Fetcher',
    items: [
      { keys: ['Ctrl', 'Enter'], action: 'Send the request' },
      { keys: ['Ctrl', 'S'], action: 'Save the request' },
      { keys: ['Ctrl', 'K'], action: 'Search requests, history and collections' },
      { keys: ['Ctrl', 'Shift', 'A'], action: 'Toggle the AI assistant' },
    ],
  },
  {
    title: 'GitHub Explorer',
    items: [
      { keys: ['↑', '↓'], action: 'Move through the file tree' },
      { keys: ['→', '←'], action: 'Expand or collapse a folder' },
      { keys: ['Enter'], action: 'Open the selected file or folder' },
    ],
  },
]

export function ShortcutsModal() {
  const { shortcutsModalOpen, setShortcutsModalOpen } = useUIStore()

  return (
    <Modal open={shortcutsModalOpen} onOpenChange={setShortcutsModalOpen} title="Keyboard shortcuts" description="Every keyboard shortcut in CodePilot" className="max-w-lg" visibleTitle>
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Keyboard size={16} className="text-[var(--accent-text)]" />
          <ModalTitle className="text-[15px] font-semibold text-[var(--text-primary)]">Keyboard shortcuts</ModalTitle>
        </div>
        <ModalClose aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          <X size={16} />
        </ModalClose>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{g.title}</h3>
            <dl className="divide-y divide-[var(--border-subtle)]">
              {g.items.map((s) => (
                <div key={s.action} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
                  <dt className="text-[var(--text-secondary)]">{s.action}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-[11.5px] text-[var(--text-muted)]">On macOS, use ⌘ in place of Ctrl.</p>
      </div>
    </Modal>
  )
}
