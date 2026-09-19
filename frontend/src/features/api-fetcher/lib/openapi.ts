import type { AuthConfig, HttpMethod, ImportFolder, ImportResult, RequestDef } from '../types'
import { applyParamsToUrl, newKv, newRequest } from './request'

type Json = Record<string, any>

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

export async function parseSpecText(text: string): Promise<Json> {
  const t = text.trim()
  if (!t) throw new Error('The specification is empty.')
  if (t.startsWith('{')) {
    try {
      return JSON.parse(t)
    } catch (e) {
      throw new Error(`Invalid JSON: ${(e as Error).message}`)
    }
  }
  const { parse } = await import('yaml')
  try {
    const doc = parse(t)
    if (!doc || typeof doc !== 'object') throw new Error('not an object')
    return doc as Json
  } catch (e) {
    throw new Error(`Could not parse the document as JSON or YAML: ${(e as Error).message}`)
  }
}

export function isOpenApiDoc(doc: Json): boolean {
  return typeof doc.openapi === 'string' || typeof doc.swagger === 'string'
}

function resolveRef(spec: Json, node: any, seen = new Set<string>()): any {
  let cur = node
  let guard = 0
  while (cur && typeof cur === 'object' && typeof cur.$ref === 'string' && guard++ < 20) {
    const ref: string = cur.$ref
    if (!ref.startsWith('#/') || seen.has(ref)) return {}
    seen.add(ref)
    cur = ref
      .slice(2)
      .split('/')
      .reduce((o: any, seg: string) => o?.[decodeURIComponent(seg.replace(/~1/g, '/').replace(/~0/g, '~'))], spec)
  }
  return cur ?? {}
}

/** Builds an example value for a schema, resolving local $refs, with cycle and depth guards. */
export function exampleFromSchema(spec: Json, schema: any, depth = 0, trail: string[] = []): unknown {
  if (!schema || typeof schema !== 'object' || depth > 6) return null
  if (typeof schema.$ref === 'string') {
    if (trail.includes(schema.$ref)) return null
    return exampleFromSchema(spec, resolveRef(spec, schema), depth + 1, [...trail, schema.$ref])
  }
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  if (Array.isArray(schema.allOf)) {
    const merged: Record<string, unknown> = {}
    for (const part of schema.allOf) {
      const ex = exampleFromSchema(spec, part, depth + 1, trail)
      if (ex && typeof ex === 'object' && !Array.isArray(ex)) Object.assign(merged, ex)
    }
    return merged
  }
  for (const key of ['oneOf', 'anyOf'] as const) if (Array.isArray(schema[key]) && schema[key].length) return exampleFromSchema(spec, schema[key][0], depth + 1, trail)
  const type = schema.type ?? (schema.properties ? 'object' : schema.items ? 'array' : undefined)
  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries<any>(schema.properties ?? {})) if (!v?.readOnly) out[k] = exampleFromSchema(spec, v, depth + 1, trail)
      return out
    }
    case 'array':
      return [exampleFromSchema(spec, schema.items, depth + 1, trail)]
    case 'string':
      switch (schema.format) {
        case 'date-time':
          return '2024-01-01T00:00:00Z'
        case 'date':
          return '2024-01-01'
        case 'email':
          return 'user@example.com'
        case 'uuid':
          return '3fa85f64-5717-4562-b3fc-2c963f66afa6'
        case 'uri':
        case 'url':
          return 'https://example.com'
        default:
          return 'string'
      }
    case 'integer':
      return schema.minimum ?? 0
    case 'number':
      return schema.minimum ?? 0
    case 'boolean':
      return true
    default:
      return null
  }
}

