import { create } from 'zustand'
import type { RequestDef } from './types'

export type ExportKind = 'curl' | 'request-json' | 'collection' | 'response' | 'response-body' | 'code'

interface DialogState {
  save: { open: boolean; def: RequestDef | null; collectionId: string | null; suggestedName: string }
  importOpen: boolean
  exportState: { open: boolean; kind: ExportKind; collectionId: string | null }
  shortcutsOpen: boolean
  clearConfirmOpen: boolean
  renaming: { kind: 'c' | 'r'; id: string } | null

  openSave: (opts?: { def?: RequestDef | null; collectionId?: string | null; suggestedName?: string }) => void
  closeSave: () => void
  setImportOpen: (open: boolean) => void
  openExport: (kind: ExportKind, collectionId?: string | null) => void
  closeExport: () => void
  setShortcutsOpen: (open: boolean) => void
  setClearConfirmOpen: (open: boolean) => void
  setRenaming: (r: { kind: 'c' | 'r'; id: string } | null) => void
}

export const useDialogs = create<DialogState>((set) => ({
  save: { open: false, def: null, collectionId: null, suggestedName: '' },
  importOpen: false,
  exportState: { open: false, kind: 'curl', collectionId: null },
  shortcutsOpen: false,
  clearConfirmOpen: false,
  renaming: null,

  openSave: (opts = {}) => set({ save: { open: true, def: opts.def ?? null, collectionId: opts.collectionId ?? null, suggestedName: opts.suggestedName ?? '' } }),
  closeSave: () => set((s) => ({ save: { ...s.save, open: false } })),
  setImportOpen: (importOpen) => set({ importOpen }),
  openExport: (kind, collectionId = null) => set({ exportState: { open: true, kind, collectionId } }),
  closeExport: () => set((s) => ({ exportState: { ...s.exportState, open: false } })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setClearConfirmOpen: (clearConfirmOpen) => set({ clearConfirmOpen }),
  setRenaming: (renaming) => set({ renaming }),
}))
