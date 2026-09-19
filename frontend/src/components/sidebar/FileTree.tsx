import React, { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { cn, getFileIcon } from '@/lib/utils'
import type { FileNode } from '@/types'
import {
  Search,
  RefreshCw,
  Sparkles,
  Copy,
  Trash2,
  AtSign,
  FileText,
  Folder,
  FolderOpen
} from 'lucide-react'

interface ContextMenuState {
  x: number
  y: number
  node: FileNode
}

export function FileTree() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const setSelectedFile = useUIStore((s) => s.setSelectedFile)
  const selectedFile = useUIStore((s) => s.selectedFile)
  const { setCurrentView } = useUIStore()
  const { addTask } = useTaskStore()

  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/']))
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const { data: tree = [], isLoading, refetch } = useQuery({
    queryKey: ['files', activeProject?.id],
    queryFn: () => api.files.getTree(activeProject!.id),
    enabled: !!activeProject,
    staleTime: 5000,
  })

  // Close context menu on document click
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  function filterNodes(nodes: FileNode[], q: string): FileNode[] {
    if (!q) return nodes
    return nodes.flatMap((node) => {
      if (node.type === 'file') {
        return node.name.toLowerCase().includes(q.toLowerCase()) || node.path.toLowerCase().includes(q.toLowerCase())
          ? [node]
          : []
      }
      const children = filterNodes(node.children ?? [], q)
      return children.length > 0 ? [{ ...node, children }] : []
    })
  }

  const displayTree = filterNodes(tree, search)

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
    })
  }

  const handleAskAi = async (node: FileNode) => {
    if (!activeProject) return
    const command = `Analyze and explain @file:${node.path} in detail`
    try {
      const task = await api.tasks.create(activeProject.id, { command, mode: 'EXPLAIN' })
      addTask(task)
      setCurrentView('task')
    } catch (err: any) {
      showToast(`Error: ${err.message}`)
    }
  }

  const handleAddContext = (node: FileNode) => {
    const token = node.type === 'directory' ? `@folder:${node.path}` : `@file:${node.path}`
    navigator.clipboard.writeText(token)
    showToast(`Copied ${token} to clipboard`)
  }

  const handleCopyPath = (node: FileNode) => {
    navigator.clipboard.writeText(node.path)
    showToast(`Copied path to clipboard`)
  }

  const handleDeleteFile = async (node: FileNode) => {
    if (!activeProject) return
    if (!window.confirm(`Are you sure you want to delete ${node.path}?`)) return
    try {
      await api.files.deleteFile(activeProject.id, node.path)
      refetch()
      showToast(`Deleted ${node.name}`)
      if (selectedFile === node.path) {
        setSelectedFile(null)
      }
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`)
    }
  }

  return (
    <div className="flex flex-col h-full relative select-none">
      {/* Toast popup */}
      {toastMessage && (
        <div className="absolute top-2 left-2 right-2 z-50 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent)] text-xs text-[var(--accent)] shadow-lg animate-in fade-in slide-in-from-top-1 text-center">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Explorer
        </span>
        <button
          onClick={() => refetch()}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Refresh files"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Search Filter */}
      <div className="p-2 border-b border-[var(--border-subtle)]">
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter files…"
            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg pl-7 pr-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {!activeProject ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-6">No project open</p>
        ) : isLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayTree.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-6">No matching files</p>
        ) : (
          displayTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggleExpand}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Context Menu Modal / Popup */}
      {contextMenu && (
        <div
          className="fixed z-50 w-52 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl shadow-2xl p-1 text-xs animate-in fade-in"
          style={{ top: `${Math.min(contextMenu.y, window.innerHeight - 180)}px`, left: `${Math.min(contextMenu.x, window.innerWidth - 220)}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] font-mono text-[var(--text-muted)] truncate border-b border-[var(--border-subtle)] mb-1">
            {contextMenu.node.name}
          </div>

          <button
            type="button"
            onClick={() => {
              handleAskAi(contextMenu.node)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[var(--text-primary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-colors"
          >
            <Sparkles size={12} className="text-[var(--accent)]" />
            <span>Ask AI about this</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleAddContext(contextMenu.node)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <AtSign size={12} />
            <span>Add to context (@file)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleCopyPath(contextMenu.node)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Copy size={12} />
            <span>Copy path</span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          <button
            type="button"
            onClick={() => {
              handleDeleteFile(contextMenu.node)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  selectedFile,
  onSelect,
  onContextMenu,
}: {
  node: FileNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  selectedFile: string | null
  onSelect: (path: string) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
}) {
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedFile === node.path
  const icon = node.type === 'directory'
    ? (isExpanded ? '📂' : '📁')
    : getFileIcon(node.name)

  return (
    <div>
      <button
        onClick={() => (node.type === 'directory' ? onToggle(node.path) : onSelect(node.path))}
        onContextMenu={(e) => onContextMenu(e, node)}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1 text-xs text-left hover:bg-[var(--bg-tertiary)] transition-colors rounded-sm group',
          isSelected && 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium',
          !isSelected && 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="shrink-0 text-sm">{icon}</span>
        <span className="truncate flex-1 font-mono text-[11px]">{node.name}</span>
        {node.type === 'directory' && (
          <span className="text-[var(--text-muted)] text-[10px] shrink-0 pr-1">
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
      </button>

      {node.type === 'directory' && isExpanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          selectedFile={selectedFile}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  )
}
