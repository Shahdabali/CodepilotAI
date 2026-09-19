import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import zlib from 'node:zlib'
import { performance } from 'node:perf_hooks'
import type { TLSSocket } from 'node:tls'
import { FetchError } from './errors.js'
import { createGuardedLookup, parseTargetUrl, type NetworkPolicy } from './url-guard.js'
import { isSensitiveName, redactUrl } from './redact.js'

export interface HopTimings {
  dnsMs?: number
  tcpMs?: number
  tlsMs?: number
  ttfbMs: number
  downloadMs: number
  totalMs: number
}

export interface TlsInfo {
  protocol: string | null
  cipher: string | null
  authorized: boolean
  authorizationError?: string
  subject?: string
  issuer?: string
  validFrom?: string
  validTo?: string
  altNames?: string
}

export interface RedirectHop {
  url: string
  status: number
  location: string
  durationMs: number
}

export interface RawResponse {
  status: number
  statusText: string
  httpVersion: string
  headers: Array<[string, string]>
  body: Buffer
  truncated: boolean
  transferBytes: number
  contentEncoding: string
  timings: HopTimings
  remoteAddress?: string
  remotePort?: number
  family?: string
  tls?: TlsInfo
  finalUrl: string
  redirects: RedirectHop[]
  totalMs: number
  sentHeaders: Array<[string, string]>
}

export interface PerformInput {
  method: string
  url: URL
  headers: Array<[string, string]>
  body: Buffer | null
  timeoutMs: number
  followRedirects: boolean
  maxRedirects: number
  insecureTls: boolean
  maxBytes: number
  policy: NetworkPolicy
  signal: AbortSignal
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const BODY_HEADERS = new Set(['content-type', 'content-length', 'content-encoding', 'transfer-encoding'])
const REDIRECT_BODY_LIMIT = 64 * 1024

function findHeader(headers: Array<[string, string]>, name: string): string | undefined {
  const lower = name.toLowerCase()
  return headers.find(([k]) => k.toLowerCase() === lower)?.[1]
}

function createDecoder(encoding: string): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  const enc = encoding.split(',').pop()?.trim() ?? ''
  if (enc === 'gzip' || enc === 'x-gzip') return zlib.createGunzip({ finishFlush: zlib.constants.Z_SYNC_FLUSH })
  if (enc === 'deflate') return zlib.createInflate({ finishFlush: zlib.constants.Z_SYNC_FLUSH })
  if (enc === 'br') return zlib.createBrotliDecompress({ finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH })
  return null
}

function toHeaderObject(pairs: Array<[string, string]>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  const casing = new Map<string, string>()
  for (const [k, v] of pairs) {
    const lower = k.toLowerCase()
    const name = casing.get(lower) ?? k
    casing.set(lower, name)
    const existing = out[name]
    out[name] = existing === undefined ? v : Array.isArray(existing) ? [...existing, v] : [existing, v]
  }
  return out
}

interface HopResult extends Omit<RawResponse, 'redirects' | 'totalMs' | 'finalUrl'> {}

