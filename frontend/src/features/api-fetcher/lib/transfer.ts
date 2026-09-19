import type { AuthConfig, Collection, HttpMethod, ImportFolder, ImportResult, RequestDef, SavedRequest } from '../types'
import { HTTP_METHODS } from '../types'
import { normalizeRequest, newRequest, newKv, syncParamsFromUrl } from './request'
import { redactRequest } from './redact'

export const EXPORT_FORMAT = 'codepilot-api-fetcher'

/** Serialises a request for export, dropping client-only ids. Literal credentials are removed unless includeSecrets is set. */
function cleanRequest(def: RequestDef, includeSecrets: boolean): RequestDef {
  const src = includeSecrets ? def : redactRequest(def)
  const strip = (l: RequestDef['params']) => l.map(({ key, value, enabled, description }) => ({ key, value, enabled, ...(description ? { description } : {}) }))
  return {
    name: src.name,
    method: src.method,
    url: src.url,
    params: strip(src.params) as RequestDef['params'],
    headers: strip(src.headers) as RequestDef['headers'],
    body: { ...src.body, form: strip(src.body.form) as RequestDef['params'], urlencoded: strip(src.body.urlencoded) as RequestDef['params'] },
    auth: src.auth,
  }
}

export function exportRequestJson(def: RequestDef, includeSecrets: boolean): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, type: 'request', exportedAt: new Date().toISOString(), secretsIncluded: includeSecrets, request: cleanRequest(def, includeSecrets) }, null, 2)
}

export function buildFolderTree(rootId: string, collections: Collection[], requests: SavedRequest[], includeSecrets: boolean): ImportFolder {
  const node = collections.find((c) => c.id === rootId)
  return {
    name: node?.name ?? 'Collection',
    requests: requests.filter((r) => r.collectionId === rootId).map((r) => cleanRequest({ ...r.data, name: r.name }, includeSecrets)),
    folders: collections.filter((c) => c.parentId === rootId).map((c) => buildFolderTree(c.id, collections, requests, includeSecrets)),
  }
}

export function exportCollectionJson(rootId: string, collections: Collection[], requests: SavedRequest[], includeSecrets: boolean): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, type: 'collection', exportedAt: new Date().toISOString(), secretsIncluded: includeSecrets, collection: buildFolderTree(rootId, collections, requests, includeSecrets) }, null, 2)
}

export function exportWorkspaceJson(collections: Collection[], requests: SavedRequest[], includeSecrets: boolean): string {
  const roots = collections.filter((c) => c.parentId === null)
  const folder: ImportFolder = {
    name: 'API Fetcher workspace',
    requests: requests.filter((r) => r.collectionId === null).map((r) => cleanRequest({ ...r.data, name: r.name }, includeSecrets)),
    folders: roots.map((c) => buildFolderTree(c.id, collections, requests, includeSecrets)),
  }
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, type: 'collection', exportedAt: new Date().toISOString(), secretsIncluded: includeSecrets, collection: folder }, null, 2)
}

// ─── Import ──────────────────────────────────────────────────────────────────

function looksLikeRequest(o: any): boolean {
  return !!o && typeof o === 'object' && typeof o.url === 'string' && (o.method === undefined || (HTTP_METHODS as readonly string[]).includes(String(o.method).toUpperCase()))
}

function toRequest(o: any): RequestDef {
  const req = normalizeRequest({ ...o, method: String(o.method ?? 'GET').toUpperCase() })
  delete req.id
  if (!req.params.length && req.url.includes('?')) req.params = syncParamsFromUrl(req.url, [])
  return req
}

function folderFromJson(o: any): ImportFolder {
  return {
    name: String(o?.name ?? 'Imported'),
    requests: Array.isArray(o?.requests) ? o.requests.filter(looksLikeRequest).map(toRequest) : [],
    folders: Array.isArray(o?.folders) ? o.folders.map(folderFromJson) : [],
  }
}

const countRequests = (f: ImportFolder): number => f.requests.length + f.folders.reduce((n, x) => n + countRequests(x), 0)

// Postman Collection v2.1 (subset: requests, folders, raw/urlencoded/formdata bodies, bearer/basic/apikey auth, variables)
function postmanAuth(a: any): AuthConfig | null {
  if (!a || typeof a !== 'object') return null
  const pick = (arr: any, key: string): string => (Array.isArray(arr) ? String(arr.find((x: any) => x.key === key)?.value ?? '') : '')
  if (a.type === 'bearer') return { type: 'bearer', token: pick(a.bearer, 'token'), prefix: 'Bearer' }
  if (a.type === 'basic') return { type: 'basic', username: pick(a.basic, 'username'), password: pick(a.basic, 'password') }
  if (a.type === 'apikey') return { type: 'apikey', key: pick(a.apikey, 'key') || 'X-API-Key', value: pick(a.apikey, 'value'), in: pick(a.apikey, 'in') === 'query' ? 'query' : 'header' }
  return null
}

