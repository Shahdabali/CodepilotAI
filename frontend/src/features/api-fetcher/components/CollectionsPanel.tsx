import React, { useMemo, useState } from 'react'
import { Bookmark, ChevronDown, ChevronRight, Copy, Download, Folder, FolderInput, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Play, Save, Trash2, Upload } from 'lucide-react'
import type { Collection, SavedRequest } from '../types'
import { useDataStore } from '../data.store'
import { useDialogs } from '../dialogs.store'
import { useSession } from '../session.store'
import { openSavedRequest, runSavedRequest } from '../actions'
import { collectionPath, descendantIds, flattenCollections } from '../lib/tree'
import { urlPath } from '../lib/request'
import { errorMessage, toast } from '../toast'
import { PanelHeader, SearchBox } from './HistoryPanel'
import { ConfirmDialog, EmptyState, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuTrigger, MethodBadge, Skeleton, useAutoFocus, Button } from './ui'

const guard = <T,>(p: Promise<T>, what: string) => p.catch((e) => (toast.error(`Could not ${what}`, errorMessage(e)), undefined))

function InlineRename({ initial, onCommit, onCancel }: { initial: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const ref = useAutoFocus<HTMLInputElement>()
  const [value, setValue] = useState(initial)
  const finished = React.useRef(false)
  const finish = (commit: boolean) => {
    if (finished.current) return
    finished.current = true
    if (commit && value.trim() && value.trim() !== initial) onCommit(value.trim())
    else onCancel()
  }
  return (
    <input
      ref={ref}
      className="af-input"
      style={{ height: 22 }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      aria-label="Name"
    />
  )
}

function MoveSub({ collections, exclude, currentId, onMove }: { collections: Collection[]; exclude?: Set<string>; currentId: string | null; onMove: (id: string | null) => void }) {
  const flat = flattenCollections(collections, exclude)
  return (
    <MenuSub label="Move to" icon={<FolderInput size={14} />}>
      <MenuItem disabled={currentId === null} onSelect={() => onMove(null)}>
        <span className="text-[var(--af-text-2)]">Top level</span>
      </MenuItem>
      {flat.length > 0 && <MenuSeparator />}
      {flat.map(({ collection, depth }) => (
        <MenuItem key={collection.id} disabled={collection.id === currentId} onSelect={() => onMove(collection.id)}>
          <span style={{ paddingLeft: depth * 12 }} className="af-truncate">
            {collection.name}
          </span>
        </MenuItem>
      ))}
    </MenuSub>
  )
}

function RequestMenu({ req }: { req: SavedRequest }) {
  const data = useDataStore()
  const dialogs = useDialogs()
  const savedId = useSession((s) => s.savedId)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="More" style={{ width: 22, height: 22 }} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal size={14} />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Play size={14} />} onSelect={() => runSavedRequest(req)}>
            Run
          </MenuItem>
          <MenuItem icon={<Pencil size={14} />} onSelect={() => dialogs.setRenaming({ kind: 'r', id: req.id })}>
            Rename
          </MenuItem>
          <MenuItem
            icon={<Copy size={14} />}
            onSelect={() =>
              guard(data.duplicateRequest(req.id), 'duplicate request').then((r) => r && toast.success('Request duplicated', r.name))
            }
          >
            Duplicate
          </MenuItem>
          <MoveSub collections={data.collections} currentId={req.collectionId} onMove={(id) => guard(data.updateRequest(req.id, { collectionId: id }), 'move request').then((r) => r && toast.success('Request moved'))} />
          <MenuItem
            icon={<Download size={14} />}
            onSelect={() => {
              openSavedRequest(req)
              dialogs.openExport('request-json')
            }}
          >
            Export…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 size={14} />} tone="danger" onSelect={() => setConfirm(true)}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete request?"
        danger
        confirmLabel="Delete"
        description={
          <>
            “{req.name}” will be permanently deleted.{savedId === req.id ? ' It is open in the editor; your current edits stay there as an unsaved request.' : ''}
          </>
        }
        onConfirm={async () => {
          await guard(data.deleteRequest(req.id), 'delete request')
          if (useSession.getState().savedId === req.id) useSession.setState({ savedId: null, savedSnapshot: null })
          toast.success('Request deleted')
        }}
      />
    </>
  )
}

