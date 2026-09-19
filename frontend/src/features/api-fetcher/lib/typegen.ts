// Infers a structural shape from JSON samples (merging every array element) and renders it as
// TypeScript interfaces / type aliases, Python dataclasses, or a JSON Schema document.

export type Shape =
  | { t: 'null' }
  | { t: 'boolean' }
  | { t: 'number'; int: boolean }
  | { t: 'string'; format?: string }
  | { t: 'array'; item: Shape | null }
  | { t: 'object'; fields: Map<string, { shape: Shape; optional: boolean }> }
  | { t: 'union'; options: Shape[] }

const MAX_ARRAY_SAMPLE = 500
const MAX_DEPTH = 30

function stringFormat(s: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return 'date-time'
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return 'uuid'
  if (/^https?:\/\/[^\s]+$/i.test(s)) return 'uri'
  return undefined
}

export function inferShape(value: unknown, depth = 0): Shape {
  if (value === null || value === undefined) return { t: 'null' }
  if (typeof value === 'boolean') return { t: 'boolean' }
  if (typeof value === 'number') return { t: 'number', int: Number.isInteger(value) }
  if (typeof value === 'string') return { t: 'string', format: stringFormat(value) }
  if (depth > MAX_DEPTH) return { t: 'union', options: [] }
  if (Array.isArray(value)) {
    let item: Shape | null = null
    for (const el of value.slice(0, MAX_ARRAY_SAMPLE)) item = item ? mergeShapes(item, inferShape(el, depth + 1)) : inferShape(el, depth + 1)
    return { t: 'array', item }
  }
  const fields = new Map<string, { shape: Shape; optional: boolean }>()
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) fields.set(k, { shape: inferShape(v, depth + 1), optional: false })
  return { t: 'object', fields }
}

function optionsOf(s: Shape): Shape[] {
  return s.t === 'union' ? s.options : [s]
}

export function mergeShapes(a: Shape, b: Shape): Shape {
  if (a.t === 'union' || b.t === 'union') {
    let result: Shape[] = []
    for (const opt of [...optionsOf(a), ...optionsOf(b)]) {
      const i = result.findIndex((r) => r.t === opt.t)
      if (i >= 0) result[i] = mergeShapes(result[i], opt)
      else result = [...result, opt]
    }
    return result.length === 1 ? result[0] : { t: 'union', options: result }
  }
  if (a.t !== b.t) return { t: 'union', options: [a, b] }
  switch (a.t) {
    case 'number':
      return { t: 'number', int: a.int && (b as typeof a).int }
    case 'string': {
      const bf = (b as typeof a).format
      return { t: 'string', format: a.format === bf ? a.format : undefined }
    }
    case 'array': {
      const bi = (b as typeof a).item
      return { t: 'array', item: a.item && bi ? mergeShapes(a.item, bi) : (a.item ?? bi) }
    }
    case 'object': {
      const bf = (b as typeof a).fields
      const fields = new Map<string, { shape: Shape; optional: boolean }>()
      for (const [k, f] of a.fields) {
        const other = bf.get(k)
        fields.set(k, other ? { shape: mergeShapes(f.shape, other.shape), optional: f.optional || other.optional } : { shape: f.shape, optional: true })
      }
      for (const [k, f] of bf) if (!a.fields.has(k)) fields.set(k, { shape: f.shape, optional: true })
      return { t: 'object', fields }
    }
    default:
      return a
  }
}

// ─── Naming ──────────────────────────────────────────────────────────────────

function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

export function pascalCase(text: string): string {
  const w = words(text).map((x) => x[0].toUpperCase() + x.slice(1))
  const name = w.join('')
  if (!name) return 'Item'
  return /^\d/.test(name) ? `T${name}` : name
}

export function snakeCase(text: string): string {
  const name = words(text).map((x) => x.toLowerCase()).join('_')
  return !name ? 'field' : /^\d/.test(name) ? `f_${name}` : name
}

export function singularize(word: string): string {
  if (/ies$/i.test(word) && word.length > 3) return word.replace(/ies$/i, 'y')
  if (/(ss|us|is)$/i.test(word)) return word
  if (/(xes|ches|shes|sses)$/i.test(word)) return word.replace(/es$/i, '')
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1)
  return word
}

const PY_KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'])

function signature(s: Shape): string {
  switch (s.t) {
    case 'object':
      return `{${[...s.fields].map(([k, f]) => `${k}${f.optional ? '?' : ''}:${signature(f.shape)}`).sort().join(',')}}`
    case 'array':
      return `[${s.item ? signature(s.item) : ''}]`
    case 'union':
      return `(${s.options.map(signature).sort().join('|')})`
    case 'number':
      return s.int ? 'int' : 'number'
    default:
      return s.t
  }
}

interface NamedObject {
  name: string
  shape: Extract<Shape, { t: 'object' }>
}

