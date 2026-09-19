import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiAction, AuthConfig, ExecOptions, ExecuteOutcome, HttpMethod, KeyValue, RequestBody, RequestDef } from './types'
import { fetcherApi } from './lib/client'
import { applyParamsToUrl, newRequest, normalizeRequest, snapshotOf, syncParamsFromUrl } from './lib/request'
import type { LangId } from './lib/codegen'
import type { TypeTarget } from './lib/typegen'
import { hasLiteralSecrets, redactRequest } from './lib/redact'
import { historyEntryFor, useDataStore } from './data.store'
import { toast, errorMessage } from './toast'

export type Section = 'workspace' | 'environments' | 'settings'
export type Panel = 'history' | 'saved' | 'collections' | null
export type RequestTab = 'params' | 'headers' | 'body' | 'auth' | 'settings'
export type LowerTab = 'response' | 'diagnostics' | 'code' | 'types'

export type Prefs = ExecOptions

export const DEFAULT_PREFS: Prefs = { timeoutMs: 30_000, followRedirects: true, maxRedirects: 10, insecureTls: false }

export interface AiRequest {
  action: AiAction
  message?: string
  language?: string
  nonce: number
}

interface SessionState {
  draft: RequestDef
  savedId: string | null
  savedSnapshot: string | null

  sending: boolean
  sendStartedAt: number | null
  outcome: ExecuteOutcome | null
  sentDef: RequestDef | null
  transportError: string | null

  section: Section
  panel: Panel
  requestTab: RequestTab
  lowerTab: LowerTab
  aiOpen: boolean
  activeEnvId: string | null
  prefs: Prefs
  codeLang: LangId
  typeTarget: TypeTarget
  aiRequest: AiRequest | null
  searchOpen: boolean

  setMethod: (m: HttpMethod) => void
  setUrl: (url: string) => void
  setParams: (params: KeyValue[]) => void
  setHeaders: (headers: KeyValue[]) => void
  patchBody: (patch: Partial<RequestBody>) => void
  setAuth: (auth: AuthConfig) => void
  setName: (name: string) => void
  patchDraft: (patch: Partial<RequestDef>) => void

  newDraft: () => void
  openRequest: (def: RequestDef, savedId?: string | null) => void
  markSaved: (savedId: string, def: RequestDef) => void
  duplicateDraft: () => void
  syncSaved: () => void

  send: () => Promise<void>
  cancel: () => void

  setSection: (s: Section) => void
  setPanel: (p: Panel) => void
  togglePanel: (p: Exclude<Panel, null>) => void
  setRequestTab: (t: RequestTab) => void
  setLowerTab: (t: LowerTab) => void
  setAiOpen: (open: boolean) => void
  setActiveEnv: (id: string | null) => void
  setPrefs: (p: Partial<Prefs>) => void
  setCodeLang: (l: LangId) => void
  setTypeTarget: (t: TypeTarget) => void
  askAi: (r: Omit<AiRequest, 'nonce'>) => void
  clearAiRequest: () => void
  setSearchOpen: (open: boolean) => void
}

let controller: AbortController | null = null
let nonce = 1

