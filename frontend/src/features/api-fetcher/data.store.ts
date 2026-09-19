import { create } from 'zustand'
import type { AiStatus, Collection, EnvVarInput, Environment, FetcherConfig, HistoryEntry, ImportResult, RequestDef, SavedRequest } from './types'
import { fetcherApi } from './lib/client'
import { redactUrl } from './lib/redact'

interface DataState {
  loaded: boolean
  loading: boolean
  loadError: string | null
  collections: Collection[]
  requests: SavedRequest[]
  environments: Environment[]
  history: HistoryEntry[]
  config: FetcherConfig | null
  ai: AiStatus | null
  /** Full (unredacted) requests from this browser session, keyed by history id. Never persisted. */
  sessionRequests: Map<string, RequestDef>

  load: () => Promise<void>
  refreshHistory: () => Promise<void>
  refreshAi: () => Promise<void>
  rememberSent: (historyId: string, def: RequestDef) => void
  addHistory: (entry: HistoryEntry) => void
  deleteHistory: (id: string) => Promise<void>
  clearHistory: () => Promise<void>

  createCollection: (name: string, parentId: string | null) => Promise<Collection>
  updateCollection: (id: string, patch: { name?: string; parentId?: string | null }) => Promise<void>
  deleteCollection: (id: string) => Promise<void>
  duplicateCollection: (id: string) => Promise<void>

  createRequest: (name: string, collectionId: string | null, data: RequestDef) => Promise<SavedRequest>
  updateRequest: (id: string, patch: { name?: string; collectionId?: string | null; data?: RequestDef }) => Promise<SavedRequest>
  deleteRequest: (id: string) => Promise<void>
  duplicateRequest: (id: string) => Promise<SavedRequest>

  createEnvironment: (name: string, variables: EnvVarInput[]) => Promise<Environment>
  updateEnvironment: (id: string, name: string, variables: EnvVarInput[]) => Promise<Environment>
  deleteEnvironment: (id: string) => Promise<void>
  duplicateEnvironment: (id: string) => Promise<Environment>

  applyImport: (result: ImportResult, parentId: string | null) => Promise<{ requests: number; collections: number; environmentId: string | null }>
}

const replaceById = <T extends { id: string }>(list: T[], item: T): T[] => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item])

export const useDataStore = create<DataState>((set, get) => ({
  loaded: false,
  loading: false,
  loadError: null,
  collections: [],
  requests: [],
  environments: [],
  history: [],
  config: null,
  ai: null,
  sessionRequests: new Map(),

  async load() {
    if (get().loading) return
    set({ loading: true, loadError: null })
    try {
      const [ws, hist, config] = await Promise.all([fetcherApi.workspace(), fetcherApi.history(), fetcherApi.config().catch(() => null)])
      set({ ...ws, history: hist.history, config, loaded: true, loading: false })
      get().refreshAi()
    } catch (e) {
      set({ loading: false, loadError: e instanceof Error ? e.message : 'Failed to load workspace' })
    }
  },

  async refreshHistory() {
    const { history } = await fetcherApi.history()
    set({ history })
  },

  async refreshAi() {
    try {
      set({ ai: await fetcherApi.aiStatus() })
    } catch {
      set({ ai: { configured: false, providers: [], routingMode: 'auto' } })
    }
  },

  rememberSent(historyId, def) {
    const map = new Map(get().sessionRequests)
    map.set(historyId, structuredClone(def))
    if (map.size > 100) map.delete(map.keys().next().value as string)
    set({ sessionRequests: map })
  },

  addHistory(entry) {
    set((s) => ({ history: [entry, ...s.history.filter((h) => h.id !== entry.id)].slice(0, 500) }))
  },

  async deleteHistory(id) {
    await fetcherApi.deleteHistory(id)
    set((s) => ({ history: s.history.filter((h) => h.id !== id) }))
  },

  async clearHistory() {
    await fetcherApi.clearHistory()
    set({ history: [], sessionRequests: new Map() })
  },

  async createCollection(name, parentId) {
    const c = await fetcherApi.createCollection(name, parentId)
    set((s) => ({ collections: [...s.collections, c] }))
    return c
  },
  async updateCollection(id, patch) {
    const c = await fetcherApi.updateCollection(id, patch)
    set((s) => ({ collections: replaceById(s.collections, c) }))
  },
  async deleteCollection(id) {
    await fetcherApi.deleteCollection(id)
    // Cascade deletes touch many rows, so re-read the workspace instead of patching lists piecemeal.
    const ws = await fetcherApi.workspace()
    set({ collections: ws.collections, requests: ws.requests })
  },
  async duplicateCollection(id) {
    const created = await fetcherApi.duplicateCollection(id)
    set((s) => ({ collections: [...s.collections, ...created.collections], requests: [...s.requests, ...created.requests] }))
  },

  async createRequest(name, collectionId, data) {
    const r = await fetcherApi.createRequest(name, collectionId, data)
    set((s) => ({ requests: [...s.requests, r] }))
    return r
  },
  async updateRequest(id, patch) {
    const r = await fetcherApi.updateRequest(id, patch)
    set((s) => ({ requests: replaceById(s.requests, r) }))
    return r
  },
  async deleteRequest(id) {
    await fetcherApi.deleteRequest(id)
    set((s) => ({ requests: s.requests.filter((r) => r.id !== id) }))
  },
  async duplicateRequest(id) {
    const r = await fetcherApi.duplicateRequest(id)
    set((s) => ({ requests: [...s.requests, r] }))
    return r
  },

  async createEnvironment(name, variables) {
    const e = await fetcherApi.createEnvironment(name, variables)
    set((s) => ({ environments: [...s.environments, e] }))
    return e
  },
  async updateEnvironment(id, name, variables) {
    const e = await fetcherApi.updateEnvironment(id, name, variables)
    set((s) => ({ environments: replaceById(s.environments, e) }))
    return e
  },
  async deleteEnvironment(id) {
    await fetcherApi.deleteEnvironment(id)
    set((s) => ({ environments: s.environments.filter((e) => e.id !== id) }))
  },
  async duplicateEnvironment(id) {
    const e = await fetcherApi.duplicateEnvironment(id)
    set((s) => ({ environments: [...s.environments, e] }))
    return e
  },

  async applyImport(result, parentId) {
    const res = await fetcherApi.importBulk({ parentId, root: result.folder, requests: result.requests, environment: result.environment })
    set((s) => ({
      collections: [...s.collections, ...res.collections],
      requests: [...s.requests, ...res.requests],
      environments: res.environment ? [...s.environments, res.environment] : s.environments,
    }))
    return { requests: res.requests.length, collections: res.collections.length, environmentId: res.environment?.id ?? null }
  },
}))

export function historyEntryFor(def: RequestDef, id: string, o: { status: number | null; statusText: string | null; durationMs: number | null; sizeBytes: number | null; errorCode: string | null; errorMessage: string | null; environmentId: string | null }): HistoryEntry {
  return { id, method: def.method, url: redactUrl(def.url), createdAt: new Date().toISOString(), ...o }
}
