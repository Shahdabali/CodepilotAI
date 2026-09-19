import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project.store'
import { cn, getLanguageIcon } from '@/lib/utils'

export function ProjectList() {
  const { projects, setProjects, activeProject, setActiveProject, addProject } = useProjectStore()
  const [showAdd, setShowAdd] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const list = await api.projects.list()
      setProjects(list)
      return list
    },
    staleTime: 30_000,
  })

  async function handleAdd() {
    if (!newPath.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await api.projects.create(newPath.trim())
      addProject(res.project)
      setNewPath('')
      setShowAdd(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border-color)]">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Projects</span>
        <button onClick={() => setShowAdd(!showAdd)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm font-bold">+</button>
      </div>

      {showAdd && (
        <div className="p-2 border-b border-[var(--border-color)]">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="C:\path\to\project"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] mb-1.5"
            autoFocus
          />
          {error && <p className="text-xs text-red-400 mb-1">{error}</p>}
          <div className="flex gap-1">
            <button onClick={handleAdd} disabled={adding || !newPath.trim()} className="flex-1 py-1 rounded bg-[var(--accent)] text-white text-xs disabled:opacity-40">
              {adding ? 'Opening…' : 'Open'}
            </button>
            <button onClick={() => { setShowAdd(false); setError(null) }} className="px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="text-center py-8 px-3">
            <p className="text-xs text-[var(--text-muted)]">No projects yet</p>
            <button onClick={() => setShowAdd(true)} className="mt-2 text-xs text-[var(--accent)] hover:underline">Open a project</button>
          </div>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setActiveProject(project)}
              className={cn(
                'w-full px-2 py-2.5 text-left border-b border-[var(--border-color)]/40 hover:bg-[var(--bg-tertiary)] transition-colors',
                activeProject?.id === project.id && 'bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]'
              )}
            >
              <div className="flex items-center gap-2">
                <span>{getLanguageIcon(project.language)}</span>
                <span className="text-xs font-medium text-[var(--text-primary)] truncate">{project.name}</span>
              </div>
              {project.framework && (
                <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">{project.framework}</span>
              )}
              <span className="text-[10px] text-[var(--text-muted)] font-mono block truncate mt-0.5">{project.path}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
