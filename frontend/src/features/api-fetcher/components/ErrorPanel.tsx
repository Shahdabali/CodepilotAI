import React, { useState } from 'react'
import { Activity, AlertOctagon, ChevronDown, ChevronRight, Lightbulb, Sparkles } from 'lucide-react'
import type { ErrorReport, ExecuteSuccess, RequestDef } from '../types'
import { explainStatus } from '../lib/http-info'
import { useSession } from '../session.store'
import { Button, Callout } from './ui'

/** Explains a 4xx/5xx/3xx response using the actual request and response context. */
export function StatusExplanationPanel({ outcome, request }: { outcome: ExecuteSuccess; request: RequestDef | null }) {
  const [open, setOpen] = useState(true)
  const askAi = useSession((s) => s.askAi)
  const r = outcome.response
  const explanation = explainStatus({ status: r.status, statusText: r.statusText, request, responseHeaders: r.headers, bodyText: r.bodyText })
  if (!explanation) return null
  const tone = r.status >= 400 ? (r.status >= 500 ? 'err' : 'warn') : 'info'

  return (
    <div className="border-b border-[var(--af-border)] bg-[var(--af-panel)] px-2 pt-2">
      <Callout tone={tone} icon={<AlertOctagon size={15} className={tone === 'err' ? 'text-[var(--af-err)]' : tone === 'warn' ? 'text-[var(--af-warn)]' : 'text-[var(--af-info)]'} />} className="mb-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1 text-left" aria-expanded={open}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="text-[12.5px] font-semibold text-[var(--af-text)]">{explanation.title}</span>
          <span className="ml-2 text-[11.5px] text-[var(--af-text-2)]">{explanation.summary}</span>
        </button>
        {open && (
          <div className="af-fade-in mt-2 grid gap-3 pl-4 text-[11.5px] md:grid-cols-2">
            {explanation.serverMessage && (
              <div className="md:col-span-2">
                <span className="af-h">Server said</span>
                <div className="af-mono mt-0.5 break-words text-[var(--af-text)]">“{explanation.serverMessage}”</div>
              </div>
            )}
            <div>
              <span className="af-h">Possible causes</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--af-text-2)]">
                {explanation.causes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="af-h flex items-center gap-1">
                <Lightbulb size={11} /> What to try
              </span>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--af-text-2)]">
                {explanation.suggestions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button size="sm" onClick={() => askAi({ action: 'explain-error', message: `Why am I getting ${r.status}?` })}>
                <Sparkles size={12} /> Ask the AI assistant
              </Button>
            </div>
          </div>
        )}
      </Callout>
    </div>
  )
}

/** Shown when no HTTP response was received at all (DNS, connection, TLS, timeout, validation...). */
export function TransportErrorPanel({ error, request, elapsedMs, notes }: { error: ErrorReport; request?: { method: string; url: string }; elapsedMs: number; notes: string[] }) {
  const askAi = useSession((s) => s.askAi)
  const setLowerTab = useSession((s) => s.setLowerTab)
  const stageLabel: Record<string, string> = { validation: 'Request validation', dns: 'DNS lookup', connect: 'TCP connection', tls: 'TLS handshake', request: 'Sending request', response: 'Waiting for response' }
  const cancelled = error.code === 'CANCELLED'
  return (
    <div className="af-scroll h-full p-3 af-fade-in">
      <Callout tone={cancelled ? 'info' : 'err'} icon={<AlertOctagon size={16} className={cancelled ? 'text-[var(--af-info)]' : 'text-[var(--af-err)]'} />}>
        <div className="text-[13px] font-semibold text-[var(--af-text)]">{error.message}</div>
        <div className="mt-0.5 text-[11.5px] text-[var(--af-text-2)]">{error.cause}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--af-text-3)]">
          <span className="af-badge af-mono" data-tone="err">
            {error.code}
          </span>
          {error.stage && <span>Failed at: {stageLabel[error.stage] ?? error.stage}</span>}
          <span>· after {Math.round(elapsedMs)} ms</span>
          {request && (
            <span className="af-mono af-truncate max-w-[420px]">
              · {request.method} {request.url}
            </span>
          )}
        </div>
        {error.suggestions.length > 0 && (
          <div className="mt-3">
            <span className="af-h flex items-center gap-1">
              <Lightbulb size={11} /> Debugging suggestions
            </span>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[11.5px] text-[var(--af-text-2)]">
              {error.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {notes.length > 0 && <div className="mt-2 text-[11px] text-[var(--af-text-3)]">{notes.join(' · ')}</div>}
        <div className="mt-3 flex flex-wrap gap-2">
          {error.code !== 'VALIDATION' && !cancelled && (
            <Button size="sm" onClick={() => setLowerTab('diagnostics')}>
              <Activity size={12} /> Run connectivity check
            </Button>
          )}
          {!cancelled && (
            <Button size="sm" onClick={() => askAi({ action: 'explain-error', message: 'Why did this request fail and how do I fix it?' })}>
              <Sparkles size={12} /> Ask the AI assistant
            </Button>
          )}
        </div>
      </Callout>
    </div>
  )
}
