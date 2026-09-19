import dns from 'node:dns'
import net from 'node:net'
import { performance } from 'node:perf_hooks'
import type { z } from 'zod'
import { FetchError, toErrorReport, type ErrorReport } from './errors.js'
import { performRequest, type HopTimings, type RedirectHop, type TlsInfo } from './http-client.js'
import { redactHeaderPairs, redactRequestDef, redactUrl } from './redact.js'
import { buildOutgoingRequest } from './request-builder.js'
import {
  classifyBody,
  decodeText,
  MEDIA_INLINE_MAX,
  responseCache,
  suggestFilename,
  TEXT_INLINE_MAX,
  charsetOf,
  type BodyKind,
} from './response-processor.js'
import type { RequestDef, executeSchema } from './schemas.js'
import { execOptionsSchema } from './schemas.js'
import { addHistory, getEnvironmentContext, maskSecrets, type EnvironmentContext } from './store.js'
import { assertAddressAllowed, getNetworkPolicy, parseTargetUrl } from './url-guard.js'
import { interpolateRequest } from './variables.js'

export function getMaxResponseBytes(): number {
  const configured = parseInt(process.env.API_FETCHER_MAX_RESPONSE_BYTES ?? '', 10)
  const value = Number.isFinite(configured) && configured > 0 ? configured : 25 * 1024 * 1024
  return Math.min(value, 100 * 1024 * 1024)
}

export interface ExecuteSuccess {
  ok: true
  historyId: string | null
  notes: string[]
  request: { method: string; url: string; headers: Array<[string, string]>; bodyBytes: number }
  response: {
    status: number
    statusText: string
    httpVersion: string
    headers: Array<[string, string]>
    url: string
    redirects: RedirectHop[]
    contentType: string
    charset: string
    contentEncoding: string
    kind: BodyKind
    sizeBytes: number
    transferBytes: number
    truncated: boolean
    bodyText?: string
    bodyTextTruncated?: boolean
    bodyBase64?: string
    responseId: string
    filename: string
  }
  timings: HopTimings
  network: { remoteAddress?: string; remotePort?: number; family?: string; tls?: TlsInfo }
}

export interface ExecuteFailure {
  ok: false
  historyId: string | null
  notes: string[]
  error: ErrorReport
  elapsedMs: number
  request?: { method: string; url: string; headers: Array<[string, string]>; bodyBytes: number }
}

export type ExecuteOutcome = ExecuteSuccess | ExecuteFailure

type ExecutePayload = z.infer<typeof executeSchema>

function headerValue(headers: Array<[string, string]>, name: string): string {
  const lower = name.toLowerCase()
  return headers.find(([k]) => k.toLowerCase() === lower)?.[1] ?? ''
}

