import { randomBytes } from 'node:crypto'
import { FetchError } from './errors.js'
import type { RequestDef } from './schemas.js'
import { parseTargetUrl, type NetworkPolicy } from './url-guard.js'

export interface OutgoingRequest {
  method: string
  url: URL
  headers: Array<[string, string]>
  body: Buffer | null
  notes: string[]
}

const TOKEN_CHARS = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const DEFAULT_UA = 'CodePilot-API-Fetcher/1.0'

function hasHeader(headers: Array<[string, string]>, name: string): boolean {
  const lower = name.toLowerCase()
  return headers.some(([k]) => k.toLowerCase() === lower)
}

function setHeader(headers: Array<[string, string]>, name: string, value: string): void {
  const lower = name.toLowerCase()
  for (let i = headers.length - 1; i >= 0; i--) if (headers[i][0].toLowerCase() === lower) headers.splice(i, 1)
  headers.push([name, value])
}

function assertHeader(name: string, value: string): void {
  if (!TOKEN_CHARS.test(name)) throw new FetchError('INVALID_REQUEST', `Invalid header name "${name}"`, 'Header names may only contain letters, digits and - _ . ! # $ % & \' * + ^ ` | ~')
  if (/[\r\n\0]/.test(value)) throw new FetchError('INVALID_REQUEST', `Header "${name}" contains a line break`, 'Header values must be a single line.')
}

function multipart(fields: Array<{ key: string; value: string }>): { body: Buffer; contentType: string } {
  const boundary = `----CodePilotFormBoundary${randomBytes(12).toString('hex')}`
  const parts = fields.map(
    ({ key, value }) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${key.replace(/["\r\n]/g, '')}"\r\n\r\n${value}\r\n`
  )
  return { body: Buffer.from(`${parts.join('')}--${boundary}--\r\n`, 'utf8'), contentType: `multipart/form-data; boundary=${boundary}` }
}

/** Turns a (variable-resolved) request definition into a concrete outgoing HTTP request. */
export function buildOutgoingRequest(def: RequestDef, policy: NetworkPolicy): OutgoingRequest {
  const { url, notes } = parseTargetUrl(def.url, policy)
  const headers: Array<[string, string]> = []
  for (const h of def.headers) {
    if (!h.enabled || !h.key.trim()) continue
    const name = h.key.trim()
    assertHeader(name, h.value)
    headers.push([name, h.value])
  }

  const auth = def.auth
  switch (auth.type) {
    case 'bearer':
      if (auth.token) setHeader(headers, 'Authorization', `${auth.prefix || 'Bearer'} ${auth.token}`)
      break
    case 'apikey':
      if (auth.key && auth.value) {
        if (auth.in === 'query') {
          const pair = `${encodeURIComponent(auth.key)}=${encodeURIComponent(auth.value)}`
          url.search = url.search ? `${url.search}&${pair}` : `?${pair}`
        } else {
          assertHeader(auth.key, auth.value)
          setHeader(headers, auth.key, auth.value)
        }
      }
      break
    case 'basic':
      if (auth.username || auth.password) {
        setHeader(headers, 'Authorization', `Basic ${Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64')}`)
      }
      break
    case 'oauth2':
      if (!auth.accessToken) {
        throw new FetchError('INVALID_REQUEST', 'OAuth 2.0 is selected but no access token is set', 'Use "Get New Access Token" in the Authorization tab, or paste an existing token.')
      }
      setHeader(headers, 'Authorization', `${auth.tokenPrefix || 'Bearer'} ${auth.accessToken}`)
      break
  }

  let body: Buffer | null = null
  const b = def.body
  if (b.mode === 'json') {
    if (b.json.trim()) {
      body = Buffer.from(b.json, 'utf8')
      if (!hasHeader(headers, 'content-type')) headers.push(['Content-Type', 'application/json'])
    }
  } else if (b.mode === 'urlencoded') {
    const params = new URLSearchParams()
    for (const f of b.urlencoded) if (f.enabled && f.key) params.append(f.key, f.value)
    body = Buffer.from(params.toString(), 'utf8')
    if (!hasHeader(headers, 'content-type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded'])
  } else if (b.mode === 'form-data') {
    const m = multipart(b.form.filter((f) => f.enabled && f.key))
    body = m.body
    setHeader(headers, 'Content-Type', m.contentType)
  } else if (b.mode === 'raw') {
    if (b.raw.length > 0) {
      body = Buffer.from(b.raw, 'utf8')
      if (!hasHeader(headers, 'content-type') && b.rawContentType) headers.push(['Content-Type', b.rawContentType])
    }
  }

  if ((def.method === 'GET' || def.method === 'HEAD') && body) {
    notes.push(`${def.method} request with a body; some servers ignore or reject this`)
  }

  if (!hasHeader(headers, 'user-agent')) headers.push(['User-Agent', DEFAULT_UA])
  if (!hasHeader(headers, 'accept')) headers.push(['Accept', '*/*'])
  if (!hasHeader(headers, 'accept-encoding')) headers.push(['Accept-Encoding', 'gzip, deflate, br'])

  return { method: def.method, url, headers, body, notes }
}
