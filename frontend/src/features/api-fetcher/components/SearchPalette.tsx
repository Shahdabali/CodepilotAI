import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Bookmark, Clock, Command, FolderPlus, Keyboard, Layers, Plus, Search, Send, Settings, Sparkles, Sun, Upload, Code2, Save } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useDataStore } from '../data.store'
import { useDialogs } from '../dialogs.store'
import { editFromHistory, openSavedRequest, saveCurrent } from '../actions'
import { collectionPath } from '../lib/tree'
import { relativeTime } from '../lib/format'
import { urlPath } from '../lib/request'
import { useSession } from '../session.store'
import { Kbd, MethodBadge, StatusBadge } from './ui'

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  icon?: React.ReactNode
  right?: React.ReactNode
  keywords?: string
  run: () => void
}

export function SearchPalette() {
  const open = useSession((s) => s.searchOpen)
  const setOpen = useSession((s) => s.setSearchOpen)
  const data = useDataStore()
  const dialogs = useDialogs()
  const session = useSession()
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const close = () => setOpen(false)
    const act = (fn: () => void) => () => (close(), fn())
    const actions: Item[] = [
      { id: 'a-send', group: 'Actions', label: 'Send request', hint: 'Ctrl+Enter', icon: <Send size={14} />, run: act(() => void session.send()) },
      { id: 'a-save', group: 'Actions', label: 'Save request', hint: 'Ctrl+S', icon: <Save size={14} />, run: act(() => void saveCurrent()) },
      { id: 'a-new', group: 'Actions', label: 'New request', icon: <Plus size={14} />, run: act(() => (session.newDraft(), document.getElementById('af-url-input')?.focus())) },
      { id: 'a-import', group: 'Actions', label: 'Import cURL, OpenAPI or JSON…', icon: <Upload size={14} />, run: act(() => dialogs.setImportOpen(true)) },
      { id: 'a-export', group: 'Actions', label: 'Export…', icon: <Upload size={14} className="rotate-180" />, run: act(() => dialogs.openExport('curl')) },
      { id: 'a-code', group: 'Actions', label: 'Generate code', icon: <Code2 size={14} />, run: act(() => (session.setSection('workspace'), session.setLowerTab('code'))) },
      { id: 'a-collection', group: 'Actions', label: 'New collection', icon: <FolderPlus size={14} />, run: act(() => (session.setPanel('collections'), void data.createCollection('New collection', null))) },
      { id: 'a-ai', group: 'Actions', label: session.aiOpen ? 'Hide AI assistant' : 'Show AI assistant', icon: <Sparkles size={14} />, run: act(() => session.setAiOpen(!session.aiOpen)) },
      { id: 'a-env', group: 'Actions', label: 'Manage environments', icon: <Layers size={14} />, run: act(() => session.setSection('environments')) },
      { id: 'a-settings', group: 'Actions', label: 'API Fetcher settings', icon: <Settings size={14} />, run: act(() => session.setSection('settings')) },
      { id: 'a-theme', group: 'Actions', label: 'Toggle light / dark theme', icon: <Sun size={14} />, run: act(toggleTheme) },
      { id: 'a-keys', group: 'Actions', label: 'Keyboard shortcuts', icon: <Keyboard size={14} />, run: act(() => dialogs.setShortcutsOpen(true)) },
    ]
    const envs: Item[] = [
      { id: 'e-none', group: 'Environments', label: 'Use no environment', icon: <Layers size={14} />, run: act(() => session.setActiveEnv(null)) },
      ...data.environments.map<Item>((e) => ({ id: `e-${e.id}`, group: 'Environments', label: `Switch to ${e.name}`, icon: <Layers size={14} />, right: session.activeEnvId === e.id ? <span className="text-[10px] text-[var(--af-accent-text)]">active</span> : undefined, run: act(() => session.setActiveEnv(e.id)) })),
    ]
    const saved: Item[] = data.requests.map<Item>((r) => ({
      id: `r-${r.id}`,
      group: 'Saved requests',
      label: r.name,
      hint: collectionPath(data.collections, r.collectionId) || undefined,
      icon: <Bookmark size={14} />,
      right: <MethodBadge method={r.method} />,
      keywords: `${r.method} ${r.url}`,
      run: act(() => openSavedRequest(r)),
    }))
    const hist: Item[] = data.history.slice(0, 60).map<Item>((h) => ({
      id: `h-${h.id}`,
      group: 'History',
      label: `${urlPath(h.url) || h.url}`,
      hint: `${h.url.replace(/^https?:\/\//, '').split('/')[0]} · ${relativeTime(h.createdAt)}`,
      icon: <Clock size={14} />,
      right: (
        <span className="flex items-center gap-1.5">
          <MethodBadge method={h.method} />
          <StatusBadge status={h.status} statusLabel={h.statusText} error={h.status === null} />
        </span>
      ),
      keywords: `${h.method} ${h.url} ${h.status ?? ''}`,
      run: act(() => void editFromHistory(h)),
    }))
    return [...actions, ...envs, ...saved, ...hist]
  }, [data.requests, data.history, data.environments, data.collections, session, dialogs, setOpen, toggleTheme])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items.filter((i) => i.group === 'Actions' || i.group === 'Saved requests').slice(0, 24)
    const terms = needle.split(/\s+/)
    return items.filter((i) => terms.every((t) => `${i.label} ${i.hint ?? ''} ${i.keywords ?? ''} ${i.group}`.toLowerCase().includes(t))).slice(0, 40)
  }, [items, q])

  useEffect(() => setCursor(0), [q])
  useEffect(() => {
    list.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, results])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(results.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[cursor]?.run()
    }
  }

  let lastGroup = ''
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="af-overlay" />
        <Dialog.Content className="af-dialog" style={{ ['--af-dialog-w' as string]: '600px', top: '18%', transform: 'translate(-50%, 0)', animation: 'af-fade 0.12s ease-out' }} aria-describedby={undefined} onKeyDown={onKey}>
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-[var(--af-border)] px-3">
            <Search size={15} className="text-[var(--af-text-3)]" />
            <input autoFocus className="h-11 flex-1 border-0 bg-transparent text-[13px] text-[var(--af-text)] outline-none placeholder:text-[var(--af-text-3)]" placeholder="Search requests, history, environments and actions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            <Kbd>Esc</Kbd>
          </div>
          <div ref={list} className="af-scroll p-1.5" style={{ maxHeight: 380 }} role="listbox">
            {results.length === 0 && <div className="af-empty">No matches for “{q}”.</div>}
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null
              lastGroup = r.group
              return (
                <React.Fragment key={r.id}>
                  {header && <div className="af-h px-2 pb-1 pt-2">{header}</div>}
                  <div role="option" aria-selected={i === cursor} data-cursor={i === cursor} className="af-list-item" data-selected={i === cursor} onMouseMove={() => setCursor(i)} onClick={r.run}>
                    <span className="text-[var(--af-text-3)]">{r.icon}</span>
                    <span className="af-truncate min-w-0 flex-1 text-[12px]">{r.label}</span>
                    {r.hint && <span className="af-truncate max-w-[200px] text-[10.5px] text-[var(--af-text-3)]">{r.hint}</span>}
                    {r.right}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-[var(--af-border)] px-3 py-1.5 text-[10.5px] text-[var(--af-text-3)]">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
            </span>
            <span>
              <Kbd>Enter</Kbd> select
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Command size={11} /> Ctrl+K
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl / Cmd + Enter', 'Send request'],
  ['Ctrl / Cmd + S', 'Save request'],
  ['Ctrl / Cmd + K', 'Search everything'],
  ['Ctrl / Cmd + Shift + A', 'Toggle AI assistant'],
  ['Ctrl / Cmd + Shift + F', 'Search inside the response'],
  ['Alt + 1 … 4', 'Params, Headers, Body, Authorization'],
  ['Esc', 'Close dialog or cancel search'],
  ['Enter / Shift + Enter', 'Next / previous search match'],
]

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useDialogs()
  return (
    <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="af-overlay" />
        <Dialog.Content className="af-dialog" style={{ ['--af-dialog-w' as string]: '440px' }} aria-describedby={undefined}>
          <div className="af-dialog-head">
            <Dialog.Title className="text-[14px] font-semibold">Keyboard shortcuts</Dialog.Title>
          </div>
          <div className="af-dialog-body">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="af-shortcut-row">
                <span className="text-[12px] text-[var(--af-text-2)]">{what}</span>
                <span className="flex gap-1">
                  {keys.split(' + ').map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

