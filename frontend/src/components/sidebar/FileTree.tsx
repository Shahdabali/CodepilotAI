import React, { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import { cn, getFileIcon } from '@/lib/utils'
import type { FileNode } from '@/types'

export function FileTree() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const setSelectedFile = useUIStore((s) => s.setSelectedFile)
  const selectedFile = useUIStore((s) => s.selectedFile)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/']))

  const { data: tree = [], isLoading, refetch } = useQuery({
    queryKey: ['files', activeProject?.id],
    queryFn: () => api.files.getTree(activeProject!.id),
    enabled: !!activeProject,
    staleTime: 5000,
  })

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
        return node.name.toLowerCase().includes(q.toLowerCase()) ? [node] : []
      }
      const children = filterNodes(node.children ?? [], q)
      return children.length > 0 ? [{ ...node, children }] : []
    })
  }

  const displayTree = filterNodes(tree, search)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border-color)]">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Files</span>
        <button onClick={() => refetch()} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs p-0.5 rounded hover:bg-[var(--bg-tertiary)]" title="Refresh">↻</button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-[var(--border-color)]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files…"
          className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {!activeProject ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-4">No project open</p>
        ) : isLoading ? (
          <div className="flex justify-center py-4">
            <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayTree.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-4">No files found</p>
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
            />
          ))
        )}
      </div>
    </div>
  )
}

function TreeNode({
  node, depth, expanded, onToggle, selectedFile, onSelect,
}: {
  node: FileNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  selectedFile: string | null
  onSelect: (path: string) => void
}) {
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedFile === node.path
  const icon = node.type === 'directory'
    ? (isExpanded ? '📂' : '📁')
    : getFileIcon(node.name)

  return (
    <div>
      <button
        onClick={() => node.type === 'directory' ? onToggle(node.path) : onSelect(node.path)}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-0.5 text-xs text-left hover:bg-[var(--bg-tertiary)] transition-colors rounded-sm',
          isSelected && 'bg-[var(--accent)]/15 text-[var(--accent)]',
          !isSelected && 'text-[var(--text-secondary)]'
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate flex-1">{node.name}</span>
        {node.type === 'directory' && (
          <span className="text-[var(--text-muted)] shrink-0">{isExpanded ? '▾' : '▸'}</span>
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
        />
      ))}
    </div>
  )
}
