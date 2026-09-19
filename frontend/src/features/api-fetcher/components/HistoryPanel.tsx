import React, { useMemo, useState } from 'react'
import { Bookmark, Clock, Pencil, Play, Search, Trash2, X } from 'lucide-react'
import { useDataStore } from '../data.store'
import { editFromHistory, saveHistoryToCollection } from '../actions'
import { dayLabel, formatBytes, formatMs, relativeTime, statusClass, type StatusClass } from '../lib/format'
import { urlHost, urlPath } from '../lib/request'
import { HTTP_METHODS, type HistoryEntry } from '../types'
import { errorMessage, toast } from '../toast'
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, MethodBadge, Skeleton, StatusBadge } from './ui'

const FILTERS: Array<{ id: 'all' | StatusClass; label: string }> = [
  { id: 'all', label: 'All' },
  { id: '2xx', label: '2xx' },
  { id: '3xx', label: '3xx' },
  { id: '4xx', label: '4xx' },
  { id: '5xx', label: '5xx' },
  { id: 'error', label: 'Errors' },
]

export function PanelHeader({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--af-border)] px-3">
      <h2 className="text-[12px] font-semibold">{title}</h2>
      {count !== undefined && <Badge>{count}</Badge>}
      <div className="ml-auto flex items-center gap-0.5">{children}</div>
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id?: string }) {
  return (
    <div className="relative">
      <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--af-text-3)]" />
      <input id={id} className="af-input" style={{ paddingLeft: 24, paddingRight: value ? 24 : 8 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button type="button" className="af-icon-btn absolute right-0.5 top-0.5" style={{ width: 24, height: 24 }} onClick={() => onChange('')} aria-label="Clear search">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function Item({ entry }: { entry: HistoryEntry }) {
  const remove = useDataStore((s) => s.deleteHistory)
  const failed = entry.status === null
  return (
    <div className="af-list-item group" role="button" tabIndex={0} onClick={() => editFromHistory(entry)} onKeyDown={(e) => e.key === 'Enter' && editFromHistory(entry)} title={`${entry.method} ${entry.url}`}>
      <MethodBadge method={entry.method} className="w-10" />
      <div className="min-w-0 flex-1">
        <div className="af-mono af-truncate text-[11.5px]">{urlPath(entry.url) || '/'}</div>
        <div className="af-truncate text-[10.5px] text-[var(--af-text-3)]">
          {urlHost(entry.url)} · {relativeTime(entry.createdAt)}
          {entry.durationMs !== null && ` · ${formatMs(entry.durationMs)}`}
          {entry.sizeBytes !== null && ` · ${formatBytes(entry.sizeBytes)}`}
        </div>
        {failed && entry.errorMessage && <div className="af-truncate text-[10.5px] text-[var(--af-err)]">{entry.errorMessage}</div>}
      </div>
      <span className="af-item-meta">
        <StatusBadge status={entry.status} statusLabel={entry.statusText} error={failed} />
      </span>
      <span className="af-item-actions" onClick={(e) => e.stopPropagation()}>
        <IconButton label="Re-run" onClick={() => editFromHistory(entry, true)} style={{ width: 22, height: 22 }}>
          <Play size={12} />
        </IconButton>
        <IconButton label="Edit in builder" onClick={() => editFromHistory(entry)} style={{ width: 22, height: 22 }}>
          <Pencil size={12} />
        </IconButton>
        <IconButton label="Save to a collection" onClick={() => saveHistoryToCollection(entry)} style={{ width: 22, height: 22 }}>
          <Bookmark size={12} />
        </IconButton>
        <IconButton
          label="Delete"
          tone="danger"
          style={{ width: 22, height: 22 }}
          onClick={() => remove(entry.id).catch((e) => toast.error('Could not delete', errorMessage(e)))}
        >
          <Trash2 size={12} />
        </IconButton>
      </span>
    </div>
  )
}

export function HistoryPanel() {
  const history = useDataStore((s) => s.history)
  const loaded = useDataStore((s) => s.loaded)
  const clearHistory = useDataStore((s) => s.clearHistory)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | StatusClass>('all')
  const [method, setMethod] = useState<'all' | string>('all')
  const [confirm, setConfirm] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return history.filter((h) => (filter === 'all' || statusClass(h.status) === filter) && (method === 'all' || h.method === method) && (!needle || `${h.method} ${h.url} ${h.status ?? ''} ${h.errorMessage ?? ''}`.toLowerCase().includes(needle)))
  }, [history, q, filter, method])

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: HistoryEntry[] }> = []
    for (const h of filtered) {
      const label = dayLabel(h.createdAt)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(h)
      else out.push({ label, items: [h] })
    }
    return out
  }, [filtered])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--af-panel)]">
      <PanelHeader title="Request History" count={history.length}>
        <IconButton label="Clear all history" tone="danger" onClick={() => setConfirm(true)} disabled={!history.length}>
          <Trash2 size={14} />
        </IconButton>
      </PanelHeader>
      <div className="space-y-2 border-b border-[var(--af-border)] p-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search history" />
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="af-badge cursor-pointer" data-tone={filter === f.id ? 'accent' : undefined} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
              {f.label}
            </button>
          ))}
          <select className="af-input ml-auto" style={{ width: 84, height: 20, fontSize: 10.5, padding: '0 2px' }} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Filter by method">
            <option value="all">Any method</option>
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="af-scroll min-h-0 flex-1 p-1.5">
        {!loaded ? (
          <div className="space-y-2 p-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} style={{ height: 34 }} />
            ))}
          </div>
        ) : history.length === 0 ? (
          <EmptyState icon={<Clock size={18} />} title="No requests yet" description="Every request you send is recorded here with its status and timing. Credentials are never stored." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search size={18} />} title="Nothing matches" description="Try a different search or filter." action={<Button size="sm" onClick={() => (setQ(''), setFilter('all'), setMethod('all'))}>Reset filters</Button>} />
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-2">
              <div className="af-h sticky top-0 z-10 bg-[var(--af-panel)] px-2 py-1">{g.label}</div>
              {g.items.map((h) => (
                <Item key={h.id} entry={h} />
              ))}
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear all history?"
        danger
        confirmLabel="Clear history"
        description={`This permanently removes all ${history.length} recorded requests. Saved requests and collections are not affected.`}
        onConfirm={async () => {
          try {
            await clearHistory()
            toast.success('History cleared')
          } catch (e) {
            toast.error('Could not clear history', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
