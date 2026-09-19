// ─── Validation with precise positions ───────────────────────────────────────

export interface JsonError {
  message: string
  pos: number
  line: number
  column: number
}

class JsonSyntaxError extends Error {
  constructor(
    message: string,
    public pos: number
  ) {
    super(message)
  }
}

export function lineColumn(text: string, pos: number): { line: number; column: number } {
  let line = 1
  let last = -1
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++
      last = i
    }
  }
  return { line, column: pos - last }
}

/** Validates JSON text. `{{variable}}` references are accepted wherever a value may appear. Returns null when valid. */
export function checkJson(text: string): JsonError | null {
  let i = 0
  const n = text.length
  const fail = (message: string, pos = i): never => {
    throw new JsonSyntaxError(message, pos)
  }
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i)
      if (c === 32 || c === 9 || c === 10 || c === 13) i++
      else break
    }
  }
  const describe = (c: string | undefined) => (c === undefined ? 'end of input' : c === '\n' ? 'a line break' : `'${c}'`)
  const isVarAt = (p: number) => text.startsWith('{{', p) && text.indexOf('}}', p) > 0

  const string = () => {
    const start = i
    i++
    while (i < n) {
      const c = text.charCodeAt(i)
      if (c === 34) {
        i++
        return
      }
      if (c === 92) {
        const e = text[i + 1]
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail('Invalid unicode escape (expected 4 hex digits)', i)
          i += 6
          continue
        }
        if (e === undefined || !'"\\/bfnrt'.includes(e)) fail(`Invalid escape sequence '\\${e ?? ''}'`, i)
        i += 2
        continue
      }
      if (c < 0x20) fail('Unescaped control character in string (use \\n for line breaks)', i)
      i++
    }
    fail('Unterminated string', start)
  }

  const number = () => {
    const m = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y
    m.lastIndex = i
    const r = m.exec(text)
    if (!r) fail('Invalid number', i)
    i += r![0].length
  }

  const value = (depth: number): void => {
    if (depth > 400) fail('Nesting is too deep', i)
    ws()
    if (i >= n) fail('Unexpected end of JSON input', n)
    const c = text[i]
    if (isVarAt(i)) {
      i = text.indexOf('}}', i) + 2
      return
    }
    if (c === '{') {
      i++
      ws()
      if (text[i] === '}') {
        i++
        return
      }
      for (;;) {
        ws()
        if (text[i] !== '"') {
          if (text[i] === "'") fail('Property names must use double quotes', i)
          if (text[i] === '}') fail('Trailing comma is not allowed', i)
          fail(`Expected a property name in double quotes but found ${describe(text[i])}`, i)
        }
        string()
        ws()
        if (text[i] !== ':') fail(`Expected ':' after property name but found ${describe(text[i])}`, i)
        i++
        value(depth + 1)
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === '}') {
          i++
          return
        }
        fail(`Expected ',' or '}' after property value but found ${describe(text[i])}`, i)
      }
    }
    if (c === '[') {
      i++
      ws()
      if (text[i] === ']') {
        i++
        return
      }
      for (;;) {
        ws()
        if (text[i] === ']') fail('Trailing comma is not allowed', i)
        value(depth + 1)
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === ']') {
          i++
          return
        }
        fail(`Expected ',' or ']' after array element but found ${describe(text[i])}`, i)
      }
    }
    if (c === '"') return string()
    if (c === '-' || (c >= '0' && c <= '9')) return number()
    for (const lit of ['true', 'false', 'null']) {
      if (text.startsWith(lit, i)) {
        i += lit.length
        return
      }
    }
    if (c === "'") fail('Strings must use double quotes', i)
    fail(`Unexpected ${describe(c)}`, i)
  }

  try {
    if (text.trim() === '') return null
    value(0)
    ws()
    if (i < n) fail('Unexpected content after the end of the JSON value', i)
    return null
  } catch (e) {
    if (e instanceof JsonSyntaxError) return { message: e.message, pos: e.pos, ...lineColumn(text, e.pos) }
    throw e
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const PLACEHOLDER_BASE = 99_900_000_000

/** Swaps unquoted {{vars}} for unique numeric placeholders so the text parses as strict JSON. */
function protectVariables(text: string): { masked: string; vars: string[] } {
  const vars: string[] = []
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      out += c
      if (c === '\\') out += text[++i] ?? ''
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
      out += c
    } else if (c === '{' && text[i + 1] === '{' && text.indexOf('}}', i) > 0) {
      const end = text.indexOf('}}', i) + 2
      out += String(PLACEHOLDER_BASE + vars.length)
      vars.push(text.slice(i, end))
      i = end - 1
    } else {
      out += c
    }
  }
  return { masked: out, vars }
}

export function formatJsonText(text: string, indent = 2): { ok: true; text: string } | { ok: false; error: JsonError } {
  const err = checkJson(text)
  if (err) return { ok: false, error: err }
  if (text.trim() === '') return { ok: true, text }
  const { masked, vars } = protectVariables(text)
  const pretty = JSON.stringify(JSON.parse(masked), null, indent)
  return { ok: true, text: pretty.replace(/99900\d{6}/g, (m) => vars[Number(m) - PLACEHOLDER_BASE] ?? m) }
}

export function minifyJsonText(text: string): { ok: true; text: string } | { ok: false; error: JsonError } {
  const r = formatJsonText(text, 0)
  return r
}

// ─── Tree model ──────────────────────────────────────────────────────────────

export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export function kindOf(v: unknown): JsonKind {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  const t = typeof v
  return t === 'object' ? 'object' : t === 'string' ? 'string' : t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'null'
}

