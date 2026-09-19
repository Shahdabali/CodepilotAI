import React, { useMemo, useRef, useState } from 'react'
import { Activity, CheckCircle2, Globe2, Lock, Network, Route, ShieldAlert, XCircle } from 'lucide-react'
import type { DiagnoseResult, ExecuteOutcome, Timings } from '../types'
import { fetcherApi } from '../lib/client'
import { formatBytes, formatMs } from '../lib/format'
import { newKv, newRequest } from '../lib/request'
import { resolveForDisplay } from '../lib/variables'
import { useSession } from '../session.store'
import { errorMessage, toast } from '../toast'
import { useActiveEnv } from './EnvSelector'
import { Badge, Button, Callout, EmptyState } from './ui'

const STAGES: Array<{ key: keyof Timings; label: string; color: string; hint: string }> = [
  { key: 'dnsMs', label: 'DNS lookup', color: 'var(--af-info)', hint: 'Resolving the hostname to an IP address' },
  { key: 'tcpMs', label: 'TCP connect', color: 'var(--af-warn)', hint: 'Opening the TCP connection' },
  { key: 'tlsMs', label: 'TLS handshake', color: 'var(--af-m-patch)', hint: 'Negotiating encryption and verifying the certificate' },
  { key: 'ttfbMs', label: 'Waiting (TTFB)', color: 'var(--af-accent-text)', hint: 'Server processing time until the first byte of the response' },
  { key: 'downloadMs', label: 'Download', color: 'var(--af-ok)', hint: 'Receiving the response body' },
]

function Section({ icon, title, children, right }: { icon: React.ReactNode; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="af-panel p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[var(--af-text-3)]">{icon}</span>
        <h3 className="af-h">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  )
}

const Row = ({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'ok' | 'warn' | 'err' }) => (
  <div className="flex items-baseline gap-3 py-0.5 text-[11.5px]">
    <span className="w-[132px] shrink-0 text-[var(--af-text-3)]">{k}</span>
    <span className="af-mono min-w-0 break-all" style={{ color: tone === 'ok' ? 'var(--af-ok)' : tone === 'warn' ? 'var(--af-warn)' : tone === 'err' ? 'var(--af-err)' : 'var(--af-text)' }}>
      {v}
    </span>
  </div>
)

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null
  const t = Date.parse(dateStr)
  return Number.isNaN(t) ? null : Math.floor((t - Date.now()) / 86_400_000)
}

