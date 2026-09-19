import type {
  CommitSummary,
  FilePayload,
  GithubStatus,
  IssueState,
  IssueSummary,
  Paged,
  ReadmePayload,
  RepoOverview,
  SearchPayload,
  TreePayload,
} from './types'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const BASE = `${API_BASE}/api/github`

export class GithubApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly resetAt?: number
  ) {
    super(message)
    this.name = 'GithubApiError'
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== '') qs.set(k, String(v))
  let res: Response
  try {
    res = await fetch(`${BASE}${path}${qs.size ? `?${qs}` : ''}`, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new GithubApiError('Could not reach the CodePilot server.', 'NETWORK', 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new GithubApiError(body?.error ?? `Request failed (${res.status})`, body?.code ?? 'UPSTREAM', res.status, body?.resetAt)
  return body as T
}

const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

export const githubApi = {
  status: (signal?: AbortSignal) => get<GithubStatus>('/status', undefined, signal),
  search: (q: string, sort: 'best' | 'stars' | 'forks' | 'updated' = 'best', page = 1, signal?: AbortSignal) =>
    get<SearchPayload>('/search', { q, sort, page }, signal),
  overview: (owner: string, repo: string, signal?: AbortSignal) => get<RepoOverview>(repoPath(owner, repo), undefined, signal),
  readme: (owner: string, repo: string, ref?: string, signal?: AbortSignal) => get<ReadmePayload>(`${repoPath(owner, repo)}/readme`, { ref }, signal),
  tree: (owner: string, repo: string, ref?: string, signal?: AbortSignal) => get<TreePayload>(`${repoPath(owner, repo)}/tree`, { ref }, signal),
  file: (owner: string, repo: string, path: string, ref?: string, signal?: AbortSignal) => get<FilePayload>(`${repoPath(owner, repo)}/file`, { path, ref }, signal),
  commits: (owner: string, repo: string, opts: { path?: string; sha?: string; page?: number } = {}, signal?: AbortSignal) =>
    get<Paged<CommitSummary>>(`${repoPath(owner, repo)}/commits`, { path: opts.path, sha: opts.sha, page: opts.page }, signal),
  issues: (owner: string, repo: string, kind: 'issue' | 'pr', state: IssueState, page = 1, signal?: AbortSignal) =>
    get<Paged<IssueSummary>>(`${repoPath(owner, repo)}/issues`, { kind, state, page }, signal),
}

/**
 * Streams the AI briefing. Calls `onDelta` for each chunk and resolves when the model is done.
 * Rejects with a GithubApiError (NO_PROVIDER / AI_FAILED / repo errors) — the UI shows the message as-is.
 */
export async function streamBrief(owner: string, repo: string, onDelta: (text: string) => void, signal: AbortSignal): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BASE}${repoPath(owner, repo)}/brief`, { method: 'POST', signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new GithubApiError('Could not reach the CodePilot server.', 'NETWORK', 0)
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null)
    throw new GithubApiError(body?.error ?? `Request failed (${res.status})`, body?.code ?? 'UPSTREAM', res.status)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        let event: { type?: string; text?: string; message?: string; code?: string }
        try {
          event = JSON.parse(line.slice(5).trim())
        } catch {
          continue
        }
        if (event.type === 'delta' && event.text) onDelta(event.text)
        else if (event.type === 'error') throw new GithubApiError(event.message ?? 'The AI request failed.', event.code ?? 'AI_FAILED', 502)
      }
    }
  }
}
