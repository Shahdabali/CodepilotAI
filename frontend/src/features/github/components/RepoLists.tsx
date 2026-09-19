import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, CircleDot, Copy, GitCommit, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, MessageSquare } from 'lucide-react'
import { fadeUp, listStagger } from '@/lib/motion'
import { Badge, Button, EmptyState, Segmented, Skeleton } from '@/components/ui/primitives'
import { githubApi } from '../api'
import { timeAgo } from '../lib/format'
import type { CommitSummary, IssueState, IssueSummary } from '../types'
import { ErrorNotice } from './ErrorNotice'

function Avatar({ url, name }: { url?: string; name: string }) {
  return url ? (
    <img src={url} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 shrink-0 rounded-full bg-[var(--bg-card)]" />
  ) : (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card)] text-[10px] font-semibold text-[var(--text-muted)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-busy>
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="h-[58px]" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  )
}

function CopySha({ sha }: { sha: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(sha).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }, () => {})
      }}
      title="Copy full commit hash"
      aria-label={`Copy commit hash ${sha.slice(0, 7)}`}
      className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
    >
      {sha.slice(0, 7)}
      {copied ? <Check size={11} className="text-[var(--success)]" /> : <Copy size={11} />}
    </button>
  )
}

export function CommitsList({ owner, repo, refName }: { owner: string; repo: string; refName: string }) {
  const q = useInfiniteQuery({
    queryKey: ['gh', 'commits', owner, repo, refName],
    queryFn: ({ pageParam, signal }) => githubApi.commits(owner, repo, { sha: refName, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 60_000,
    retry: 0,
  })

  if (q.isLoading) return <ListSkeleton />
  if (q.error && !q.data) return <ErrorNotice error={q.error} onRetry={() => q.refetch()} compact />
  const commits: CommitSummary[] = q.data?.pages.flatMap((p) => p.items) ?? []
  if (commits.length === 0) return <EmptyState icon={<GitCommit size={20} />} title="No commits" description="This branch has no commit history." />

  return (
    <div className="p-4">
      <motion.ul key={`${owner}/${repo}`} variants={listStagger(0.02)} initial="hidden" animate="show" className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {commits.map((c) => (
          <motion.li key={c.sha} variants={fadeUp} className="flex items-start gap-3 px-4 py-3">
            <Avatar url={c.author?.avatarUrl} name={c.authorName} />
            <div className="min-w-0 flex-1">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13.5px] font-medium text-[var(--text-primary)] hover:text-[var(--accent-text)] hover:underline" title={c.title}>
                {c.title || '(no message)'}
              </a>
              <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                {c.authorName} committed {timeAgo(c.date)}
              </p>
            </div>
            <CopySha sha={c.sha} />
          </motion.li>
        ))}
      </motion.ul>
      {q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
            Load more commits
          </Button>
        </div>
      )}
      {q.error && <ErrorNotice error={q.error} onRetry={() => q.fetchNextPage()} compact />}
    </div>
  )
}

function IssueIcon({ issue }: { issue: IssueSummary }) {
  if (!issue.isPullRequest) return <CircleDot size={16} className={issue.state === 'open' ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'} />
  if (issue.merged) return <GitMerge size={16} className="text-[var(--accent-text)]" />
  if (issue.draft) return <GitPullRequestDraft size={16} className="text-[var(--text-muted)]" />
  return issue.state === 'open' ? <GitPullRequest size={16} className="text-[var(--success)]" /> : <GitPullRequestClosed size={16} className="text-[var(--danger)]" />
}

export function IssuesList({ owner, repo, kind }: { owner: string; repo: string; kind: 'issue' | 'pr' }) {
  const [state, setState] = useState<IssueState>('open')
  const q = useInfiniteQuery({
    queryKey: ['gh', 'issues', owner, repo, kind, state],
    queryFn: ({ pageParam, signal }) => githubApi.issues(owner, repo, kind, state, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 60_000,
    retry: 0,
  })

  const items: IssueSummary[] = q.data?.pages.flatMap((p) => p.items) ?? []
  const noun = kind === 'pr' ? 'pull request' : 'issue'

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Segmented
          value={state}
          onChange={setState}
          ariaLabel={`${noun} state`}
          size="sm"
          options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]}
        />
      </div>

      {q.isLoading ? (
        <ListSkeleton />
      ) : q.error && !q.data ? (
        <ErrorNotice error={q.error} onRetry={() => q.refetch()} compact />
      ) : items.length === 0 ? (
        <EmptyState icon={kind === 'pr' ? <GitPullRequest size={20} /> : <CircleDot size={20} />} title={`No ${state === 'all' ? '' : state + ' '}${noun}s`} description={kind === 'issue' ? 'Nothing here — or the repository has issues turned off.' : undefined} />
      ) : (
        <>
          <motion.ul key={`${kind}-${state}`} variants={listStagger(0.02)} initial="hidden" animate="show" className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {items.map((i) => (
              <motion.li key={i.number} variants={fadeUp} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5">
                  <IssueIcon issue={i} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-medium text-[var(--text-primary)] hover:text-[var(--accent-text)] hover:underline">
                      {i.title}
                    </a>
                    {i.draft && <Badge>draft</Badge>}
                    {i.labels.slice(0, 4).map((l) => (
                      <span key={l.name} className="rounded-full border px-2 py-px text-[10.5px] font-medium" style={{ borderColor: `#${l.color}66`, color: 'var(--text-secondary)', background: `#${l.color}22` }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                    #{i.number} opened {timeAgo(i.createdAt)}
                    {i.user && <> by {i.user.login}</>}
                    {i.closedAt && <> · closed {timeAgo(i.closedAt)}</>}
                  </p>
                </div>
                {i.comments > 0 && (
                  <span className="flex items-center gap-1 text-[11.5px] text-[var(--text-muted)]" title={`${i.comments} comments`}>
                    <MessageSquare size={12} /> {i.comments}
                  </span>
                )}
              </motion.li>
            ))}
          </motion.ul>
          {q.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