function RequestRow({ req, depth, renaming, setRenaming, showPath, collections }: { req: SavedRequest; depth: number; renaming: boolean; setRenaming: (v: boolean) => void; showPath?: boolean; collections: Collection[] }) {
  const savedId = useSession((s) => s.savedId)
  const update = useDataStore((s) => s.updateRequest)
  const commit = async (name: string) => {
    setRenaming(false)
    const r = await guard(update(req.id, { name }), 'rename request')
    if (r && useSession.getState().savedId === req.id) useSession.setState((s) => ({ draft: { ...s.draft, name: r.name } }))
  }
  return (
    <div className="af-list-item group" data-active={savedId === req.id || undefined} style={{ paddingLeft: 8 + depth * 14 }} role="button" tabIndex={0} onClick={() => !renaming && openSavedRequest(req)} onKeyDown={(e) => e.key === 'Enter' && openSavedRequest(req)}>
      <MethodBadge method={req.method} className="w-10" />
      <div className="min-w-0 flex-1">
        {renaming ? <InlineRename initial={req.name} onCommit={commit} onCancel={() => setRenaming(false)} /> : <div className="af-truncate text-[12px]">{req.name}</div>}
        {showPath && !renaming && (
          <div className="af-truncate text-[10.5px] text-[var(--af-text-3)]">
            {collectionPath(collections, req.collectionId) || 'No collection'} · <span className="af-mono">{urlPath(req.url) || '/'}</span>
          </div>
        )}
      </div>
      {!renaming && (
        <span className="af-item-actions" onClick={(e) => e.stopPropagation()}>
          <IconButton label="Run" style={{ width: 22, height: 22 }} onClick={() => runSavedRequest(req)}>
            <Play size={12} />
          </IconButton>
          <RequestMenu req={req} />
        </span>
      )}
    </div>
  )
}

export function SavedPanel() {
  const requests = useDataStore((s) => s.requests)
  const collections = useDataStore((s) => s.collections)
  const loaded = useDataStore((s) => s.loaded)
  const [q, setQ] = useState('')
  const renaming = useDialogs((s) => s.renaming)
  const setRenaming = useDialogs((s) => s.setRenaming)
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...requests].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter((r) => !needle || `${r.name} ${r.method} ${r.url} ${collectionPath(collections, r.collectionId)}`.toLowerCase().includes(needle))
  }, [requests, collections, q])
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--af-panel)]">
      <PanelHeader title="Saved Requests" count={requests.length} />
      <div className="border-b border-[var(--af-border)] p-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search saved requests" />
      </div>
      <div className="af-scroll min-h-0 flex-1 p-1.5">
        {!loaded ? (
          <div className="space-y-2 p-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 32 }} />)}</div>
        ) : requests.length === 0 ? (
          <EmptyState icon={<Bookmark size={18} />} title="No saved requests" description="Press Ctrl+S to save the current request, or save one from your history." />
        ) : list.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try a different search." />
        ) : (
          list.map((r) => <RequestRow key={r.id} req={r} depth={0} showPath collections={collections} renaming={renaming?.kind === 'r' && renaming.id === r.id} setRenaming={(v) => setRenaming(v ? { kind: 'r', id: r.id } : null)} />)
        )}
      </div>
    </div>
  )
}