/** Collects every object shape into a list of uniquely named types (structurally identical shapes are reused). */
function collectObjects(root: Shape, rootName: string): { objects: NamedObject[]; nameOf: Map<Shape, string> } {
  const objects: NamedObject[] = []
  const bySig = new Map<string, string>()
  const used = new Set<string>()
  const nameOf = new Map<Shape, string>()

  const unique = (base: string) => {
    let name = base
    let n = 2
    while (used.has(name)) name = `${base}${n++}`
    used.add(name)
    return name
  }

  const visit = (s: Shape, hint: string): void => {
    if (s.t === 'object') {
      const sig = signature(s)
      let name = bySig.get(sig)
      if (!name) {
        name = unique(hint)
        bySig.set(sig, name)
        objects.push({ name, shape: s })
        for (const [k, f] of s.fields) visit(f.shape, f.shape.t === 'array' ? pascalCase(singularize(k)) : pascalCase(k))
      }
      nameOf.set(s, name)
    } else if (s.t === 'array' && s.item) visit(s.item, hint)
    else if (s.t === 'union') s.options.forEach((o) => visit(o, hint))
  }
  visit(root, root.t === 'array' ? `${rootName}Item` : rootName)
  return { objects, nameOf }
}

// ─── TypeScript ──────────────────────────────────────────────────────────────

const TS_IDENT = /^[A-Za-z_$][\w$]*$/

export type TsStyle = 'interface' | 'type'