export async function executeRequest(payload: ExecutePayload, signal: AbortSignal): Promise<ExecuteOutcome> {
  const started = performance.now()
  const policy = getNetworkPolicy()
  const def: RequestDef = payload.request
  const options = payload.options
  const envId = payload.environmentId ?? null
  const notes: string[] = []
  let ctx: EnvironmentContext = { vars: {}, secrets: [] }
  let requestPreview: ExecuteFailure['request']

  const record = async (status: number | null, statusText: string | null, durationMs: number | null, size: number | null, err: ErrorReport | null): Promise<string | null> => {
    try {
      const row = await addHistory({
        redactedRequest: redactRequestDef(def),
        status,
        statusText,
        durationMs,
        sizeBytes: size,
        errorCode: err?.code ?? null,
        errorMessage: err ? maskSecrets(err.message, ctx.secrets) : null,
        environmentId: envId,
      })
      return row.id
    } catch {
      return null
    }
  }

  try {
    if (envId) {
      try {
        ctx = await getEnvironmentContext(envId)
      } catch (e) {
        throw new FetchError('INVALID_REQUEST', e instanceof Error ? e.message : 'Environment could not be loaded')
      }
    }
    const { request: resolved, missing } = interpolateRequest(def, ctx.vars)
    if (missing.length) {
      throw new FetchError('UNRESOLVED_VARIABLES', `Undefined variable${missing.length > 1 ? 's' : ''}: ${missing.map((m) => `{{${m}}}`).join(', ')}`)
    }

    const outgoing = buildOutgoingRequest(resolved, policy)
    notes.push(...outgoing.notes)
    requestPreview = {
      method: outgoing.method,
      // Known secrets become {{NAME}} first, so redaction keeps the (harmless) variable reference and hides only literals.
      url: redactUrl(maskSecrets(outgoing.url.href, ctx.secrets)),
      headers: redactHeaderPairs(outgoing.headers.map(([k, v]) => [k, maskSecrets(v, ctx.secrets)] as [string, string])),
      bodyBytes: outgoing.body?.length ?? 0,
    }

    const raw = await performRequest({
      method: outgoing.method,
      url: outgoing.url,
      headers: outgoing.headers,
      body: outgoing.body,
      timeoutMs: options.timeoutMs,
      followRedirects: options.followRedirects,
      maxRedirects: options.maxRedirects,
      insecureTls: options.insecureTls,
      maxBytes: getMaxResponseBytes(),
      policy,
      signal,
    })
    if (options.insecureTls) notes.push('TLS certificate verification was disabled for this request')

    const contentType = headerValue(raw.headers, 'content-type')
    const kind = classifyBody(contentType, raw.body)
    const filename = suggestFilename(raw.finalUrl, contentType, headerValue(raw.headers, 'content-disposition'))
    const responseId = responseCache.put(raw.body, contentType, filename)

    const textLike = kind === 'json' || kind === 'html' || kind === 'xml' || kind === 'text'
    const response: ExecuteSuccess['response'] = {
      status: raw.status,
      statusText: raw.statusText,
      httpVersion: raw.httpVersion,
      headers: raw.headers,
      url: maskSecrets(raw.finalUrl, ctx.secrets),
      redirects: raw.redirects,
      contentType,
      charset: charsetOf(contentType),
      contentEncoding: raw.contentEncoding,
      kind,
      sizeBytes: raw.body.length,
      transferBytes: raw.transferBytes,
      truncated: raw.truncated,
      responseId,
      filename,
    }
    if (textLike) {
      const text = decodeText(raw.body, contentType)
      if (text.length > TEXT_INLINE_MAX) {
        response.bodyText = text.slice(0, TEXT_INLINE_MAX)
        response.bodyTextTruncated = true
      } else {
        response.bodyText = text
      }
    } else if (raw.body.length > 0 && raw.body.length <= MEDIA_INLINE_MAX && kind !== 'binary') {
      response.bodyBase64 = raw.body.toString('base64')
    }
    if (raw.truncated) notes.push(`Response exceeded the ${Math.round(getMaxResponseBytes() / 1048576)} MB capture limit and was truncated`)

    const historyId = await record(raw.status, raw.statusText, raw.totalMs, raw.body.length, null)
    return {
      ok: true,
      historyId,
      notes,
      request: requestPreview!,
      response,
      timings: { ...raw.timings, totalMs: raw.totalMs },
      network: { remoteAddress: raw.remoteAddress, remotePort: raw.remotePort, family: raw.family, tls: raw.tls },
    }
  } catch (err) {
    const report = toErrorReport(err)
    report.message = maskSecrets(report.message, ctx.secrets)
    const elapsedMs = performance.now() - started
    const historyId = report.code === 'CANCELLED' ? null : await record(null, null, elapsedMs, null, report)
    return { ok: false, historyId, notes, error: report, elapsedMs, request: requestPreview }
  }
}

// ─── Connectivity diagnostics ────────────────────────────────────────────────

export interface DiagnoseResult {
  host: string
  port: number
  scheme: string
  addresses: Array<{ address: string; family: number }>
  dnsMs: number | null
  dnsError?: string
  tcp: { ok: boolean; ms: number | null; address?: string; error?: string } | null
  notes: string[]
}

/** Runs a real DNS resolution and TCP connect against the URL's host. */
export async function diagnoseUrl(rawUrl: string, signal: AbortSignal): Promise<DiagnoseResult> {
  const policy = getNetworkPolicy()
  const { url, notes } = parseTargetUrl(rawUrl, policy)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
  const result: DiagnoseResult = { host, port, scheme: url.protocol.replace(':', ''), addresses: [], dnsMs: null, tcp: null, notes }

  if (net.isIP(host)) {
    result.addresses = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }]
  } else {
    const t0 = performance.now()
    try {
      const addrs = await dns.promises.lookup(host, { all: true, verbatim: true })
      result.dnsMs = performance.now() - t0
      result.addresses = addrs.map((a) => ({ address: a.address, family: a.family }))
    } catch (e) {
      result.dnsMs = performance.now() - t0
      result.dnsError = (e as NodeJS.ErrnoException).code ?? 'DNS lookup failed'
      return result
    }
  }

  const allowed = result.addresses.filter((a) => {
    try {
      assertAddressAllowed(a.address, policy, a.address)
      return true
    } catch {
      return false
    }
  })
  if (allowed.length === 0) {
    result.tcp = { ok: false, ms: null, error: 'All resolved addresses are blocked by the proxy network policy' }
    return result
  }

  const target = allowed[0]
  result.tcp = await new Promise((resolve) => {
    const t1 = performance.now()
    const socket = net.connect({ host: target.address, port })
    const done = (value: NonNullable<DiagnoseResult['tcp']>) => {
      socket.destroy()
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }
    const onAbort = () => done({ ok: false, ms: null, address: target.address, error: 'cancelled' })
    signal.addEventListener('abort', onAbort, { once: true })
    socket.setTimeout(5000, () => done({ ok: false, ms: null, address: target.address, error: 'Connection timed out after 5s' }))
    socket.once('connect', () => done({ ok: true, ms: performance.now() - t1, address: target.address }))
    socket.once('error', (e: NodeJS.ErrnoException) => done({ ok: false, ms: null, address: target.address, error: e.code ?? e.message }))
  })
  return result
}

