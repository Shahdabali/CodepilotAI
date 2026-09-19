import { randomUUID, randomInt } from 'node:crypto'
import type { RequestDef } from './schemas.js'

const VAR_PATTERN = /\{\{\s*([\w.$-]+)\s*\}\}/g

function dynamicValue(name: string): string | undefined {
  switch (name) {
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000))
    case '$isoTimestamp':
      return new Date().toISOString()
    case '$guid':
    case '$uuid':
      return randomUUID()
    case '$randomInt':
      return String(randomInt(0, 1000))
    default:
      return undefined
  }
}

export interface Interpolator {
  apply(text: string): string
  readonly missing: Set<string>
}

export function createInterpolator(vars: Record<string, string>): Interpolator {
  const missing = new Set<string>()
  const apply = (text: string): string => {
    if (!text || !text.includes('{{')) return text
    let current = text
    for (let pass = 0; pass < 5; pass++) {
      let changed = false
      current = current.replace(VAR_PATTERN, (match, name: string) => {
        const dyn = dynamicValue(name)
        if (dyn !== undefined) return dyn
        if (Object.prototype.hasOwnProperty.call(vars, name)) {
          changed = true
          return vars[name]
        }
        missing.add(name)
        return match
      })
      if (!changed || !current.includes('{{')) break
    }
    return current
  }
  return { apply, missing }
}

export function interpolateRequest(def: RequestDef, vars: Record<string, string>): { request: RequestDef; missing: string[] } {
  const it = createInterpolator(vars)
  const a = it.apply
  const kv = <T extends { key: string; value: string; enabled: boolean }>(list: T[]): T[] =>
    list.map((x) => (x.enabled ? { ...x, key: a(x.key), value: a(x.value) } : x))
  const mode = def.body.mode

  let auth = def.auth
  switch (auth.type) {
    case 'bearer':
      auth = { ...auth, token: a(auth.token), prefix: a(auth.prefix) }
      break
    case 'apikey':
      auth = { ...auth, key: a(auth.key), value: a(auth.value) }
      break
    case 'basic':
      auth = { ...auth, username: a(auth.username), password: a(auth.password) }
      break
    case 'oauth2':
      auth = {
        ...auth,
        accessTokenUrl: a(auth.accessTokenUrl),
        clientId: a(auth.clientId),
        clientSecret: a(auth.clientSecret),
        username: a(auth.username),
        password: a(auth.password),
        scope: a(auth.scope),
        accessToken: a(auth.accessToken),
        tokenPrefix: a(auth.tokenPrefix),
      }
      break
  }

  const request: RequestDef = {
    ...def,
    url: a(def.url),
    params: kv(def.params),
    headers: kv(def.headers),
    auth,
    body: {
      ...def.body,
      json: mode === 'json' ? a(def.body.json) : def.body.json,
      raw: mode === 'raw' ? a(def.body.raw) : def.body.raw,
      rawContentType: mode === 'raw' ? a(def.body.rawContentType) : def.body.rawContentType,
      form: mode === 'form-data' ? kv(def.body.form) : def.body.form,
      urlencoded: mode === 'urlencoded' ? kv(def.body.urlencoded) : def.body.urlencoded,
    },
  }
  return { request, missing: [...it.missing] }
}