export type PathSeg = string | number

export interface TreeRow {
  id: string
  path: PathSeg[]
  depth: number
  keyLabel: string | null
  isIndex: boolean
  kind: JsonKind
  text: string
  fullText?: string
  childCount: number
  container: boolean
  expanded: boolean
  closing: boolean
  comma: boolean
}

export interface ExpandState {
  depth: number
  open: ReadonlySet<string>
  closed: ReadonlySet<string>
}

export const DEFAULT_EXPAND: ExpandState = { depth: 2, open: new Set(), closed: new Set() }

const SEP = '\u001f'
export const pathId = (path: PathSeg[]): string => path.join(SEP)

export function isExpanded(id: string, depth: number, s: ExpandState): boolean {
  if (s.closed.has(id)) return false
  if (s.open.has(id)) return true
  return depth < s.depth
}

const MAX_STRING = 500
export const MAX_ROWS = 400_000

export function pathToString(path: PathSeg[]): string {
  return path.reduce<string>((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : /^[A-Za-z_$][\w$]*$/.test(seg) ? `${acc}.${seg}` : `${acc}[${JSON.stringify(seg)}]`), '$')
}

export function getAtPath(root: unknown, path: PathSeg[]): unknown {
  let cur: any = root
  for (const seg of path) cur = cur?.[seg as never]
  return cur
}

/** Flattens the visible part of a JSON document into rows (collapsed subtrees are never visited). */
export function buildRows(root: unknown, state: ExpandState): { rows: TreeRow[]; truncated: boolean } {
  const rows: TreeRow[] = []
  let truncated = false

  const leafText = (v: unknown, kind: JsonKind): { text: string; fullText?: string } => {
    if (kind === 'string') {
      const s = JSON.stringify(v)
      return s.length > MAX_STRING ? { text: `${s.slice(0, MAX_STRING)}…"`, fullText: s } : { text: s }
    }
    return { text: String(v) }
  }

  const walk = (value: unknown, path: PathSeg[], keyLabel: string | null, isIndex: boolean, depth: number, comma: boolean): void => {
    if (rows.length >= MAX_ROWS) {
      truncated = true
      return
    }
    const kind = kindOf(value)
    const id = pathId(path)
    if (kind === 'object' || kind === 'array') {
      const entries = kind === 'array' ? (value as unknown[]) : Object.keys(value as object)
      const count = entries.length
      const open = kind === 'array' ? '[' : '{'
      const close = kind === 'array' ? ']' : '}'
      if (count === 0) {
        rows.push({ id, path, depth, keyLabel, isIndex, kind, text: `${open}${close}`, childCount: 0, container: false, expanded: false, closing: false, comma })
        return
      }
      const expanded = isExpanded(id, depth, state)
      if (!expanded) {
        rows.push({ id, path, depth, keyLabel, isIndex, kind, text: `${open}…${close}`, childCount: count, container: true, expanded: false, closing: false, comma })
        return
      }
      rows.push({ id, path, depth, keyLabel, isIndex, kind, text: open, childCount: count, container: true, expanded: true, closing: false, comma: false })
      if (kind === 'array') {
        const arr = value as unknown[]
        for (let i = 0; i < arr.length; i++) walk(arr[i], [...path, i], String(i), true, depth + 1, i < arr.length - 1)
      } else {
        const keys = entries as string[]
        const obj = value as Record<string, unknown>
        for (let i = 0; i < keys.length; i++) walk(obj[keys[i]], [...path, keys[i]], keys[i], false, depth + 1, i < keys.length - 1)
      }
      rows.push({ id: `${id}${SEP}\u0000close`, path, depth, keyLabel: null, isIndex: false, kind, text: close, childCount: 0, container: false, expanded: true, closing: true, comma })
      return
    }
    const { text, fullText } = leafText(value, kind)
    rows.push({ id, path, depth, keyLabel, isIndex, kind, text, fullText, childCount: 0, container: false, expanded: false, closing: false, comma })
  }

  walk(root, [], null, false, 0, false)
  return { rows, truncated }
}

export interface JsonMatch {
  path: PathSeg[]
  id: string
  where: 'key' | 'value'
}

export const MAX_MATCHES = 5000

/** Finds every key or scalar value containing `query` (case-insensitive), in document order. */
export function searchJson(root: unknown, query: string): { matches: JsonMatch[]; capped: boolean } {
  const q = query.toLowerCase()
  const matches: JsonMatch[] = []
  if (!q) return { matches, capped: false }
  let capped = false

  const walk = (value: unknown, path: PathSeg[], key: string | null): void => {
    if (matches.length >= MAX_MATCHES) {
      capped = true
      return
    }
    const id = pathId(path)
    if (key !== null && key.toLowerCase().includes(q)) matches.push({ path, id, where: 'key' })
    const kind = kindOf(value)
    if (kind === 'object') {
      for (const k of Object.keys(value as object)) walk((value as Record<string, unknown>)[k], [...path, k], k)
    } else if (kind === 'array') {
      ;(value as unknown[]).forEach((v, i) => walk(v, [...path, i], String(i)))
    } else if (String(value).toLowerCase().includes(q)) {
      matches.push({ path, id, where: 'value' })
    }
  }
  walk(root, [], null)
  return { matches, capped }
}

export function ancestorIds(path: PathSeg[]): string[] {
  const ids: string[] = []
  for (let i = 0; i < path.length; i++) ids.push(pathId(path.slice(0, i)))
  return ids
}

export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}
