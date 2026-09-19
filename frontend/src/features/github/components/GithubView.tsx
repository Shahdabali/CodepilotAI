import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Github, KeyRound, Search, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { useNow } from '@/hooks/useNow'
import { githubApi } from '../api'
import { parseRepoInput } from '../lib/parse'
import { useGithub } from '../store'
import { Discover } from './Discover'
import { RepoPage } from './RepoPage'
import { SearchResults } from './SearchResults'

function StatusPill() {
  const status = useQuery({
    queryKey: ['gh', 'status'],
    queryFn: ({ signal }) => githubApi.status(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 0,
  })
  const now = useNow(!!status.data?.rate && status.data.rate.remaining === 0, 1000)
  const s = status.data

  if (status.isLoading) return null
  if (!s) return null
  if (!s.reachable) {
    return <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--warning)]">GitHub unreachable</span>
  }

  const rate = s.rate
  const label = rate ? `${rate.remaining.toLocaleString()} / ${rate.limit.toLocaleString()} requests left` : 'Rate limit unknown'
  const low = !!rate && rate.remaining <= Math.max(5, rate.limit * 0.1)
  const resetIn = rate && rate.remaining === 0 ? Math.max(0, Math.round(rate.reset - now / 1000)) : null

  return (
    <div className="flex items-center gap-2">
      <span
        className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
        title={s.authenticated ? `Authenticated with ${s.tokenSource}` : s.tokenRejected ? `${s.tokenSource} was rejected by GitHub — using anonymous access` : 'Anonymous access — set GITHUB_TOKEN on the server for a higher limit'}
      >
        {s.authenticated ? <KeyRound size={11} className="text-[var(--success)]" /> : <ShieldAlert size={11} className={s.tokenRejected ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'} />}
        {s.authenticated ? 'Signed in' : s.tokenRejected ? 'Token rejected' : 'Anonymous'}
        <span aria-hidden className="text-[var(--text-muted)]">
          ·
        </span>
        <span className={low ? 'font-semibold text-[var(--warning)]' : ''}>{resetIn !== null ? `resets in ${Math.ceil(resetIn / 60)} min` : label}</span>
      </span>
    </div>
  )
}

/** Entry point of the GitHub Explorer (lazy-loaded by the app shell). */
export default function GithubView() {
  const repo = useGithub((s) => s.repo)
  const search = useGithub((s) => s.search)
  const open = useGithub((s) => s.open)
  const [input, setInput] = useState('')

  // Keep the box in step with what is open (e.g. when a repository is opened from the Home screen).
  useEffect(() => {
    if (repo) setInput(`${repo.owner}/${repo.name}`)
    else if (search) setInput(search)
  }, [repo, search])

  const parsed = parseRepoInput(input)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (parsed.kind !== 'empty') open(input)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)]">
            <Github size={17} />
          </span>
          <h1 className="text-[15px] font-semibold text-[var(--text-primary)]">GitHub Explorer</h1>
        </div>

        <form onSubmit={submit} role="search" className="flex min-w-[260px] flex-1 items-center gap-2 sm:max-w-xl">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Repository, GitHub URL or search terms</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="owner/repo, a GitHub URL, or search terms…"
              spellCheck={false}
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-9 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
          </label>
          <Button type="submit" variant="primary" disabled={parsed.kind === 'empty'}>
            {parsed.kind === 'repo' ? 'Open' : 'Search'}
          </Button>
        </form>

        <div className="ml-auto">
          <StatusPill />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {repo ? <RepoPage key={`${repo.owner}/${repo.name}`} target={repo} /> : search ? <SearchResults query={search} /> : <Discover />}
      </div>
    </div>
  )
}
