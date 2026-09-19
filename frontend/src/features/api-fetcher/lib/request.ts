import type { AuthConfig, AuthType, KeyValue, RequestBody, RequestDef } from '../types'
import { shortId } from './format'

export const newKv = (key = '', value = '', enabled = true): KeyValue => ({ id: shortId(), key, value, enabled })

export function emptyBody(): RequestBody {
  return { mode: 'none', json: '', raw: '', rawContentType: 'text/plain', form: [], urlencoded: [] }
}

export function newRequest(over: Partial<RequestDef> = {}): RequestDef {
  return { name: '', method: 'GET', url: '', params: [], headers: [], body: emptyBody(), auth: { type: 'none' }, ...over }
}

export function defaultAuth(type: AuthType): AuthConfig {
  switch (type) {
    case 'bearer':
      return { type, token: '', prefix: 'Bearer' }
    case 'apikey':
      return { type, key: 'X-API-Key', value: '', in: 'header' }
    case 'basic':
      return { type, username: '', password: '' }
    case 'oauth2':
      return {
        type,
        grantType: 'client_credentials',
        accessTokenUrl: '',
        clientId: '',
        clientSecret: '',
        username: '',
        password: '',
        scope: '',
        clientAuth: 'basic',
        tokenPrefix: 'Bearer',
        accessToken: '',
        expiresAt: null,
      }
    default:
      return { type: 'none' }
  }
}

/** Fills missing ids/fields so saved, imported or AI-produced definitions can safely be edited. */
export function normalizeRequest(raw: Partial<RequestDef> & Record<string, unknown>): RequestDef {
  const base = newRequest()
  const kvs = (list: unknown): KeyValue[] =>
    Array.isArray(list)
      ? list.map((x: any) => ({ id: typeof x?.id === 'string' && x.id ? x.id : shortId(), key: String(x?.key ?? ''), value: String(x?.value ?? ''), enabled: x?.enabled !== false, description: x?.description }))
      : []
  const body = (raw.body ?? {}) as Partial<RequestBody>
  const auth = (raw.auth ?? { type: 'none' }) as AuthConfig
  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    name: typeof raw.name === 'string' ? raw.name : base.name,
    method: (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const).includes(raw.method as never) ? (raw.method as RequestDef['method']) : 'GET',
    url: typeof raw.url === 'string' ? raw.url : '',
    params: kvs(raw.params),
    headers: kvs(raw.headers),
    body: {
      mode: (body.mode as RequestBody['mode']) ?? 'none',
      json: body.json ?? '',
      raw: body.raw ?? '',
      rawContentType: body.rawContentType ?? 'text/plain',
      form: kvs(body.form),
      urlencoded: kvs(body.urlencoded),
    },
    auth: auth && typeof auth === 'object' && 'type' in auth ? { ...defaultAuth(auth.type), ...auth } : { type: 'none' },
  }
}

// ─── URL <-> params ──────────────────────────────────────────────────────────

const VAR_SPLIT = /(\{\{[^}]*\}\})/

/** Percent-encodes text but leaves {{variable}} references readable. */
function encodePart(text: string): string {
  return text
    .split(VAR_SPLIT)
    .map((seg) => (seg.startsWith('{{') && seg.endsWith('}}') ? seg : encodeURIComponent(seg)))
    .join('')
}

function decodePart(text: string): string {
  return text
    .split(VAR_SPLIT)
    .map((seg) => {
      if (seg.startsWith('{{') && seg.endsWith('}}')) return seg
      try {
        return decodeURIComponent(seg.replace(/\+/g, ' '))
      } catch {
        return seg
      }
    })
    .join('')
}

export function splitUrl(url: string): { base: string; query: string; hash: string } {
  const hashIdx = url.indexOf('#')
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : ''
  const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url
  const qIdx = noHash.indexOf('?')
  return qIdx >= 0 ? { base: noHash.slice(0, qIdx), query: noHash.slice(qIdx + 1), hash } : { base: noHash, query: '', hash }
}

export function parseQuery(query: string): Array<{ key: string; value: string }> {
  if (!query) return []
  return query
    .split('&')
    .filter((p) => p !== '')
    .map((part) => {
      const eq = part.indexOf('=')
      return eq < 0 ? { key: decodePart(part), value: '' } : { key: decodePart(part.slice(0, eq)), value: decodePart(part.slice(eq + 1)) }
    })
}

export function buildQuery(params: Array<{ key: string; value: string; enabled: boolean }>): string {
  return params
    .filter((p) => p.enabled && p.key !== '')
    .map((p) => (p.value === '' ? `${encodePart(p.key)}=` : `${encodePart(p.key)}=${encodePart(p.value)}`))
    .join('&')
}

/** Rewrites the query string of `url` from the enabled params. */
export function applyParamsToUrl(url: string, params: KeyValue[]): string {
  const { base, hash } = splitUrl(url)
  const q = buildQuery(params)
  return `${base}${q ? `?${q}` : ''}${hash}`
}

/** Recomputes params after the URL was edited, keeping ids/descriptions and disabled rows. */
export function syncParamsFromUrl(url: string, existing: KeyValue[]): KeyValue[] {
  const parsed = parseQuery(splitUrl(url).query)
  const enabled = existing.filter((p) => p.enabled)
  const disabled = existing.filter((p) => !p.enabled)
  const next: KeyValue[] = parsed.map((p, i) => {
    const prior = enabled[i]
    return { id: prior?.id ?? shortId(), key: p.key, value: p.value, enabled: true, description: prior?.description }
  })
  return [...next, ...disabled]
}

export function urlHasSyncedParams(url: string, params: KeyValue[]): boolean {
  return buildQuery(params) === buildQuery(parseQuery(splitUrl(url).query).map((p) => ({ ...p, enabled: true })))
}

// ─── Misc helpers ────────────────────────────────────────────────────────────

export function getHeader(headers: KeyValue[], name: string): KeyValue | undefined {
  const lower = name.toLowerCase()
  return headers.find((h) => h.enabled && h.key.toLowerCase() === lower)
}

export function setHeaderValue(headers: KeyValue[], name: string, value: string): KeyValue[] {
  const lower = name.toLowerCase()
  const idx = headers.findIndex((h) => h.key.toLowerCase() === lower)
  if (idx >= 0) return headers.map((h, i) => (i === idx ? { ...h, value, enabled: true } : h))
  return [...headers, newKv(name, value)]
}

/** A stable JSON snapshot used for dirty tracking (ignores row ids so re-rendering never marks a request dirty). */
export function snapshotOf(def: RequestDef): string {
  const strip = (l: KeyValue[]) => l.map(({ key, value, enabled }) => [key, value, enabled])
  return JSON.stringify([def.name, def.method, def.url, strip(def.params), strip(def.headers), def.body.mode, def.body.json, def.body.raw, def.body.rawContentType, strip(def.body.form), strip(def.body.urlencoded), def.auth])
}

export function isBlankRow(kv: KeyValue): boolean {
  return kv.key === '' && kv.value === ''
}

export function displayName(def: Pick<RequestDef, 'name' | 'method' | 'url'>): string {
  if (def.name.trim()) return def.name.trim()
  return urlPath(def.url) || 'Untitled request'
}

export function urlPath(url: string): string {
  const { base } = splitUrl(url)
  const m = base.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i)
  if (m) return m[1] ?? '/'
  const slash = base.indexOf('/')
  return slash >= 0 ? base.slice(slash) : base
}

export function urlHost(url: string): string {
  const m = url.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#]*)/i)
  return m?.[1] ?? ''
}
