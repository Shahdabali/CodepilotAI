/**
 * Minimal, hardened GitHub REST client.
 *
 *  • Talks only to api.github.com — the host is fixed, so there is no SSRF surface, and every path
 *    segment that reaches it is validated and percent-encoded.
 *  • The token (GITHUB_TOKEN / GH_TOKEN / GITHUB_API_KEY) lives on the server and is never returned
 *    to the browser or written to logs.
 *  • Responses are cached in memory with ETags; a 304 does not count against the rate limit.
 *  • Every failure is mapped to a GithubError with a user-facing message, never a raw upstream body.
 */

const API = 'https://api.github.com'
const TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 12 * 1024 * 1024
const CACHE_MAX_ENTRIES = 400

export type GithubErrorCode = 'NOT_FOUND' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'TIMEOUT' | 'NETWORK' | 'UPSTREAM' | 'BAD_REQUEST' | 'TOO_LARGE'

export class GithubError extends Error {
  constructor(
    public readonly code: GithubErrorCode,
    message: string,
    public readonly status: number,
    public readonly resetAt?: number
  ) {
    super(message)
    this.name = 'GithubError'
  }
}

export interface RateLimit {
  limit: number
  remaining: number
  /** Unix seconds when the window resets. */
  reset: number
  resource?: string
}

// ─── Token ────────────────────────────────────────────────────────────────────

export type TokenSource = 'GITHUB_TOKEN' | 'GH_TOKEN' | 'GITHUB_API_KEY'
const TOKEN_ENV: TokenSource[] = ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_API_KEY']

let tokenRejected = false

export function getToken(): { token: string; source: TokenSource } | null {
  for (const source of TOKEN_ENV) {
    const token = process.env[source]?.trim()
    if (token) return { token, source }
  }
  return null
}

export function tokenState(): { configured: boolean; source: TokenSource | null; rejected: boolean } {
  const t = getToken()
  return { configured: !!t, source: t?.source ?? null, rejected: !!t && tokenRejected }
}

/** Test hook. */
export function _resetClientState() {
  tokenRejected = false
  cache.clear()
  lastRate = null
}

// ─── Input validation ─────────────────────────────────────────────────────────

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/
const REF_RE = /^[A-Za-z0-9._\-/@]{1,200}$/

export function assertRepoRef(owner: string, repo: string) {
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === '.' || repo === '..' || repo.endsWith('.git')) {
    throw new GithubError('BAD_REQUEST', `“${owner}/${repo}” is not a valid GitHub repository name.`, 400)
  }
}

export function assertRef(ref: string) {
  if (!REF_RE.test(ref) || ref.includes('..') || ref.startsWith('/') || ref.endsWith('/')) {
    throw new GithubError('BAD_REQUEST', 'That branch, tag or commit name is not valid.', 400)
  }
}

/** Validates and percent-encodes a repo-relative path ("src/app/main.ts"). */
export function encodeRepoPath(path: string): string {
  if (path.length > 1000 || path.includes('\\') || path.includes('\0')) throw new GithubError('BAD_REQUEST', 'That file path is not valid.', 400)
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.some((s) => s === '..' || s === '.')) throw new GithubError('BAD_REQUEST', 'That file path is not valid.', 400)
  return segments.map(encodeURIComponent).join('/')
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  etag: string | null
  body: string
  status: number
  expires: number
  contentType: string
}
const cache = new Map<string, CacheEntry>()
let lastRate: RateLimit | null = null

export function lastRateLimit(): RateLimit | null {
  return lastRate
}

function remember(key: string, entry: CacheEntry) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.delete(key)
  cache.set(key, entry)
}