const scalarExample = (spec: Json, p: any): string => {
  const schema = resolveRef(spec, p.schema ?? p)
  const v = p.example ?? p.default ?? schema.example ?? schema.default ?? (Array.isArray(schema.enum) ? schema.enum[0] : undefined)
  return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function serverBase(spec: Json): string {
  if (Array.isArray(spec.servers) && spec.servers.length) {
    const s = spec.servers[0]
    return String(s.url ?? '').replace(/\{(\w+)\}/g, (_m: string, name: string) => String(s.variables?.[name]?.default ?? name))
  }
  if (spec.swagger) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes.length ? spec.schemes[0] : 'https'
    return spec.host ? `${scheme}://${spec.host}${spec.basePath ?? ''}` : ''
  }
  return ''
}

interface AuthPlan {
  auth: AuthConfig
  vars: Array<{ key: string; secret: boolean }>
}

function planAuth(spec: Json, security: any[] | undefined): AuthPlan | null {
  const reqs = security ?? spec.security
  if (!Array.isArray(reqs) || !reqs.length) return null
  const schemes: Json = spec.components?.securitySchemes ?? spec.securityDefinitions ?? {}
  for (const req of reqs) {
    for (const name of Object.keys(req ?? {})) {
      const sc = resolveRef(spec, schemes[name])
      if (!sc || !sc.type) continue
      if (sc.type === 'http' && /bearer/i.test(sc.scheme ?? '')) return { auth: { type: 'bearer', token: '{{token}}', prefix: 'Bearer' }, vars: [{ key: 'token', secret: true }] }
      if (sc.type === 'http' && /basic/i.test(sc.scheme ?? '')) return { auth: { type: 'basic', username: '{{username}}', password: '{{password}}' }, vars: [{ key: 'username', secret: false }, { key: 'password', secret: true }] }
      if (sc.type === 'basic') return { auth: { type: 'basic', username: '{{username}}', password: '{{password}}' }, vars: [{ key: 'username', secret: false }, { key: 'password', secret: true }] }
      if (sc.type === 'apiKey') return { auth: { type: 'apikey', key: sc.name ?? 'X-API-Key', value: '{{apiKey}}', in: sc.in === 'query' ? 'query' : 'header' }, vars: [{ key: 'apiKey', secret: true }] }
      if (sc.type === 'oauth2' || sc.type === 'openIdConnect')
        return { auth: { type: 'oauth2', grantType: 'manual', accessTokenUrl: '', clientId: '', clientSecret: '', username: '', password: '', scope: '', clientAuth: 'basic', tokenPrefix: 'Bearer', accessToken: '{{accessToken}}', expiresAt: null }, vars: [{ key: 'accessToken', secret: true }] }
    }
  }
  return null
}