export function toTypeScript(root: Shape, rootName = 'Root', style: TsStyle = 'interface'): string {
  const { objects, nameOf } = collectObjects(root, pascalCase(rootName))

  const render = (s: Shape): string => {
    switch (s.t) {
      case 'null':
        return 'null'
      case 'boolean':
        return 'boolean'
      case 'number':
        return 'number'
      case 'string':
        return 'string'
      case 'object':
        return nameOf.get(s) ?? 'Record<string, unknown>'
      case 'array': {
        if (!s.item) return 'unknown[]'
        const inner = render(s.item)
        return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`
      }
      case 'union':
        return s.options.length ? [...new Set([...s.options].sort((x, y) => Number(x.t === 'null') - Number(y.t === 'null')).map(render))].join(' | ') : 'unknown'
    }
  }

  const blocks: string[] = []
  for (const { name, shape } of objects) {
    const lines = [...shape.fields].map(([k, f]) => `  ${TS_IDENT.test(k) ? k : JSON.stringify(k)}${f.optional ? '?' : ''}: ${render(f.shape)};`)
    if (style === 'interface') blocks.push(`export interface ${name} {\n${lines.join('\n')}\n}`)
    else blocks.push(`export type ${name} = {\n${lines.join('\n')}\n};`)
  }
  const rootIsNamedObject = root.t === 'object'
  if (!rootIsNamedObject) blocks.unshift(`export type ${pascalCase(rootName)} = ${render(root)};`)
  return blocks.join('\n\n')
}

// ─── Python dataclasses ──────────────────────────────────────────────────────

export function toPythonDataclasses(root: Shape, rootName = 'Root'): string {
  const { objects, nameOf } = collectObjects(root, pascalCase(rootName))
  const usesOptional = { v: false }
  const usesAny = { v: false }
  const usesList = { v: false }
  const usesUnion = { v: false }

  const render = (s: Shape): string => {
    switch (s.t) {
      case 'null':
        return 'None'
      case 'boolean':
        return 'bool'
      case 'number':
        return s.int ? 'int' : 'float'
      case 'string':
        return 'str'
      case 'object':
        return nameOf.get(s) ?? 'dict'
      case 'array':
        usesList.v = true
        if (!s.item) {
          usesAny.v = true
          return 'List[Any]'
        }
        return `List[${render(s.item)}]`
      case 'union': {
        const nonNull = s.options.filter((o) => o.t !== 'null')
        const nullable = nonNull.length !== s.options.length
        if (nonNull.length === 0) {
          usesAny.v = true
          return 'Any'
        }
        const parts = [...new Set(nonNull.map(render))]
        if (parts.length === 1) {
          if (nullable) usesOptional.v = true
          return nullable ? `Optional[${parts[0]}]` : parts[0]
        }
        usesUnion.v = true
        if (nullable) usesOptional.v = true
        const u = `Union[${parts.join(', ')}]`
        return nullable ? `Optional[${u}]` : u
      }
    }
  }

  // Expression converting raw JSON into the field's Python type.
  const convert = (s: Shape, expr: string): string => {
    if (s.t === 'object') return `${nameOf.get(s)}.from_dict(${expr})`
    if (s.t === 'array' && s.item) {
      const inner = convert(s.item, 'x')
      return inner === 'x' ? expr : `[${inner} for x in ${expr}]`
    }
    if (s.t === 'union') {
      const nonNull = s.options.filter((o) => o.t !== 'null')
      if (nonNull.length === 1 && nonNull[0].t !== 'union') {
        const inner = convert(nonNull[0], expr)
        return inner === expr ? expr : `(${inner} if ${expr} is not None else None)`
      }
    }
    return expr
  }

  const classes = objects.map(({ name, shape }) => {
    const entries = [...shape.fields].map(([k, f]) => {
      let attr = snakeCase(k)
      if (PY_KEYWORDS.has(attr)) attr += '_'
      const optional = f.optional
      let type = render(f.shape)
      if (optional && !type.startsWith('Optional[') && type !== 'None') {
        usesOptional.v = true
        type = `Optional[${type}]`
      }
      return { key: k, attr, type, optional, shape: f.shape }
    })
    const required = entries.filter((e) => !e.optional)
    const optional = entries.filter((e) => e.optional)
    const fields = [...required.map((e) => `    ${e.attr}: ${e.type}`), ...optional.map((e) => `    ${e.attr}: ${e.type} = None`)]
    const args = entries.map((e) => {
      const source = e.optional ? `data.get(${JSON.stringify(e.key)})` : `data[${JSON.stringify(e.key)}]`
      let guarded = convert(e.shape, source)
      if (e.optional && guarded !== source) guarded = `(${guarded} if ${source} is not None else None)`
      return `            ${e.attr}=${guarded},`
    })
    const renamed = entries.filter((e) => e.attr !== e.key)
    const note = renamed.length ? `    # JSON keys: ${renamed.map((e) => `${e.attr} <- "${e.key}"`).join(', ')}\n` : ''
    return `@dataclass\nclass ${name}:\n${fields.length ? fields.join('\n') : '    pass'}\n${note}\n    @classmethod\n    def from_dict(cls, data: dict) -> "${name}":\n        return cls(\n${args.join('\n')}\n        )`
  })

  const typing = [usesAny.v && 'Any', usesList.v && 'List', usesOptional.v && 'Optional', usesUnion.v && 'Union'].filter(Boolean)
  const header = ['from dataclasses import dataclass', typing.length ? `from typing import ${typing.join(', ')}` : ''].filter(Boolean).join('\n')
  // Dependencies (nested types) must be defined before the classes that use them.
  const ordered = [...classes].reverse()
  let body = ordered.join('\n\n\n')
  if (root.t !== 'object') body += `\n\n\n# Root value is ${render(root)}`
  return `${header}\n\n\n${body}`
}

// ─── JSON Schema ─────────────────────────────────────────────────────────────

export function toJsonSchema(root: Shape, title = 'Root'): string {
  const schema = (s: Shape): Record<string, unknown> => {
    switch (s.t) {
      case 'null':
        return { type: 'null' }
      case 'boolean':
        return { type: 'boolean' }
      case 'number':
        return { type: s.int ? 'integer' : 'number' }
      case 'string':
        return s.format ? { type: 'string', format: s.format } : { type: 'string' }
      case 'array':
        return s.item ? { type: 'array', items: schema(s.item) } : { type: 'array' }
      case 'object': {
        const properties: Record<string, unknown> = {}
        const required: string[] = []
        for (const [k, f] of s.fields) {
          properties[k] = schema(f.shape)
          if (!f.optional) required.push(k)
        }
        return { type: 'object', properties, ...(required.length ? { required } : {}) }
      }
      case 'union': {
        if (!s.options.length) return {}
        const nonNull = s.options.filter((o) => o.t !== 'null')
        const hasNull = nonNull.length !== s.options.length
        const parts = nonNull.map(schema)
        if (parts.length === 1) {
          const only = parts[0]
          return hasNull && typeof only.type === 'string' ? { ...only, type: [only.type, 'null'] } : hasNull ? { anyOf: [only, { type: 'null' }] } : only
        }
        return { anyOf: hasNull ? [...parts, { type: 'null' }] : parts }
      }
    }
  }
  return JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', title, ...schema(root) }, null, 2)
}

export type TypeTarget = 'ts-interface' | 'ts-type' | 'python' | 'json-schema'

export const TYPE_TARGETS: Array<{ id: TypeTarget; label: string; ext: string; hl: 'typescript' | 'python' | 'json' }> = [
  { id: 'ts-interface', label: 'TypeScript interfaces', ext: 'ts', hl: 'typescript' },
  { id: 'ts-type', label: 'TypeScript types', ext: 'ts', hl: 'typescript' },
  { id: 'python', label: 'Python dataclasses', ext: 'py', hl: 'python' },
  { id: 'json-schema', label: 'JSON Schema', ext: 'json', hl: 'json' },
]

export function generateTypes(value: unknown, target: TypeTarget, rootName: string): string {
  const shape = inferShape(value)
  const name = pascalCase(rootName || 'Root')
  switch (target) {
    case 'ts-interface':
      return toTypeScript(shape, name, 'interface')
    case 'ts-type':
      return toTypeScript(shape, name, 'type')
    case 'python':
      return toPythonDataclasses(shape, name)
    case 'json-schema':
      return toJsonSchema(shape, name)
  }
}
