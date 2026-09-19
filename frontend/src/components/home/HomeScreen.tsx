import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  AtSign,
  Eye,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Github,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { useGithub } from '@/features/github/store'
import { api } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { fadeUp, listStagger } from '@/lib/motion'
import { toast } from '@/components/ui/toast'
import { StatusGlyph } from '@/components/ui/StatusGlyph'
import { Badge, Button, EmptyState, Kbd, Segmented, Skeleton, Spinner } from '@/components/ui/primitives'
import type { AgentMode, AutonomyLevel } from '@/types'

const MODES: Array<{ value: AgentMode; label: string; hint: string; readOnly?: boolean; placeholder: string; suggestions: string[] }> = [
  {
    value: 'BUILD',
    label: 'Build',
    hint: 'Implement a feature or new code',
    placeholder: 'Describe what to build — e.g. “Add JWT authentication to the API with tests”',
    suggestions: ['Add a /health endpoint with a test', 'Create a reusable Button component', 'Add input validation to the signup form'],
  },
  {
    value: 'FIX',
    label: 'Fix',
    hint: 'Find and repair a bug',
    placeholder: 'What is broken? Include the error message or the steps to reproduce.',
    suggestions: ['Fix the failing tests', 'Find why the build breaks on a clean install', 'Fix the memory leak in the file watcher'],
  },
  {
    value: 'EXPLAIN',
    label: 'Explain',
    hint: 'Read-only — answers from your code',
    readOnly: true,
    placeholder: 'Ask about the code — e.g. “How does authentication work here?”',
    suggestions: ['Give me a tour of this codebase', 'Explain how requests flow through the backend', 'What are the main modules and how do they connect?'],
  },
  {
    value: 'REVIEW',
    label: 'Review',
    hint: 'Read-only — reviews your code',
    readOnly: true,
    placeholder: 'What should be reviewed? e.g. “Review @folder:src/api for bugs and security issues”',
    suggestions: ['Review the project for security issues', 'Review error handling in the API routes', 'Find dead code and unused dependencies'],
  },
  {
    value: 'REFACTOR',
    label: 'Refactor',
    hint: 'Restructure without changing behaviour',
    placeholder: 'What should be restructured? e.g. “Split the 800-line component into smaller ones”',
    suggestions: ['Extract duplicated logic into a shared helper', 'Convert callbacks to async/await', 'Split the largest file into modules'],
  },
  {
    value: 'TEST',
    label: 'Test',
    hint: 'Write or repair tests',
    placeholder: 'What should be tested? e.g. “Add unit tests for the pricing module”',
    suggestions: ['Add unit tests for the utility functions', 'Increase coverage for the API routes', 'Add a regression test for the last bug fix'],
  },
]

const AUTONOMY: Array<{ value: AutonomyLevel; label: string; hint: string }> = [
  { value: 'SAFE', label: 'Ask first', hint: 'You approve every file change before it is written' },
  { value: 'BALANCED', label: 'Auto-edit', hint: 'Edits files on its own; asks before risky commands' },
  { value: 'AUTONOMOUS', label: 'Full auto', hint: 'Runs end to end without asking' },
]

