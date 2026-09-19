import type { AuthConfig, KeyValue, RequestDef } from '../types'

export const REDACTED = '[REDACTED]'

const SENSITIVE_NAME =
  /(^|[^a-z0-9])(authorization|proxy[-_ ]authorization|cookie|set[-_ ]cookie|api[-_ ]?key|apikey|key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|auth[-_ ]?token|security[-_ ]?token|csrf[-_ ]?token|xsrf[-_ ]?token|token|secret|client[-_ ]?secret|password|passwd|pwd|passphrase|signature|sig|session[-_ ]?id|sessionid|private[-_ ]?key|credentials?|bearer|otp|pin)s?([^a-z0-9]|$)/i

export function isSensitiveName(name: string): boolean {
  if (!name) return false
  return SENSITIVE_NAME.test(name.replace(/([a-z0-9])([A-Z])/g, '$1_$2'))
}

/** True when a value consists only of {{variable}} references (optionally behind a scheme like "Bearer"). */
export function isVariableReference(value: string): boolean {
  if (!value.includes('{{')) return false
  return value.replace(/\{\{[^}]+\}\}/g, '').replace(/^\s*(bearer|basic|token|digest)\s*/i, '').trim() === ''
}

export function redactValue(value: string, marker = REDACTED): string {
  if (!value) return value
  return isVariableReference(value) ? value : marker
}

const redactKv = (list: KeyValue[], marker: string): KeyValue[] => list.map((kv) => (isSensitiveName(kv.key) ? { ...kv, value: redactValue(kv.value, marker) } : kv))

export function redactUrl(raw: string, marker = REDACTED): string {
  let out = raw.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#@]*@/i, '$1')
  const hashIdx = out.indexOf('#')
  const hash = hashIdx >= 0 ? out.slice(hashIdx) : ''
  if (hashIdx >= 0) out = out.slice(0, hashIdx)
  const q = out.indexOf('?')
  if (q < 0) return out + hash
  const query = out
    .slice(q + 1)
    .split('&')
    .map((part) => {
      const eq = part.indexOf('=')
      if (eq < 0) return part
      let name = part.slice(0, eq)
      try {
        name = decodeURIComponent(name)
      } catch {
        /* keep raw */
      }
      return isSensitiveName(name) ? `${part.slice(0, eq)}=${redactValue(part.slice(eq + 1), marker)}` : part
    })
    .join('&')
  return `${out.slice(0, q)}?${query}${hash}`
}

function redactJson(input: unknown, marker: string, depth = 0): unknown {
  if (depth > 40 || input === null || typeof input !== 'object') return input
  if (Array.isArray(input)) return input.map((v) => redactJson(v, marker, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = isSensitiveName(k) && (typeof v === 'string' || typeof v === 'number') ? (typeof v === 'string' ? redactValue(v, marker) : marker) : redactJson(v, marker, depth + 1)
  }
  return out
}

export function redactText(text: string, marker = REDACTED): string {
  const t = text.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.stringify(redactJson(JSON.parse(t), marker), null, 2)
    } catch {
      /* fall through */
    }
  }
  return text
    .replace(/("?[\w.-]*(?:token|secret|password|passwd|api[_-]?key|authorization|signature)[\w.-]*"?\s*[:=]\s*)("[^"]*"|[^\s,&;}]+)/gi, (_m, a: string, b: string) => `${a}${b.startsWith('"') ? `"${marker}"` : marker}`)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${marker}`)
}

function redactAuth(auth: AuthConfig, marker: string): AuthConfig {
  switch (auth.type) {
    case 'bearer':
      return { ...auth, token: redactValue(auth.token, marker) }
    case 'apikey':
      return { ...auth, value: redactValue(auth.value, marker) }
    case 'basic':
      return { ...auth, password: redactValue(auth.password, marker) }
    case 'oauth2':
      return { ...auth, clientSecret: redactValue(auth.clientSecret, marker), password: redactValue(auth.password, marker), accessToken: redactValue(auth.accessToken, marker) }
    default:
      return auth
  }
}

/** Copy of a request with every literal credential replaced (variable references are kept). */
export function redactRequest(def: RequestDef, marker = REDACTED): RequestDef {
  return {
    ...def,
    url: redactUrl(def.url, marker),
    params: redactKv(def.params, marker),
    headers: redactKv(def.headers, marker),
    auth: redactAuth(def.auth, marker),
    body: { ...def.body, json: redactText(def.body.json, marker), raw: redactText(def.body.raw, marker), form: redactKv(def.body.form, marker), urlencoded: redactKv(def.body.urlencoded, marker) },
  }
}

/** Does the request contain literal (non-variable) credentials? */
export function hasLiteralSecrets(def: RequestDef): boolean {
  const a = def.auth
  if (a.type === 'bearer' && a.token && !isVariableReference(a.token)) return true
  if (a.type === 'apikey' && a.value && !isVariableReference(a.value)) return true
  if (a.type === 'basic' && a.password && !isVariableReference(a.password)) return true
  if (a.type === 'oauth2' && ((a.clientSecret && !isVariableReference(a.clientSecret)) || (a.accessToken && !isVariableReference(a.accessToken)) || (a.password && !isVariableReference(a.password)))) return true
  const lists = [def.headers, def.params, def.body.form, def.body.urlencoded]
  if (lists.some((l) => l.some((kv) => kv.enabled && isSensitiveName(kv.key) && kv.value && !isVariableReference(kv.value)))) return true
  return redactUrl(def.url) !== def.url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#@]*@/i, '$1')
}

export function containsRedactionMarker(def: RequestDef): boolean {
  return JSON.stringify(def).includes(REDACTED)
}
