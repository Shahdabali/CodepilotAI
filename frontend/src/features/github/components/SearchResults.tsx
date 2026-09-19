import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import { listStagger } from '@/lib/motion'
import { Button, EmptyState, Segmented } from '@/components/ui/primitives'
import { githubApi } from '../api'
import { useGithub } from '../store'
import { RepoGridSkeleton } from './Discover'
import { ErrorNotice } from './ErrorNotice'
import { RepoCard } from './RepoCard'

type Sort = 'best' | 'stars' | 'forks' | 'updated'

export function SearchResults({ query }: { query: string }) {
  const openRepo = useGithub((s) => s.openRepo)
  const [sort, setSort] = useState<Sort>('best')
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [query, sort])

  const q = useQuery({
    queryKey: ['gh', 'search', query, sort, page],
    queryFn: ({ signal }) => githubApi.search(query, sort, page, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 0,
  })

  const totalPages = q.data ? Math.min(Math.ceil(Math.min(q.data.total, 1000) / 12), 50) : 1

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Results for <span className="font-mono text-[var(--accent-text)]">{query}</span>
          </h2>
          {q.data && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{q.data.total.toLocaleString()} repositories{q.data.total > 1000 ? ' (GitHub shows the first 1,000)' : ''}</p>}
        </div>
        <Segmented
          value={sort}
          onChange={setSort}
          ariaLabel="Sort results"
          size="sm"
          options={[
            { value: 'best', label: 'Best match' },
            { value: 'stars', label: 'Most stars' },
            { value: 'updated', label: 'Recently updated' },
          ]}
        />
      </div>

      {q.isLoading ? (
        <RepoGridSkeleton count={9} />
      ) : q.error ? (
        <ErrorNotice error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState icon={<SearchX size={20} />} title="No repositories matched" description="Try fewer words, or search by topic, e.g. topic:react." />
      ) : (
        <>
          <motion.ul key={`${query}-${sort}-${page}`} variants={listStagger(0.035)} initial="hidden" animate="show" className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
            {q.data!.items.map((repo) => (
              <RepoCard key={repo.fullName} repo={repo} onOpen={() => openRepo({ owner: repo.owner.login, name: repo.name })} />
            ))}
          </motion.ul>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft size={13} /> Previous
              </Button>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {page} / {totalPages}
              </span>
              <Button size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next <ChevronRight size={13} />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
