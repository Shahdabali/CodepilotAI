import type { KeyValue, RequestDef } from './schemas.js'

export const REDACTED = '[REDACTED]'

const SENSITIVE_NAME =
  /(^|[^a-z0-9])(authorization|proxy[-_ ]authorization|cookie|set[-_ ]cookie|api[-_ ]?key|apikey|key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|auth[-_ ]?token|security[-_ ]?token|csrf[-_ ]?token|xsrf[-_ ]?token|token|secret|client[-_ ]?secret|password|passwd|pwd|passphrase|signature|sig|session[-_ ]?id|sessionid|private[-_ ]?key|credentials?|bearer|otp|pin)s?([^a-z0-9]|$)/i

export function isSensitiveName(name: string): boolean {
  if (!name) return false
  const normalised = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  return SENSITIVE_NAME.test(normalised)
}

const VAR_REF = /\{\{[^}]+\}\}/g

/** True when a value is only variable references (optionally behind an auth scheme word). */
export function isVariableReference(value: string): boolean {
  if (!value.includes('{{')) return false
  const rest = value.replace(VAR_REF, '').replace(/^\s*(bearer|basic|token|digest)\s*/i, '').trim()
  return rest === ''
}

export function redactValue(value: string): string {
  if (!value) return value
  return isVariableReference(value) ? value : REDACTED
}

export function redactKeyValues(list: KeyValue[]): KeyValue[] {
  return list.map((kv) => (isSensitiveName(kv.key) ? { ...kv, value: redactValue(kv.value) } : kv))
}

export function redactHeaderPairs(pairs: Array<[string, string]>): Array<[string, string]> {
  return pairs.map(([k, v]) => [k, isSensitiveName(k) ? redactValue(v) : v])
}

/** Strips userinfo and masks sensitive query parameter values, keeping {{variable}} references intact. */
export function redactUrl(raw: string): string {
  if (!raw) return raw
  let out = raw.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#@]*@/i, '$1')
  const hashIdx = out.indexOf('#')
  const hash = hashIdx >= 0 ? out.slice(hashIdx) : ''
  if (hashIdx >= 0) out = out.slice(0, hashIdx)
  const qIdx = out.indexOf('?')
  if (qIdx < 0) return out + hash
  const base = out.slice(0, qIdx)
  const query = out
    .slice(qIdx + 1)
    .split('&')
    .map((part) => {
      const eq = part.indexOf('=')
      if (eq < 0) return part
      const name = safeDecode(part.slice(0, eq))
      const value = part.slice(eq + 1)
      return isSensitiveName(name) ? `${part.slice(0, eq)}=${redactValue(safeDecode(value))}` : part
    })
    .join('&')
  return `${base}?${query}${hash}`
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Masks values of sensitive keys anywhere inside a JSON document. */
export function redactJsonValue(input: unknown, depth = 0): unknown {
  if (depth > 40 || input === null || typeof input !== 'object') return input
  if (Array.isArray(input)) return input.map((v) => redactJsonValue(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveName(k) && (typeof v === 'string' || typeof v === 'number')) {
      out[k] = typeof v === 'string' ? redactValue(v) : REDACTED
    } else {
      out[k] = redactJsonValue(v, depth + 1)
    }
  }
  return out
}

/** Redacts a body/text blob: JSON is walked structurally, anything else falls back to pattern masking. */
export function redactText(text: string): string {
  if (!text) return text
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(redactJsonValue(JSON.parse(trimmed)), null, 2)
    } catch {
      /* fall through to pattern masking */
    }
  }
  return text
    .replace(/("?[\w.-]*(?:token|secret|password|passwd|api[_-]?key|authorization|signature)[\w.-]*"?\s*[:=]\s*)("[^"]*"|[^\s,&;}]+)/gi, (_m, p1: string, p2: string) =>
      `${p1}${p2.startsWith('"') ? `"${REDACTED}"` : REDACTED}`
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`)
}

function redactAuth(auth: RequestDef['auth']): RequestDef['auth'] {
  switch (auth.type) {
    case 'bearer':
      return { ...auth, token: redactValue(auth.token) }
    case 'apikey':
      return { ...auth, value: redactValue(auth.value) }
    case 'basic':
      return { ...auth, password: redactValue(auth.password) }
    case 'oauth2':
      return {
        ...auth,
        clientSecret: redactValue(auth.clientSecret),
        password: redactValue(auth.password),
        accessToken: redactValue(auth.accessToken),
      }
    default:
      return auth
  }
}

/** Produces a copy of a request definition that is safe to persist in history or send to an AI provider. */
export function redactRequestDef(def: RequestDef): RequestDef {
  return {
    ...def,
    url: redactUrl(def.url),
    params: redactKeyValues(def.params),
    headers: redactKeyValues(def.headers),
    auth: redactAuth(def.auth),
    body: {
      ...def.body,
      json: redactText(def.body.json),
      raw: redactText(def.body.raw),
      form: redactKeyValues(def.body.form),
      urlencoded: redactKeyValues(def.body.urlencoded),
    },
  }
}
