import React, { useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { api } from '@/lib/api'
import {
  FolderOpen,
  GitBranch,
  FolderPlus,
  X,
  CheckCircle2,
  ArrowRight,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

export function ProjectModal() {
  const { projectModalOpen, setProjectModalOpen } = useUIStore()
  const { addProject, setActiveProject, projects } = useProjectStore()

  const [tab, setTab] = useState<'open' | 'clone' | 'create'>('open')
  const [folderPath, setFolderPath] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzedProject, setAnalyzedProject] = useState<Project | null>(null)

  if (!projectModalOpen) return null

  const handleOpenFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!folderPath.trim() || loading) return
    setLoading(true)
    setError(null)
    setAnalyzedProject(null)

    try {
      const project = await api.projects.create(folderPath.trim())
      addProject(project)
      setActiveProject(project)
      setAnalyzedProject(project)
      setFolderPath('')
    } catch (err: any) {
      setError(err.message || 'Failed to open project folder')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectRecent = (project: Project) => {
    setActiveProject(project)
    setProjectModalOpen(false)
  }

  const handleClose = () => {
    setProjectModalOpen(false)
    setAnalyzedProject(null)
    setError(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Select or Open Project
          </h2>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 3 Action Tabs */}
        <div className="grid grid-cols-3 p-2 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] gap-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => { setTab('open'); setError(null) }}
            className={cn(
              'flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors',
              tab === 'open'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <FolderOpen size={14} />
            <span>Open Folder</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('clone'); setError(null) }}
            className={cn(
              'flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors',
              tab === 'clone'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <GitBranch size={14} />
            <span>Clone Repo</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('create'); setError(null) }}
            className={cn(
              'flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors',
              tab === 'create'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <FolderPlus size={14} />
            <span>Create New</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5">
          {tab === 'open' && (
            <form onSubmit={handleOpenFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Local Directory Path
                </label>
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="e.g. C:\Users\you\Documents\my-app or /home/you/my-app"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] rounded-lg px-3.5 py-2.5 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-all"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setFolderPath(window.location.pathname ? 'C:\\Users\\itzsh\\OneDrive\\Documents\\ChatBot\\codepilot-ai' : '.')}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Use current folder
                </button>
                <button
                  type="submit"
                  disabled={!folderPath.trim() || loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-opacity"
                >
                  {loading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Analyzing…</span>
                    </>
                  ) : (
                    <>
                      <span>Open & Analyze</span>
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {tab === 'clone' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Git Repository URL
                </label>
                <input
                  type="text"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/username/repo.git"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3.5 py-2.5 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Repository will be cloned into your projects workspace and analyzed automatically.
              </p>
            </div>
          )}

          {tab === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="my-new-project"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3.5 py-2.5 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                A clean workspace will be initialized for CodePilot AI to scaffold.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-[var(--danger)] flex items-center gap-1.5">
              <span>⚠</span> {error}
            </p>
          )}

          {/* Instant Analysis Preview Card */}
          {analyzedProject && (
            <div className="mt-4 p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] animate-in fade-in">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--success)]">
                  <CheckCircle2 size={14} />
                  <span>Project Ready</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">Analyzed</span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                {analyzedProject.name}
              </h3>
              <div className="flex flex-wrap gap-1.5 text-xs text-[var(--text-secondary)]">
                {analyzedProject.framework && (
                  <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    {analyzedProject.framework}
                  </span>
                )}
                {analyzedProject.language && (
                  <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    {analyzedProject.language}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  {analyzedProject.fileCount || 1} files
                </span>
                {analyzedProject.testFileCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    {analyzedProject.testFileCount} tests
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="mt-3 w-full py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Start Coding in this Project →
              </button>
            </div>
          )}

          {/* Recent Projects List */}
          {projects.length > 0 && !analyzedProject && (
            <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
              <span className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Recently Opened
              </span>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {projects.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectRecent(p)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <span className="font-medium text-[var(--text-primary)] truncate">{p.name}</span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">
                      {p.path}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