export async function importOpenApi(text: string): Promise<ImportResult> {
  const spec = await parseSpecText(text)
  if (!isOpenApiDoc(spec)) throw new Error('This is not an OpenAPI/Swagger document (expected an "openapi" or "swagger" field).')
  const warnings: string[] = []
  const title = String(spec.info?.title ?? 'Imported API').slice(0, 120)
  const baseUrl = serverBase(spec)
  if (!baseUrl) warnings.push('No server URL was found; set the baseUrl variable in the created environment.')

  const envVars = new Map<string, { value: string; secret: boolean }>()
  envVars.set('baseUrl', { value: baseUrl.replace(/\/+$/, ''), secret: false })

  const folders = new Map<string, RequestDef[]>()
  let count = 0
  const paths: Json = spec.paths ?? {}

  for (const [rawPath, pathItemRaw] of Object.entries<any>(paths)) {
    const pathItem = resolveRef(spec, pathItemRaw)
    for (const method of METHODS) {
      const op = pathItem[method]
      if (!op || typeof op !== 'object') continue
      const params: any[] = [...(pathItem.parameters ?? []), ...(op.parameters ?? [])].map((p) => resolveRef(spec, p))
      const req = newRequest({ method: method.toUpperCase() as HttpMethod })
      req.name = String(op.summary ?? op.operationId ?? `${method.toUpperCase()} ${rawPath}`).slice(0, 120)

      const pathWithVars = rawPath.replace(/\{([^}]+)\}/g, (_m, name: string) => {
        const p = params.find((x) => x.in === 'path' && x.name === name)
        if (!envVars.has(name)) envVars.set(name, { value: p ? scalarExample(spec, p) : '', secret: false })
        return `{{${name}}}`
      })

      for (const p of params) {
        if (p.in === 'query') req.params.push({ ...newKv(p.name, scalarExample(spec, p), !!p.required), description: p.description })
        else if (p.in === 'header' && !/^(authorization|content-type|accept)$/i.test(p.name)) req.headers.push({ ...newKv(p.name, scalarExample(spec, p), !!p.required), description: p.description })
      }

      // Request body: OpenAPI 3 requestBody, or Swagger 2 body/formData parameters.
      const rb = op.requestBody ? resolveRef(spec, op.requestBody) : null
      if (rb?.content) {
        const types = Object.keys(rb.content)
        const jsonType = types.find((t) => /json/i.test(t))
        if (jsonType) {
          const media = rb.content[jsonType]
          const example = media.example ?? (media.examples ? Object.values<any>(media.examples)[0]?.value : undefined) ?? exampleFromSchema(spec, media.schema)
          req.body.mode = 'json'
          req.body.json = JSON.stringify(example ?? {}, null, 2)
        } else if (types.some((t) => /x-www-form-urlencoded/i.test(t)) || types.some((t) => /multipart/i.test(t))) {
          const t = types.find((x) => /x-www-form-urlencoded/i.test(x)) ?? types[0]
          const schema = resolveRef(spec, rb.content[t].schema)
          const rows = Object.entries<any>(schema.properties ?? {}).map(([k, v]) => newKv(k, scalarExample(spec, v)))
          if (/multipart/i.test(t)) {
            req.body.mode = 'form-data'
            req.body.form = rows
          } else {
            req.body.mode = 'urlencoded'
            req.body.urlencoded = rows
          }
        } else if (types.length) {
          req.body.mode = 'raw'
          req.body.rawContentType = types[0]
          const media = rb.content[types[0]]
          req.body.raw = typeof media.example === 'string' ? media.example : ''
        }
      } else if (spec.swagger) {
        const bodyParam = params.find((p) => p.in === 'body')
        const formParams = params.filter((p) => p.in === 'formData')
        if (bodyParam) {
          req.body.mode = 'json'
          req.body.json = JSON.stringify(exampleFromSchema(spec, bodyParam.schema) ?? {}, null, 2)
        } else if (formParams.length) {
          const multipart = (op.consumes ?? spec.consumes ?? []).some((c: string) => /multipart/i.test(c))
          const rows = formParams.map((p) => newKv(p.name, scalarExample(spec, p)))
          if (multipart) {
            req.body.mode = 'form-data'
            req.body.form = rows
          } else {
            req.body.mode = 'urlencoded'
            req.body.urlencoded = rows
          }
        }
      }

      const plan = planAuth(spec, op.security)
      if (plan) {
        req.auth = plan.auth
        for (const v of plan.vars) if (!envVars.has(v.key)) envVars.set(v.key, { value: '', secret: v.secret })
      }

      req.url = applyParamsToUrl(`{{baseUrl}}${pathWithVars}`, req.params)
      const tag = String(op.tags?.[0] ?? 'default')
      const list = folders.get(tag) ?? []
      list.push(req)
      folders.set(tag, list)
      count++
    }
  }

  if (count === 0) throw new Error('No operations were found under "paths" in this specification.')
  const root: ImportFolder = {
    name: title,
    requests: [],
    folders: [...folders].map(([name, requests]) => ({ name, requests, folders: [] })),
  }
  return {
    folder: root,
    environment: { name: title, variables: [...envVars].map(([key, v]) => ({ key, value: v.value, secret: v.secret })) },
    summary: `${count} operation${count === 1 ? '' : 's'} in ${folders.size} folder${folders.size === 1 ? '' : 's'} from "${title}" (OpenAPI ${spec.openapi ?? spec.swagger})`,
    warnings,
  }
}
