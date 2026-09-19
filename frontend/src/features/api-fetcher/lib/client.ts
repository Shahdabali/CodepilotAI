import type {
  AiAction,
  AiStatus,
  AuthConfig,
  Collection,
  DiagnoseResult,
  EnvVarInput,
  Environment,
  ExecOptions,
  ExecuteOutcome,
  FetcherConfig,
  HistoryEntry,
  ImportFolder,
  RequestDef,
  SavedRequest,
} from '../types'

const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/+$/, '')
const BASE = `${API_BASE}/api/fetcher`

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: json !== undefined ? { 'Content-Type': 'application/json', ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Cannot reach the CodePilot backend. Make sure the server is running (npm run dev).', 0)
  }
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.error || body.message || message
    } catch {
      /* keep status text */
    }
    throw new ApiError(message || `Request failed (${res.status})`, res.status)
  }
  return res.json() as Promise<T>
}

/** Combines an abort signal with a safety timeout so the UI can never wait forever on the backend. */
function withTimeout(signal: AbortSignal, ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, ms)
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    },
  }
}

export interface Workspace {
  collections: Collection[]
  requests: SavedRequest[]
  environments: Environment[]
}

export interface ImportPayload {
  parentId?: string | null
  root?: ImportFolder
  requests?: RequestDef[]
  environment?: { name: string; variables: Array<{ key: string; value: string; secret: boolean }> }
}

export interface AiChatPayload {
  message: string
  action: AiAction
  language?: string
  environmentId?: string | null
  request?: RequestDef
  response?: {
    status?: number
    statusText?: string
    url?: string
    contentType?: string
    headers?: Array<[string, string]>
    bodyText?: string
    durationMs?: number
    sizeBytes?: number
    redirects?: Array<{ url: string; status: number; location: string }>
    error?: { code: string; message: string; cause?: string }
  }
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type AiEvent = { type: 'delta'; text: string } | { type: 'done' } | { type: 'error'; code: string; message: string }

export const fetcherApi = {
  workspace: () => call<Workspace>('/workspace'),
  config: () => call<FetcherConfig>('/config'),

  async execute(request: RequestDef, environmentId: string | null, options: ExecOptions, signal: AbortSignal): Promise<ExecuteOutcome> {
    const guard = withTimeout(signal, options.timeoutMs + 20_000)
    try {
      return await call<ExecuteOutcome>('/execute', { method: 'POST', json: { request, environmentId, options }, signal: guard.signal })
    } finally {
      guard.clear()
    }
  },

  async downloadResponse(responseId: string): Promise<Blob> {
    const res = await fetch(`${BASE}/responses/${encodeURIComponent(responseId)}/download`)
    if (!res.ok) {
      let msg = 'The full response is no longer available. Send the request again.'
      try {
        msg = (await res.json()).error ?? msg
      } catch {
        /* keep default */
      }
      throw new ApiError(msg, res.status)
    }
    return res.blob()
  },

  diagnose: (url: string, signal?: AbortSignal) => call<DiagnoseResult>('/diagnose', { method: 'POST', json: { url }, signal }),
  oauthToken: (auth: AuthConfig, environmentId: string | null, signal?: AbortSignal) =>
    call<{ ok: boolean; accessToken?: string; tokenType?: string; expiresIn?: number; scope?: string; error?: string }>('/oauth/token', { method: 'POST', json: { auth, environmentId }, signal }),

  history: (limit = 200) => call<{ history: HistoryEntry[] }>(`/history?limit=${limit}`),
  historyRequest: (id: string) => call<{ entry: HistoryEntry; request: RequestDef }>(`/history/${id}`),
  deleteHistory: (id: string) => call<{ success: boolean }>(`/history/${id}`, { method: 'DELETE' }),
  clearHistory: () => call<{ success: boolean }>('/history', { method: 'DELETE' }),

  createCollection: (name: string, parentId: string | null) => call<Collection>('/collections', { method: 'POST', json: { name, parentId } }),
  updateCollection: (id: string, patch: { name?: string; parentId?: string | null }) => call<Collection>(`/collections/${id}`, { method: 'PATCH', json: patch }),
  deleteCollection: (id: string) => call<{ success: boolean }>(`/collections/${id}`, { method: 'DELETE' }),
  duplicateCollection: (id: string) => call<{ collections: Collection[]; requests: SavedRequest[] }>(`/collections/${id}/duplicate`, { method: 'POST' }),

  createRequest: (name: string, collectionId: string | null, data: RequestDef) => call<SavedRequest>('/requests', { method: 'POST', json: { name, collectionId, data } }),
  updateRequest: (id: string, patch: { name?: string; collectionId?: string | null; data?: RequestDef }) => call<SavedRequest>(`/requests/${id}`, { method: 'PATCH', json: patch }),
  deleteRequest: (id: string) => call<{ success: boolean }>(`/requests/${id}`, { method: 'DELETE' }),
  duplicateRequest: (id: string) => call<SavedRequest>(`/requests/${id}/duplicate`, { method: 'POST' }),

  createEnvironment: (name: string, variables: EnvVarInput[]) => call<Environment>('/environments', { method: 'POST', json: { name, variables } }),
  updateEnvironment: (id: string, name: string, variables: EnvVarInput[]) => call<Environment>(`/environments/${id}`, { method: 'PUT', json: { name, variables } }),
  deleteEnvironment: (id: string) => call<{ success: boolean }>(`/environments/${id}`, { method: 'DELETE' }),
  duplicateEnvironment: (id: string) => call<Environment>(`/environments/${id}/duplicate`, { method: 'POST' }),

  importBulk: (payload: ImportPayload) => call<{ collections: Collection[]; requests: SavedRequest[]; environment: Environment | null }>('/import', { method: 'POST', json: payload }),

  aiStatus: () => call<AiStatus>('/ai/status'),

  /** Streams an assistant answer. Resolves when the stream ends; throws on transport failure. */
  async aiChat(payload: AiChatPayload, onEvent: (e: AiEvent) => void, signal: AbortSignal): Promise<void> {
    let res: Response
    try {
      res = await fetch(`${BASE}/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      throw new ApiError('Cannot reach the CodePilot backend.', 0)
    }
    if (!res.ok || !res.body) {
      let message = res.statusText
      try {
        message = (await res.json()).error ?? message
      } catch {
        /* keep */
      }
      throw new ApiError(message, res.status)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const line = frame.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        try {
          onEvent(JSON.parse(line.slice(6)) as AiEvent)
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  },
}
