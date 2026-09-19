import React, { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, ChevronDown, FileJson, ListChecks, Plus, RefreshCw, ShieldCheck, Sparkles, Square, Trash2, User, Wand2, X, Bug, Code2, ScrollText } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import type { AiAction } from '../types'
import { useAiChat, type ChatMessage } from '../ai.store'
import { useDataStore } from '../data.store'
import { LANGUAGES } from '../lib/codegen'
import { normalizeRequest } from '../lib/request'
import { isDraftDirty, useSession } from '../session.store'
import { toast } from '../toast'
import { Markdown } from './Markdown'
import { Button, Callout, ConfirmDialog, IconButton, Menu, MenuContent, MenuItem, MenuTrigger, Spinner, Tip } from './ui'

function Bubble({ m, onUseRequest }: { m: ChatMessage; onUseRequest: (json: string) => void }) {
  const isUser = m.role === 'user'
  return (
    <div className={`af-fade-in flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${isUser ? 'bg-[var(--af-hover)] text-[var(--af-text-2)]' : 'bg-[var(--af-accent-soft)] text-[var(--af-accent-text)]'}`}>{isUser ? <User size={13} /> : <Bot size={13} />}</div>
      <div className={`min-w-0 max-w-[92%] rounded-lg px-3 py-2 ${isUser ? 'bg-[var(--af-hover)]' : 'border border-[var(--af-border)] bg-[var(--af-panel)]'}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap break-words text-[12px]">{m.content}</div>
        ) : (
          <>
            {m.content ? <Markdown text={m.content} onUseRequest={onUseRequest} /> : m.streaming && !m.error ? <span className="inline-flex items-center gap-2 text-[11.5px] text-[var(--af-text-3)]"><Spinner /> Thinking…</span> : null}
            {m.streaming && m.content && <span className="af-pulse ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 rounded-sm bg-[var(--af-accent-text)]" />}
            {m.error && (
              <Callout tone="err" className="mt-2">
                <div className="text-[11.5px] break-words">{m.error.message}</div>
              </Callout>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ icon, label, onClick, disabled, hint, blocked }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; hint?: string; blocked: boolean }) {
  return (
    <Tip label={disabled ? hint : undefined}>
      <span>
        <button type="button" onClick={onClick} disabled={disabled || blocked} className="af-btn af-btn-sm" style={{ borderRadius: 999 }}>
          {icon}
          {label}
        </button>
      </span>
    </Tip>
  )
}

export function AiPanel() {
  const { messages, busy, send, stop, clear } = useAiChat()
  const outcome = useSession((s) => s.outcome)
  const draft = useSession((s) => s.draft)
  const aiRequest = useSession((s) => s.aiRequest)
  const clearAiRequest = useSession((s) => s.clearAiRequest)
  const setAiOpen = useSession((s) => s.setAiOpen)
  const ai = useDataStore((s) => s.ai)
  const refreshAi = useDataStore((s) => s.refreshAi)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const [input, setInput] = useState('')
  const [createMode, setCreateMode] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void refreshAi()
  }, [refreshAi])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Other parts of the UI (e.g. the error panel) can ask a question on the user's behalf.
  useEffect(() => {
    if (!aiRequest) return
    void send({ action: aiRequest.action, message: aiRequest.message, label: aiRequest.message, language: aiRequest.language })
    clearAiRequest()
  }, [aiRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasResponse = !!outcome?.ok
  const hasOutcome = !!outcome
  const isErr = outcome ? (!outcome.ok ? outcome.error.code !== 'CANCELLED' : outcome.response.status >= 400) : false
  const status = outcome?.ok ? outcome.response.status : null
  const hasJsonBody = draft.body.mode === 'json' && draft.body.json.trim().length > 0
  const responseIsJson = outcome?.ok && outcome.response.kind === 'json'
  const ready = ai?.configured

  const run = (action: AiAction, label: string, extra: { message?: string; language?: string } = {}) => void send({ action, label, ...extra })

  const submit = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    if (createMode) {
      setCreateMode(false)
      void send({ action: 'create-request', message: text, label: `Create a request: ${text}` })
    } else void send({ action: 'free', message: text })
  }

  const applyRequest = (json: string) => {
    try {
      const raw = JSON.parse(json)
      if (raw.body && typeof raw.body.json !== 'string' && raw.body.json !== undefined) raw.body.json = JSON.stringify(raw.body.json, null, 2)
      if (raw.body && !raw.body.mode) raw.body.mode = raw.body.json ? 'json' : raw.body.raw ? 'raw' : 'none'
      const def = normalizeRequest({ ...raw, method: String(raw.method ?? 'GET').toUpperCase() })
      useSession.getState().openRequest(def, null)
      toast.success('Request loaded into the editor', 'Review it, then press Send.')
    } catch {
      toast.error('That JSON is not a valid request definition')
    }
  }
  const useRequest = (json: string) => {
    if (isDraftDirty(useSession.getState())) setPendingRequest(json)
    else applyRequest(json)
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-[var(--af-border)] bg-[var(--af-bg)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--af-border)] bg-[var(--af-panel)] px-3">
        <Sparkles size={14} className="text-[var(--af-accent-text)]" />
        <span className="text-[12.5px] font-semibold">AI Assistant</span>
        {ai?.providers.length ? (
          <span className="af-badge" data-tone="ok" title={ai.providers.map((p) => p.name).join(', ')}>
            {ai.routingMode === 'auto' ? 'auto' : ai.providers.find((p) => p.id === ai.routingMode)?.name ?? ai.routingMode}
          </span>
        ) : null}
        <div className="ml-auto flex items-center">
          <IconButton label="New conversation" onClick={clear} disabled={!messages.length}>
            <Trash2 size={14} />
          </IconButton>
          <IconButton label="Close assistant" onClick={() => setAiOpen(false)}>
            <X size={15} />
          </IconButton>
        </div>
      </div>

      {ai && !ai.configured && (
        <div className="p-3">
          <Callout tone="warn" icon={<Wand2 size={15} className="text-[var(--af-warn)]" />}>
            <div className="text-[12px] font-semibold text-[var(--af-text)]">No AI provider is configured</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--af-text-2)]">The assistant uses the same providers as the rest of CodePilot. Add an API key (Gemini, Groq, OpenRouter, NVIDIA, GitHub) or enable Ollama in Settings.</div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => setSettingsOpen(true)}>
                Open AI settings
              </Button>
              <Button size="sm" onClick={() => void refreshAi()}>
                <RefreshCw size={12} /> Check again
              </Button>
            </div>
          </Callout>
        </div>
      )}

      <div ref={scroller} className="af-scroll min-h-0 flex-1 space-y-3 px-3 py-3">
        {messages.length === 0 ? (
          <div className="af-fade-in">
            <div className="mb-3 text-[12px] leading-relaxed text-[var(--af-text-2)]">
              Ask about the request and response you are looking at right now. The assistant reads the real request, status, headers and body, not a generic example.
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip blocked={busy || !ready} icon={<ScrollText size={12} />} label="Explain this response" disabled={!hasResponse} hint="Send a request first" onClick={() => run('explain-response', 'Explain this API response')} />
              <Chip
                blocked={busy || !ready}
                icon={<Bug size={12} />}
                label={status ? `Why am I getting ${status}?` : 'Why did it fail?'}
                disabled={!hasOutcome || !isErr}
                hint="Available when the response is an error"
                onClick={() => run('explain-error', status ? `Why am I getting ${status}?` : 'Why did this request fail?')}
              />
              <Menu>
                <MenuTrigger asChild disabled={busy || !ready || !draft.url.trim()}>
                  <button type="button" className="af-btn af-btn-sm" style={{ borderRadius: 999 }} disabled={busy || !ready || !draft.url.trim()}>
                    <Code2 size={12} /> Convert to… <ChevronDown size={11} />
                  </button>
                </MenuTrigger>
                <MenuContent align="start" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {LANGUAGES.map((l) => (
                    <MenuItem key={l.id} onSelect={() => run('convert-code', `Convert this request to ${l.label}`, { language: l.label })}>
                      {l.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <Chip blocked={busy || !ready} icon={<Plus size={12} />} label="Create a request…" onClick={() => (setCreateMode(true), textarea.current?.focus())} />
              <Chip blocked={busy || !ready} icon={<FileJson size={12} />} label="Find the problem in my JSON" disabled={!hasJsonBody} hint="Add a JSON body first" onClick={() => run('find-json-problem', 'Find the problem in my JSON')} />
              <Chip blocked={busy || !ready} icon={<Code2 size={12} />} label="Generate TypeScript types" disabled={!responseIsJson} hint="Needs a JSON response" onClick={() => run('generate-types', 'Generate TypeScript types from this response')} />
              <Chip blocked={busy || !ready} icon={<ListChecks size={12} />} label="Explain these headers" disabled={!hasResponse} hint="Send a request first" onClick={() => run('explain-headers', 'Explain these API headers')} />
            </div>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} onUseRequest={useRequest} />)
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--af-border)] bg-[var(--af-panel)] p-2.5">
        {createMode && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--af-accent-text)]">
            <Plus size={11} /> Describe the request to create (e.g. “POST a new user with name and email”)
            <button type="button" className="ml-auto text-[var(--af-text-3)] hover:text-[var(--af-text)]" onClick={() => setCreateMode(false)}>
              cancel
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textarea}
            className="af-input af-textarea"
            style={{ minHeight: 36, maxHeight: 120, resize: 'none' }}
            rows={1}
            value={input}
            placeholder={ready ? (createMode ? 'Describe the request…' : 'Ask about this request or response…') : 'Configure an AI provider to chat'}
            disabled={!ready}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            aria-label="Message the AI assistant"
          />
          {busy ? (
            <Button variant="danger" onClick={stop} aria-label="Stop generating" style={{ height: 36 }}>
              <Square size={12} fill="currentColor" />
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={!input.trim() || !ready} aria-label="Send message" style={{ height: 36 }}>
              <ArrowUp size={15} />
            </Button>
          )}
        </div>
        <div className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-snug text-[var(--af-text-3)]">
          <ShieldCheck size={12} className="mt-px shrink-0 text-[var(--af-ok)]" />
          Credentials, tokens and secret variable values are removed before anything is sent to the AI provider.
        </div>
      </div>

      <ConfirmDialog
        open={pendingRequest !== null}
        onOpenChange={(o) => !o && setPendingRequest(null)}
        title="Replace the current request?"
        description="The editor has unsaved changes. Loading the AI-generated request will replace them."
        confirmLabel="Replace"
        onConfirm={() => {
          if (pendingRequest) applyRequest(pendingRequest)
          setPendingRequest(null)
        }}
      />
    </div>
  )
}
