import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { parseRepoInput } from './lib/parse'

export interface OpenRepo {
  owner: string
  name: string
  /** Deep-link branch/tag (from a pasted /tree/… URL). */
  ref?: string
  /** Deep-link path to open in the file browser. */
  path?: string
}

interface GithubState {
  repo: OpenRepo | null
  /** The active free-text search, when no repository is open. */
  search: string | null
  /** Recently opened repositories ("owner/name"), newest first. Persisted. */
  recents: string[]

  /** Route whatever was typed/pasted: a repository opens, anything else becomes a search. */
  open: (input: string) => void
  openRepo: (repo: OpenRepo) => void
  openSearch: (q: string) => void
  /** Add a repository to the recents list — called once it has actually loaded. */
  remember: (fullName: string) => void
  back: () => void
  removeRecent: (fullName: string) => void
  clearRecents: () => void
}

const MAX_RECENTS = 8

export const useGithub = create<GithubState>()(
  persist(
    (set, get) => ({
      repo: null,
      search: null,
      recents: [],

      open: (input) => {
        const parsed = parseRepoInput(input)
        if (parsed.kind === 'repo') get().openRepo({ owner: parsed.owner, name: parsed.repo, ref: parsed.ref, path: parsed.path })
        else if (parsed.kind === 'search') get().openSearch(parsed.q)
      },

      // Recents are only written once the repository loads (see `remember`), so typos and 404s never pile up.
      openRepo: (repo) => set({ repo, search: null }),

      remember: (full) =>
        set((s) => ({ recents: [full, ...s.recents.filter((r) => r.toLowerCase() !== full.toLowerCase())].slice(0, MAX_RECENTS) })),

      openSearch: (q) => set({ repo: null, search: q.trim() || null }),

      back: () => set({ repo: null }),

      removeRecent: (full) => set((s) => ({ recents: s.recents.filter((r) => r !== full) })),
      clearRecents: () => set({ recents: [] }),
    }),
    {
      name: 'codepilot-github-v1',
      partialize: (s) => ({ recents: s.recents }),
    }
  )
)
