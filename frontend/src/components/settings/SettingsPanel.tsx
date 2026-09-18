import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUIStore } from '@/stores/ui.store'
import type { AppSettings, AutonomyLevel } from '@/types'
import {
  X,
  Sliders,
  Sparkles,
  Terminal,
  GitBranch,
  Laptop,
  Check,
  Eye,
  EyeOff,
  CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SettingsTab = 'general' | 'agent' | 'ai' | 'execution' | 'git'

const AUTONOMY_OPTIONS: { id: AutonomyLevel; label: string; desc: string }[] = [
  { id: 'SAFE', label: 'Ask before changes', desc: 'Prompts for explicit approval before any file modification' },
  { id: 'BALANCED', label: 'Allow normal changes', desc: 'Auto-edits project files; prompts only for dangerous/destructive commands' },
  { id: 'AUTONOMOUS', label: 'Full autonomy', desc: 'Executes end-to-end coding tasks without interruption unless blocked' },
]

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, theme, toggleTheme, setShortcutsModalOpen } = useUIStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const { data: settings, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    enabled: settingsOpen,
  })

  const [form, setForm] = useState<Partial<AppSettings>>({})

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  if (!settingsOpen) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.settings.update(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      refetch()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[520px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="h-14 px-6 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content: 2-column tabs */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Category Tabs */}
          <div className="w-48 border-r border-[var(--border-subtle)] bg-[var(--bg-card)] p-2 space-y-1 shrink-0 text-xs font-medium">
            <button
              onClick={() => setActiveTab('general')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                activeTab === 'general'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              <Laptop size={14} />
              <span>General</span>
            </button>
            <button
              onClick={() => setActiveTab('agent')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                activeTab === 'agent'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              <Sliders size={14} />
              <span>Agent</span>
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                activeTab === 'ai'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              <Sparkles size={14} />
              <span>AI Provider</span>
            </button>
            <button
              onClick={() => setActiveTab('execution')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                activeTab === 'execution'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              <Terminal size={14} />
              <span>Execution</span>
            </button>
            <button
              onClick={() => setActiveTab('git')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                activeTab === 'git'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              <GitBranch size={14} />
              <span>Git</span>
            </button>
          </div>

          {/* Right Tab Panel */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Theme
                  </label>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Choose between Dark mode (optimized for low light) and Light mode.
                  </p>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {theme === 'dark' ? '☀️ Switch to Light Theme' : '🌙 Switch to Dark Theme'}
                  </button>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Keyboard Shortcuts
                  </label>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    View full list of productivity shortcuts.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setSettingsOpen(false); setShortcutsModalOpen(true) }}
                    className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Open Shortcuts Cheat Sheet
                  </button>
                </div>
              </div>
            )}

            {/* AGENT TAB */}
            {activeTab === 'agent' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Autonomy Level
                  </label>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Control how independently CodePilot modifies files and executes commands.
                  </p>
                  <div className="space-y-2">
                    {AUTONOMY_OPTIONS.map((opt) => {
                      const selected = (form.autonomyLevel ?? 'BALANCED') === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, autonomyLevel: opt.id }))}
                          className={cn(
                            'w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors',
                            selected
                              ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                              : 'border-[var(--border-subtle)] hover:bg-[var(--bg-card)]'
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center',
                              selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)]'
                            )}
                          >
                            {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              {opt.label}
                            </span>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                              {opt.desc}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Max Iterations per Task: {form.maxIterations ?? 10}
                  </label>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Safety limit for self-debugging loops.
                  </p>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={form.maxIterations ?? 10}
                    onChange={(e) => setForm((f) => ({ ...f, maxIterations: Number(e.target.value) }))}
                    className="w-full accent-[var(--accent)]"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
                    <span>1 (Single pass)</span>
                    <span>10 (Default)</span>
                    <span>20 (Deep iterate)</span>
                  </div>
                </div>
              </div>
            )}

            {/* AI TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Gemini Model
                  </label>
                  <select
                    value={form.geminiModel ?? 'gemini-3.6-flash'}
                    onChange={(e) => setForm((f) => ({ ...f, geminiModel: e.target.value }))}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="gemini-3.6-flash">gemini-3.6-flash (Fast & Accurate)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (Deep reasoning)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Gemini API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={form.geminiApiKey ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, geminiApiKey: e.target.value }))}
                      placeholder="AIzaSy…"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                    Your key is securely stored in local configuration.
                  </p>
                </div>
              </div>
            )}

            {/* EXECUTION TAB */}
            {activeTab === 'execution' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Execution Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={form.executionTimeout ?? 60000}
                    onChange={(e) => setForm((f) => ({ ...f, executionTimeout: Number(e.target.value) }))}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Maximum time allowed before a command or test run is cancelled (default: 60,000ms).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Dangerous Commands Guard
                  </label>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Commands such as rm -rf, drop table, or format disk always require explicit user confirmation regardless of autonomy level.
                  </p>
                </div>
              </div>
            )}

            {/* GIT TAB */}
            {activeTab === 'git' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Automatic Snapshots
                  </label>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    CodePilot captures file snapshots before modifying code so that any task can be safely reverted with 1 click.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Git Remote Push Safety
                  </label>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    CodePilot never pushes code to remote git repositories automatically.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Bottom Save Bar */}
        <div className="h-14 px-6 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-center justify-between shrink-0">
          <div>
            {saved && (
              <span className="text-xs font-medium text-[var(--success)] flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 size={14} />
                <span>Settings saved</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(false)}
              className="px-4 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 shadow-xs"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
