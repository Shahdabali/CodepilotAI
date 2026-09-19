import React, { useEffect, useState } from 'react'
import { ArrowRight, Radio, Send, Square, WifiOff } from 'lucide-react'
import type { ExecuteOutcome, RequestDef } from '../types'
import { formatBytes, formatMs, statusText, statusTone } from '../lib/format'
import { newKv, newRequest } from '../lib/request'
import { useSession, type LowerTab } from '../session.store'
import { CodeTab } from './CodeTab'
import { DiagnosticsTab } from './DiagnosticsTab'
import { StatusExplanationPanel, TransportErrorPanel } from './ErrorPanel'
import { ResponseBody } from './ResponseBody'
import { TypesTab } from './TypesTab'
import { Button, Callout, EmptyState, Kbd, Skeleton, TabBar, Tip } from './ui'

const EXAMPLES: Array<{ label: string; description: string; make: () => RequestDef }> = [
  { label: 'GET a JSON post', description: 'jsonplaceholder.typicode.com', make: () => newRequest({ name: 'Get post', method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1' }) },
  {
    label: 'POST with a JSON body',
    description: 'Create a post',
    make: () => newRequest({ name: 'Create post', method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts', body: { mode: 'json', json: '{\n  "title": "Hello",\n  "body": "Sent from API Fetcher",\n  "userId": 1\n}', raw: '', rawContentType: 'text/plain', form: [], urlencoded: [] } }),
  },
  { label: 'Query parameters', description: 'Filter comments by post', make: () => { const r = newRequest({ name: 'List comments', method: 'GET', url: 'https://jsonplaceholder.typicode.com/comments?postId=1&_limit=5' }); r.params = [newKv('postId', '1'), newKv('_limit', '5')]; return r } },
  { label: 'See a 404 explained', description: 'A missing resource', make: () => newRequest({ name: 'Missing post', method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/999999' }) },
]

function StatusSummary({ outcome, sending }: { outcome: ExecuteOutcome | null; sending: boolean }) {
  if (sending || !outcome) return null
  if (!outcome.ok) {
    return (
      <div className="flex items-center gap-2.5 text-[11.5px]">
        <span className="af-badge" data-tone="err">
          {outcome.error.code === 'CANCELLED' ? 'CANCELLED' : 'FAILED'}
        </span>
        <span className="af-mono text-[var(--af-text-3)]">{formatMs(outcome.elapsedMs)}</span>
      </div>
    )
  }
  const { response: r, timings: t } = outcome
  const tone = statusTone(r.status)
  const breakdown = [t.dnsMs !== undefined && `DNS ${formatMs(t.dnsMs)}`, t.tcpMs !== undefined && `TCP ${formatMs(t.tcpMs)}`, t.tlsMs !== undefined && `TLS ${formatMs(t.tlsMs)}`, `Wait ${formatMs(t.ttfbMs)}`, `Download ${formatMs(t.downloadMs)}`].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-3 text-[12px]" aria-live="polite">
      <span className="af-mono font-semibold" style={{ color: `var(--af-${tone})` }}>
        {r.status} {statusText(r.status, r.statusText)}
      </span>
      <Tip label={breakdown}>
        <span className="af-mono cursor-default text-[var(--af-text-2)]">{formatMs(t.totalMs)}</span>
      </Tip>
      <Tip label={r.contentEncoding ? `${r.sizeBytes.toLocaleString()} bytes decoded · ${r.transferBytes.toLocaleString()} bytes transferred (${r.contentEncoding})` : `${r.sizeBytes.toLocaleString()} bytes`}>
        <span className="af-mono cursor-default text-[var(--af-text-2)]">{formatBytes(r.sizeBytes)}</span>
      </Tip>
    </div>
  )
}

function Sending() {
  const startedAt = useSession((s) => s.sendStartedAt)
  const cancel = useSession((s) => s.cancel)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex h-full flex-col p-4 af-fade-in" role="status" aria-label="Sending request">
      <div className="mb-4 flex items-center gap-3">
        <Radio size={15} className="af-pulse text-[var(--af-accent-text)]" />
        <span className="text-[12.5px] font-medium">Waiting for response…</span>
        <span className="af-mono text-[var(--af-text-3)]">{startedAt ? formatMs(now - startedAt) : ''}</span>
        <Button size="sm" variant="danger" className="ml-auto" onClick={cancel}>
          <Square size={11} fill="currentColor" /> Cancel
        </Button>
      </div>
      <div className="space-y-2.5">
        {[92, 78, 64, 86, 55, 70].map((w, i) => (
          <Skeleton key={i} style={{ height: 12, width: `${w}%`, animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  )
}

function Idle() {
  const openRequest = useSession((s) => s.openRequest)
  const send = useSession((s) => s.send)
  return (
    <div className="af-scroll h-full p-4">
      <EmptyState
        icon={<Send size={18} />}
        title="No response yet"
        description={
          <>
            Enter a URL and press <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd>. Every request is sent for real by the CodePilot backend; nothing here is mocked.
          </>
        }
      />
      <div className="mx-auto mt-1 grid max-w-[560px] gap-2 sm:grid-cols-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="af-panel group flex items-center gap-2 p-2.5 text-left transition-colors hover:border-[var(--af-border-strong)] hover:bg-[var(--af-hover)]"
            onClick={() => {
              openRequest(ex.make(), null)
              void send()
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium">{ex.label}</div>
              <div className="text-[11px] text-[var(--af-text-3)]">{ex.description}</div>
            </div>
            <ArrowRight size={13} className="text-[var(--af-text-3)] transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function ResponsePane() {
  const outcome = useSession((s) => s.outcome)
  const sending = useSession((s) => s.sending)
  const transportError = useSession((s) => s.transportError)
  const sentDef = useSession((s) => s.sentDef)
  const tab = useSession((s) => s.lowerTab)
  const setTab = useSession((s) => s.setLowerTab)

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--af-panel)]">
      <TabBar<LowerTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'response', label: 'Response' },
          { id: 'diagnostics', label: 'Diagnostics' },
          { id: 'code', label: 'Code' },
          { id: 'types', label: 'Types' },
        ]}
        right={<StatusSummary outcome={outcome} sending={sending} />}
      />
      <div className="min-h-0 flex-1">
        {tab === 'response' && (
          <>
            {sending ? (
              <Sending />
            ) : transportError ? (
              <div className="p-3">
                <Callout tone="err" icon={<WifiOff size={16} className="text-[var(--af-err)]" />}>
                  <div className="text-[12.5px] font-semibold">The request could not be started</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--af-text-2)]">{transportError}</div>
                </Callout>
              </div>
            ) : !outcome ? (
              <Idle />
            ) : !outcome.ok ? (
              <TransportErrorPanel error={outcome.error} request={outcome.request} elapsedMs={outcome.elapsedMs} notes={outcome.notes} />
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                {outcome.response.status >= 300 && <StatusExplanationPanel outcome={outcome} request={sentDef} />}
                {outcome.notes.length > 0 && <div className="border-b border-[var(--af-border)] bg-[var(--af-info-soft)] px-3 py-1 text-[11px] text-[var(--af-text-2)]">{outcome.notes.join(' · ')}</div>}
                <div className="min-h-0 flex-1">
                  <ResponseBody outcome={outcome} />
                </div>
              </div>
            )}
          </>
        )}
        {tab === 'diagnostics' && <DiagnosticsTab outcome={sending ? null : outcome} />}
        {tab === 'code' && <CodeTab />}
        {tab === 'types' && <TypesTab />}
      </div>
    </div>
  )
}
