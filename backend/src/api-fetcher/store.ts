import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { getDb } from '../db/schema.js'
import { requestDefSchema, type EnvVarInput, type RequestDef } from './schemas.js'

const HISTORY_LIMIT = 500

const now = () => new Date().toISOString()

export async function ensureFetcherSchema(): Promise<void> {
  await getDb().executeMultiple(`
    CREATE TABLE IF NOT EXISTS fetcher_collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fetcher_requests (
      id TEXT PRIMARY KEY,
      collection_id TEXT,
      name TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      data TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fetcher_requests_collection ON fetcher_requests(collection_id);
    CREATE TABLE IF NOT EXISTS fetcher_history (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      status INTEGER,
      status_text TEXT,
      duration_ms INTEGER,
      size_bytes INTEGER,
      error_code TEXT,
      error_message TEXT,
      request_data TEXT NOT NULL,
      environment_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fetcher_history_created ON fetcher_history(created_at DESC);
    CREATE TABLE IF NOT EXISTS fetcher_environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      variables TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}

// ─── Secret sealing ──────────────────────────────────────────────────────────

const SEAL_PREFIX = 'enc:v1:'

function sealingKey(): Buffer | null {
  const k = process.env.API_FETCHER_ENCRYPTION_KEY
  return k ? createHash('sha256').update(k).digest() : null
}

export function isEncryptionEnabled(): boolean {
  return sealingKey() !== null
}

function seal(plain: string): string {
  const key = sealingKey()
  if (!key || !plain) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return SEAL_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}

function unseal(stored: string): string {
  if (!stored.startsWith(SEAL_PREFIX)) return stored
  const key = sealingKey()
  if (!key) throw new Error('A stored secret is encrypted but API_FETCHER_ENCRYPTION_KEY is not set')
  const raw = Buffer.from(stored.slice(SEAL_PREFIX.length), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CollectionRow {
  id: string
  name: string
  parentId: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface SavedRequestRow {
  id: string
  collectionId: string | null
  name: string
  method: string
  url: string
  data: RequestDef
  position: number
  createdAt: string
  updatedAt: string
}

export interface HistoryRow {
  id: string
  method: string
  url: string
  status: number | null
  statusText: string | null
  durationMs: number | null
  sizeBytes: number | null
  errorCode: string | null
  errorMessage: string | null
  environmentId: string | null
  createdAt: string
}

export interface EnvironmentView {
  id: string
  name: string
  variables: Array<{ key: string; value: string; secret: boolean; hasValue: boolean }>
  position: number
  updatedAt: string
}

// ─── Collections ─────────────────────────────────────────────────────────────

function toCollection(r: Record<string, unknown>): CollectionRow {
  return {
    id: r.id as string,
    name: r.name as string,
    parentId: (r.parent_id as string | null) ?? null,
    position: Number(r.position ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

async function nextPosition(table: 'fetcher_collections' | 'fetcher_requests' | 'fetcher_environments', where = '1=1', args: (string | null)[] = []): Promise<number> {
  const res = await getDb().execute({ sql: `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${table} WHERE ${where}`, args })
  return Number(res.rows[0].p)
}

export async function listCollections(): Promise<CollectionRow[]> {
  const res = await getDb().execute('SELECT * FROM fetcher_collections ORDER BY position, created_at')
  return res.rows.map(toCollection)
}

export async function getCollection(id: string): Promise<CollectionRow | null> {
  const res = await getDb().execute({ sql: 'SELECT * FROM fetcher_collections WHERE id = ?', args: [id] })
  return res.rows[0] ? toCollection(res.rows[0]) : null
}

export async function createCollection(name: string, parentId: string | null): Promise<CollectionRow> {
  if (parentId && !(await getCollection(parentId))) throw new NotFoundError('Parent collection not found')
  const id = randomUUID()
  const ts = now()
  const position = await nextPosition('fetcher_collections', parentId ? 'parent_id = ?' : 'parent_id IS NULL', parentId ? [parentId] : [])
  await getDb().execute({
    sql: 'INSERT INTO fetcher_collections (id, name, parent_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, name, parentId, position, ts, ts],
  })
  return { id, name, parentId, position, createdAt: ts, updatedAt: ts }
}

async function descendantIds(id: string): Promise<string[]> {
  const all = await listCollections()
  const out: string[] = []
  const walk = (parent: string) => {
    for (const c of all) {
      if (c.parentId === parent) {
        out.push(c.id)
        walk(c.id)
      }
    }
  }
  walk(id)
  return out
}

export async function updateCollection(id: string, patch: { name?: string; parentId?: string | null }): Promise<CollectionRow> {
  const existing = await getCollection(id)
  if (!existing) throw new NotFoundError('Collection not found')
  let parentId = existing.parentId
  if (patch.parentId !== undefined) {
    if (patch.parentId === id || (patch.parentId && (await descendantIds(id)).includes(patch.parentId))) {
      throw new ValidationError('A collection cannot be moved into itself or one of its sub-collections')
    }
    if (patch.parentId && !(await getCollection(patch.parentId))) throw new NotFoundError('Target collection not found')
    parentId = patch.parentId
  }
  const name = patch.name ?? existing.name
  const position = parentId !== existing.parentId ? await nextPosition('fetcher_collections', parentId ? 'parent_id = ?' : 'parent_id IS NULL', parentId ? [parentId] : []) : existing.position
  const ts = now()
  await getDb().execute({ sql: 'UPDATE fetcher_collections SET name = ?, parent_id = ?, position = ?, updated_at = ? WHERE id = ?', args: [name, parentId, position, ts, id] })
  return { ...existing, name, parentId, position, updatedAt: ts }
}

export async function deleteCollection(id: string): Promise<void> {
  if (!(await getCollection(id))) throw new NotFoundError('Collection not found')
  const ids = [id, ...(await descendantIds(id))]
  const marks = ids.map(() => '?').join(',')
  const db = getDb()
  await db.batch(
    [
      { sql: `DELETE FROM fetcher_requests WHERE collection_id IN (${marks})`, args: ids },
      { sql: `DELETE FROM fetcher_collections WHERE id IN (${marks})`, args: ids },
    ],
    'write'
  )
}

export async function duplicateCollection(id: string): Promise<{ collections: CollectionRow[]; requests: SavedRequestRow[] }> {
  const source = await getCollection(id)
  if (!source) throw new NotFoundError('Collection not found')
  const created: { collections: CollectionRow[]; requests: SavedRequestRow[] } = { collections: [], requests: [] }
  const copy = async (srcId: string, parentId: string | null, name: string) => {
    const dst = await createCollection(name, parentId)
    created.collections.push(dst)
    for (const r of await listRequestsIn(srcId)) {
      created.requests.push(await createRequest({ name: r.name, collectionId: dst.id, data: r.data }))
    }
    for (const child of (await listCollections()).filter((c) => c.parentId === srcId && !created.collections.some((x) => x.id === c.id))) {
      await copy(child.id, dst.id, child.name)
    }
  }
  await copy(id, source.parentId, `${source.name} copy`)
  return created
}

// ─── Saved requests ──────────────────────────────────────────────────────────

function parseDef(json: string, fallbackName: string): RequestDef {
  try {
    const parsed = requestDefSchema.safeParse(JSON.parse(json))
    if (parsed.success) return parsed.data
  } catch {
    /* fall through */
  }
  return requestDefSchema.parse({ name: fallbackName })
}

function toRequest(r: Record<string, unknown>): SavedRequestRow {
  const name = r.name as string
  return {
    id: r.id as string,
    collectionId: (r.collection_id as string | null) ?? null,
    name,
    method: r.method as string,
    url: r.url as string,
    data: parseDef(r.data as string, name),
    position: Number(r.position ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export async function listRequests(): Promise<SavedRequestRow[]> {
  const res = await getDb().execute('SELECT * FROM fetcher_requests ORDER BY position, created_at')
  return res.rows.map(toRequest)
}

async function listRequestsIn(collectionId: string): Promise<SavedRequestRow[]> {
  const res = await getDb().execute({ sql: 'SELECT * FROM fetcher_requests WHERE collection_id = ? ORDER BY position, created_at', args: [collectionId] })
  return res.rows.map(toRequest)
}

export async function getRequest(id: string): Promise<SavedRequestRow | null> {
  const res = await getDb().execute({ sql: 'SELECT * FROM fetcher_requests WHERE id = ?', args: [id] })
  return res.rows[0] ? toRequest(res.rows[0]) : null
}

export async function createRequest(input: { name: string; collectionId: string | null; data: RequestDef }): Promise<SavedRequestRow> {
  if (input.collectionId && !(await getCollection(input.collectionId))) throw new NotFoundError('Collection not found')
  const id = randomUUID()
  const ts = now()
  const data = { ...input.data, id, name: input.name }
  const position = await nextPosition('fetcher_requests', input.collectionId ? 'collection_id = ?' : 'collection_id IS NULL', input.collectionId ? [input.collectionId] : [])
  await getDb().execute({
    sql: 'INSERT INTO fetcher_requests (id, collection_id, name, method, url, data, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [id, input.collectionId, input.name, data.method, data.url, JSON.stringify(data), position, ts, ts],
  })
  return { id, collectionId: input.collectionId, name: input.name, method: data.method, url: data.url, data, position, createdAt: ts, updatedAt: ts }
}

export async function updateRequest(id: string, patch: { name?: string; collectionId?: string | null; data?: RequestDef }): Promise<SavedRequestRow> {
  const existing = await getRequest(id)
  if (!existing) throw new NotFoundError('Request not found')
  let collectionId = existing.collectionId
  if (patch.collectionId !== undefined) {
    if (patch.collectionId && !(await getCollection(patch.collectionId))) throw new NotFoundError('Collection not found')
    collectionId = patch.collectionId
  }
  const name = patch.name ?? existing.name
  const data = { ...(patch.data ?? existing.data), id, name }
  const position = collectionId !== existing.collectionId ? await nextPosition('fetcher_requests', collectionId ? 'collection_id = ?' : 'collection_id IS NULL', collectionId ? [collectionId] : []) : existing.position
  const ts = now()
  await getDb().execute({
    sql: 'UPDATE fetcher_requests SET collection_id = ?, name = ?, method = ?, url = ?, data = ?, position = ?, updated_at = ? WHERE id = ?',
    args: [collectionId, name, data.method, data.url, JSON.stringify(data), position, ts, id],
  })
  return { ...existing, collectionId, name, method: data.method, url: data.url, data, position, updatedAt: ts }
}

export async function deleteRequest(id: string): Promise<void> {
  if (!(await getRequest(id))) throw new NotFoundError('Request not found')
  await getDb().execute({ sql: 'DELETE FROM fetcher_requests WHERE id = ?', args: [id] })
}

export async function duplicateRequest(id: string): Promise<SavedRequestRow> {
  const source = await getRequest(id)
  if (!source) throw new NotFoundError('Request not found')
  return createRequest({ name: `${source.name} copy`, collectionId: source.collectionId, data: source.data })
}

// ─── History ─────────────────────────────────────────────────────────────────

function toHistory(r: Record<string, unknown>): HistoryRow {
  return {
    id: r.id as string,
    method: r.method as string,
    url: r.url as string,
    status: r.status === null ? null : Number(r.status),
    statusText: (r.status_text as string | null) ?? null,
    durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    errorCode: (r.error_code as string | null) ?? null,
    errorMessage: (r.error_message as string | null) ?? null,
    environmentId: (r.environment_id as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

export async function addHistory(entry: {
  redactedRequest: RequestDef
  status: number | null
  statusText: string | null
  durationMs: number | null
  sizeBytes: number | null
  errorCode: string | null
  errorMessage: string | null
  environmentId: string | null
}): Promise<HistoryRow> {
  const id = randomUUID()
  const ts = now()
  const db = getDb()
  await db.execute({
    sql: `INSERT INTO fetcher_history (id, method, url, status, status_text, duration_ms, size_bytes, error_code, error_message, request_data, environment_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      entry.redactedRequest.method,
      entry.redactedRequest.url,
      entry.status,
      entry.statusText,
      entry.durationMs === null ? null : Math.round(entry.durationMs),
      entry.sizeBytes,
      entry.errorCode,
      entry.errorMessage,
      JSON.stringify(entry.redactedRequest),
      entry.environmentId,
      ts,
    ],
  })
  await db.execute({
    sql: `DELETE FROM fetcher_history WHERE id IN (SELECT id FROM fetcher_history ORDER BY created_at DESC LIMIT -1 OFFSET ?)`,
    args: [HISTORY_LIMIT],
  })
  return {
    id,
    method: entry.redactedRequest.method,
    url: entry.redactedRequest.url,
    status: entry.status,
    statusText: entry.statusText,
    durationMs: entry.durationMs === null ? null : Math.round(entry.durationMs),
    sizeBytes: entry.sizeBytes,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage,
    environmentId: entry.environmentId,
    createdAt: ts,
  }
}

