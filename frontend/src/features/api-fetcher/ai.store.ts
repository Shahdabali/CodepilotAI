import { create } from 'zustand'
import type { AiAction, ExecuteOutcome, RequestDef } from './types'
import { fetcherApi, type AiChatPayload } from './lib/client'
import { useDataStore } from './data.store'
import { useSession } from './session.store'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  error?: { code: string; message: string }
}

interface ChatState {
  messages: ChatMessage[]
  busy: boolean
  send: (opts: { action: AiAction; message?: string; label?: string; language?: string }) => Promise<void>
  stop: () => void
  clear: () => void
}

let controller: AbortController | null = null
let seq = 1

const REQUEST_ACTIONS: AiAction[] = ['convert-code', 'create-request', 'find-json-problem']

/** Snapshot of exactly what the assistant is allowed to see. The server redacts it again before prompting. */
export function buildAiContext(action: AiAction): Pick<AiChatPayload, 'request' | 'response'> {
  const s = useSession.getState()
  const outcome: ExecuteOutcome | null = s.outcome
  const request: RequestDef = REQUEST_ACTIONS.includes(action) ? s.draft : (s.sentDef ?? s.draft)
  if (!outcome) return { request }
  if (!outcome.ok) return { request, response: { error: { code: outcome.error.code, message: outcome.error.message, cause: outcome.error.cause }, durationMs: outcome.elapsedMs } }
  const r = outcome.response
  return {
    request,
    response: {
      status: r.status,
      statusText: r.statusText,
      url: r.url,
      contentType: r.contentType,
      headers: r.headers,
      bodyText: r.bodyText?.slice(0, 60_000),
      durationMs: outcome.timings.totalMs,
      sizeBytes: r.sizeBytes,
      redirects: r.redirects.map((h) => ({ url: h.url, status: h.status, location: h.location })),
    },
  }
}

export const useAiChat = create<ChatState>((set, get) => ({
  messages: [],
  busy: false,

  async send({ action, message = '', label, language }) {
    if (get().busy) return
    const userText = label ?? message
    const history = get()
      .messages.filter((m) => !m.error && m.content)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }))
    const userMsg: ChatMessage = { id: seq++, role: 'user', content: userText || 'Analyse this request' }
    const botMsg: ChatMessage = { id: seq++, role: 'assistant', content: '', streaming: true }
    set((s) => ({ messages: [...s.messages, userMsg, botMsg], busy: true }))

    controller = new AbortController()
    const ctrl = controller
    const patchBot = (fn: (m: ChatMessage) => ChatMessage) => set((s) => ({ messages: s.messages.map((m) => (m.id === botMsg.id ? fn(m) : m)) }))
    try {
      await fetcherApi.aiChat(
        { action, message, language, environmentId: useSession.getState().activeEnvId, history, ...buildAiContext(action) },
        (e) => {
          if (e.type === 'delta') patchBot((m) => ({ ...m, content: m.content + e.text }))
          else if (e.type === 'error') {
            patchBot((m) => ({ ...m, streaming: false, error: { code: e.code, message: e.message } }))
            if (e.code === 'NO_PROVIDER') void useDataStore.getState().refreshAi()
          } else if (e.type === 'done') patchBot((m) => ({ ...m, streaming: false }))
        },
        ctrl.signal
      )
      patchBot((m) => ({ ...m, streaming: false }))
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError'
      patchBot((m) => ({ ...m, streaming: false, error: aborted ? undefined : { code: 'TRANSPORT', message: err instanceof Error ? err.message : 'The assistant request failed' }, content: aborted && !m.content ? '(stopped)' : m.content }))
    } finally {
      if (controller === ctrl) controller = null
      set({ busy: false })
    }
  },

  stop: () => controller?.abort(),
  clear: () => {
    controller?.abort()
    set({ messages: [], busy: false })
  },
}))