function requestOnce(o: {
  url: URL
  method: string
  headers: Array<[string, string]>
  body: Buffer | null
  insecureTls: boolean
  maxBytes: number
  followRedirects: boolean
  policy: NetworkPolicy
  signal: AbortSignal
}): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const isHttps = o.url.protocol === 'https:'
    const lib = isHttps ? https : http
    const host = o.url.hostname.replace(/^\[|\]$/g, '')
    const t0 = performance.now()
    let tLookup: number | undefined
    let tConnect: number | undefined
    let tSecure: number | undefined
    let settled = false

    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      reject(err)
    }

    const req = lib.request({
      hostname: host,
      port: o.url.port || undefined,
      path: `${o.url.pathname}${o.url.search}`,
      method: o.method,
      headers: toHeaderObject(o.headers),
      agent: false,
      lookup: createGuardedLookup(o.policy) as never,
      rejectUnauthorized: !o.insecureTls,
      servername: net.isIP(host) ? undefined : host,
      signal: o.signal,
    })

    req.on('socket', (socket) => {
      socket.once('lookup', () => {
        tLookup = performance.now()
      })
      socket.once('connect', () => {
        tConnect = performance.now()
      })
      socket.once('secureConnect', () => {
        tSecure = performance.now()
      })
    })

    req.on('error', fail)

    req.on('response', (res) => {
      const tFirst = performance.now()
      const status = res.statusCode ?? 0
      const headers: Array<[string, string]> = []
      for (let i = 0; i < res.rawHeaders.length; i += 2) headers.push([res.rawHeaders[i], res.rawHeaders[i + 1]])

      const socket = res.socket
      const tlsSocket = isHttps ? (socket as TLSSocket) : null
      let tls: TlsInfo | undefined
      if (tlsSocket && typeof tlsSocket.getProtocol === 'function') {
        const cert = tlsSocket.getPeerCertificate?.()
        tls = {
          protocol: tlsSocket.getProtocol(),
          cipher: tlsSocket.getCipher?.()?.name ?? null,
          authorized: tlsSocket.authorized,
          authorizationError: tlsSocket.authorizationError ? String(tlsSocket.authorizationError) : undefined,
          subject: cert && cert.subject ? [cert.subject.CN].flat().join(', ') : undefined,
          issuer: cert && cert.issuer ? [cert.issuer.O ?? cert.issuer.CN].flat().join(', ') : undefined,
          validFrom: cert?.valid_from,
          validTo: cert?.valid_to,
          altNames: cert?.subjectaltname,
        }
      }
      const remoteAddress = socket?.remoteAddress
      const remotePort = socket?.remotePort
      const family = socket?.remoteFamily

      const contentEncoding = String(res.headers['content-encoding'] ?? '').toLowerCase().trim()
      const noBody = o.method === 'HEAD' || status === 204 || status === 304 || (status >= 100 && status < 200)
      const limit = o.followRedirects && REDIRECT_STATUSES.has(status) ? Math.min(o.maxBytes, REDIRECT_BODY_LIMIT) : o.maxBytes

      let transferBytes = 0
      res.on('data', (c: Buffer) => {
        transferBytes += c.length
      })

      let source: NodeJS.ReadableStream = res
      let decoder: ReturnType<typeof createDecoder> = null
      if (!noBody && contentEncoding) {
        decoder = createDecoder(contentEncoding)
        if (decoder) {
          decoder.on('error', (e) => fail(new FetchError('UNKNOWN', `Failed to decode ${contentEncoding} response body`, e.message)))
          res.pipe(decoder)
          source = decoder
        }
      }

      const chunks: Buffer[] = []
      let size = 0
      let truncated = false

      const finish = () => {
        if (settled) return
        settled = true
        const tEnd = performance.now()
        const afterConnect = tSecure ?? tConnect ?? tLookup ?? t0
        resolve({
          status,
          statusText: res.statusMessage ?? '',
          httpVersion: res.httpVersion,
          headers,
          body: Buffer.concat(chunks, size),
          truncated,
          transferBytes,
          contentEncoding,
          timings: {
            dnsMs: tLookup !== undefined ? tLookup - t0 : undefined,
            tcpMs: tConnect !== undefined ? tConnect - (tLookup ?? t0) : undefined,
            tlsMs: tSecure !== undefined && tConnect !== undefined ? tSecure - tConnect : undefined,
            ttfbMs: Math.max(0, tFirst - afterConnect),
            downloadMs: Math.max(0, tEnd - tFirst),
            totalMs: tEnd - t0,
          },
          remoteAddress,
          remotePort,
          family,
          tls,
          sentHeaders: o.headers,
        })
      }

      source.on('data', (chunk: Buffer) => {
        if (truncated || settled) return
        const remaining = limit - size
        if (chunk.length > remaining) {
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
          size += Math.max(remaining, 0)
          truncated = true
          finish()
          res.destroy()
          decoder?.destroy()
          return
        }
        chunks.push(chunk)
        size += chunk.length
      })
      source.on('end', finish)
      source.on('error', fail)
      res.on('error', fail)
      res.on('aborted', () => fail(Object.assign(new Error('The server closed the connection before the response completed'), { code: 'ECONNRESET' })))
      res.on('close', () => {
        if (!settled && !res.complete) fail(Object.assign(new Error('The server closed the connection before the response completed'), { code: 'ECONNRESET' }))
      })
    })

    if (o.body && o.body.length > 0) req.end(o.body)
    else req.end()
  })
}

/** Executes an HTTP request, following redirects manually so every hop is validated, timed and reported. */
export async function performRequest(input: PerformInput): Promise<RawResponse> {
  const ac = new AbortController()
  let reason: 'timeout' | 'cancelled' | null = null
  const timer = setTimeout(() => {
    reason = 'timeout'
    ac.abort()
  }, input.timeoutMs)
  const onAbort = () => {
    reason = 'cancelled'
    ac.abort()
  }
  if (input.signal.aborted) onAbort()
  else input.signal.addEventListener('abort', onAbort, { once: true })

  const started = performance.now()
  const redirects: RedirectHop[] = []
  let current = input.url
  let method = input.method
  let body = input.body
  let headers = input.headers

  try {
    for (let hop = 0; ; hop++) {
      const hopStart = performance.now()
      const result = await requestOnce({
        url: current,
        method,
        headers,
        body,
        insecureTls: input.insecureTls,
        maxBytes: input.maxBytes,
        followRedirects: input.followRedirects,
        policy: input.policy,
        signal: ac.signal,
      })
      const location = findHeader(result.headers, 'location')

      if (input.followRedirects && REDIRECT_STATUSES.has(result.status) && location) {
        if (hop >= input.maxRedirects) {
          throw new FetchError('TOO_MANY_REDIRECTS', `Stopped after ${input.maxRedirects} redirects`)
        }
        let next: URL
        try {
          next = parseTargetUrl(new URL(location, current).href, input.policy).url
        } catch (e) {
          if (e instanceof FetchError) throw new FetchError(e.fetchCode, `Redirect target rejected: ${e.message}`, e.cause2)
          throw e
        }
        redirects.push({ url: redactUrl(current.href), status: result.status, location: redactUrl(next.href), durationMs: performance.now() - hopStart })

        if (result.status === 303 || ((result.status === 301 || result.status === 302) && method === 'POST')) {
          if (method !== 'HEAD') method = 'GET'
          body = null
          headers = headers.filter(([k]) => !BODY_HEADERS.has(k.toLowerCase()))
        }
        headers = headers.filter(([k]) => k.toLowerCase() !== 'host')
        if (next.origin !== current.origin) headers = headers.filter(([k]) => !isSensitiveName(k))
        current = next
        continue
      }

      return { ...result, finalUrl: redactUrl(current.href), redirects, totalMs: performance.now() - started }
    }
  } catch (err) {
    if (reason === 'timeout') throw new FetchError('TIMEOUT', `The request timed out after ${Math.round(input.timeoutMs / 1000)}s`)
    if (reason === 'cancelled') throw new FetchError('CANCELLED', 'Request cancelled')
    throw err
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener('abort', onAbort)
  }
}