export async function listHistory(limit = 200): Promise<HistoryRow[]> {
  const res = await getDb().execute({
    sql: `SELECT id, method, url, status, status_text, duration_ms, size_bytes, error_code, error_message, environment_id, created_at
          FROM fetcher_history ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  })
  return res.rows.map(toHistory)
}

export async function getHistoryRequest(id: string): Promise<{ entry: HistoryRow; request: RequestDef } | null> {
  const res = await getDb().execute({ sql: 'SELECT * FROM fetcher_history WHERE id = ?', args: [id] })
  const row = res.rows[0]
  if (!row) return null
  return { entry: toHistory(row), request: parseDef(row.request_data as string, '') }
}

export async function deleteHistory(id: string): Promise<void> {
  await getDb().execute({ sql: 'DELETE FROM fetcher_history WHERE id = ?', args: [id] })
}

export async function clearHistory(): Promise<void> {
  await getDb().execute('DELETE FROM fetcher_history')
}

// ─── Environments ────────────────────────────────────────────────────────────

interface StoredVar {
  key: string
  value: string
  secret: boolean
}

function readVars(json: string): StoredVar[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as StoredVar[]) : []
  } catch {
    return []
  }
}

function toEnvView(r: Record<string, unknown>): EnvironmentView {
  return {
    id: r.id as string,
    name: r.name as string,
    variables: readVars(r.variables as string).map((v) => ({
      key: v.key,
      value: v.secret ? '' : v.value,
      secret: v.secret,
      hasValue: v.value !== '',
    })),
    position: Number(r.position ?? 0),
    updatedAt: r.updated_at as string,
  }
}

export async function listEnvironments(): Promise<EnvironmentView[]> {
  const res = await getDb().execute('SELECT * FROM fetcher_environments ORDER BY position, created_at')
  return res.rows.map(toEnvView)
}

export async function getEnvironmentView(id: string): Promise<EnvironmentView | null> {
  const res = await getDb().execute({ sql: 'SELECT * FROM fetcher_environments WHERE id = ?', args: [id] })
  return res.rows[0] ? toEnvView(res.rows[0]) : null
}

export interface EnvironmentContext {
  vars: Record<string, string>
  secrets: Array<{ name: string; value: string }>
}

/** Resolved variable map including decrypted secrets. Server-side use only. */
export async function getEnvironmentContext(id: string): Promise<EnvironmentContext> {
  const res = await getDb().execute({ sql: 'SELECT variables FROM fetcher_environments WHERE id = ?', args: [id] })
  if (!res.rows[0]) throw new NotFoundError('Environment not found')
  const ctx: EnvironmentContext = { vars: {}, secrets: [] }
  for (const v of readVars(res.rows[0].variables as string)) {
    const value = v.secret ? unseal(v.value) : v.value
    ctx.vars[v.key] = value
    if (v.secret && value.length >= 4) ctx.secrets.push({ name: v.key, value })
  }
  return ctx
}

/** Replaces any occurrence of a secret variable's value with its {{NAME}} placeholder. */
export function maskSecrets(text: string, secrets: EnvironmentContext['secrets']): string {
  let out = text
  for (const { name, value } of secrets) if (out.includes(value)) out = out.split(value).join(`{{${name}}}`)
  return out
}

function mergeVariables(input: EnvVarInput[], existing: StoredVar[]): StoredVar[] {
  const byKey = new Map(existing.map((v) => [v.key, v]))
  const seen = new Set<string>()
  const out: StoredVar[] = []
  for (const v of input) {
    if (seen.has(v.key)) throw new ValidationError(`Duplicate variable name "${v.key}"`)
    seen.add(v.key)
    const prior = byKey.get(v.key)
    if (v.secret) {
      const keepExisting = (v.keep || v.value === undefined) && prior?.secret
      out.push({ key: v.key, secret: true, value: keepExisting ? prior!.value : seal(v.value ?? '') })
    } else {
      // A secret that is being downgraded to plain text must have its value explicitly re-supplied.
      out.push({ key: v.key, secret: false, value: v.value ?? '' })
    }
  }
  return out
}

export async function createEnvironment(name: string, variables: EnvVarInput[]): Promise<EnvironmentView> {
  const id = randomUUID()
  const ts = now()
  const position = await nextPosition('fetcher_environments')
  await getDb().execute({
    sql: 'INSERT INTO fetcher_environments (id, name, variables, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, name, JSON.stringify(mergeVariables(variables, [])), position, ts, ts],
  })
  return (await getEnvironmentView(id))!
}

export async function updateEnvironment(id: string, name: string, variables: EnvVarInput[]): Promise<EnvironmentView> {
  const res = await getDb().execute({ sql: 'SELECT variables FROM fetcher_environments WHERE id = ?', args: [id] })
  if (!res.rows[0]) throw new NotFoundError('Environment not found')
  const merged = mergeVariables(variables, readVars(res.rows[0].variables as string))
  await getDb().execute({
    sql: 'UPDATE fetcher_environments SET name = ?, variables = ?, updated_at = ? WHERE id = ?',
    args: [name, JSON.stringify(merged), now(), id],
  })
  return (await getEnvironmentView(id))!
}

export async function deleteEnvironment(id: string): Promise<void> {
  await getDb().execute({ sql: 'DELETE FROM fetcher_environments WHERE id = ?', args: [id] })
}

export async function duplicateEnvironment(id: string): Promise<EnvironmentView> {
  const res = await getDb().execute({ sql: 'SELECT * FROM fetcher_environments WHERE id = ?', args: [id] })
  const row = res.rows[0]
  if (!row) throw new NotFoundError('Environment not found')
  const newId = randomUUID()
  const ts = now()
  await getDb().execute({
    sql: 'INSERT INTO fetcher_environments (id, name, variables, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [newId, `${row.name as string} copy`, row.variables as string, await nextPosition('fetcher_environments'), ts, ts],
  })
  return (await getEnvironmentView(newId))!
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class NotFoundError extends Error {}
export class ValidationError extends Error {}