function postmanRequest(item: any, inheritedAuth: AuthConfig | null, warnings: string[]): RequestDef | null {
  const r = item.request
  if (!r || typeof r !== 'object') return null
  const def = newRequest({ name: String(item.name ?? '') })
  const m = String(r.method ?? 'GET').toUpperCase()
  def.method = ((HTTP_METHODS as readonly string[]).includes(m) ? m : 'GET') as HttpMethod
  def.url = typeof r.url === 'string' ? r.url : String(r.url?.raw ?? '')
  def.params = syncParamsFromUrl(def.url, [])
  def.headers = (Array.isArray(r.header) ? r.header : []).map((h: any) => newKv(String(h.key ?? ''), String(h.value ?? ''), !h.disabled))
  const b = r.body
  if (b?.mode === 'raw') {
    const isJson = b.options?.raw?.language === 'json' || /^\s*[[{]/.test(String(b.raw ?? ''))
    def.body.mode = isJson ? 'json' : 'raw'
    if (isJson) def.body.json = String(b.raw ?? '')
    else def.body.raw = String(b.raw ?? '')
  } else if (b?.mode === 'urlencoded') {
    def.body.mode = 'urlencoded'
    def.body.urlencoded = (b.urlencoded ?? []).map((f: any) => newKv(String(f.key ?? ''), String(f.value ?? ''), !f.disabled))
  } else if (b?.mode === 'formdata') {
    def.body.mode = 'form-data'
    def.body.form = (b.formdata ?? []).map((f: any) => {
      if (f.type === 'file') warnings.push(`File field "${f.key}" in "${def.name}" was imported empty.`)
      return newKv(String(f.key ?? ''), f.type === 'file' ? '' : String(f.value ?? ''), !f.disabled)
    })
  } else if (b?.mode) warnings.push(`Body mode "${b.mode}" in "${def.name}" is not supported.`)
  def.auth = postmanAuth(r.auth) ?? inheritedAuth ?? { type: 'none' }
  return def
}

function postmanFolder(items: any[], name: string, inherited: AuthConfig | null, warnings: string[]): ImportFolder {
  const folder: ImportFolder = { name, requests: [], folders: [] }
  for (const it of items) {
    if (Array.isArray(it.item)) folder.folders.push(postmanFolder(it.item, String(it.name ?? 'Folder'), postmanAuth(it.auth) ?? inherited, warnings))
    else {
      const req = postmanRequest(it, inherited, warnings)
      if (req) folder.requests.push(req)
    }
  }
  return folder
}

export function importJson(text: string): ImportResult {
  let doc: any
  try {
    doc = JSON.parse(text)
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
  const warnings: string[] = []

  if (doc?.info && typeof doc.info.schema === 'string' && /postman/i.test(doc.info.schema) && Array.isArray(doc.item)) {
    const folder = postmanFolder(doc.item, String(doc.info.name ?? 'Postman collection'), postmanAuth(doc.auth), warnings)
    const vars = (Array.isArray(doc.variable) ? doc.variable : []).filter((v: any) => v?.key).map((v: any) => ({ key: String(v.key), value: String(v.value ?? ''), secret: false }))
    return { folder, environment: vars.length ? { name: folder.name, variables: vars } : undefined, summary: `${countRequests(folder)} requests from Postman collection "${folder.name}"`, warnings }
  }
  if (doc?.format === EXPORT_FORMAT) {
    if (doc.type === 'request' && looksLikeRequest(doc.request)) return { requests: [toRequest(doc.request)], summary: '1 request', warnings: doc.secretsIncluded === false ? ['Credentials were removed when this file was exported; re-enter them or use {{variables}}.'] : [] }
    if (doc.type === 'collection' && doc.collection) {
      const folder = folderFromJson(doc.collection)
      return { folder, summary: `${countRequests(folder)} requests in collection "${folder.name}"`, warnings: doc.secretsIncluded === false ? ['Credentials were removed when this file was exported; re-enter them or use {{variables}}.'] : [] }
    }
  }
  if (Array.isArray(doc) && doc.length && doc.every(looksLikeRequest)) return { requests: doc.map(toRequest), summary: `${doc.length} requests`, warnings }
  if (looksLikeRequest(doc)) return { requests: [toRequest(doc)], summary: '1 request', warnings }
  if (doc?.requests && Array.isArray(doc.requests)) {
    const folder = folderFromJson(doc)
    return { folder, summary: `${countRequests(folder)} requests`, warnings }
  }
  throw new Error('Unrecognised JSON. Expected a request definition ({ method, url, ... }), an array of them, an API Fetcher export, or a Postman v2.1 collection.')
}
