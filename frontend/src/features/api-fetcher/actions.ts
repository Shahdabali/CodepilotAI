import type { HistoryEntry, RequestDef, SavedRequest } from './types'
import { useDataStore } from './data.store'
import { useDialogs } from './dialogs.store'
import { fetcherApi } from './lib/client'
import { containsRedactionMarker } from './lib/redact'
import { displayName, normalizeRequest } from './lib/request'
import { isDraftDirty, useSession } from './session.store'
import { toast, errorMessage } from './toast'

export function suggestName(def: RequestDef): string {
  return def.name.trim() || displayName({ name: '', method: def.method, url: def.url.replace(/^\{\{[^}]+\}\}/, '') }).replace(/^\//, '') || 'New request'
}

/** Save button / Ctrl+S: updates an existing saved request in place, otherwise asks where to save it. */
export async function saveCurrent(): Promise<void> {
  const { draft, savedId, markSaved } = useSession.getState()
  const data = useDataStore.getState()
  if (savedId && data.requests.some((r) => r.id === savedId)) {
    try {
      const name = draft.name.trim() || suggestName(draft)
      const saved = await data.updateRequest(savedId, { name, data: { ...draft, name } })
      markSaved(savedId, { ...draft, name: saved.name })
      toast.success('Request saved', saved.name)
    } catch (e) {
      toast.error('Could not save request', errorMessage(e))
    }
    return
  }
  useDialogs.getState().openSave({ suggestedName: suggestName(draft) })
}

export function openSavedRequest(req: SavedRequest): void {
  const s = useSession.getState()
  const go = () => useSession.getState().openRequest({ ...normalizeRequest(req.data as never), name: req.name }, req.id)
  if (isDraftDirty(s) && s.savedId !== req.id) {
    toast.info('Opened “' + req.name + '”', 'Your unsaved changes to the previous request were replaced.', { label: 'Undo', run: () => useSession.getState().openRequest(s.draft, s.savedId) })
  }
  go()
}

export async function runSavedRequest(req: SavedRequest): Promise<void> {
  openSavedRequest(req)
  await useSession.getState().send()
}

/** History items keep credentials out of the database; a session copy (if any) preserves them for re-running. */
export async function loadHistoryRequest(entry: HistoryEntry): Promise<{ def: RequestDef; redacted: boolean } | null> {
  const data = useDataStore.getState()
  const full = data.sessionRequests.get(entry.id)
  if (full) return { def: structuredClone(full), redacted: false }
  try {
    const { request } = await fetcherApi.historyRequest(entry.id)
    const def = normalizeRequest(request as never)
    return { def, redacted: containsRedactionMarker(def) }
  } catch (e) {
    toast.error('Could not load history entry', errorMessage(e))
    return null
  }
}

export async function editFromHistory(entry: HistoryEntry, thenSend = false): Promise<void> {
  const loaded = await loadHistoryRequest(entry)
  if (!loaded) return
  useSession.getState().openRequest(loaded.def, null)
  if (loaded.redacted) {
    toast.warning('Credentials were not stored', 'History never keeps secrets. Re-enter them or use {{variables}}, then send.')
    return
  }
  if (thenSend) await useSession.getState().send()
}

export async function saveHistoryToCollection(entry: HistoryEntry): Promise<void> {
  const loaded = await loadHistoryRequest(entry)
  if (!loaded) return
  useDialogs.getState().openSave({ def: loaded.def, suggestedName: suggestName(loaded.def) })
}
