import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronUp,
  Clock,
  Edit2,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { collapse, springSnappy } from '@/lib/motion'
import { parseRepoInput } from '@/features/github/lib/parse'
import { Modal, ModalClose, ModalTitle } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toast'
import { Badge, Button, EmptyState, Tabs } from '@/components/ui/primitives'
import type { Project, ProjectAnalysis, PathValidationResult } from '@/types'

type TabId = 'open' | 'clone' | 'create' | 'recent'

const INPUT =
  'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-2.5 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-[border-color,box-shadow] focus:border-[var(--accent-text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]'

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}

/** A repository the user typed as `owner/repo` (or pasted as a web URL) becomes the https clone URL git needs. */
function toCloneUrl(input: string): string {
  const parsed = parseRepoInput(input)
  return parsed.kind === 'repo' ? `https://github.com/${parsed.owner}/${parsed.repo}.git` : input.trim()
}

function repoNameFrom(url: string): string {
  const last = url.replace(/[/\\]+$/, '').replace(/\.git$/i, '').split(/[/:\\]/).pop() ?? ''
  return last.replace(/[^\w.-]/g, '')
}

export function ProjectModal() {
  const { projectModalOpen, setProjectModalOpen, projectModalTab, cloneUrl, setCloneUrl } = useUIStore()
  const { addProject, setActiveProject, updateProject, removeProject, projects, activeProject } = useProjectStore()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<TabId>(projectModalTab || 'open')

  // Real locations from the server — never a hard-coded path.
  const { data: defaults } = useQuery({ queryKey: ['project-defaults'], queryFn: api.projects.defaults, staleTime: Infinity, enabled: projectModalOpen })
  const sep = defaults?.separator ?? '/'
  const join = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}${sep}${name}`

  // Open Folder
  const [folderPath, setFolderPath] = useState('')
  const [pathValidation, setPathValidation] = useState<PathValidationResult | null>(null)
  const [validatingPath, setValidatingPath] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [browse, setBrowse] = useState<{ current: string; parent: string | null; folders: string[] } | null>(null)
  const [browseError, setBrowseError] = useState<string | null>(null)

  // Clone
  const [cloneInput, setCloneInput] = useState('')
  const [cloneTargetPath, setCloneTargetPath] = useState('')
  const [cloneTouchedPath, setCloneTouchedPath] = useState(false)
  const [cloneName, setCloneName] = useState('')

  // Create
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectPath, setNewProjectPath] = useState('')
  const [pathTouched, setPathTouched] = useState(false)
  const [newProjectTemplate, setNewProjectTemplate] = useState<'ts-react' | 'ts-node' | 'python' | 'blank'>('ts-react')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readyProject, setReadyProject] = useState<{ project: Project; analysis?: ProjectAnalysis } | null>(null)

  // Recent
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  useEffect(() => {
    if (projectModalOpen) {
      setTab(projectModalTab || 'open')
      setError(null)
    }
  }, [projectModalTab, projectModalOpen])

  // A repository handed over from the GitHub explorer pre-fills the Clone tab.
  useEffect(() => {
    if (projectModalOpen && cloneUrl) {
      setCloneInput(cloneUrl)
      setCloneName(repoNameFrom(cloneUrl))
      setCloneTouchedPath(false)
      setCloneUrl('')
    }
  }, [projectModalOpen, cloneUrl, setCloneUrl])

  // Default clone destination follows the repository name until the user edits it.
  useEffect(() => {
    if (!defaults || cloneTouchedPath) return
    const name = cloneName || repoNameFrom(cloneInput)
    setCloneTargetPath(name ? join(defaults.workspaceRoot, name) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults, cloneName, cloneInput, cloneTouchedPath])

  // Real-time path validation (debounced)
  useEffect(() => {
    if (!folderPath.trim()) {
      setPathValidation(null)
      return
    }
    const timer = setTimeout(async () => {
      setValidatingPath(true)
      try {
        setPathValidation(await api.projects.validatePath(folderPath.trim()))
      } catch {
        setPathValidation(null)
      } finally {
        setValidatingPath(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [folderPath])

  const openBrowser = async (path?: string) => {
    setBrowsing(true)
    setBrowseError(null)
    try {
      setBrowse(await api.projects.browse(path || folderPath.trim() || defaults?.workspaceRoot))
    } catch (err: any) {
      setBrowseError(err.message || 'Could not list that folder')
    }
  }

  const finish = (res: { project: Project; analysis?: ProjectAnalysis }, verb: string) => {
    addProject(res.project)
    setActiveProject(res.project)
    setReadyProject(res)
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    toast.success(`${verb} ${res.project.name}`, 'It is now your active project.')
  }

  const run = async (fn: () => Promise<{ project: Project; analysis?: ProjectAnalysis }>, verb: string, fallback: string) => {
    if (loading) return
    setLoading(true)
    setError(null)
    setReadyProject(null)
    try {
      finish(await fn(), verb)
    } catch (err: any) {
      setError(err.message || fallback)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFolder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!folderPath.trim()) return
    void run(() => api.projects.create(folderPath.trim()), 'Opened', 'Failed to open project folder')
  }
  const handleCloneRepo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!cloneInput.trim() || !cloneTargetPath.trim()) return
    void run(() => api.projects.clone(toCloneUrl(cloneInput), cloneTargetPath.trim(), cloneName.trim() || undefined), 'Cloned', 'Failed to clone repository')
  }
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectPath.trim()) return
    void run(() => api.projects.scaffold(newProjectPath.trim(), newProjectName.trim() || undefined, newProjectTemplate), 'Created', 'Failed to scaffold project')
  }

  const handleSelectRecent = (project: Project) => {
    setActiveProject(project)
    setProjectModalOpen(false)
    setReadyProject(null)
    toast.info(`Switched to ${project.name}`)
  }

  const handleRemoveRecent = async (id: string) => {
    try {
      await api.projects.delete(id)
      removeProject(id)
      setConfirmRemove(null)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.info('Removed from recent projects', 'The folder on disk was not touched.')
    } catch (err: any) {
      toast.error('Could not remove the project', err.message)
    }
  }

  const handleReveal = async (path: string) => {
    try {
      await api.projects.reveal(path)
    } catch (err: any) {
      toast.error('Could not open the folder', err.message)
    }
  }

  const handleSaveRename = async (id: string) => {
    const name = editName.trim()
    if (!name) return
    try {
      await api.projects.update(id, { name })
      updateProject(id, { name })
      setEditingId(null)
    } catch (err: any) {
      toast.error('Could not rename the project', err.message)
    }
  }

  const handleClose = (open: boolean) => {
    if (open) return
    setProjectModalOpen(false)
    setReadyProject(null)
    setError(null)
    setBrowsing(false)
  }

  const changeTab = (next: TabId) => {
    setTab(next)
    setError(null)
    setReadyProject(null)
  }

  const tabs = useMemo(
    () => [
      { value: 'open' as const, label: <><FolderOpen size={14} /> Open folder</> },
      { value: 'clone' as const, label: <><GitBranch size={14} /> Clone repo</> },
      { value: 'create' as const, label: <><FolderPlus size={14} /> Create new</> },
      { value: 'recent' as const, label: <><Clock size={14} /> Recent{projects.length ? <span className="font-mono text-[10.5px] text-[var(--text-muted)]">{projects.length}</span> : null}</> },
    ],
    [projects.length]
  )

  const submitBtn = (label: string, busyLabel: string, icon: React.ReactNode, disabled: boolean) => (
    <Button type="submit" variant="primary" disabled={disabled} loading={loading}>
      {loading ? busyLabel : (<>{icon}{label}</>)}
    </Button>
  )

  return (
    <Modal open={projectModalOpen} onOpenChange={handleClose} title="Choose a project" description="Open a folder, clone a repository, create a project, or switch to a recent one." className="max-w-2xl max-h-[90vh]" visibleTitle>
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-text)]">
            <FolderOpen size={18} />
          </span>
          <div>
            <ModalTitle className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">Choose a project</ModalTitle>
            <p className="text-xs text-[var(--text-muted)]">CodePilot works inside one project folder at a time</p>
          </div>
        </div>
        <ModalClose aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          <X size={16} />
        </ModalClose>
      </div>

      <Tabs value={tab} onChange={changeTab} items={tabs} ariaLabel="Project source" className="px-4" />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        <AnimatePresence initial={false}>
          {error && (
            <motion.div key="err" variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden" role="alert">
              <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] px-3.5 py-3 text-xs text-[var(--danger)]">
                <AlertTriangle size={15} className="mt-px shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Project ready */}
        {readyProject && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={springSnappy} className="rounded-2xl border border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-[var(--bg-card)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--success)]">
                <CheckCircle2 size={15} /> Project ready
              </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">Active workspace</span>
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{readyProject.project.name}</h3>
            <p className="mt-0.5 truncate font-mono text-[11.5px] text-[var(--text-muted)]" title={readyProject.project.path}>
              {readyProject.project.path}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                <span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-muted)]">Detected stack</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {[readyProject.analysis?.language || readyProject.project.language, readyProject.analysis?.framework, readyProject.analysis?.buildTool].filter(Boolean).join(' · ') || 'Unknown'}
                </span>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                <span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-muted)]">Files</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {readyProject.analysis?.sourceFileCount ?? readyProject.project.fileCount} source · {readyProject.analysis?.testFileCount ?? readyProject.project.testFileCount} test
                </span>
              </div>
              {readyProject.analysis?.gitStatus?.isRepo && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                  <span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-muted)]">Git</span>
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                    <GitBranch size={12} className="text-[var(--accent-text)]" />
                    {readyProject.analysis.gitStatus.branch || 'main'}
                    <Badge tone={readyProject.analysis.gitStatus.unstaged.length === 0 && readyProject.analysis.gitStatus.untracked.length === 0 ? 'success' : 'warning'}>
                      {readyProject.analysis.gitStatus.unstaged.length === 0 && readyProject.analysis.gitStatus.untracked.length === 0 ? 'clean' : `${readyProject.analysis.gitStatus.unstaged.length} modified`}
                    </Badge>
                  </span>
                </div>
              )}
              {readyProject.analysis?.entryPoint && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                  <span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-muted)]">Entry point</span>
                  <span className="block truncate font-mono text-[11px] text-[var(--text-primary)]">{readyProject.analysis.entryPoint}</span>
                </div>
              )}
            </div>
            <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => handleClose(false)}>
              Start working in this project <ArrowRight size={15} />
            </Button>
          </motion.div>
        )}

        {/* Open folder */}
        {tab === 'open' && !readyProject && (
          <form onSubmit={handleOpenFolder} className="space-y-4">
            <Field label="Local folder path" htmlFor="pm-folder" hint={defaults ? `Tip: your projects usually live in ${defaults.workspaceRoot}` : undefined}>
              <div className="relative">
                <input id="pm-folder" type="text" value={folderPath} onChange={(e) => setFolderPath(e.target.value)} placeholder={sep === '\\' ? 'C:\\Users\\you\\my-project' : '/home/you/my-project'} className={INPUT} autoFocus spellCheck={false} />
                {validatingPath && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-[var(--text-muted)]" />}
              </div>
              <AnimatePresence initial={false}>
                {pathValidation && (
                  <motion.p key={pathValidation.valid ? 'ok' : 'bad'} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-1.5 text-xs" role="status">
                    {pathValidation.valid ? (
                      <span className="flex items-center gap-1 text-[var(--success)]">
                        <CheckCircle2 size={13} /> Valid project folder: <b className="font-semibold">{pathValidation.name}</b>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[var(--danger)]">
                        <AlertTriangle size={13} /> {pathValidation.error}
                      </span>
                    )}
                  </motion.p>
                )}
              </AnimatePresence>
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => (browsing ? setBrowsing(false) : void openBrowser())} className="flex items-center gap-1 font-medium text-[var(--accent-text)] hover:underline" aria-expanded={browsing}>
                  <Folder size={13} /> {browsing ? 'Hide folder browser' : 'Browse folders'}
                </button>
                {defaults && (
                  <button type="button" onClick={() => setFolderPath(defaults.appRoot)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline">
                    Use CodePilot’s own folder
                  </button>
                )}
              </div>
              {submitBtn('Open & analyze', 'Analyzing…', <ArrowRight size={14} />, !folderPath.trim() || (pathValidation !== null && !pathValidation.valid))}
            </div>

            <AnimatePresence initial={false}>
              {browsing && (
                <motion.div variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)]">
                    <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
                      <button
                        type="button"
                        disabled={!browse?.parent}
                        onClick={() => browse?.parent && void openBrowser(browse.parent)}
                        aria-label="Up one folder"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--text-secondary)]" title={browse?.current}>
                        {browse?.current ?? 'Loading…'}
                      </span>
                      <Button size="sm" variant="primary" disabled={!browse} onClick={() => browse && (setFolderPath(browse.current), setBrowsing(false))}>
                        Select this folder
                      </Button>
                    </div>
                    <ul className="max-h-48 overflow-y-auto p-1" aria-label="Subfolders">
                      {browseError ? (
                        <li className="px-3 py-4 text-xs text-[var(--danger)]">{browseError}</li>
                      ) : !browse ? (
                        <li className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--text-muted)]">
                          <Loader2 size={13} className="animate-spin" /> Loading folders…
                        </li>
                      ) : browse.folders.length === 0 ? (
                        <li className="px-3 py-4 text-xs text-[var(--text-muted)]">No subfolders here.</li>
                      ) : (
                        browse.folders.map((name) => (
                          <li key={name}>
                            <button type="button" onClick={() => void openBrowser(join(browse.current, name))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
                              <Folder size={13} className="text-[var(--accent-text)]" /> {name}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        )}

        {/* Clone */}
        {tab === 'clone' && !readyProject && (
          <form onSubmit={handleCloneRepo} className="space-y-4">
            <Field label="Repository" htmlFor="pm-clone-url" hint="A Git URL, a GitHub link, or just owner/repo. Want to look first? Try the GitHub Explorer.">
              <input
                id="pm-clone-url"
                type="text"
                value={cloneInput}
                onChange={(e) => {
                  setCloneInput(e.target.value)
                  setCloneName(repoNameFrom(e.target.value))
                }}
                placeholder="https://github.com/user/repository.git  or  user/repository"
                className={INPUT}
                autoFocus
                spellCheck={false}
              />
            </Field>
            <Field label="Destination folder" htmlFor="pm-clone-dest" hint="Must not exist yet, or be empty.">
              <input
                id="pm-clone-dest"
                type="text"
                value={cloneTargetPath}
                onChange={(e) => {
                  setCloneTargetPath(e.target.value)
                  setCloneTouchedPath(true)
                }}
                placeholder={defaults ? join(defaults.workspaceRoot, 'my-cloned-app') : ''}
                className={INPUT}
                spellCheck={false}
              />
            </Field>
            <div className="flex justify-end">{submitBtn('Clone & open', 'Cloning & analyzing…', <GitBranch size={14} />, !cloneInput.trim() || !cloneTargetPath.trim())}</div>
          </form>
        )}

        {/* Create */}
        {tab === 'create' && !readyProject && (
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Project name" htmlFor="pm-new-name">
                <input
                  id="pm-new-name"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => {
                    setNewProjectName(e.target.value)
                    if (!pathTouched && defaults) setNewProjectPath(e.target.value ? join(defaults.workspaceRoot, e.target.value) : '')
                  }}
                  placeholder="my-cool-app"
                  className={INPUT}
                  autoFocus
                  spellCheck={false}
                />
              </Field>
              <Field label="Starter template" htmlFor="pm-new-template">
                <select id="pm-new-template" value={newProjectTemplate} onChange={(e) => setNewProjectTemplate(e.target.value as typeof newProjectTemplate)} className={cn(INPUT, 'font-sans')}>
                  <option value="ts-react">React + Vite + TypeScript</option>
                  <option value="ts-node">Node.js + TypeScript</option>
                  <option value="python">Python project</option>
                  <option value="blank">Blank workspace</option>
                </select>
              </Field>
            </div>
            <Field label="Directory path" htmlFor="pm-new-path">
              <input
                id="pm-new-path"
                type="text"
                value={newProjectPath}
                onChange={(e) => {
                  setNewProjectPath(e.target.value)
                  setPathTouched(true)
                }}
                placeholder={defaults ? join(defaults.workspaceRoot, 'my-cool-app') : ''}
                className={INPUT}
                spellCheck={false}
              />
            </Field>
            <div className="flex justify-end">{submitBtn('Create project', 'Scaffolding…', <FolderPlus size={14} />, !newProjectPath.trim())}</div>
          </form>
        )}

        {/* Recent */}
        {tab === 'recent' &&
          (projects.length === 0 ? (
            <EmptyState icon={<Clock size={20} />} title="No recent projects" description="Projects you open, clone or create show up here." />
          ) : (
            <ul className="space-y-2" aria-label="Recent projects">
              {projects.map((p) => {
                const isActive = activeProject?.id === p.id
                const isEditing = editingId === p.id
                const confirming = confirmRemove === p.id
                return (
                  <li key={p.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => !isEditing && !confirming && handleSelectRecent(p)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && !isEditing && !confirming) {
                          e.preventDefault()
                          handleSelectRecent(p)
                        }
                      }}
                      className={cn(
                        'group flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors',
                        isActive ? 'border-[var(--accent-text)]/50 bg-[var(--accent-subtle)]' : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleSaveRename(p.id)
                                  if (e.key === 'Escape') {
                                    e.stopPropagation()
                                    setEditingId(null)
                                  }
                                }}
                                aria-label="Project name"
                                className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 py-0.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-text)] focus:outline-none"
                                autoFocus
                              />
                              <button type="button" onClick={() => void handleSaveRename(p.id)} aria-label="Save name" className="p-1 text-[var(--success)] hover:brightness-125">
                                <Check size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{p.name}</span>
                              {isActive && <Badge tone="accent">current</Badge>}
                            </>
                          )}
                        </div>
                        <p className="mb-1.5 truncate font-mono text-[11px] text-[var(--text-muted)]" title={p.path}>
                          {p.path}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                          {p.language && <Badge>{p.language}</Badge>}
                          {p.framework && <Badge>{p.framework}</Badge>}
                          <span className="text-[var(--text-muted)]">{p.fileCount || 0} files</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {confirming ? (
                          <>
                            <span className="mr-1 text-[11px] text-[var(--text-secondary)]">Remove from list?</span>
                            <Button size="sm" variant="danger" onClick={() => void handleRemoveRecent(p.id)}>
                              Remove
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                              Keep
                            </Button>
                          </>
                        ) : (
                          <>
                            <button type="button" title="Reveal in file explorer" aria-label={`Reveal ${p.name} in file explorer`} onClick={() => void handleReveal(p.path)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]">
                              <ExternalLink size={14} />
                            </button>
                            <button
                              type="button"
                              title="Rename"
                              aria-label={`Rename ${p.name}`}
                              onClick={() => {
                                setEditingId(p.id)
                                setEditName(p.name)
                              }}
                              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button type="button" title="Remove from recent projects (files stay on disk)" aria-label={`Remove ${p.name} from recent projects`} onClick={() => setConfirmRemove(p.id)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--danger)]">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ))}
      </div>
    </Modal>
  )
}
