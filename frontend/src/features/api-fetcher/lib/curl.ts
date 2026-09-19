import type { HttpMethod, RequestDef } from '../types'
import { HTTP_METHODS } from '../types'
import { newKv, newRequest, syncParamsFromUrl, splitUrl } from './request'

export type CurlParseResult = { ok: true; request: RequestDef; warnings: string[] } | { ok: false; error: string }

// ─── Tokenizer ───────────────────────────────────────────────────────────────

function unescapeAnsiC(s: string): string {
  return s.replace(/\\(n|t|r|\\|'|"|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/g, (_m, c: string) => {
    if (c === 'n') return '\n'
    if (c === 't') return '\t'
    if (c === 'r') return '\r'
    if (c.startsWith('x') || c.startsWith('u')) return String.fromCharCode(parseInt(c.slice(1), 16))
    return c
  })
}

export function tokenizeShell(input: string): string[] {
  let text = input.trim()
  // Windows cmd "Copy as cURL": ^ is the escape character.
  if (/\^"/.test(text) && !text.includes("'")) text = text.replace(/\^\r?\n/g, ' ').replace(/\^(.)/g, '$1')
  text = text.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ')

  const tokens: string[] = []
  let cur = ''
  let has = false
  let i = 0
  const push = () => {
    if (has) tokens.push(cur)
    cur = ''
    has = false
  }
  while (i < text.length) {
    const c = text[i]
    if (/\s/.test(c)) {
      push()
      i++
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1)
      const stop = end < 0 ? text.length : end
      cur += text.slice(i + 1, stop)
      has = true
      i = stop + 1
    } else if (c === '$' && text[i + 1] === "'") {
      let j = i + 2
      while (j < text.length && !(text[j] === "'" && text[j - 1] !== '\\')) j++
      cur += unescapeAnsiC(text.slice(i + 2, j))
      has = true
      i = j + 1
    } else if (c === '"') {
      let j = i + 1
      let chunk = ''
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < text.length && '"\\$`'.includes(text[j + 1])) {
          chunk += text[j + 1]
          j += 2
        } else {
          chunk += text[j++]
        }
      }
      cur += chunk
      has = true
      i = j + 1
    } else if (c === '\\' && i + 1 < text.length) {
      cur += text[i + 1]
      has = true
      i += 2
    } else {
      cur += c
      has = true
      i++
    }
  }
  push()
  return tokens
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const ARG_SHORT = new Set(['X', 'H', 'd', 'u', 'A', 'e', 'b', 'F', 'o', 'm', 'x', 'w', 'T', 'E', 'c', 'K', 'r', 'y', 'Y', 'z', 'C', 'D'])
const ARG_LONG = new Set([
  'request', 'header', 'data', 'data-raw', 'data-binary', 'data-ascii', 'data-urlencode', 'user', 'user-agent', 'referer', 'cookie', 'form', 'form-string', 'output', 'max-time',
  'connect-timeout', 'proxy', 'cacert', 'cert', 'key', 'write-out', 'retry', 'retry-delay', 'url', 'json', 'oauth2-bearer', 'limit-rate', 'upload-file', 'resolve', 'cookie-jar', 'config', 'range', 'time-cond', 'proxy-user', 'dump-header', 'interface', 'local-port', 'max-redirs', 'aws-sigv4', 'compressed-ssh', 'http2-prior-knowledge', 'connect-to',
])
const LONG_ALIAS: Record<string, string> = { X: 'request', H: 'header', d: 'data', u: 'user', A: 'user-agent', e: 'referer', b: 'cookie', F: 'form' }
const IGNORED_WITH_NOTE = new Set(['upload-file', 'T', 'cert', 'key', 'proxy', 'x', 'config', 'K'])

