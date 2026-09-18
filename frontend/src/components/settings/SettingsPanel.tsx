import React, { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUIStore } from '@/stores/ui.store'
import type { AppSettings } from '@/types'
import { cn } from '@/lib/utils'

const AUTONOMY_INFO = {
  SAFE: { label: 'Safe', desc: 'Ask before every file modification', color: 'text-green-400' },
  BALANCED: { label: 'Balanced', desc: 'Auto-modify files, ask for risky ops', color: 'text-yellow-400' },
  AUTONOMOUS: { label: 'Autonomous', desc: 'Complete normal dev tasks independently', color: 'text-red-400' },
}

export function SettingsPanel() {
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const theme = useUIStore((s) => s.theme)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: settings, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    enabled: settingsOpen,
  })

  const [form, setForm] = useState<Partial<AppSettings>>({})

  React.useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  async function handleSave() {
    setSaving(true)
    try {
      await api.settings.update(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      refetch()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (!settingsOpen) return null

  const merged = { ...settings, ...form } as AppSettings

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
      <div className="w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">⚙️ Settings</h2>
          <button onClick={() => setSettingsOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Gemini API Key */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
              Gemini API Key
            </label>
            <input
              type="password"
              value={form.geminiApiKey ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, geminiApiKey: e.target.value }))}
              placeholder="AIza…"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] font-mono"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Get a free key at{' '}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
                aistudio.google.com
              </a>
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
              Gemini Model
            </label>
            <select
              value={form.geminiModel ?? 'gemini-2.5-flash'}
              onChange={(e) => setForm((f) => ({ ...f, geminiModel: e.target.value }))}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="gemini-2.5-flash">gemini-2.5-flash (recommended)</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            </select>
          </div>

          {/* Autonomy Level */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-2">
              Autonomy Level
            </label>
            <div className="space-y-2">
              {(Object.keys(AUTONOMY_INFO) as Array<keyof typeof AUTONOMY_INFO>).map((level) => {
                const info = AUTONOMY_INFO[level]
                const selected = (form.autonomyLevel ?? 'BALANCED') === level
                return (
                  <button
                    key={level}
                    onClick={() => setForm((f) => ({ ...f, autonomyLevel: level }))}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
                    )}
                  >
                    <div className={cn('w-4 h-4 rounded-full border-2 shrink-0 mt-0.5', selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-color)]')} />
                    <div>
                      <span className={cn('text-sm font-medium', info.color)}>{info.label}</span>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{info.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Theme</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-sm hover:bg-[var(--border-color)] transition-colors"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>

          {/* Max iterations */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
              Max Iterations: {form.maxIterations ?? 10}
            </label>
            <input
              type="range" min="1" max="20"
              value={form.maxIterations ?? 10}
              onChange={(e) => setForm((f) => ({ ...f, maxIterations: Number(e.target.value) }))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-0.5">
              <span>1</span><span>20</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-primary)]/30">
          {saved ? <span className="text-xs text-green-400">✓ Saved</span> : <span />}
          <div className="flex gap-2">
            <button onClick={() => setSettingsOpen(false)} className="px-4 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] hover:bg-[var(--border-color)]">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
