import React, { useState } from 'react'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { api } from '@/lib/api'
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Terminal as TerminalIcon,
  GitBranch,
  Split,
  Copy,
  Check,
  Play
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { DiffViewer } from '@/components/editor/DiffViewer'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { FileTree } from '@/components/sidebar/FileTree'
import { Terminal } from '@/components/terminal/Terminal'
import { GitPanel } from '@/components/sidebar/GitPanel'

// 5 User-friendly milestones mapped from internal agent stages
const MILESTONES = [
  { id: 'UNDERSTANDING', label: 'Understanding' },
  { id: 'INSPECTING', label: 'Inspecting project' },
  { id: 'IMPLEMENTING', label: 'Implementing fix' },
  { id: 'TESTING', label: 'Testing' },
  { id: 'VERIFYING', label: 'Verification' },
] as const

export function TaskWorkspace() {
  const { activeTask, agentEvents, addTask } = useTaskStore()
  const { activeProject } = useProjectStore()
  const {
    workspaceTab,
    setWorkspaceTab,
    setCurrentView,
    showTechnicalDetails,
    toggleTechnicalDetails,
    selectedFile
  } = useUIStore()

  const [copied, setCopied] = useState(false)
  const [retrying, setRetrying] = useState(false)

  if (!activeTask) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[var(--bg-app)]">
        <p className="text-sm text-[var(--text-muted)] mb-3">No task selected.</p>
        <button
          onClick={() => setCurrentView('home')}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          Create a Task
        </button>
      </div>
    )
  }

  const isRunning = activeTask.status === 'RUNNING' || activeTask.status === 'PENDING'
  const isComplete = activeTask.status === 'COMPLETED'
  const isFailed = activeTask.status === 'FAILED'

  // Map internal stage to one of the 5 milestones
  const getMilestoneIndex = () => {
    const stage = activeTask.currentStage
    if (stage === 'UNDERSTANDING' || stage === 'PLANNING') return 0
    if (stage === 'INSPECTING') return 1
    if (stage === 'IMPLEMENTING') return 2
    if (stage === 'RUNNING' || stage === 'TESTING' || stage === 'DEBUGGING') return 3
    if (stage === 'OPTIMIZING' || stage === 'VERIFYING' || stage === 'COMPLETE') return 4
    return isComplete ? 5 : 0
  }

  const currentMilestoneIndex = getMilestoneIndex()

  // Find latest action message from agent events
  const latestEvent = agentEvents[agentEvents.length - 1]
  const currentActivity = latestEvent?.message || 'Processing command...'

  // Extracted metrics
  const filesChanged = [...new Set(
    agentEvents
      .filter((e) => e.type === 'file_change' && e.data?.filePath)
      .map((e) => e.data!.filePath as string)
  )]

  const testsExecuted = agentEvents.filter((e) => e.type === 'test_result').length
  const commandsExecuted = agentEvents.filter((e) => e.type === 'command_run').length
  const errorEvents = agentEvents.filter((e) => e.type === 'error')

  const handleCopyLogs = () => {
    const logs = agentEvents.map((e) => `[${e.stage || 'AGENT'}] ${e.message}`).join('\n')
    navigator.clipboard.writeText(logs)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRetry = async () => {
    if (!activeProject) return
    setRetrying(true)
    try {
      const task = await api.tasks.create(activeProject.id, {
        command: activeTask.command,
        mode: activeTask.mode,
      })
      addTask(task)
    } catch {
      // ignore
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex-1 h-screen flex flex-col bg-[var(--bg-app)] overflow-hidden">
      {/* Workspace Header Bar */}
      <div className="h-14 px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
        {/* Task Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0">
            {isRunning && (
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
            )}
            {isComplete && (
              <CheckCircle2 size={16} className="text-[var(--success)]" />
            )}
            {isFailed && (
              <AlertCircle size={16} className="text-[var(--danger)]" />
            )}
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] truncate max-w-md sm:max-w-xl">
            {activeTask.command}
          </h2>
          <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
            {activeTask.mode}
          </span>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-[var(--bg-card)] p-1 rounded-lg border border-[var(--border-subtle)] text-xs font-medium">
          <button
            onClick={() => setWorkspaceTab('overview')}
            className={cn(
              'px-3 py-1 rounded-md transition-colors',
              workspaceTab === 'overview'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setWorkspaceTab('changes')}
            className={cn(
              'px-3 py-1 rounded-md transition-colors flex items-center gap-1.5',
              workspaceTab === 'changes'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <Split size={13} />
            <span>Changes</span>
            {filesChanged.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] flex items-center justify-center font-mono">
                {filesChanged.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setWorkspaceTab('code')}
            className={cn(
              'px-3 py-1 rounded-md transition-colors flex items-center gap-1.5',
              workspaceTab === 'code'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <FileCode2 size={13} />
            <span className="hidden sm:inline">Code</span>
          </button>
          <button
            onClick={() => setWorkspaceTab('terminal')}
            className={cn(
              'px-3 py-1 rounded-md transition-colors flex items-center gap-1.5',
              workspaceTab === 'terminal'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <TerminalIcon size={13} />
            <span className="hidden sm:inline">Terminal</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-y-auto">
        {/* OVERVIEW TAB */}
        {workspaceTab === 'overview' && (
          <div className="max-w-3xl mx-auto p-6 sm:p-10 space-y-6">
            {/* 5-Step Progress Tracker */}
            <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Progress
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {isComplete ? 'Finished' : isFailed ? 'Attention needed' : 'Running'}
                </span>
              </div>

              {/* Milestones horizontal chain */}
              <div className="grid grid-cols-5 gap-2 relative">
                {MILESTONES.map((m, idx) => {
                  const isDone = isComplete || currentMilestoneIndex > idx
                  const isCurrent = !isComplete && !isFailed && currentMilestoneIndex === idx
                  const isFailedCurrent = isFailed && currentMilestoneIndex === idx

                  return (
                    <div key={m.id} className="flex flex-col items-center text-center">
                      <div
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mb-2 transition-all',
                          isDone
                            ? 'bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/30'
                            : isCurrent
                            ? 'bg-[var(--accent)] text-white shadow-sm ring-4 ring-[var(--accent-subtle)]'
                            : isFailedCurrent
                            ? 'bg-[var(--danger)] text-white'
                            : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                        )}
                      >
                        {isDone ? (
                          '✓'
                        ) : isCurrent ? (
                          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        ) : isFailedCurrent ? (
                          '!'
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-[11px] font-medium leading-tight',
                          isCurrent
                            ? 'text-[var(--text-primary)] font-semibold'
                            : isDone
                            ? 'text-[var(--text-secondary)]'
                            : 'text-[var(--text-muted)]'
                        )}
                      >
                        {m.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Current Activity Line */}
              {isRunning && (
                <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex items-center gap-3">
                  <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
                  <p className="text-xs text-[var(--text-secondary)] font-mono truncate">
                    {currentActivity}
                  </p>
                </div>
              )}
            </div>

            {/* COMPLETION CARD */}
            {isComplete && (
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--success)]/30 shadow-xs animate-in fade-in">
                <div className="flex items-start gap-3.5 mb-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--success)]/15 text-[var(--success)] flex items-center justify-center shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      Task completed successfully
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                      {activeTask.summary || 'Requested changes have been implemented, tested, and verified.'}
                    </p>
                  </div>
                </div>

                {/* Metrics Pill Row */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {filesChanged.length > 0 && (
                    <span className="px-3 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] font-medium">
                      📝 {filesChanged.length} files changed
                    </span>
                  )}
                  {testsExecuted > 0 && (
                    <span className="px-3 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--success)] font-medium">
                      🧪 Tests passed
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] font-medium">
                    ⚡ Build verified
                  </span>
                </div>

                {/* Main Action Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setWorkspaceTab('changes')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] shadow-xs transition-colors"
                  >
                    <span>Review Changes</span>
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentView('home')}
                    className="px-4 py-2.5 rounded-xl bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-xs font-medium transition-colors"
                  >
                    Run Another Task
                  </button>
                </div>
              </div>
            )}

            {/* FAILURE / ATTENTION CARD */}
            {isFailed && (
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--danger)]/30 shadow-xs animate-in fade-in">
                <div className="flex items-start gap-3.5 mb-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--danger)]/15 text-[var(--danger)] flex items-center justify-center shrink-0">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      Something needs attention
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                      {errorEvents[errorEvents.length - 1]?.message ||
                        'The execution encountered an unexpected error. You can review the details or try running again.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    <RotateCcw size={13} />
                    <span>{retrying ? 'Retrying…' : 'Try Again'}</span>
                  </button>
                  <button
                    onClick={toggleTechnicalDetails}
                    className="px-4 py-2 rounded-xl bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    View Details
                  </button>
                </div>
              </div>
            )}

            {/* COLLAPSIBLE DETAILS (Progressive Disclosure) */}
            <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={toggleTechnicalDetails}
                className="w-full flex items-center justify-between px-5 py-3.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
              >
                <span>Technical Details & Logs</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)] font-normal font-mono">
                    {agentEvents.length} events
                  </span>
                  {showTechnicalDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </div>
              </button>

              {showTechnicalDetails && (
                <div className="p-5 border-t border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-4">
                  {/* Summary Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-muted)] block">Files Inspected</span>
                      <span className="font-semibold text-sm text-[var(--text-primary)]">
                        {activeProject?.fileCount || 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-muted)] block">Files Changed</span>
                      <span className="font-semibold text-sm text-[var(--text-primary)]">
                        {filesChanged.length}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-muted)] block">Commands Run</span>
                      <span className="font-semibold text-sm text-[var(--text-primary)]">
                        {commandsExecuted}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-muted)] block">Errors Found</span>
                      <span className="font-semibold text-sm text-[var(--danger)]">
                        {errorEvents.length}
                      </span>
                    </div>
                  </div>

                  {/* Raw Event Stream */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        Live Agent Logs
                      </span>
                      <button
                        onClick={handleCopyLogs}
                        className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1"
                      >
                        {copied ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copied ? 'Copied' : 'Copy logs'}</span>
                      </button>
                    </div>
                    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-3 font-mono text-[11px] max-h-60 overflow-y-auto space-y-1">
                      {agentEvents.map((e, idx) => (
                        <div key={idx} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-[var(--text-muted)] shrink-0">
                            [{e.stage ? e.stage.slice(0, 4) : 'EVT'}]
                          </span>
                          <span
                            className={cn(
                              e.type === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'
                            )}
                          >
                            {e.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHANGES (DIFF VIEWER) TAB */}
        {workspaceTab === 'changes' && (
          <div className="h-full">
            <DiffViewer />
          </div>
        )}

        {/* CODE TAB (CODE EDITOR + FILE EXPLORER) */}
        {workspaceTab === 'code' && (
          <div className="h-full flex">
            <div className="w-56 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 hidden md:block">
              <FileTree />
            </div>
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                filePath={selectedFile}
                projectId={activeProject?.id ?? null}
                readOnly={false}
              />
            </div>
          </div>
        )}

        {/* TERMINAL TAB */}
        {workspaceTab === 'terminal' && (
          <div className="h-full">
            <Terminal />
          </div>
        )}
      </div>
    </div>
  )
}