export const isDraftDirty = (s: Pick<SessionState, 'draft' | 'savedSnapshot'>): boolean => snapshotOf(s.draft) !== (s.savedSnapshot ?? snapshotOf(newRequest()))

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      draft: newRequest(),
      savedId: null,
      savedSnapshot: null,

      sending: false,
      sendStartedAt: null,
      outcome: null,
      sentDef: null,
      transportError: null,

      section: 'workspace',
      panel: null,
      requestTab: 'params',
      lowerTab: 'response',
      aiOpen: false,
      activeEnvId: null,
      prefs: DEFAULT_PREFS,
      codeLang: 'js-fetch',
      typeTarget: 'ts-interface',
      aiRequest: null,
      searchOpen: false,

      setMethod: (method) => set((s) => ({ draft: { ...s.draft, method } })),
      setUrl: (url) => set((s) => ({ draft: { ...s.draft, url, params: syncParamsFromUrl(url, s.draft.params) } })),
      setParams: (params) => set((s) => ({ draft: { ...s.draft, params, url: applyParamsToUrl(s.draft.url, params) } })),
      setHeaders: (headers) => set((s) => ({ draft: { ...s.draft, headers } })),
      patchBody: (patch) => set((s) => ({ draft: { ...s.draft, body: { ...s.draft.body, ...patch } } })),
      setAuth: (auth) => set((s) => ({ draft: { ...s.draft, auth } })),
      setName: (name) => set((s) => ({ draft: { ...s.draft, name } })),
      patchDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),

      newDraft: () => set({ draft: newRequest(), savedId: null, savedSnapshot: null, outcome: null, sentDef: null, transportError: null, requestTab: 'params', lowerTab: 'response' }),

      openRequest: (def, savedId = null) => {
        const draft = normalizeRequest(def as never)
        set({
          draft,
          savedId,
          savedSnapshot: savedId ? snapshotOf(draft) : null,
          outcome: null,
          sentDef: null,
          transportError: null,
          section: 'workspace',
          lowerTab: 'response',
        })
      },

      markSaved: (savedId, def) => set({ savedId, savedSnapshot: snapshotOf(def), draft: { ...def, id: savedId } }),

      duplicateDraft: () =>
        set((s) => ({
          draft: normalizeRequest({ ...s.draft, id: undefined, name: s.draft.name ? `${s.draft.name} copy` : '' } as never),
          savedId: null,
          savedSnapshot: null,
        })),

      syncSaved: () => {
        const { savedId, draft } = get()
        if (!savedId) return
        const saved = useDataStore.getState().requests.find((r) => r.id === savedId)
        if (!saved) set({ savedId: null, savedSnapshot: null })
        else set({ savedSnapshot: snapshotOf({ ...normalizeRequest(saved.data as never), name: saved.name }), draft: { ...draft, id: savedId } })
      },

      async send() {
        const s = get()
        if (s.sending) return
        const def = s.draft
        if (!def.url.trim()) {
          toast.warning('Enter a URL first', 'Type an endpoint such as https://api.example.com/users.')
          return
        }
        controller = new AbortController()
        const ctrl = controller
        set({ sending: true, sendStartedAt: Date.now(), outcome: null, transportError: null, sentDef: structuredClone(def), lowerTab: 'response' })
        try {
          const outcome = await fetcherApi.execute(def, s.activeEnvId, { timeoutMs: s.prefs.timeoutMs, followRedirects: s.prefs.followRedirects, maxRedirects: s.prefs.maxRedirects, insecureTls: s.prefs.insecureTls }, ctrl.signal)
          if (controller !== ctrl) return
          set({ outcome, sending: false })
          if (outcome.historyId) {
            const data = useDataStore.getState()
            data.rememberSent(outcome.historyId, def)
            data.addHistory(
              historyEntryFor(def, outcome.historyId, {
                status: outcome.ok ? outcome.response.status : null,
                statusText: outcome.ok ? outcome.response.statusText : null,
                durationMs: outcome.ok ? outcome.timings.totalMs : outcome.elapsedMs,
                sizeBytes: outcome.ok ? outcome.response.sizeBytes : null,
                errorCode: outcome.ok ? null : outcome.error.code,
                errorMessage: outcome.ok ? null : outcome.error.message,
                environmentId: s.activeEnvId,
              })
            )
          }
        } catch (e) {
          if (controller !== ctrl) return
          if ((e as Error).name === 'AbortError') {
            set({ sending: false, outcome: null, sentDef: null })
            toast.info('Request cancelled')
          } else {
            set({ sending: false, transportError: errorMessage(e) })
          }
        } finally {
          if (controller === ctrl) controller = null
        }
      },

      cancel: () => {
        controller?.abort()
      },

      setSection: (section) => set({ section }),
      setPanel: (panel) => set({ panel }),
      togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p, section: 'workspace' })),
      setRequestTab: (requestTab) => set({ requestTab }),
      setLowerTab: (lowerTab) => set({ lowerTab }),
      setAiOpen: (aiOpen) => set({ aiOpen }),
      setActiveEnv: (activeEnvId) => set({ activeEnvId }),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setCodeLang: (codeLang) => set({ codeLang }),
      setTypeTarget: (typeTarget) => set({ typeTarget }),
      askAi: (r) => set({ aiOpen: true, aiRequest: { ...r, nonce: nonce++ } }),
      clearAiRequest: () => set({ aiRequest: null }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
    }),
    {
      name: 'codepilot-api-fetcher-v1',
      version: 1,
      // Literal credentials are blanked before anything reaches localStorage.
      partialize: (s) => ({
        draft: hasLiteralSecrets(s.draft) ? redactRequest(s.draft, '') : s.draft,
        savedId: s.savedId,
        panel: s.panel,
        requestTab: s.requestTab,
        lowerTab: s.lowerTab,
        aiOpen: s.aiOpen,
        activeEnvId: s.activeEnvId,
        prefs: s.prefs,
        codeLang: s.codeLang,
        typeTarget: s.typeTarget,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SessionState>
        return {
          ...current,
          ...p,
          draft: p.draft ? normalizeRequest(p.draft as never) : current.draft,
          prefs: { ...DEFAULT_PREFS, ...(p.prefs ?? {}) },
          section: 'workspace',
        }
      },
    }
  )
)