function readRate(res: Response) {
  const limit = Number(res.headers.get('x-ratelimit-limit'))
  const remaining = Number(res.headers.get('x-ratelimit-remaining'))
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(limit) && Number.isFinite(remaining) && Number.isFinite(reset) && res.headers.has('x-ratelimit-limit')) {
    lastRate = { limit, remaining, reset, resource: res.headers.get('x-ratelimit-resource') ?? undefined }
  }
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export interface GetOptions {
  /** Accept header — `application/vnd.github.raw+json` returns file/README bodies as plain text. */
  accept?: string
  /** Cache lifetime in ms (default 2 minutes). */
  ttl?: number
  signal?: AbortSignal
}

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new GithubError('TOO_LARGE', 'That response is too large to load.', 413)
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      throw new GithubError('TOO_LARGE', 'That response is too large to load.', 413)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function toError(res: Response, bodyText: string, usedToken: boolean): GithubError {
  const remaining = res.headers.get('x-ratelimit-remaining')
  const reset = Number(res.headers.get('x-ratelimit-reset')) || undefined
  const retryAfter = Number(res.headers.get('retry-after'))
  let upstream = ''
  try {
    upstream = String((JSON.parse(bodyText) as { message?: unknown }).message ?? '')
  } catch {
    /* not JSON */
  }

  if (res.status === 404) return new GithubError('NOT_FOUND', 'Not found. The repository or file may not exist, or it may be private.', 404)
  if (res.status === 401) return new GithubError('UNAUTHORIZED', 'GitHub rejected the configured access token.', 401)
  if (res.status === 429 || (res.status === 403 && (remaining === '0' || /rate limit|abuse|secondary/i.test(upstream)))) {
    const resetAt = reset ?? (Number.isFinite(retryAfter) && retryAfter > 0 ? Math.floor(Date.now() / 1000) + retryAfter : undefined)
    const when = resetAt ? ` It resets ${new Date(resetAt * 1000).toLocaleTimeString()}.` : ''
    return new GithubError(
      'RATE_LIMITED',
      usedToken ? `GitHub rate limit reached.${when}` : `GitHub’s anonymous rate limit (60 requests/hour) is used up.${when} Add a GITHUB_TOKEN on the server for 5,000/hour.`,
      429,
      resetAt
    )
  }
  if (res.status === 403) return new GithubError('FORBIDDEN', 'GitHub refused this request (the repository may be private or blocked).', 403)
  if (res.status === 451) return new GithubError('FORBIDDEN', 'This repository is unavailable for legal reasons.', 451)
  if (res.status === 422) return new GithubError('BAD_REQUEST', upstream ? `GitHub could not process that: ${upstream}` : 'GitHub could not process that request.', 422)
  return new GithubError('UPSTREAM', `GitHub returned an error (${res.status}). Try again in a moment.`, 502)
}

/** GET a GitHub API path and return `{ text, status, contentType }`. */
export async function ghGetText(path: string, opts: GetOptions = {}): Promise<{ text: string; status: number; contentType: string }> {
  if (!path.startsWith('/') || /[\s\0\\]/.test(path)) throw new GithubError('BAD_REQUEST', 'Invalid request path.', 400)

  const accept = opts.accept ?? 'application/vnd.github+json'
  const key = `${accept}|${path}`
  const cached = cache.get(key)
  const now = Date.now()
  if (cached && cached.expires > now) return { text: cached.body, status: cached.status, contentType: cached.contentType }

  const attempt = async (withToken: boolean) => {
    const auth = withToken ? getToken() : null
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'CodePilot-AI-GitHub-Explorer',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (auth) headers.Authorization = `Bearer ${auth.token}`
    if (cached?.etag) headers['If-None-Match'] = cached.etag

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const onAbort = () => ctrl.abort()
    opts.signal?.addEventListener('abort', onAbort)
    try {
      const res = await fetch(API + path, { headers, signal: ctrl.signal, redirect: 'follow' })
      readRate(res)
      return { res, usedToken: !!auth }
    } catch (err) {
      if (opts.signal?.aborted) throw new GithubError('NETWORK', 'The request was cancelled.', 499)
      if (ctrl.signal.aborted) throw new GithubError('TIMEOUT', 'GitHub took too long to respond.', 504)
      throw new GithubError('NETWORK', 'Could not reach GitHub. Check the server’s internet connection.', 502)
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  let { res, usedToken } = await attempt(true)

  // A configured-but-invalid token makes even public reads fail with 401. Fall back to anonymous access
  // (and remember, so the status screen can say the token needs attention).
  if (res.status === 401 && usedToken) {
    tokenRejected = true
    ;({ res, usedToken } = await attempt(false))
  } else if (usedToken) {
    tokenRejected = false
  }

  if (res.status === 304 && cached) {
    cached.expires = now + (opts.ttl ?? 120_000)
    return { text: cached.body, status: cached.status, contentType: cached.contentType }
  }

  const text = await readCapped(res)
  if (!res.ok) throw toError(res, text, usedToken)

  const contentType = res.headers.get('content-type') ?? ''
  remember(key, { etag: res.headers.get('etag'), body: text, status: res.status, expires: now + (opts.ttl ?? 120_000), contentType })
  return { text, status: res.status, contentType }
}

export async function ghGetJson<T>(path: string, opts: GetOptions = {}): Promise<T> {
  const { text, status } = await ghGetText(path, opts)
  if (status === 204 || text.trim() === '') return [] as unknown as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new GithubError('UPSTREAM', 'GitHub sent a response that could not be read.', 502)
  }
}