const CONTEXT_TOKENS = ['@file:', '@folder:', '@project']

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function HomeScreen() {
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AgentMode>('BUILD')
  const [autonomy, setAutonomy] = useState<AutonomyLevel>('BALANCED')
  const [repoQuery, setRepoQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const autonomySeeded = useRef(false)

  const activeProject = useProjectStore((s) => s.activeProject)
  const { tasks, tasksLoaded, addTask, setActiveTask } = useTaskStore()
  const setCurrentView = useUIStore((s) => s.setCurrentView)
  const openProjectModalWithTab = useUIStore((s) => s.openProjectModalWithTab)
  const openRepo = useGithub((s) => s.open)

  // Start from the autonomy level chosen in Settings (the server applies the same default).
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 30_000 })
  useEffect(() => {
    if (settings?.autonomyLevel && !autonomySeeded.current) {
      autonomySeeded.current = true
      setAutonomy(settings.autonomyLevel)
    }
  }, [settings])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const modeInfo = useMemo(() => MODES.find((m) => m.value === mode)!, [mode])
  const autonomyInfo = AUTONOMY.find((a) => a.value === autonomy)!

  const handleSubmit = async () => {
    const text = command.trim()
    if (!text || loading) return

    if (!activeProject) {
      toast.info('Open a project first', 'CodePilot works inside a project folder.')
      openProjectModalWithTab('open')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const task = await api.tasks.create(activeProject.id, { command: text, mode, autonomy })
      addTask(task)
      setCommand('')
      setCurrentView('task')
    } catch (err: any) {
      const message = err.message || 'Failed to start the task'
      setError(message)
      toast.error('Could not start the task', message)
    } finally {
      setLoading(false)
    }
  }

  const insertToken = (token: string) => {
    setCommand((prev) => (prev && !prev.endsWith(' ') ? `${prev} ${token}` : `${prev}${token}`))
    textareaRef.current?.focus()
  }

  const submitRepo = (e: React.FormEvent) => {
    e.preventDefault()
    const q = repoQuery.trim()
    if (!q) return
    openRepo(q)
    setCurrentView('github')
    setRepoQuery('')
  }

  const recent = tasks.slice(0, 5)

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="cp-grid pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden />

      <motion.div
        variants={listStagger(0.06)}
        initial="hidden"
        animate="show"
        className="relative mx-auto grid max-w-[1180px] gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-10 lg:py-10"
      >
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          <motion.header variants={fadeUp}>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent-text)]">{greeting()}</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[34px]">
              {activeProject ? (
                <>
                  What should we do in <span className="text-[var(--accent-text)]">{activeProject.name}</span>?
                </>
              ) : (
                'What are we building?'
              )}
            </h1>
          </motion.header>

          {/* Composer */}
          <motion.section variants={fadeUp} aria-label="New task">
            <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--accent-text)] focus-within:shadow-[0_0_0_4px_var(--accent-subtle)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
                <Segmented value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label, hint: m.hint }))} ariaLabel="Task type" size="sm" />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={mode}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                    className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]"
                  >
                    {modeInfo.readOnly && <Eye size={12} className="text-[var(--accent-text)]" />}
                    {modeInfo.hint}
                  </motion.span>
                </AnimatePresence>
              </div>

              <textarea
                ref={textareaRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder={modeInfo.placeholder}
                aria-label="Describe the task"
                rows={4}
                className="block w-full resize-none bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] px-3 py-2.5">
                <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <AtSign size={11} /> Context
                </span>
                {CONTEXT_TOKENS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => insertToken(t)}
                    className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  >
                    {t}
                  </button>
                ))}

                <div className="ml-auto flex items-center gap-2">
                  <Segmented value={autonomy} onChange={setAutonomy} options={AUTONOMY.map((a) => ({ value: a.value, label: a.label, hint: a.hint }))} ariaLabel="Autonomy" size="sm" />
                  <Button variant="primary" size="md" onClick={() => void handleSubmit()} disabled={!command.trim()} loading={loading} aria-label="Run task (Ctrl+Enter)">
                    {loading ? 'Starting' : 'Run'}
                    {!loading && <ArrowRight size={15} />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[11.5px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-[var(--accent-text)]" />
                {autonomyInfo.hint}
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Ctrl</Kbd>
                <Kbd>Enter</Kbd> to run
              </span>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                  role="alert"
                >
                  <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] px-3.5 py-2.5 text-[13px] text-[var(--danger)]">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs font-semibold hover:underline">
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Suggestions for the chosen mode */}
            <div className="mt-4 flex flex-wrap gap-2">
              {modeInfo.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setCommand(s)
                    textareaRef.current?.focus()
                  }}
                  className="cp-press flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                >
                  <Sparkles size={11} className="text-[var(--accent-text)]" />
                  {s}
                </button>
              ))}
            </div>
          </motion.section>

          {/* Recent tasks */}
          <motion.section variants={fadeUp} aria-labelledby="recent-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="recent-heading" className="text-sm font-semibold text-[var(--text-primary)]">
                Jump back in
              </h2>
              {tasks.length > 5 && <span className="text-xs text-[var(--text-muted)]">{tasks.length} tasks in this project</span>}
            </div>

            {!activeProject ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-strong)]">
                <EmptyState
                  icon={<FolderOpen size={20} />}
                  title="No project open"
                  description="Open a folder, clone a repository or scaffold a new project — then your tasks show up here."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="primary" onClick={() => openProjectModalWithTab('open')}>
                        <FolderOpen size={14} /> Open folder
                      </Button>
                      <Button onClick={() => openProjectModalWithTab('clone')}>
                        <GitBranch size={14} /> Clone repository
                      </Button>
                      <Button onClick={() => openProjectModalWithTab('create')}>
                        <FolderPlus size={14} /> New project
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : !tasksLoaded ? (
              <div className="space-y-2" aria-busy>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[58px]" style={{ opacity: 1 - i * 0.25 }} />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-strong)]">
                <EmptyState icon={<Sparkles size={20} />} title="No tasks yet" description="Describe something above and CodePilot will plan it, change the code, run the checks and show you the diff." />
              </div>
            ) : (
              <motion.ul variants={listStagger(0.04)} initial="hidden" animate="show" className="space-y-2">
                {recent.map((task) => (
                  <motion.li key={task.id} variants={fadeUp}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTask(task)
                        setCurrentView('task')
                      }}
                      className="cp-lift flex w-full items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-left hover:border-[var(--border-strong)]"
                    >
                      <StatusGlyph status={task.status} size={16} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-[var(--text-primary)]">{task.command}</span>
                        <span className="block text-[11.5px] text-[var(--text-muted)]">
                          {formatDate(task.createdAt)}
                          {task.filesChanged.length > 0 && ` · ${task.filesChanged.length} file${task.filesChanged.length === 1 ? '' : 's'} changed`}
                        </span>
                      </span>
                      <Badge>{task.mode.toLowerCase()}</Badge>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </motion.section>
        </div>

        {/* ── Side rail ───────────────────────────────────────────────── */}
        <aside className="space-y-4" aria-label="Shortcuts to tools">
          <motion.div variants={fadeUp} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Workspace</h2>
              <button type="button" onClick={() => openProjectModalWithTab(activeProject ? 'recent' : 'open')} className="text-xs font-medium text-[var(--accent-text)] hover:underline">
                {activeProject ? 'Switch' : 'Open'}
              </button>
            </div>
            {activeProject ? (
              <dl className="mt-3 space-y-2 text-[13px]">
                <div>
                  <dt className="sr-only">Name</dt>
                  <dd className="truncate font-semibold text-[var(--text-primary)]">{activeProject.name}</dd>
                </div>
                <div>
                  <dt className="sr-only">Path</dt>
                  <dd className="truncate font-mono text-[11px] text-[var(--text-muted)]" title={activeProject.path}>
                    {activeProject.path}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeProject.language && <Badge tone="accent">{activeProject.language}</Badge>}
                  {activeProject.framework && <Badge>{activeProject.framework}</Badge>}
                  <Badge>{activeProject.fileCount} files</Badge>
                  {activeProject.testFileCount > 0 && <Badge>{activeProject.testFileCount} tests</Badge>}
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">Choose the folder CodePilot should work in.</p>
            )}
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center gap-2">
              <Github size={15} className="text-[var(--text-secondary)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Explore a GitHub repo</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">Read the README, browse files, commits and issues — then clone it, or let AI brief you.</p>
            <form onSubmit={submitRepo} className="mt-3 flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Repository (owner/name or URL)</span>
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={repoQuery}
                  onChange={(e) => setRepoQuery(e.target.value)}
                  placeholder="facebook/react"
                  spellCheck={false}
                  className="h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-8 pr-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
                />
              </label>
              <Button type="submit" variant="secondary" disabled={!repoQuery.trim()} aria-label="Open repository">
                <ArrowRight size={14} />
              </Button>
            </form>
          </motion.div>

          <motion.button
            variants={fadeUp}
            type="button"
            onClick={() => setCurrentView('api-fetcher')}
            className="cp-lift group flex w-full items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left hover:border-[var(--border-strong)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-text)]">
              <Network size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">API Fetcher</span>
              <span className="block text-xs text-[var(--text-secondary)]">Send requests, inspect responses, generate client code</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]" />
          </motion.button>
        </aside>
      </motion.div>
    </div>
  )
}
