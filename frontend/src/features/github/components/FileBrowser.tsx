import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  File as FileIcon,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  Search,
  WrapText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CodeViewer } from '@/components/ui/CodeViewer'
import { Markdown } from '@/components/ui/Markdown'
import { toast } from '@/components/ui/toast'
import { EmptyState, IconButton, Segmented, Skeleton } from '@/components/ui/primitives'
import { githubApi } from '../api'
import { formatBytes } from '../lib/format'
import { ancestorsOf, buildTree, findFiles, visibleRows } from '../lib/tree'
import { ErrorNotice } from './ErrorNotice'

const ROW_H = 28

function iconFor(name: string, isDir: boolean, open: boolean) {
  if (isDir) return open ? <FolderOpen size={14} className="text-[var(--accent-text)]" /> : <Folder size={14} className="text-[var(--accent-text)]" />
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return <FileImage size={14} className="text-[var(--text-muted)]" />
  if (['md', 'txt', 'rst', 'mdx'].includes(ext)) return <FileText size={14} className="text-[var(--text-muted)]" />
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'php', 'json', 'css', 'html', 'sh', 'yml', 'yaml', 'toml'].includes(ext))
    return <FileCode2 size={14} className="text-[var(--text-muted)]" />
  return <FileIcon size={14} className="text-[var(--text-muted)]" />
}

