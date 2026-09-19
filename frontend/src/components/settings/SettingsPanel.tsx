import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUIStore } from '@/stores/ui.store'
import type { AppSettings, AutonomyLevel, ProvidersResponse, HealthStatus, NvidiaDetailedHealth } from '@/types'
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
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Zap,
  Activity,
  Server,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal, ModalTitle } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toast'

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
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latency?: number }>>({})
  const [nvidiaDiagnostics, setNvidiaDiagnostics] = useState<NvidiaDetailedHealth | null>(null)
  const [nvidiaModelsList, setNvidiaModelsList] = useState<Array<{ id: string; name: string }>>([])
  const [loadingNvidiaModels, setLoadingNvidiaModels] = useState(false)

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    enabled: settingsOpen,
  })

  const { data: providersData, refetch: refetchProviders } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: api.ai.getProviders,
    enabled: settingsOpen && activeTab === 'ai',
    refetchInterval: 15000,
  })

  const [form, setForm] = useState<Partial<AppSettings>>({})

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const toggleKeyVisibility = (providerId: string) => {
    setVisibleKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
  }

  const handleTestConnection = async (providerId: string, apiKey?: string, baseUrl?: string, model?: string) => {
    setTestingProvider(providerId)
    try {
      const res = await api.ai.test(providerId, apiKey, baseUrl, model)
      if (providerId === 'nvidia' && res.detailedHealth) {
        setNvidiaDiagnostics(res.detailedHealth)
      }
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          success: res.success,
          message: res.health.message || (res.success ? 'Connected successfully' : 'Check failed'),
          latency: res.health.latencyMs,
        },
      }))
      refetchProviders()
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          success: false,
          message: err.message || 'Connection error',
        },
      }))
    } finally {
      setTestingProvider(null)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.settings.update(form)
      if (form.aiRoutingMode) {
        await api.ai.setRoutingMode(form.aiRoutingMode)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      refetchSettings()
      refetchProviders()
      toast.success('Settings saved')
    } catch (err: any) {
      toast.error('Could not save settings', err?.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      title="Settings"
      description="Autonomy, AI providers, execution and Git preferences"
      className="max-w-3xl h-[640px] max-h-[92vh]"
      visibleTitle
    >
      <>
        {/* Modal Top Header */}
        <div className="h-14 px-6 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ModalTitle className="text-base font-semibold text-[var(--text-primary)]">Settings</ModalTitle>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              v0.1.0
            </span>
          </div>
          <button
            type="button"
            aria-label="Close settings"
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
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors relative',
                activeTab === 'ai'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              <Sparkles size={14} />
              <span>AI Providers</span>
              <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />
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
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">Theme</label>
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
                    onClick={() => {
                      setSettingsOpen(false)
                      setShortcutsModalOpen(true)
                    }}
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
                            <span className="text-xs font-semibold text-[var(--text-primary)]">{opt.label}</span>
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
                  <p className="text-xs text-[var(--text-muted)] mb-3">Safety limit for self-debugging loops.</p>
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

            {/* AI TAB - MULTI-PROVIDER ARCHITECTURE */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                {/* Router Header Banner */}
                <div className="p-3.5 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Zap size={15} className="text-[var(--accent)]" />
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      Multi-Provider Intelligent AI Router
                    </h3>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    CodePilot connects to curated free LLM APIs (Gemini, Groq, OpenRouter, NVIDIA NIM, GitHub Models, Ollama). 
                    Tasks are routed automatically to the best model with automated fallback if rate limits (HTTP 429) or timeouts occur.
                  </p>
                </div>

                {/* Routing Strategy Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Default AI Routing Strategy
                  </label>
                  <select
                    value={form.aiRoutingMode ?? 'auto'}
                    onChange={(e) => setForm((f) => ({ ...f, aiRoutingMode: e.target.value }))}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="auto">⚡ Automatic (Intelligent Task-Based Router + Auto-Fallback)</option>
                    <option value="nvidia-only">🛡️ NVIDIA NIM Only (Strict - No Fallback)</option>
                    <option value="gemini-only">🛡️ Google Gemini Only (Strict - No Fallback)</option>
                    <option value="groq-only">🛡️ Groq Cloud Only (Strict - No Fallback)</option>
                    <option value="openrouter-only">🛡️ OpenRouter Only (Strict - No Fallback)</option>
                    <option value="github-only">🛡️ GitHub Models Only (Strict - No Fallback)</option>
                    <option value="ollama-only">🛡️ Ollama Only (Strict - No Fallback)</option>
                    <option value="nvidia">NVIDIA NIM (Preferred with Fallback)</option>
                    <option value="gemini">Google Gemini (Preferred with Fallback)</option>
                    <option value="groq">Groq Cloud (Preferred with Fallback)</option>
                    <option value="openrouter">OpenRouter (Preferred with Fallback)</option>
                  </select>
                </div>

                {/* Providers Cards Grid */}
                <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[var(--text-primary)]">Connected Providers</h4>
                    <button
                      type="button"
                      onClick={() => refetchProviders()}
                      className="text-[11px] flex items-center gap-1 text-[var(--accent)] hover:underline"
                    >
                      <RefreshCw size={11} /> Refresh status
                    </button>
                  </div>

                  {/* 1. Google Gemini */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">Google Gemini</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                          1M Context
                        </span>
                      </div>
                      <StatusBadge status={getProviderStatus(providersData, 'gemini')} />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      15 RPM, 1,500 requests/day free. State of the art coding and massive repository context.
                    </p>
                    <div className="space-y-2">
                      <div className="relative flex items-center gap-2">
                        <input
                          type={visibleKeys['gemini'] ? 'text' : 'password'}
                          value={form.geminiApiKey ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, geminiApiKey: e.target.value }))}
                          placeholder="Gemini API Key (AQ.Ab... or AIzaSy...)"
                          className="flex-1 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility('gemini')}
                          className="absolute right-24 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {visibleKeys['gemini'] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTestConnection('gemini', form.geminiApiKey)}
                          disabled={testingProvider === 'gemini'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 shrink-0"
                        >
                          {testingProvider === 'gemini' ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                      {testResults['gemini'] && (
                        <TestResultBanner result={testResults['gemini']} />
                      )}
                    </div>
                  </div>

                  {/* 2. Groq Cloud */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">Groq Cloud</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                          500+ tok/s
                        </span>
                      </div>
                      <StatusBadge status={getProviderStatus(providersData, 'groq')} />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      30 RPM, 14,400 requests/day free on Groq LPU chips. Models: Llama 3.3 70B, DeepSeek R1, Qwen 2.5 Coder.
                    </p>
                    <div className="space-y-2">
                      <div className="relative flex items-center gap-2">
                        <input
                          type={visibleKeys['groq'] ? 'text' : 'password'}
                          value={form.groqApiKey ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, groqApiKey: e.target.value }))}
                          placeholder="Groq API Key (gsk_...)"
                          className="flex-1 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility('groq')}
                          className="absolute right-24 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {visibleKeys['groq'] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTestConnection('groq', form.groqApiKey)}
                          disabled={testingProvider === 'groq'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 shrink-0"
                        >
                          {testingProvider === 'groq' ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                      {testResults['groq'] && (
                        <TestResultBanner result={testResults['groq']} />
                      )}
                    </div>
                  </div>

                  {/* 3. OpenRouter */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">OpenRouter</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                          35+ Free Models
                        </span>
                      </div>
                      <StatusBadge status={getProviderStatus(providersData, 'openrouter')} />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      20 RPM, 200 free requests/day with :free models (DeepSeek-R1, Llama 3.3, Qwen Coder).
                    </p>
                    <div className="space-y-2">
                      <div className="relative flex items-center gap-2">
                        <input
                          type={visibleKeys['openrouter'] ? 'text' : 'password'}
                          value={form.openRouterApiKey ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, openRouterApiKey: e.target.value }))}
                          placeholder="OpenRouter Key (sk-or-v1-...)"
                          className="flex-1 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility('openrouter')}
                          className="absolute right-24 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {visibleKeys['openrouter'] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTestConnection('openrouter', form.openRouterApiKey)}
                          disabled={testingProvider === 'openrouter'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 shrink-0"
                        >
                          {testingProvider === 'openrouter' ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                      {testResults['openrouter'] && (
                        <TestResultBanner result={testResults['openrouter']} />
                      )}
                    </div>
                  </div>

                  {/* 4. NVIDIA NIM */}
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">NVIDIA NIM</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-mono">
                          Enterprise DGX / Self-Hosted
                        </span>
                      </div>
                      <StatusBadge status={getProviderStatus(providersData, 'nvidia')} />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      High-throughput enterprise AI inference using NVIDIA NIM microservices. Supports hosted endpoints (<code className="font-mono text-[10px]">build.nvidia.com</code>) and self-hosted local NIM containers (<code className="font-mono text-[10px]">http://localhost:8000/v1</code>).
                    </p>

                    <div className="space-y-3 pt-1">
                      {/* API Key */}
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                          NVIDIA API Key
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type={visibleKeys['nvidia'] ? 'text' : 'password'}
                            value={form.nvidiaApiKey ?? ''}
                            onChange={(e) => setForm((f) => ({ ...f, nvidiaApiKey: e.target.value }))}
                            placeholder="nvapi-..."
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                          />
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility('nvidia')}
                            className="absolute right-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          >
                            {visibleKeys['nvidia'] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Base URL */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                            Base URL / Endpoint
                          </label>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, nvidiaBaseUrl: 'https://integrate.api.nvidia.com/v1' }))}
                              className="text-[var(--accent)] hover:underline"
                            >
                              Hosted
                            </button>
                            <span className="text-[var(--text-muted)]">•</span>
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, nvidiaBaseUrl: 'http://localhost:8000/v1' }))}
                              className="text-[var(--accent)] hover:underline"
                            >
                              Local Container (:8000)
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={form.nvidiaBaseUrl ?? 'https://integrate.api.nvidia.com/v1'}
                          onChange={(e) => setForm((f) => ({ ...f, nvidiaBaseUrl: e.target.value }))}
                          placeholder="https://integrate.api.nvidia.com/v1"
                          className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      {/* Model Selector */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                            Default NIM Model
                          </label>
                          <button
                            type="button"
                            onClick={async () => {
                              setLoadingNvidiaModels(true)
                              try {
                                const res = await api.ai.getNvidiaModels()
                                if (res.models) setNvidiaModelsList(res.models.map(m => ({ id: m.id, name: m.name || m.id })))
                              } catch {} finally {
                                setLoadingNvidiaModels(false)
                              }
                            }}
                            className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
                          >
                            <RefreshCw size={10} className={loadingNvidiaModels ? 'animate-spin' : ''} />
                            <span>Discover models</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={form.nvidiaModel ?? 'nvidia/llama-3.1-nemotron-70b-instruct'}
                            onChange={(e) => setForm((f) => ({ ...f, nvidiaModel: e.target.value }))}
                            className="flex-1 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                          >
                            <option value="nvidia/llama-3.1-nemotron-70b-instruct">nvidia/llama-3.1-nemotron-70b-instruct (Recommended)</option>
                            <option value="mistralai/codestral-22b-instruct-v0.1">mistralai/codestral-22b-instruct-v0.1 (Coding)</option>
                            <option value="deepseek-ai/deepseek-r1">deepseek-ai/deepseek-r1 (Reasoning)</option>
                            <option value="qwen/qwen2.5-coder-32b-instruct">qwen/qwen2.5-coder-32b-instruct (Qwen Coder)</option>
                            <option value="meta/codellama-70b">meta/codellama-70b</option>
                            {nvidiaModelsList
                              .filter(m => !['nvidia/llama-3.1-nemotron-70b-instruct', 'mistralai/codestral-22b-instruct-v0.1', 'deepseek-ai/deepseek-r1', 'qwen/qwen2.5-coder-32b-instruct', 'meta/codellama-70b'].includes(m.id))
                              .map(m => (
                                <option key={m.id} value={m.id}>{m.id}</option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleTestConnection('nvidia', form.nvidiaApiKey, form.nvidiaBaseUrl, form.nvidiaModel)}
                            disabled={testingProvider === 'nvidia'}
                            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 shrink-0 flex items-center gap-1.5 shadow-xs"
                          >
                            {testingProvider === 'nvidia' ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                            <span>Test NIM</span>
                          </button>
                        </div>
                      </div>

                      {/* Diagnostic Results */}
                      {nvidiaDiagnostics && (
                        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
                          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                            <span className="font-semibold text-[var(--text-primary)]">
                              Diagnostic Results ({nvidiaDiagnostics.latencyMs}ms)
                            </span>
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                              nvidiaDiagnostics.status === 'available' ? 'bg-emerald-500/20 text-emerald-400' :
                              nvidiaDiagnostics.status === 'degraded' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-red-500/20 text-red-400'
                            )}>
                              {nvidiaDiagnostics.status}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {nvidiaDiagnostics.steps.map((st, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-[11px]">
                                <div className="mt-0.5">
                                  {st.status === 'pass' ? (
                                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                                  ) : st.status === 'skipped' ? (
                                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">⏸</span>
                                  ) : (
                                    <AlertCircle size={13} className="text-red-400 shrink-0" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className={st.status === 'pass' ? 'text-[var(--text-primary)] font-medium' : 'text-red-400 font-medium'}>
                                      {st.name}
                                    </span>
                                    {st.latencyMs !== undefined && (
                                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                        {st.latencyMs}ms
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                    {st.message}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {nvidiaDiagnostics.suggestedAction && (
                            <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 leading-relaxed">
                              💡 <b>Actionable Solution:</b> {nvidiaDiagnostics.suggestedAction}
                            </div>
                          )}

                          {nvidiaDiagnostics.technicalError && (
                            <div className="text-[10px] font-mono text-red-400/90 bg-black/20 p-2 rounded truncate">
                              Error: {nvidiaDiagnostics.technicalError}
                            </div>
                          )}
                        </div>
                      )}

                      {testResults['nvidia'] && !nvidiaDiagnostics && (
                        <TestResultBanner result={testResults['nvidia']} />
                      )}
                    </div>
                  </div>

                  {/* 5. GitHub Models */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">GitHub Models</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-mono">
                          GitHub PAT
                        </span>
                      </div>
                      <StatusBadge status={getProviderStatus(providersData, 'github')} />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      15 RPM free with your personal access token (github_pat_... or ghp_...). Access GPT-4o-mini & DeepSeek-R1.
                    </p>
                    <div className="space-y-2">
                      <div className="relative flex items-center gap-2">
                        <input
                          type={visibleKeys['github'] ? 'text' : 'password'}
                          value={form.githubApiKey ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, githubApiKey: e.target.value }))}
                          placeholder="GitHub Token (ghp_... or github_pat_...)"
                          className="flex-1 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility('github')}
                          className="absolute right-24 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {visibleKeys['github'] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTestConnection('github', form.githubApiKey)}
                          disabled={testingProvider === 'github'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 shrink-0"
                        >
                          {testingProvider === 'github' ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                      {testResults['github'] && (
                        <TestResultBanner result={testResults['github']} />
                      )}
                    </div>
                  </div>

                  {/* 6. Ollama Local */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server size={14} className="text-[var(--accent)]" />
                        <span className="text-xs font-semibold text-[var(--text-primary)]">Ollama (Local Offline)</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                          100% Private
                        </span>
                      </div>
                      <StatusBadge status={getProviderStatus(providersData, 'ollama')} />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Runs locally on your computer with zero external network calls. Requires Ollama running on your machine.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            checked={form.ollamaEnabled === true || form.ollamaEnabled === 'true'}
                            onChange={(e) => setForm((f) => ({ ...f, ollamaEnabled: e.target.checked }))}
                            className="rounded border-[var(--border-strong)] accent-[var(--accent)]"
                          />
                          <span>Enable Local Ollama</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={form.ollamaBaseUrl ?? 'http://localhost:11434/v1'}
                          onChange={(e) => setForm((f) => ({ ...f, ollamaBaseUrl: e.target.value }))}
                          placeholder="http://localhost:11434/v1"
                          className="flex-1 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => handleTestConnection('ollama', undefined, form.ollamaBaseUrl)}
                          disabled={testingProvider === 'ollama'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 shrink-0"
                        >
                          {testingProvider === 'ollama' ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                      {testResults['ollama'] && (
                        <TestResultBanner result={testResults['ollama']} />
                      )}
                    </div>
                  </div>
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
                <span>Settings saved successfully</span>
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
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 shadow-xs flex items-center gap-1.5"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </>
    </Modal>
  )
}

function getProviderStatus(
  data: ProvidersResponse | undefined,
  providerId: string
): HealthStatus | undefined {
  if (!data?.providers) return undefined
  const p = data.providers.find((item) => item.id === providerId)
  return p?.health
}

function StatusBadge({ status }: { status?: HealthStatus }) {
  if (!status || status.status === 'unconfigured') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-subtle)] font-medium">
        Unconfigured
      </span>
    )
  }
  if (status.status === 'available') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Available {status.latencyMs ? `(${status.latencyMs}ms)` : ''}
      </span>
    )
  }
  if (status.status === 'rate_limited') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
        Rate Limited
      </span>
    )
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
      Error
    </span>
  )
}

function TestResultBanner({
  result,
}: {
  result: { success: boolean; message: string; latency?: number }
}) {
  return (
    <div
      className={cn(
        'px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1.5',
        result.success
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      )}
    >
      {result.success ? <Check size={12} /> : <AlertCircle size={12} />}
      <span>
        {result.message} {result.latency ? `(${result.latency}ms)` : ''}
      </span>
    </div>
  )
}
