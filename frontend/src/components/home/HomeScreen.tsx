import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { api } from '@/lib/api'
import {
  Sparkles,
  ArrowRight,
  FolderPlus,
  Paperclip,
  CheckCircle2,
  SlidersHorizontal,
  AtSign
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AutonomyLevel } from '@/types'

const EXAMPLES = [
  { label: 'Build a feature', icon: '✨', prompt: 'Build a REST API endpoint for user profile updates with validation.' },
  { label: 'Fix a bug', icon: '🔧', prompt: 'Find and fix all runtime errors and edge cases in the application.' },
  { label: 'Optimize my code', icon: '⚡', prompt: 'Analyze performance bottlenecks and optimize critical code paths.' },
  { label: 'Explain my project', icon: '📖', prompt: 'Explain the architecture, folder structure, and key workflows in this codebase.' },
  { label: 'Generate tests', icon: '🧪', prompt: 'Write comprehensive automated unit tests covering key business logic.' },
]

export function HomeScreen() {
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autonomy, setAutonomy] = useState<AutonomyLevel>('BALANCED')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { activeProject } = useProjectStore()
  const { addTask } = useTaskStore()
  const { setCurrentView, setProjectModalOpen, setSettingsOpen } = useUIStore()

  const { data: providersData } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: api.ai.getProviders,
    staleTime: 30000,
  })

  const configuredCount = providersData?.providers?.filter((p) => p.isConfigured).length ?? 0
  const activeMode = providersData?.routingMode ?? 'auto'
  const activeProviderName =
    activeMode === 'auto'
      ? 'Auto Router'
      : (providersData?.providers?.find((p) => p.id === activeMode)?.name ?? activeMode)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = async () => {
    const text = command.trim()
    if (!text || loading) return

    if (!activeProject) {
      // Prompt user to pick/open project first
      setProjectModalOpen(true)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const task = await api.tasks.create(activeProject.id, {
        command: text,
        mode: 'BUILD',
      })
      addTask(task)
      setCommand('')
      setCurrentView('task')
    } catch (err: any) {
      setError(err.message || 'Failed to start agent task')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex-1 h-screen overflow-y-auto flex flex-col items-center justify-center p-6 bg-[var(--bg-app)]">
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)] mb-3">
          What do you want to build?
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] mb-8 max-w-md">
          Just describe what you want in plain English. CodePilot plans, codes, tests, and verifies it.
        </p>

        {/* Hero Command Box */}
        <div className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-subtle)] rounded-2xl shadow-sm transition-all duration-200 p-4 mb-4 text-left">
          <textarea
            ref={textareaRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want me to build or fix... (Ctrl+Enter to run)"
            rows={4}
            className="w-full bg-transparent border-0 resize-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none text-base sm:text-lg leading-relaxed font-sans"
          />

          {/* Bottom Toolbar of the Input */}
          <div className="pt-3 mt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
            {/* Left Context Controls */}
            <div className="flex items-center gap-2">
              {activeProject ? (
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-colors"
                  title="Active Workspace Project"
                >
                  <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
                  <span className="max-w-[140px] truncate">{activeProject.name}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent-subtle)]/80 border border-[var(--accent)]/20 transition-colors"
                >
                  <FolderPlus size={13} />
                  <span>+ Add Project</span>
                </button>
              )}

              {/* Active AI Provider / Router Badge */}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-colors"
                title={`${activeProviderName} · ${configuredCount} active provider${configuredCount === 1 ? '' : 's'}. Click to configure in Settings.`}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    configuredCount > 0 ? 'bg-emerald-400' : 'bg-zinc-500'
                  )}
                />
                <Sparkles size={11} className="text-[var(--accent)]" />
                <span className="max-w-[120px] truncate">{activeProviderName}</span>
              </button>

              {/* Autonomy Selector */}
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-colors"
                >
                  <SlidersHorizontal size={12} />
                  <span>
                    {autonomy === 'SAFE' && 'Ask before changes'}
                    {autonomy === 'BALANCED' && 'Allow normal changes'}
                    {autonomy === 'AUTONOMOUS' && 'Full autonomy'}
                  </span>
                </button>
                <div className="absolute left-0 bottom-full mb-1 hidden group-hover:flex group-focus-within:flex flex-col bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-lg shadow-lg p-1.5 w-60 z-20">
                  <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2 py-1">
                    Agent Autonomy
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutonomy('SAFE')}
                    className={cn(
                      'text-left px-2 py-1.5 rounded text-xs transition-colors',
                      autonomy === 'SAFE' ? 'bg-[var(--accent)] text-white font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    )}
                  >
                    <div>Ask before changes</div>
                    <div className="text-[10px] opacity-80">Prompts before every modification</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutonomy('BALANCED')}
                    className={cn(
                      'text-left px-2 py-1.5 rounded text-xs transition-colors',
                      autonomy === 'BALANCED' ? 'bg-[var(--accent)] text-white font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    )}
                  >
                    <div>Allow normal changes</div>
                    <div className="text-[10px] opacity-80">Auto-modifies files, asks for dangerous ops</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutonomy('AUTONOMOUS')}
                    className={cn(
                      'text-left px-2 py-1.5 rounded text-xs transition-colors',
                      autonomy === 'AUTONOMOUS' ? 'bg-[var(--accent)] text-white font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    )}
                  >
                    <div>Full autonomy</div>
                    <div className="text-[10px] opacity-80">Completes tasks with minimal interaction</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Action Button */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="hidden sm:inline text-xs text-[var(--text-muted)]">
                Ctrl+Enter
              </span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!command.trim() || loading}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                  command.trim() && !loading
                    ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm active:scale-[0.98]'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border-subtle)]'
                )}
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Planning…</span>
                  </>
                ) : (
                  <>
                    <span>Run Agent</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error message if any */}
        {error && (
          <p className="text-xs text-[var(--danger)] mb-4 flex items-center gap-1.5">
            <span>⚠</span> {error}
          </p>
        )}

        {/* Project Ready Badge */}
        {activeProject && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] mb-6 shadow-xs">
            <CheckCircle2 size={13} className="text-[var(--success)]" />
            <span>Project Ready</span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-primary)]">{activeProject.name}</span>
            {activeProject.language && (
              <>
                <span className="text-[var(--text-muted)]">·</span>
                <span>{activeProject.language}</span>
              </>
            )}
            {activeProject.fileCount > 0 && (
              <>
                <span className="text-[var(--text-muted)]">·</span>
                <span>{activeProject.fileCount} files</span>
              </>
            )}
          </div>
        )}

        {/* Clickable Quick Examples */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => {
                setCommand(ex.prompt)
                textareaRef.current?.focus()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all shadow-xs"
            >
              <span>{ex.icon}</span>
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