export function FileBrowser({ owner, repo, refName, initialPath, rawBase }: { owner: string; repo: string; refName: string; initialPath?: string; rawBase: string }) {
  const tree = useQuery({
    queryKey: ['gh', 'tree', owner, repo, refName],
    queryFn: ({ signal }) => githubApi.tree(owner, repo, refName, signal),
    staleTime: 3 * 60_000,
    retry: 0,
  })

  const nodes = useMemo(() => (tree.data ? buildTree(tree.data.entries) : []), [tree.data])
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(initialPath ?? null)
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [wrap, setWrap] = useState(false)
  const [mdView, setMdView] = useState<'preview' | 'code'>('preview')
  const scroller = useRef<HTMLDivElement>(null)

  // Deep link: reveal and select the file from a pasted /blob/ URL.
  useEffect(() => {
    if (initialPath && tree.data) {
      setOpen((prev) => new Set([...prev, ...ancestorsOf(initialPath)]))
      setSelected(initialPath)
    }
  }, [initialPath, tree.data])

  const filtering = filter.trim().length > 0
  const matches = useMemo(() => (tree.data && filtering ? findFiles(tree.data.entries, filter) : []), [tree.data, filter, filtering])
  const rows = useMemo(() => (filtering ? [] : visibleRows(nodes, open)), [nodes, open, filtering])
  const count = filtering ? matches.length : rows.length

  const file = useQuery({
    queryKey: ['gh', 'file', owner, repo, refName, selected],
    queryFn: ({ signal }) => githubApi.file(owner, repo, selected!, refName, signal),
    enabled: !!selected,
    staleTime: 3 * 60_000,
    retry: 0,
  })

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const activate = (index: number) => {
    if (filtering) {
      const path = matches[index]
      if (path) {
        setSelected(path)
        setOpen((prev) => new Set([...prev, ...ancestorsOf(path)]))
      }
      return
    }
    const row = rows[index]
    if (!row) return
    if (row.node.type === 'dir') toggle(row.node.path)
    else setSelected(row.node.path)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, count - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate(active)
    } else if (e.key === 'ArrowRight' && !filtering) {
      const row = rows[active]
      if (row?.node.type === 'dir' && !open.has(row.node.path)) toggle(row.node.path)
    } else if (e.key === 'ArrowLeft' && !filtering) {
      const row = rows[active]
      if (row?.node.type === 'dir' && open.has(row.node.path)) toggle(row.node.path)
    } else if (e.key === 'Home') {
      setActive(0)
    } else if (e.key === 'End') {
      setActive(Math.max(0, count - 1))
    }
  }

  // Keep the active row in view.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const top = active * ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight
  }, [active])

  useEffect(() => setActive(0), [filter])

  const viewportH = scroller.current?.clientHeight ?? 600
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 8)
  const end = Math.min(count, Math.ceil((scrollTop + viewportH) / ROW_H) + 8)

  const isMarkdown = !!selected && /\.(md|markdown|mdx)$/i.test(selected)
  const dir = selected && selected.includes('/') ? selected.slice(0, selected.lastIndexOf('/') + 1) : ''
  const resolveMdUrl = (url: string, kind: 'link' | 'image') => {
    if (/^(https?:|mailto:|#)/i.test(url)) return url
    const clean = url.replace(/^\.?\//, '')
    const resolved = clean.startsWith('/') ? clean.slice(1) : dir + clean
    return kind === 'image' ? `${rawBase}/${resolved}` : `https://github.com/${owner}/${repo}/blob/${refName}/${resolved}`
  }

  if (tree.isLoading) {
    return (
      <div className="grid h-full grid-cols-[280px_1fr] gap-4 p-4" aria-busy>
        <div className="space-y-1.5">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-6" style={{ width: `${90 - (i % 4) * 14}%`, opacity: 1 - i * 0.06 }} />
          ))}
        </div>
        <Skeleton className="h-full" />
      </div>
    )
  }
  if (tree.error) return <ErrorNotice error={tree.error} onRetry={() => tree.refetch()} />

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
      {/* Tree */}
      <div className="flex min-h-0 flex-col border-b border-[var(--border-subtle)] md:border-b-0 md:border-r">
        <div className="border-b border-[var(--border-subtle)] p-2">
          <label className="relative block">
            <span className="sr-only">Go to file</span>
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Go to file…"
              spellCheck={false}
              className="h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-8 pr-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
          </label>
        </div>

        <div
          ref={scroller}
          role="tree"
          aria-label="Repository files"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="relative min-h-[220px] flex-1 overflow-y-auto py-1 focus-visible:outline-none"
        >
          {tree.data && (tree.data.truncated || tree.data.capped) && (
            <p className="mx-2 mb-1 rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-1 text-[11px] text-[var(--warning)]">
              Very large repository — the listing is incomplete.
            </p>
          )}
          {count === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">{filtering ? 'No files match.' : 'This repository is empty.'}</p>
          ) : (
            <div style={{ height: count * ROW_H, position: 'relative' }}>
              {Array.from({ length: end - start }, (_, k) => {
                const i = start + k
                const top = i * ROW_H
                if (filtering) {
                  const path = matches[i]
                  const name = path.slice(path.lastIndexOf('/') + 1)
                  return (
                    <button
                      key={path}
                      type="button"
                      role="treeitem"
                      aria-selected={selected === path}
                      onClick={() => {
                        setActive(i)
                        activate(i)
                      }}
                      className={cn(
                        'absolute inset-x-1 flex items-center gap-2 rounded-md px-2 text-left text-xs',
                        selected === path ? 'bg-[var(--accent-subtle)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                        active === i && 'ring-1 ring-inset ring-[var(--border-strong)]'
                      )}
                      style={{ top, height: ROW_H }}
                      title={path}
                    >
                      {iconFor(name, false, false)}
                      <span className="min-w-0 flex-1 truncate">
                        {name}
                        <span className="ml-2 text-[10.5px] text-[var(--text-muted)]">{path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''}</span>
                      </span>
                    </button>
                  )
                }
                const { node, depth } = rows[i]
                const isDir = node.type === 'dir'
                const isOpen = isDir && open.has(node.path)
                return (
                  <button
                    key={node.path}
                    type="button"
                    role="treeitem"
                    aria-expanded={isDir ? isOpen : undefined}
                    aria-selected={selected === node.path}
                    onClick={() => {
                      setActive(i)
                      activate(i)
                    }}
                    className={cn(
                      'absolute inset-x-1 flex items-center gap-1.5 rounded-md pr-2 text-left text-xs',
                      selected === node.path ? 'bg-[var(--accent-subtle)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                      active === i && 'ring-1 ring-inset ring-[var(--border-strong)]'
                    )}
                    style={{ top, height: ROW_H, paddingLeft: 6 + depth * 14 }}
                    title={node.path}
                  >
                    <ChevronRight size={12} className={cn('shrink-0 text-[var(--text-muted)] transition-transform', isDir ? (isOpen ? 'rotate-90' : '') : 'invisible')} />
                    {iconFor(node.name, isDir, isOpen)}
                    <span className="min-w-0 flex-1 truncate">{node.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Viewer */}
      <div className="flex min-h-[320px] min-w-0 flex-col md:min-h-0">
        {!selected ? (
          <EmptyState icon={<FileCode2 size={20} />} title="Select a file" description="Pick a file on the left — or type a name in “Go to file” — to read it here." className="m-auto" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-primary)]" title={selected}>
                {selected}
              </span>
              {file.data && <span className="font-mono text-[11px] text-[var(--text-muted)]">{formatBytes(file.data.size)}</span>}
              {isMarkdown && file.data?.text !== undefined && (
                <Segmented value={mdView} onChange={setMdView} ariaLabel="Markdown view" size="sm" options={[{ value: 'preview', label: 'Preview' }, { value: 'code', label: 'Code' }]} />
              )}
              {file.data?.text !== undefined && (!isMarkdown || mdView === 'code') && (
                <IconButton label={wrap ? 'Turn off line wrapping' : 'Wrap long lines'} onClick={() => setWrap((w) => !w)} className={wrap ? 'bg-[var(--accent-subtle)] text-[var(--accent-text)]' : ''}>
                  <WrapText size={15} />
                </IconButton>
              )}
              {file.data?.text !== undefined && (
                <IconButton
                  label="Copy file contents"
                  onClick={() => {
                    navigator.clipboard?.writeText(file.data!.text!).then(
                      () => toast.success('Copied', selected),
                      () => toast.error('Could not copy to the clipboard')
                    )
                  }}
                >
                  <Copy size={15} />
                </IconButton>
              )}
              {file.data?.downloadUrl && (
                <a href={file.data.downloadUrl} target="_blank" rel="noopener noreferrer" aria-label="Open raw file" title="Open raw file" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                  <Download size={15} />
                </a>
              )}
              {file.data?.htmlUrl && (
                <a href={file.data.htmlUrl} target="_blank" rel="noopener noreferrer" aria-label="Open on GitHub" title="Open on GitHub" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                  <ExternalLink size={15} />
                </a>
              )}
            </div>

            <div className="min-h-0 flex-1">
              {file.isLoading ? (
                <div className="space-y-2 p-4" aria-busy>
                  {Array.from({ length: 10 }, (_, i) => (
                    <Skeleton key={i} className="h-4" style={{ width: `${40 + ((i * 37) % 55)}%` }} />
                  ))}
                </div>
              ) : file.error ? (
                <ErrorNotice error={file.error} onRetry={() => file.refetch()} compact />
              ) : file.data?.image ? (
                <div className="flex h-full items-center justify-center overflow-auto bg-[var(--bg-input)] p-6">
                  <img src={file.data.downloadUrl ?? ''} alt={selected} referrerPolicy="no-referrer" className="max-h-full max-w-full rounded border border-[var(--border-subtle)] bg-white object-contain" />
                </div>
              ) : file.data?.binary ? (
                <EmptyState icon={<FileIcon size={20} />} title="Binary file" description="This file isn’t text, so there is nothing to show here." className="h-full" />
              ) : file.data?.tooLarge ? (
                <EmptyState
                  icon={<FileIcon size={20} />}
                  title="File too large to preview"
                  description={`It is ${formatBytes(file.data.size)}; previews stop at ${formatBytes(file.data.maxBytes)}. Open the raw file or view it on GitHub.`}
                  className="h-full"
                />
              ) : file.data?.text !== undefined ? (
                isMarkdown && mdView === 'preview' ? (
                  <div className="h-full overflow-auto p-6">
                    <Markdown text={file.data.text} resolveUrl={resolveMdUrl} />
                  </div>
                ) : (
                  <CodeViewer path={selected} text={file.data.text} wrap={wrap} label={`Contents of ${selected}`} />
                )
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