export function parseCurl(input: string): CurlParseResult {
  const tokens = tokenizeShell(input)
  if (!tokens.length) return { ok: false, error: 'Nothing to import: paste a cURL command.' }
  let idx = 0
  if (/^(sudo)$/i.test(tokens[0])) idx++
  if (!/^curl(\.exe)?$/i.test(tokens[idx] ?? '')) return { ok: false, error: 'This does not look like a cURL command (it should start with "curl").' }
  idx++

  let method: string | null = null
  let url = ''
  const headers: Array<[string, string]> = []
  const dataParts: string[] = []
  const urlencoded: Array<[string, string]> = []
  const form: Array<[string, string]> = []
  let user: string | null = null
  let bearer: string | null = null
  let useGet = false
  let head = false
  let jsonFlag = false
  const warnings: string[] = []

  const takeArg = (name: string, inline: string | undefined): string => {
    if (inline !== undefined) return inline
    const v = tokens[idx++]
    if (v === undefined) throw new Error(`Option ${name} expects a value`)
    return v
  }

  const handle = (name: string, value: string | undefined, isShort: boolean): void => {
    const key = isShort ? (LONG_ALIAS[name] ?? name) : name
    switch (key) {
      case 'request':
        method = (value ?? '').toUpperCase()
        break
      case 'url':
        url = value ?? ''
        break
      case 'header': {
        const h = value ?? ''
        const c = h.indexOf(':')
        if (c > 0) headers.push([h.slice(0, c).trim(), h.slice(c + 1).trim()])
        break
      }
      case 'data':
      case 'data-raw':
      case 'data-binary':
      case 'data-ascii':
        if ((value ?? '').startsWith('@') && key !== 'data-raw') warnings.push(`Reading the body from a file (${value}) is not supported; add the body manually.`)
        else dataParts.push(value ?? '')
        break
      case 'json':
        jsonFlag = true
        dataParts.push(value ?? '')
        break
      case 'data-urlencode': {
        const v = value ?? ''
        const eq = v.indexOf('=')
        urlencoded.push(eq >= 0 ? [v.slice(0, eq), v.slice(eq + 1)] : ['', v])
        break
      }
      case 'form':
      case 'form-string': {
        const v = value ?? ''
        const eq = v.indexOf('=')
        const val = eq >= 0 ? v.slice(eq + 1) : ''
        if (val.startsWith('@')) warnings.push(`File upload for form field "${v.slice(0, eq)}" is not supported; the field was added empty.`)
        form.push([eq >= 0 ? v.slice(0, eq) : v, val.startsWith('@') ? '' : val])
        break
      }
      case 'user':
        user = value ?? ''
        break
      case 'oauth2-bearer':
        bearer = value ?? ''
        break
      case 'user-agent':
        headers.push(['User-Agent', value ?? ''])
        break
      case 'referer':
        headers.push(['Referer', value ?? ''])
        break
      case 'cookie':
        headers.push(['Cookie', value ?? ''])
        break
      case 'G':
      case 'get':
        useGet = true
        break
      case 'I':
      case 'head':
        head = true
        break
      case 'k':
      case 'insecure':
        warnings.push('--insecure was ignored; disable TLS verification per request in the request settings if needed.')
        break
      default:
        if (IGNORED_WITH_NOTE.has(key)) warnings.push(`Option ${isShort ? '-' : '--'}${name} is not supported and was ignored.`)
    }
  }

  try {
    while (idx < tokens.length) {
      const tok = tokens[idx++]
      if (tok.startsWith('--')) {
        const eq = tok.indexOf('=')
        const name = eq > 0 ? tok.slice(2, eq) : tok.slice(2)
        const inline = eq > 0 ? tok.slice(eq + 1) : undefined
        handle(name, ARG_LONG.has(name) ? takeArg(`--${name}`, inline) : undefined, false)
      } else if (tok.startsWith('-') && tok.length > 1) {
        for (let c = 1; c < tok.length; c++) {
          const ch = tok[c]
          if (ARG_SHORT.has(ch)) {
            const rest = tok.slice(c + 1)
            handle(ch, takeArg(`-${ch}`, rest || undefined), true)
            break
          }
          handle(ch, undefined, true)
        }
      } else if (!url) {
        url = tok
      } else {
        warnings.push(`Extra argument "${tok}" was ignored.`)
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  if (!url) return { ok: false, error: 'No URL found in the cURL command.' }

  const def = newRequest()
  let finalMethod: string = method ?? (head ? 'HEAD' : useGet ? 'GET' : dataParts.length || urlencoded.length || form.length ? 'POST' : 'GET')
  if (!(HTTP_METHODS as readonly string[]).includes(finalMethod)) {
    warnings.push(`Method ${finalMethod} is not supported; using GET.`)
    finalMethod = 'GET'
  }
  def.method = finalMethod as HttpMethod

  // Pull credentials out of the Authorization header into the Authorization tab.
  const rest: Array<[string, string]> = []
  for (const [k, v] of headers) {
    if (k.toLowerCase() === 'authorization') {
      const bm = v.match(/^Bearer\s+(.+)$/i)
      const basic = v.match(/^Basic\s+(.+)$/i)
      if (bm && !bearer) {
        bearer = bm[1]
        continue
      }
      if (basic && !user) {
        try {
          user = atob(basic[1])
          continue
        } catch {
          /* keep as a header */
        }
      }
    }
    rest.push([k, v])
  }
  if (bearer) def.auth = { type: 'bearer', token: bearer, prefix: 'Bearer' }
  else if (user !== null) {
    const c = (user as string).indexOf(':')
    def.auth = { type: 'basic', username: c >= 0 ? (user as string).slice(0, c) : (user as string), password: c >= 0 ? (user as string).slice(c + 1) : '' }
  }

  const ctype = rest.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
  if (jsonFlag) {
    if (!ctype) rest.push(['Content-Type', 'application/json'])
    if (!rest.some(([k]) => k.toLowerCase() === 'accept')) rest.push(['Accept', 'application/json'])
  }
  def.headers = rest.map(([k, v]) => newKv(k, v))

  const dataText = dataParts.join('&')
  if (useGet && (dataText || urlencoded.length)) {
    const extra = [dataText, ...urlencoded.map(([k, v]) => `${k ? `${k}=` : ''}${encodeURIComponent(v)}`)].filter(Boolean).join('&')
    url += (url.includes('?') ? '&' : '?') + extra
  } else if (form.length) {
    def.body.mode = 'form-data'
    def.body.form = form.map(([k, v]) => newKv(k, v))
  } else if (urlencoded.length || (dataText && /x-www-form-urlencoded/i.test(ctype))) {
    def.body.mode = 'urlencoded'
    const fields: Array<[string, string]> = []
    if (dataText && /x-www-form-urlencoded/i.test(ctype)) {
      for (const pair of dataText.split('&')) {
        const eq = pair.indexOf('=')
        try {
          fields.push(eq >= 0 ? [decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' ')), decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '))] : [pair, ''])
        } catch {
          fields.push(eq >= 0 ? [pair.slice(0, eq), pair.slice(eq + 1)] : [pair, ''])
        }
      }
    }
    fields.push(...urlencoded)
    def.body.urlencoded = fields.map(([k, v]) => newKv(k, v))
  } else if (dataText) {
    let looksJson = /json/i.test(ctype)
    if (!looksJson) {
      try {
        JSON.parse(dataText)
        looksJson = dataText.trim().startsWith('{') || dataText.trim().startsWith('[')
      } catch {
        /* not JSON */
      }
    }
    if (looksJson) {
      def.body.mode = 'json'
      try {
        def.body.json = JSON.stringify(JSON.parse(dataText), null, 2)
      } catch {
        def.body.json = dataText
      }
      // Content-Type is implied by JSON mode when it is application/json.
      if (/^application\/json\s*(;.*)?$/i.test(ctype)) def.headers = def.headers.filter((h) => h.key.toLowerCase() !== 'content-type')
    } else {
      def.body.mode = 'raw'
      def.body.raw = dataText
      def.body.rawContentType = ctype.split(';')[0].trim() || 'text/plain'
      def.headers = def.headers.filter((h) => h.key.toLowerCase() !== 'content-type')
    }
  }

  def.url = url
  def.params = syncParamsFromUrl(url, [])
  def.name = suggestName(def)
  return { ok: true, request: def, warnings }
}

function suggestName(def: RequestDef): string {
  const { base } = splitUrl(def.url)
  const path = base.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '') || '/'
  return `${def.method} ${path}`.slice(0, 80)
}
