import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FilePen,
  FileCode2,
  Flag,
  ListChecks,
  Play,
  RotateCcw,
  ShieldQuestion,
  Sparkles,
  Split,
  Terminal as TerminalIcon,
  Wrench,
  X,
} from 'lucide-react'
import { stepsToEvents, useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { api } from '@/lib/api'
import { cn, formatDuration } from '@/lib/utils'
import { collapse, fadeUp, listStagger, springSnappy, springSoft } from '@/lib/motion'
import { useNow } from '@/hooks/useNow'
import { toast } from '@/components/ui/toast'
import { Markdown } from '@/components/ui/Markdown'
import { StatusGlyph } from '@/components/ui/StatusGlyph'
import { Badge, Button, EmptyState, Skeleton, Tabs } from '@/components/ui/primitives'
import type { AgentEvent, AgentMode, Task } from '@/types'

// The editors and the terminal (CodeMirror, merge view, xterm) are heavy and only needed on their tabs.
const DiffViewer = lazy(() => import('@/components/editor/DiffViewer').then((m) => ({ default: m.DiffViewer })))
const CodeEditor = lazy(() => import('@/components/editor/CodeEditor').then((m) => ({ default: m.CodeEditor })))
const FileTree = lazy(() => import('@/components/sidebar/FileTree').then((m) => ({ default: m.FileTree })))
const Terminal = lazy(() => import('@/components/terminal/Terminal').then((m) => ({ default: m.Terminal })))

function TabFallback() {
  return (
    <div className="space-y-3 p-6" role="status" aria-label="Loading">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

const READ_ONLY_MODES: AgentMode[] = ['EXPLAIN', 'REVIEW']
const AUTONOMY_LABEL = { SAFE: 'asks first', BALANCED: 'auto-edit', AUTONOMOUS: 'full auto' } as const

interface Milestone {
  label: string
  stages: string[]
}

/** The steps a task moves through, in the words a person would use. Read-only tasks have their own, shorter path. */
function milestonesFor(mode: AgentMode): Milestone[] {
  if (READ_ONLY_MODES.includes(mode)) {
    return [
      { label: 'Reading the project', stages: ['INSPECTING'] },
      { label: mode === 'REVIEW' ? 'Reviewing' : 'Working out the answer', stages: ['UNDERSTANDING'] },
      { label: 'Answer ready', stages: ['COMPLETE'] },
    ]
  }
  return [
    { label: 'Understanding', stages: ['UNDERSTANDING', 'PLANNING'] },
    { label: 'Inspecting', stages: ['INSPECTING'] },
    { label: 'Implementing', stages: ['IMPLEMENTING'] },
    { label: 'Testing', stages: ['RUNNING', 'TESTING', 'DEBUGGING'] },
    { label: 'Verifying', stages: ['OPTIMIZING', 'VERIFYING', 'COMPLETE'] },
  ]
}

function currentMilestone(task: Task, milestones: Milestone[]): number {
  const stage = task.currentStage
  if (!stage) return 0
  const idx = milestones.findIndex((m) => m.stages.includes(stage))
  return idx === -1 ? 0 : idx
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const HIDDEN_TYPES = new Set(['heartbeat', 'iteration', 'command_output'])

function eventIcon(e: AgentEvent) {
  const warn = e.data?.level === 'warn'
  switch (e.type) {
    case 'stage_change':
      return <ArrowRight size={13} className="text-[var(--accent-text)]" />
    case 'file_change':
      return <FilePen size={13} className="text-[var(--accent-text)]" />
    case 'command_run':
      return <TerminalIcon size={13} className="text-[var(--text-secondary)]" />
    case 'test_result':
      return e.data?.passed === true ? <Check size={13} className="text-[var(--success)]" /> : <X size={13} className="text-[var(--danger)]" />
    case 'approval_required':
      return <ShieldQuestion size={13} className="text-[var(--warning)]" />
    case 'approval_resolved':
      return e.data?.approved === true ? <Check size={13} className="text-[var(--success)]" /> : <X size={13} className="text-[var(--text-muted)]" />
    case 'error':
      return <AlertCircle size={13} className="text-[var(--danger)]" />
    case 'cancelled':
      return <Ban size={13} className="text-[var(--warning)]" />
    case 'complete':
      return <CheckCircle2 size={13} className="text-[var(--success)]" />
    default:
      return warn ? <AlertTriangle size={13} className="text-[var(--warning)]" /> : <span className="block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
  }
}

function clock(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function ActivityFeed({ events, live }: { events: AgentEvent[]; live: boolean }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const feed = useMemo(() => events.filter((e) => !HIDDEN_TYPES.has(e.type)), [events])

  // Follow the newest line while the task runs, unless the user scrolled up to read.
  useEffect(() => {
    const el = box.current
    if (!el || !live) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [feed.length, live])

  const copyLogs = () => {
    const text = feed.map((e) => `${clock(e.timestamp)} [${e.stage ?? 'AGENT'}] ${e.message}`).join('\n')
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => toast.error('Could not copy to the clipboard')
    )
  }

  return (
    <section aria-labelledby="activity-title" className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left">
          <ListChecks size={15} className="text-[var(--text-muted)]" />
          <h3 id="activity-title" className="text-[13px] font-semibold text-[var(--text-primary)]">
            Activity
          </h3>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{feed.length}</span>
          <ChevronDown size={14} className={cn('ml-auto text-[var(--text-muted)] transition-transform', open && 'rotate-180')} />
        </button>
        {feed.length > 0 && (
          <Button size="sm" variant="ghost" onClick={copyLogs} aria-label="Copy activity log">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden">
            <div ref={box} className="max-h-80 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-2.5" role="log" aria-live={live ? 'polite' : 'off'} aria-label="Task activity">
              {feed.length === 0 ? (
                <p className="py-3 text-xs text-[var(--text-muted)]">{live ? 'Waiting for the first update…' : 'No activity was recorded for this task.'}</p>
              ) : (
                <ol className="space-y-1.5">
                  {feed.map((e, i) => (
                    <motion.li
                      key={`${e.timestamp}-${i}`}
                      initial={live && i > feed.length - 4 ? { opacity: 0, x: -6 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-start gap-2.5 text-[12.5px] leading-relaxed"
                    >
                      <span className="mt-[5px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">{eventIcon(e)}</span>
                      <span className={cn('min-w-0 flex-1 break-words', e.type === 'error' ? 'text-[var(--danger)]' : e.type === 'stage_change' ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
                        {e.message}
                      </span>
                      <time className="shrink-0 pt-px font-mono text-[10.5px] text-[var(--text-muted)]" dateTime={e.timestamp}>
                        {clock(e.timestamp)}
                      </time>
                    </motion.li>
                  ))}
                </ol>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

// ── Approval cards ────────────────────────────────────────────────────────────

function ApprovalCard({ event, onAnswer, busy }: { event: AgentEvent; onAnswer: (approved: boolean) => void; busy: boolean }) {
  const kind = String(event.data?.kind ?? '')
  const details = (event.data?.details ?? {}) as Record<string, unknown>
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={springSnappy}
      role="alertdialog"
      aria-label="Approval needed"
      className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,var(--bg-surface))] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-[var(--warning)]">
          <ShieldQuestion size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--warning)]">Waiting for your approval</p>
          <p className="mt-0.5 break-words text-[14px] font-semibold text-[var(--text-primary)]">{event.message}</p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {kind === 'file_write' ? (details.isNew ? 'A new file will be created.' : 'This file will be overwritten — you can roll it back from Changes.') : 'This command runs on your machine.'} The task is paused until you answer.
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap justify-end gap-2">
        <Button size="sm" onClick={() => onAnswer(false)} disabled={busy}>
          Skip this
        </Button>
        <Button size="sm" variant="primary" onClick={() => onAnswer(true)} loading={busy}>
          <Check size={13} /> Approve
        </Button>
      </div>
    </motion.div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'changes' | 'code' | 'terminal'

export function TaskWorkspace() {
  const { activeTask, agentEvents, addTask, patchTask, setAgentEvents } = useTaskStore()
  const activeProject = useProjectStore((s) => s.activeProject)
  const workspaceTab = useUIStore((s) => s.workspaceTab)
  const setWorkspaceTab = useUIStore((s) => s.setWorkspaceTab)
  const setCurrentView = useUIStore((s) => s.setCurrentView)
  const selectedFile = useUIStore((s) => s.selectedFile)

  const [cancelling, setCancelling] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [answering, setAnswering] = useState<Set<string>>(new Set())
  const [copiedAnswer, setCopiedAnswer] = useState(false)

  const live = !!activeTask && (activeTask.status === 'RUNNING' || activeTask.status === 'PENDING')
  const now = useNow(live)

  // A finished task has no live stream: rebuild what happened from its stored steps.
  const taskId = activeTask?.id
  useEffect(() => {
    if (!taskId || live) return
    if (useTaskStore.getState().agentEvents.length > 0) return
    let cancelled = false
    api.tasks
      .getSteps(taskId)
      .then((steps) => {
        if (!cancelled && useTaskStore.getState().activeTask?.id === taskId) setAgentEvents(stepsToEvents(steps))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [taskId, live, setAgentEvents])

  const pendingApprovals = useMemo(() => {
    if (!live) return []
    const resolved = new Set(agentEvents.filter((e) => e.type === 'approval_resolved').map((e) => String(e.data?.approvalId)))
    return agentEvents.filter((e) => e.type === 'approval_required' && !resolved.has(String(e.data?.approvalId)))
  }, [agentEvents, live])

  if (!activeTask) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<Play size={20} />}
          title="No task selected"
          description="Pick a task from the sidebar, or describe a new one on the Home screen."
          action={
            <Button variant="primary" onClick={() => setCurrentView('home')}>
              New task
            </Button>
          }
        />
      </div>
    )
  }

  const task = activeTask
  const isRunning = live
  const isComplete = task.status === 'COMPLETED'
  const isFailed = task.status === 'FAILED'
  const isCancelled = task.status === 'CANCELLED'
  const readOnly = READ_ONLY_MODES.includes(task.mode)
  const milestones = milestonesFor(task.mode)
  const stageIdx = isComplete ? milestones.length : currentMilestone(task, milestones)
  const progress = isComplete ? 1 : milestones.length > 1 ? Math.min(stageIdx, milestones.length - 1) / (milestones.length - 1) : 0

  const filesChanged = [...new Set([...(task.filesChanged ?? []), ...agentEvents.filter((e) => e.type === 'file_change' && e.data?.filePath).map((e) => String(e.data!.filePath))])]
  const testEvents = agentEvents.filter((e) => e.type === 'test_result')
  const lastTest = testEvents[testEvents.length - 1]
  const errorEvent = [...agentEvents].reverse().find((e) => e.type === 'error')
  const activity = [...agentEvents].reverse().find((e) => e.type === 'stage_change' || e.type === 'log' || e.type === 'file_change')?.message ?? 'Starting…'

  const startedAt = Date.parse(task.createdAt)
  const endedAt = task.completedAt ? Date.parse(task.completedAt) : now
  const elapsed = Number.isFinite(startedAt) ? formatDuration(Math.max(0, (isRunning ? now : endedAt) - startedAt)) : ''

  const handleCancel = async () => {
    setCancelling(true)
    try {
      patchTask(task.id, await api.tasks.cancel(task.id))
      toast.info('Task cancelled', 'Nothing more will be written. Changes made so far are in the Changes tab.')
    } catch (err) {
      toast.error('Could not cancel the task', (err as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  const handleRetry = async () => {
    if (!activeProject) return
    setRetrying(true)
    try {
      addTask(await api.tasks.create(activeProject.id, { command: task.command, mode: task.mode, autonomy: task.autonomy ?? undefined }))
    } catch (err) {
      toast.error('Could not start the task', (err as Error).message)
    } finally {
      setRetrying(false)
    }
  }

  const answer = async (event: AgentEvent, approved: boolean) => {
    const id = String(event.data?.approvalId)
    setAnswering((s) => new Set(s).add(id))
    try {
      await api.tasks.resolveApproval(task.id, id, approved)
    } catch (err) {
      toast.warning('That request was already handled', (err as Error).message)
    } finally {
      setAnswering((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  const copyAnswer = () => {
    navigator.clipboard?.writeText(task.summary ?? '').then(
      () => {
        setCopiedAnswer(true)
        setTimeout(() => setCopiedAnswer(false), 1500)
      },
      () => toast.error('Could not copy to the clipboard')
    )
  }

  const tab: Tab = (['overview', 'changes', 'code', 'terminal'] as const).includes(workspaceTab as Tab) && !(readOnly && workspaceTab === 'changes') ? (workspaceTab as Tab) : 'overview'
  const tabs = [
    { value: 'overview' as const, label: 'Overview' },
    ...(readOnly ? [] : [{ value: 'changes' as const, label: <><Split size={13} /> Changes</>, badge: filesChanged.length > 0 ? <span className="rounded-full bg-[var(--accent-subtle)] px-1.5 font-mono text-[10.5px] text-[var(--accent-text)]">{filesChanged.length}</span> : undefined }]),
    { value: 'code' as const, label: <><FileCode2 size={13} /> Code</> },
    { value: 'terminal' as const, label: <><TerminalIcon size={13} /> Terminal</> },
  ]

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <StatusGlyph status={task.status} size={18} />
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold leading-tight text-[var(--text-primary)]" title={task.command}>
                {task.command}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--text-muted)]">
                <Badge>{task.mode.toLowerCase()}</Badge>
                {task.autonomy && !readOnly && <Badge tone={task.autonomy === 'SAFE' ? 'accent' : 'neutral'}>{AUTONOMY_LABEL[task.autonomy]}</Badge>}
                <span>
                  {isRunning ? 'Running' : isComplete ? 'Completed' : isFailed ? 'Needs attention' : isCancelled ? 'Cancelled' : task.status.toLowerCase()}
                  {elapsed && ` · ${elapsed}`}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Button variant="secondary" onClick={() => void handleCancel()} loading={cancelling} aria-label="Cancel task">
                <Ban size={14} /> Cancel
              </Button>
            ) : (
              <>
                <Button onClick={() => setCurrentView('home')}>New task</Button>
                <Button onClick={() => void handleRetry()} loading={retrying}>
                  <RotateCcw size={13} /> Run again
                </Button>
              </>
            )}
          </div>
        </div>
        <Tabs value={tab} onChange={setWorkspaceTab} items={tabs} ariaLabel="Task sections" className="border-b-0" />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className={tab === 'overview' ? '' : 'h-full'}
            role="tabpanel"
          >
            {tab === 'overview' && (
              <motion.div variants={listStagger(0.06)} initial="hidden" animate="show" className="mx-auto max-w-3xl space-y-5 p-6 sm:p-8">
                {/* Progress */}
                <motion.section variants={fadeUp} aria-label="Progress" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                  <div className="relative">
                    <div className="absolute left-[calc(100%/var(--n)/2)] right-[calc(100%/var(--n)/2)] top-3.5 h-0.5 rounded-full bg-[var(--border-subtle)]" style={{ '--n': milestones.length } as React.CSSProperties}>
                      <motion.div
                        className={cn('h-full rounded-full', isFailed || isCancelled ? 'bg-[var(--danger)]' : 'bg-[var(--accent-text)]')}
                        initial={false}
                        animate={{ width: `${progress * 100}%` }}
                        transition={springSoft}
                      />
                    </div>
                    <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr))` }}>
                      {milestones.map((m, idx) => {
                        const done = isComplete || stageIdx > idx
                        const current = !isComplete && stageIdx === idx
                        const stopped = current && (isFailed || isCancelled)
                        return (
                          <li key={m.label} className="flex flex-col items-center text-center" aria-current={current && isRunning ? 'step' : undefined}>
                            <motion.span
                              layout
                              className={cn(
                                'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold',
                                done
                                  ? 'border-transparent bg-[var(--accent)] text-[var(--on-accent)]'
                                  : stopped
                                    ? 'border-transparent bg-[var(--danger)] text-white'
                                    : current
                                      ? 'border-[var(--accent-text)] bg-[var(--bg-surface)] text-[var(--accent-text)]'
                                      : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                              )}
                            >
                              {current && isRunning && <span className="cp-pulse-ring absolute inset-0 rounded-full" aria-hidden />}
                              {done ? <Check size={13} /> : stopped ? '!' : idx + 1}
                            </motion.span>
                            <span className={cn('mt-2 px-1 text-[11.5px] leading-tight', current || done ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-muted)]')}>{m.label}</span>
                          </li>
                        )
                      })}
                    </ol>
                  </div>

                  <AnimatePresence initial={false}>
                    {isRunning && (
                      <motion.div variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden">
                        <div className="mt-5 flex items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
                          <StatusGlyph status="RUNNING" size={14} />
                          <p className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-secondary)]" aria-live="polite">
                            {activity}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.section>

                {/* Approvals */}
                <AnimatePresence initial={false}>
                  {pendingApprovals.map((ev) => (
                    <ApprovalCard key={String(ev.data?.approvalId)} event={ev} busy={answering.has(String(ev.data?.approvalId))} onAnswer={(approved) => void answer(ev, approved)} />
                  ))}
                </AnimatePresence>

                {/* Outcome */}
                <AnimatePresence mode="wait" initial={false}>
                  {isComplete && (
                    <motion.section key="done" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }} className="rounded-2xl border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[var(--bg-surface)] p-5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]">
                          <CheckCircle2 size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{readOnly ? 'Here’s what I found' : 'Task completed'}</h3>
                          {!readOnly && <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{task.summary || 'The requested changes were made and verified.'}</p>}
                        </div>
                        {readOnly && task.summary && (
                          <Button size="sm" variant="ghost" onClick={copyAnswer}>
                            {copiedAnswer ? <Check size={12} /> : <Copy size={12} />} {copiedAnswer ? 'Copied' : 'Copy'}
                          </Button>
                        )}
                      </div>

                      {readOnly && task.summary && (
                        <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-5">
                          <Markdown text={task.summary} />
                        </div>
                      )}

                      {!readOnly && (
                        <>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Badge tone="accent">
                              <FilePen size={11} /> {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'} changed
                            </Badge>
                            {lastTest && (
                              <Badge tone={lastTest.data?.passed === true ? 'success' : 'danger'}>
                                <Wrench size={11} /> {lastTest.data?.passed === true ? 'Tests passed' : 'Tests failing'}
                              </Badge>
                            )}
                            {task.iterationCount > 0 && <Badge>{task.iterationCount} fix attempt{task.iterationCount === 1 ? '' : 's'}</Badge>}
                          </div>
                          {filesChanged.length > 0 && (
                            <ul className="mt-3 max-h-32 space-y-0.5 overflow-y-auto font-mono text-[11.5px] text-[var(--text-secondary)]">
                              {filesChanged.slice(0, 12).map((f) => (
                                <li key={f} className="truncate">
                                  {f}
                                </li>
                              ))}
                              {filesChanged.length > 12 && <li className="text-[var(--text-muted)]">+ {filesChanged.length - 12} more</li>}
                            </ul>
                          )}
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {filesChanged.length > 0 && (
                              <Button variant="primary" onClick={() => setWorkspaceTab('changes')}>
                                Review changes <ArrowRight size={14} />
                              </Button>
                            )}
                            <Button onClick={() => setCurrentView('home')}>Run another task</Button>
                          </div>
                        </>
                      )}
                    </motion.section>
                  )}

                  {isFailed && (
                    <motion.section key="failed" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }} className="rounded-2xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--bg-surface)] p-5" role="alert">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-[var(--danger)]">
                          <AlertCircle size={18} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Something needs attention</h3>
                          <p className="mt-1 break-words text-[13px] leading-relaxed text-[var(--text-secondary)]">{errorEvent?.message || task.summary || 'The task stopped before it could finish.'}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button variant="primary" onClick={() => void handleRetry()} loading={retrying}>
                          <RotateCcw size={13} /> Try again
                        </Button>
                        {filesChanged.length > 0 && !readOnly && <Button onClick={() => setWorkspaceTab('changes')}>Review partial changes</Button>}
                      </div>
                    </motion.section>
                  )}

                  {isCancelled && (
                    <motion.section key="cancelled" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }} className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--bg-surface)] p-5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]">
                          <Flag size={16} />
                        </span>
                        <div>
                          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">You cancelled this task</h3>
                          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                            {filesChanged.length > 0 ? `${filesChanged.length} file${filesChanged.length === 1 ? ' was' : 's were'} already written — review or roll them back in Changes.` : 'No files were changed.'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="primary" onClick={() => void handleRetry()} loading={retrying}>
                          <RotateCcw size={13} /> Run again
                        </Button>
                        {filesChanged.length > 0 && !readOnly && <Button onClick={() => setWorkspaceTab('changes')}>Review changes</Button>}
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>

                <motion.div variants={fadeUp}>
                  <ActivityFeed events={agentEvents} live={isRunning} />
                </motion.div>

                {!isRunning && !isComplete && !isFailed && !isCancelled && (
                  <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <Sparkles size={13} /> Waiting to start…
                  </p>
                )}
              </motion.div>
            )}

            {tab === 'changes' && (
              <div className="h-full">
                <Suspense fallback={<TabFallback />}>
                  <DiffViewer />
                </Suspense>
              </div>
            )}

            {tab === 'code' && (
              <div className="flex h-full">
                <div className="hidden w-56 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] md:block">
                  <Suspense fallback={<TabFallback />}>
                    <FileTree />
                  </Suspense>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Suspense fallback={<TabFallback />}>
                    <CodeEditor filePath={selectedFile} projectId={activeProject?.id ?? null} readOnly={false} />
                  </Suspense>
                </div>
              </div>
            )}

            {tab === 'terminal' && (
              <div className="h-full">
                <Suspense fallback={<TabFallback />}>
                  <Terminal />
                </Suspense>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
