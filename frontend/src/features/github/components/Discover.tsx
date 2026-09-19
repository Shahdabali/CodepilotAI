import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Clock, Flame, X } from 'lucide-react'
import { fadeUp, listStagger } from '@/lib/motion'
import { Skeleton } from '@/components/ui/primitives'
import { githubApi } from '../api'
import { useGithub } from '../store'
import { ErrorNotice } from './ErrorNotice'
import { RepoCard } from './RepoCard'

const TOPICS = ['typescript', 'python', 'rust', 'golang', 'react', 'llm', 'cli', 'devtools']

export function RepoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[132px]" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  )
}

export function Discover() {
  const recents = useGithub((s) => s.recents)
  const open = useGithub((s) => s.open)
  const openSearch = useGithub((s) => s.openSearch)
  const removeRecent = useGithub((s) => s.removeRecent)
  const openRepo = useGithub((s) => s.openRepo)

  // "Trending": repositories created in the last week, most starred first (real data from the GitHub search API).
  const since = useMemo(() => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), [])
  const trending = useQuery({
    queryKey: ['gh', 'trending', since],
    queryFn: ({ signal }) => githubApi.search(`created:>${since}`, 'stars', 1, signal),
    staleTime: 10 * 60_000,
    retry: 0,
  })

  return (
    <motion.div variants={listStagger(0.06)} initial="hidden" animate="show" className="mx-auto max-w-5xl space-y-9 px-6 py-8">
      <motion.div variants={fadeUp}>
        <h2 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Understand any repository in minutes</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Paste a GitHub URL or <span className="font-mono text-[var(--text-primary)]">owner/repo</span> above. Read the README, browse the code, scan commits and issues, get an AI briefing — then clone it into a
          workspace or turn its API into a ready-to-send collection.
        </p>
      </motion.div>

      {recents.length > 0 && (
        <motion.section variants={fadeUp} aria-labelledby="gh-recent">
          <h3 id="gh-recent" className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Clock size={12} /> Recently opened
          </h3>
          <ul className="flex flex-wrap gap-2">
            {recents.map((full) => (
              <li key={full} className="group flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]">
                <button type="button" onClick={() => open(full)} className="rounded-l-full py-1.5 pl-3.5 pr-2 font-mono text-xs text-[var(--text-primary)]">
                  {full}
                </button>
                <button type="button" onClick={() => removeRecent(full)} aria-label={`Remove ${full} from recents`} className="mr-1 flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      <motion.section variants={fadeUp} aria-labelledby="gh-topics">
        <h3 id="gh-topics" className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Browse by topic
        </h3>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => openSearch(`topic:${t}`)}
              className="cp-press rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            >
              {t}
            </button>
          ))}
        </div>
      </motion.section>

      <motion.section variants={fadeUp} aria-labelledby="gh-trending">
        <h3 id="gh-trending" className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          <Flame size={12} className="text-[var(--warning)]" /> New and rising this week
        </h3>
        {trending.isLoading ? (
          <RepoGridSkeleton />
        ) : trending.error ? (
          <ErrorNotice error={trending.error} onRetry={() => trending.refetch()} compact />
        ) : (
          <motion.ul variants={listStagger(0.04)} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {trending.data!.items.slice(0, 9).map((repo) => (
              <RepoCard key={repo.fullName} repo={repo} onOpen={() => openRepo({ owner: repo.owner.login, name: repo.name })} />
            ))}
          </motion.ul>
        )}
      </motion.section>
    </motion.div>
  )
}