export function DiagnosticsTab({ outcome }: { outcome: ExecuteOutcome | null }) {
  const draft = useSession((s) => s.draft)
  const activeEnvId = useSession((s) => s.activeEnvId)
  const prefs = useSession((s) => s.prefs)
  const env = useActiveEnv()
  const [probe, setProbe] = useState<DiagnoseResult | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [cors, setCors] = useState<null | { verdict: 'allowed' | 'blocked' | 'unknown'; rows: Array<[string, string]>; note: string }>(null)
  const [corsRunning, setCorsRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const target = useMemo(() => resolveForDisplay(draft.url, env), [draft.url, env])

  const runProbe = async () => {
    abort.current?.abort()
    abort.current = new AbortController()
    setProbing(true)
    setProbeError(null)
    try {
      setProbe(await fetcherApi.diagnose(target, abort.current.signal))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setProbe(null)
        setProbeError(errorMessage(e))
      }
    } finally {
      setProbing(false)
    }
  }

  const runCors = async () => {
    setCorsRunning(true)
    try {
      const origin = window.location.origin
      const custom = draft.headers.filter((h) => h.enabled && h.key && !/^(accept|content-type|accept-language|content-language)$/i.test(h.key)).map((h) => h.key.toLowerCase())
      const req = newRequest({
        method: 'OPTIONS',
        url: draft.url,
        headers: [newKv('Origin', origin), newKv('Access-Control-Request-Method', draft.method), ...(custom.length ? [newKv('Access-Control-Request-Headers', custom.join(', '))] : [])],
      })
      const out = await fetcherApi.execute(req, activeEnvId, { ...prefs, timeoutMs: Math.min(prefs.timeoutMs, 20_000) }, new AbortController().signal)
      if (!out.ok) {
        setCors({ verdict: 'unknown', rows: [], note: `The preflight request failed: ${out.error.message}` })
        return
      }
      const h = (n: string) => out.response.headers.find(([k]) => k.toLowerCase() === n)?.[1]
      const acao = h('access-control-allow-origin')
      const methods = h('access-control-allow-methods')
      const headers = h('access-control-allow-headers')
      const rows: Array<[string, string]> = [['Preflight status', `${out.response.status} ${out.response.statusText}`]]
      for (const [label, value] of [['Access-Control-Allow-Origin', acao], ['Access-Control-Allow-Methods', methods], ['Access-Control-Allow-Headers', headers], ['Access-Control-Allow-Credentials', h('access-control-allow-credentials')], ['Access-Control-Max-Age', h('access-control-max-age')]] as const) if (value) rows.push([label, value])
      const originOk = acao === '*' || acao === origin
      const methodOk = !methods || methods.split(',').some((m) => m.trim().toUpperCase() === draft.method || m.trim() === '*') || ['GET', 'HEAD', 'POST'].includes(draft.method)
      setCors({
        verdict: !acao ? 'blocked' : originOk && methodOk ? 'allowed' : 'blocked',
        rows,
        note: !acao ? `The API sent no Access-Control-Allow-Origin header, so a browser app served from ${origin} could not call it directly.` : originOk && methodOk ? `A browser app served from ${origin} would be allowed to call this endpoint.` : `The API responds with CORS headers, but they do not allow ${origin} with ${draft.method}.`,
      })
    } catch (e) {
      toast.error('CORS check failed', errorMessage(e))
    } finally {
      setCorsRunning(false)
    }
  }

  if (!outcome) {
    return (
      <div className="af-scroll h-full space-y-3 p-3">
        <EmptyState icon={<Activity size={18} />} title="No request sent yet" description="Send a request to see real timing, connection, TLS and header diagnostics. You can also run a connectivity check on the URL without sending the full request." />
        <div className="mx-auto max-w-[560px]">
          <ProbeSection target={target} probe={probe} probeError={probeError} probing={probing} onRun={runProbe} />
        </div>
      </div>
    )
  }

  const timings = outcome.ok ? outcome.timings : null
  const net = outcome.ok ? outcome.network : null
  const total = timings ? Math.max(timings.totalMs, 0.01) : 1
  const measured = timings ? STAGES.filter((s) => timings[s.key] !== undefined) : []
  const cert = net?.tls
  const certDays = daysUntil(cert?.validTo)
  const r = outcome.ok ? outcome.response : null
  const hv = (n: string) => r?.headers.find(([k]) => k.toLowerCase() === n)?.[1]

  return (
    <div className="af-scroll h-full p-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {!outcome.ok && (
          <Callout tone="err" icon={<XCircle size={15} className="text-[var(--af-err)]" />} className="lg:col-span-2">
            <div className="text-[12px] font-semibold text-[var(--af-text)]">{outcome.error.message}</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--af-text-2)]">
              Failed during <b>{outcome.error.stage ?? 'the request'}</b> after {formatMs(outcome.elapsedMs)}. {outcome.error.cause}
            </div>
          </Callout>
        )}

        {timings && (
          <Section icon={<Activity size={14} />} title="Timing" right={<span className="af-mono text-[12px] font-semibold">{formatMs(timings.totalMs)} total</span>}>
            <div className="flex h-3 overflow-hidden rounded-full bg-[var(--af-sunken)]" role="img" aria-label="Request timing breakdown">
              {measured.map((s) => (
                <div key={s.key} title={`${s.label}: ${formatMs(timings[s.key])}`} style={{ width: `${Math.max(1.5, ((timings[s.key] as number) / total) * 100)}%`, background: s.color }} />
              ))}
            </div>
            <div className="mt-2 space-y-0.5">
              {STAGES.map((s) => {
                const v = timings[s.key]
                return (
                  <div key={s.key} className="flex items-center gap-2 text-[11.5px]" title={s.hint}>
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: v === undefined ? 'var(--af-border-strong)' : s.color }} />
                    <span className="w-[112px] text-[var(--af-text-2)]">{s.label}</span>
                    <span className="af-mono">{v === undefined ? <span className="text-[var(--af-text-3)]">n/a</span> : formatMs(v)}</span>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-[var(--af-text-3)]">
              Measured by the CodePilot backend during this request. “n/a” means that stage did not happen (an IP address needs no DNS lookup; plain http:// has no TLS).
            </p>
          </Section>
        )}

        {r && (
          <Section icon={<Globe2 size={14} />} title="Response">
            <Row k="Status" v={`${r.status} ${r.statusText}`} tone={r.status < 400 ? 'ok' : r.status < 500 ? 'warn' : 'err'} />
            <Row k="Protocol" v={`HTTP/${r.httpVersion}`} />
            <Row k="Content-Type" v={r.contentType || '(none)'} />
            <Row k="Charset" v={r.charset} />
            <Row k="Size" v={`${formatBytes(r.sizeBytes)} (${r.sizeBytes.toLocaleString()} bytes)`} />
            <Row k="Transferred" v={r.contentEncoding ? `${formatBytes(r.transferBytes)} as ${r.contentEncoding}${r.sizeBytes > 0 ? ` (${Math.round((1 - r.transferBytes / r.sizeBytes) * 100)}% smaller)` : ''}` : `${formatBytes(r.transferBytes)} (not compressed)`} />
            {hv('server') && <Row k="Server" v={hv('server')} />}
            {(['cache-control', 'etag', 'last-modified', 'expires', 'age'] as const).map((h) => (hv(h) ? <Row key={h} k={h} v={hv(h)} /> : null))}
            {(['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'ratelimit-limit', 'ratelimit-remaining', 'retry-after'] as const).map((h) => (hv(h) ? <Row key={h} k={h} v={hv(h)} /> : null))}
          </Section>
        )}

        {net && (
          <Section icon={<Network size={14} />} title="Connection">
            <Row k="Remote address" v={net.remoteAddress ? `${net.remoteAddress}${net.remotePort ? `:${net.remotePort}` : ''}` : 'unknown'} />
            <Row k="IP version" v={net.family ?? 'unknown'} />
            {cert ? (
              <>
                <Row k="TLS version" v={cert.protocol ?? 'unknown'} />
                <Row k="Cipher" v={cert.cipher ?? 'unknown'} />
                <Row k="Certificate" v={cert.authorized ? 'Valid and trusted' : `Not trusted: ${cert.authorizationError ?? 'unknown reason'}`} tone={cert.authorized ? 'ok' : 'err'} />
                {cert.subject && <Row k="Issued to" v={cert.subject} />}
                {cert.issuer && <Row k="Issued by" v={cert.issuer} />}
                {cert.validTo && <Row k="Expires" v={`${cert.validTo}${certDays !== null ? ` (${certDays >= 0 ? `in ${certDays} days` : `${-certDays} days ago`})` : ''}`} tone={certDays !== null && certDays < 0 ? 'err' : certDays !== null && certDays < 14 ? 'warn' : undefined} />}
              </>
            ) : (
              <Row k="TLS" v={<span className="inline-flex items-center gap-1 text-[var(--af-warn)]"><Lock size={11} /> Not used (plain http://). Traffic is not encrypted.</span>} />
            )}
          </Section>
        )}

        {r && (
          <Section icon={<Route size={14} />} title="Redirects">
            {r.redirects.length === 0 ? (
              <div className="text-[11.5px] text-[var(--af-text-3)]">No redirects. The final URL is the one you requested.</div>
            ) : (
              <ol className="space-y-1.5">
                {r.redirects.map((h, i) => (
                  <li key={i} className="text-[11.5px]">
                    <Badge tone="info">{h.status}</Badge> <span className="af-mono break-all text-[var(--af-text-2)]">{h.url}</span>
                    <div className="af-mono break-all pl-1 text-[var(--af-text-3)]">→ {h.location}</div>
                  </li>
                ))}
                <li className="text-[11.5px]">
                  <Badge tone="ok">{r.status}</Badge> <span className="af-mono break-all">{r.url}</span>
                </li>
              </ol>
            )}
          </Section>
        )}

        <div className="lg:col-span-2">
          <ProbeSection target={target} probe={probe} probeError={probeError} probing={probing} onRun={runProbe} failedStage={!outcome.ok ? outcome.error.stage : undefined} />
        </div>

        <Section
          icon={<ShieldAlert size={14} />}
          title="CORS"
          right={
            <Button size="sm" onClick={runCors} loading={corsRunning} disabled={!draft.url.trim()}>
              Test preflight from this app
            </Button>
          }
        >
          <p className="text-[11.5px] leading-relaxed text-[var(--af-text-2)]">Requests in this tool are sent by the CodePilot backend, so browser CORS rules never block them. CORS only matters if you call this API directly from browser code, which this test simulates with a real OPTIONS preflight.</p>
          {r && (
            <div className="mt-2">
              <Row k="Allow-Origin (last response)" v={hv('access-control-allow-origin') ?? <span className="text-[var(--af-text-3)]">not sent</span>} />
            </div>
          )}
          {cors && (
            <div className="af-fade-in mt-2">
              <Callout tone={cors.verdict === 'allowed' ? 'ok' : cors.verdict === 'blocked' ? 'warn' : 'info'} icon={cors.verdict === 'allowed' ? <CheckCircle2 size={14} className="text-[var(--af-ok)]" /> : <ShieldAlert size={14} className="text-[var(--af-warn)]" />}>
                <div className="text-[11.5px]">{cors.note}</div>
              </Callout>
              <div className="mt-1.5">
                {cors.rows.map(([k, v]) => (
                  <Row key={k} k={k} v={v} />
                ))}
              </div>
            </div>
          )}
        </Section>

        <p className="text-[10.5px] leading-snug text-[var(--af-text-3)] lg:col-span-2">
          Not measured: ICMP ping, traceroute, packet loss and browser-side network timing. Those are not available to a web application, so this tool does not pretend to report them.
        </p>
      </div>
    </div>
  )
}

function ProbeSection({ target, probe, probeError, probing, onRun, failedStage }: { target: string; probe: DiagnoseResult | null; probeError: string | null; probing: boolean; onRun: () => void; failedStage?: string }) {
  return (
    <Section
      icon={<Activity size={14} />}
      title="Connectivity check"
      right={
        <Button size="sm" variant={failedStage ? 'primary' : 'default'} onClick={onRun} loading={probing} disabled={!target.trim()}>
          Run check
        </Button>
      }
    >
      <p className="text-[11.5px] leading-relaxed text-[var(--af-text-2)]">Resolves the host and opens a TCP connection from the backend, without sending the HTTP request. Useful for telling “DNS is broken” from “the port is closed” from “the API returned an error”.</p>
      {probeError && <div className="mt-2 text-[11.5px] text-[var(--af-err)]">{probeError}</div>}
      {probe && (
        <div className="af-fade-in mt-2">
          <Row k="Target" v={`${probe.scheme}://${probe.host}:${probe.port}`} />
          <Row k="DNS" v={probe.dnsError ? `Failed (${probe.dnsError})` : probe.dnsMs === null ? 'Not needed (IP address)' : `Resolved in ${formatMs(probe.dnsMs)}`} tone={probe.dnsError ? 'err' : 'ok'} />
          {probe.addresses.map((a) => (
            <Row key={a.address} k={`IPv${a.family}`} v={a.address} />
          ))}
          {probe.tcp && <Row k="TCP connect" v={probe.tcp.ok ? `Connected to ${probe.tcp.address} in ${formatMs(probe.tcp.ms)}` : `Failed${probe.tcp.address ? ` (${probe.tcp.address})` : ''}: ${probe.tcp.error}`} tone={probe.tcp.ok ? 'ok' : 'err'} />}
          {probe.notes.map((n) => (
            <div key={n} className="mt-1 text-[10.5px] text-[var(--af-text-3)]">
              {n}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