// ─── OAuth 2.0 token exchange ────────────────────────────────────────────────

export interface OAuthTokenResult {
  ok: boolean
  accessToken?: string
  tokenType?: string
  expiresIn?: number
  scope?: string
  error?: string
}

export async function fetchOAuthToken(
  auth: Extract<RequestDef['auth'], { type: 'oauth2' }>,
  environmentId: string | null,
  signal: AbortSignal
): Promise<OAuthTokenResult> {
  const policy = getNetworkPolicy()
  const ctx = environmentId ? await getEnvironmentContext(environmentId) : { vars: {}, secrets: [] }
  const { request, missing } = interpolateRequest(
    { name: '', method: 'POST', url: '', params: [], headers: [], body: { mode: 'none', json: '', raw: '', rawContentType: 'text/plain', form: [], urlencoded: [] }, auth },
    ctx.vars
  )
  if (missing.length) return { ok: false, error: `Undefined variable${missing.length > 1 ? 's' : ''}: ${missing.map((m) => `{{${m}}}`).join(', ')}` }
  const a = request.auth
  if (a.type !== 'oauth2') return { ok: false, error: 'Not an OAuth 2.0 configuration' }
  if (!a.accessTokenUrl) return { ok: false, error: 'Access Token URL is required' }
  if (a.grantType === 'manual') return { ok: false, error: 'Manual mode does not fetch tokens' }

  const form = new URLSearchParams()
  form.set('grant_type', a.grantType)
  if (a.scope) form.set('scope', a.scope)
  if (a.grantType === 'password') {
    form.set('username', a.username)
    form.set('password', a.password)
  }
  const headers: Array<[string, string]> = [
    ['Content-Type', 'application/x-www-form-urlencoded'],
    ['Accept', 'application/json'],
    ['User-Agent', 'CodePilot-API-Fetcher/1.0'],
  ]
  if (a.clientAuth === 'basic' && (a.clientId || a.clientSecret)) {
    headers.push(['Authorization', `Basic ${Buffer.from(`${a.clientId}:${a.clientSecret}`).toString('base64')}`])
  } else {
    if (a.clientId) form.set('client_id', a.clientId)
    if (a.clientSecret) form.set('client_secret', a.clientSecret)
  }

  try {
    const { url } = parseTargetUrl(a.accessTokenUrl, policy)
    const raw = await performRequest({
      method: 'POST',
      url,
      headers,
      body: Buffer.from(form.toString(), 'utf8'),
      timeoutMs: 20_000,
      followRedirects: false,
      maxRedirects: 0,
      insecureTls: false,
      maxBytes: 1024 * 1024,
      policy,
      signal,
    })
    const text = raw.body.toString('utf8')
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(text)
    } catch {
      /* non-JSON error body */
    }
    if (raw.status < 200 || raw.status >= 300 || typeof json.access_token !== 'string') {
      const desc = (json.error_description as string) || (json.error as string) || `Token endpoint returned HTTP ${raw.status}`
      return { ok: false, error: maskSecrets(String(desc).slice(0, 300), ctx.secrets) }
    }
    return {
      ok: true,
      accessToken: json.access_token,
      tokenType: typeof json.token_type === 'string' ? json.token_type : 'Bearer',
      expiresIn: typeof json.expires_in === 'number' ? json.expires_in : undefined,
      scope: typeof json.scope === 'string' ? json.scope : undefined,
    }
  } catch (err) {
    return { ok: false, error: toErrorReport(err).message }
  }
}

export { execOptionsSchema }