export function CollectionsPanel() {
  const data = useDataStore()
  const dialogs = useDialogs()
  const { collections, requests, loaded } = data
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(collections.map((c) => c.id)))
  const renaming = useDialogs((s) => s.renaming)
  const setRenaming = useDialogs((s) => s.setRenaming)
  const [deleting, setDeleting] = useState<Collection | null>(null)

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  const expand = (id: string) => setExpanded((s) => new Set(s).add(id))

  const newCollection = async (parentId: string | null) => {
    const c = await guard(data.createCollection('New collection', parentId), 'create collection')
    if (c) {
      if (parentId) expand(parentId)
      setRenaming({ kind: 'c', id: c.id })
    }
  }

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode =>
    collections
      .filter((c) => c.parentId === parentId)
      .map((c) => {
        const open = expanded.has(c.id)
        const childRequests = requests.filter((r) => r.collectionId === c.id)
        const isRenaming = renaming?.kind === 'c' && renaming.id === c.id
        const exclude = descendantIds(collections, c.id).add(c.id)
        return (
          <div key={c.id}>
            <div className="af-list-item group" style={{ paddingLeft: 4 + depth * 14 }} role="treeitem" aria-expanded={open} tabIndex={0} onClick={() => !isRenaming && toggle(c.id)} onKeyDown={(e) => e.key === 'Enter' && toggle(c.id)}>
              <span className="grid w-4 place-items-center text-[var(--af-text-3)]">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
              {open ? <FolderOpen size={14} className="shrink-0 text-[var(--af-accent-text)]" /> : <Folder size={14} className="shrink-0 text-[var(--af-accent-text)]" />}
              <div className="min-w-0 flex-1">
                {isRenaming ? (
                  <InlineRename
                    initial={c.name}
                    onCommit={(name) => (setRenaming(null), void guard(data.updateCollection(c.id, { name }), 'rename collection'))}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <span className="af-truncate block text-[12px] font-medium">{c.name}</span>
                )}
              </div>
              {!isRenaming && (
                <>
                  <span className="af-item-meta text-[10.5px] text-[var(--af-text-3)]">{childRequests.length + collections.filter((x) => x.parentId === c.id).length || ''}</span>
                  <span className="af-item-actions" onClick={(e) => e.stopPropagation()}>
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton label="More" style={{ width: 22, height: 22 }}>
                          <MoreHorizontal size={14} />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem icon={<Save size={14} />} onSelect={() => (expand(c.id), dialogs.openSave({ collectionId: c.id, suggestedName: useSession.getState().draft.name || '' }))}>
                          Save current request here
                        </MenuItem>
                        <MenuItem icon={<FolderPlus size={14} />} onSelect={() => newCollection(c.id)}>
                          New sub-collection
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<Pencil size={14} />} onSelect={() => setRenaming({ kind: 'c', id: c.id })}>
                          Rename
                        </MenuItem>
                        <MenuItem icon={<Copy size={14} />} onSelect={() => guard(data.duplicateCollection(c.id), 'duplicate collection').then(() => toast.success('Collection duplicated'))}>
                          Duplicate
                        </MenuItem>
                        <MoveSub collections={collections} exclude={exclude} currentId={c.parentId} onMove={(id) => guard(data.updateCollection(c.id, { parentId: id }), 'move collection').then(() => toast.success('Collection moved'))} />
                        <MenuItem icon={<Download size={14} />} onSelect={() => dialogs.openExport('collection', c.id)}>
                          Export…
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<Trash2 size={14} />} tone="danger" onSelect={() => setDeleting(c)}>
                          Delete
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </span>
                </>
              )}
            </div>
            {open && (
              <div role="group">
                {renderLevel(c.id, depth + 1)}
                {childRequests.map((r) => (
                  <RequestRow key={r.id} req={r} depth={depth + 2} collections={collections} renaming={renaming?.kind === 'r' && renaming.id === r.id} setRenaming={(v) => setRenaming(v ? { kind: 'r', id: r.id } : null)} />
                ))}
                {childRequests.length === 0 && !collections.some((x) => x.parentId === c.id) && (
                  <div className="py-1 text-[11px] text-[var(--af-text-3)]" style={{ paddingLeft: 30 + depth * 14 }}>
                    Empty. Save a request here.
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })

  const loose = requests.filter((r) => r.collectionId === null)
  const cascadeCount = deleting ? descendantIds(collections, deleting.id).size + 1 : 0
  const cascadeRequests = deleting ? requests.filter((r) => r.collectionId === deleting.id || descendantIds(collections, deleting.id).has(r.collectionId ?? '')).length : 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--af-panel)]">
      <PanelHeader title="Collections" count={collections.length}>
        <IconButton label="Import…" onClick={() => dialogs.setImportOpen(true)}>
          <Upload size={14} />
        </IconButton>
        <IconButton label="New collection" onClick={() => newCollection(null)}>
          <FolderPlus size={14} />
        </IconButton>
      </PanelHeader>
      <div className="af-scroll min-h-0 flex-1 p-1.5" role="tree" aria-label="Collections">
        {!loaded ? (
          <div className="space-y-2 p-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 30 }} />)}</div>
        ) : collections.length === 0 && loose.length === 0 ? (
          <EmptyState
            icon={<Folder size={18} />}
            title="Organise your APIs"
            description="Group requests into collections and sub-collections, such as My APIs → Users → Get Users."
            action={
              <Button size="sm" variant="primary" onClick={() => newCollection(null)}>
                <FolderPlus size={13} /> New collection
              </Button>
            }
          />
        ) : (
          <>
            {renderLevel(null, 0)}
            {loose.length > 0 && (
              <div className="mt-2">
                <div className="af-h px-2 py-1">Not in a collection</div>
                {loose.map((r) => (
                  <RequestRow key={r.id} req={r} depth={0} collections={collections} renaming={renaming?.kind === 'r' && renaming.id === r.id} setRenaming={(v) => setRenaming(v ? { kind: 'r', id: r.id } : null)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        danger
        confirmLabel="Delete collection"
        description={`This deletes ${cascadeCount === 1 ? 'the collection' : `${cascadeCount} collections`} and ${cascadeRequests} saved request${cascadeRequests === 1 ? '' : 's'} inside. This cannot be undone.`}
        onConfirm={async () => {
          if (!deleting) return
          await guard(data.deleteCollection(deleting.id), 'delete collection')
          const sid = useSession.getState().savedId
          if (sid && !useDataStore.getState().requests.some((r) => r.id === sid)) useSession.setState({ savedId: null, savedSnapshot: null })
          toast.success('Collection deleted')
        }}
      />
    </div>
  )
}

