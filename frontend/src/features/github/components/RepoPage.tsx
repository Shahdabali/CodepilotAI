import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  BookOpen,
  CircleDot,
  Download,
  ExternalLink,
  Eye,
  FolderTree,
  GitBranch,
  GitCommit,
  GitFork,
  GitPullRequest,
  Link2,
  Network,
  Scale,
  Star,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fadeUp, listStagger } from '@/lib/motion'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Markdown } from '@/components/ui/Markdown'
import { Badge, Button, Skeleton, Tabs } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useUIStore } from '@/stores/ui.store'
import { useDataStore } from '@/features/api-fetcher/data.store'
import { openSavedRequest } from '@/features/api-fetcher/actions'
import { githubApi } from '../api'
import { compactNumber, languageColor, languageShares, timeAgo } from '../lib/format'
import { githubCollection } from '../lib/fetcherCollection'
import { useGithub, type OpenRepo } from '../store'
import { ErrorNotice } from './ErrorNotice'
import { FileBrowser } from './FileBrowser'
import { CommitsList, IssuesList } from './RepoLists'
import { RepoBrief } from './RepoBrief'
import type { RepoOverview } from '../types'

type Tab = 'overview' | 'files' | 'commits' | 'issues' | 'pulls'

function LanguageBar({ languages }: { languages: Record<string, number> }) {
  const shares = languageShares(languages)
  if (!shares.length) return null
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-card)]" role="img" aria-label={`Languages: ${shares.map((s) => `${s.name} ${s.percent.toFixed(1)}%`).join(', ')}`}>
        {shares.map((s, i) => (
          <motion.span
            key={s.name}
            initial={{ width: 0 }}
            animate={{ width: `${s.percent}%` }}
            transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: s.name === 'Other' ? 'var(--text-muted)' : languageColor(s.name) }}
            title={`${s.name} ${s.percent.toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--text-secondary)]">
        {shares.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.name === 'Other' ? 'var(--text-muted)' : languageColor(s.name) }} aria-hidden />
            {s.name} <span className="text-[var(--text-muted)]">{s.percent < 0.1 ? '<0.1' : s.percent.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]" title={`${value.toLocaleString()} ${label.toLowerCase()}`}>
      <span className="text-[var(--text-muted)]">{icon}</span>
      <AnimatedNumber value={value} format={(n) => compactNumber(Math.round(n))} className="font-semibold tabular-nums text-[var(--text-primary)]" />
      <span className="text-[var(--text-muted)]">{label}</span>
    </div>
  )
}

function AboutCard({ data }: { data: RepoOverview }) {
  const { repo, latestRelease, contributors } = data
  const rows: Array<[React.ReactNode, React.ReactNode, string]> = [
    [<Scale key="l" size={13} />, repo.license ?? 'No license declared', 'License'],
    [<GitBranch key="b" size={13} />, repo.defaultBranch, 'Default branch'],
    [<GitCommit key="p" size={13} />, `Pushed ${timeAgo(repo.pushedAt)}`, 'Last push'],
    [<Download key="s" size={13} />, `${(repo.sizeKb / 1024).toFixed(repo.sizeKb > 10_240 ? 0 : 1)} MB`, 'Repository size'],
  ]
  return (
    <section aria-labelledby="about-title" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h3 id="about-title" className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        About
      </h3>
      <dl className="space-y-2">
        {rows.map(([icon, value, label]) => (
          <div key={label} className="flex items-center gap-2.5 text-[13px]">
            <dt className="sr-only">{label}</dt>
            <span className="text-[var(--text-muted)]">{icon}</span>
            <dd className="text-[var(--text-secondary)]">{value}</dd>
          </div>
        ))}
        {repo.homepage && (
          <div className="flex items-center gap-2.5 text-[13px]">
            <dt className="sr-only">Website</dt>
            <span className="text-[var(--text-muted)]">
              <Link2 size={13} />
            </span>
            <dd className="min-w-0 truncate">
              <a href={/^https?:\/\//i.test(repo.homepage) ? repo.homepage : `https://${repo.homepage}`} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--accent-text)] hover:underline">
                {repo.homepage.replace(/^https?:\/\//i, '')}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {latestRelease && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Latest release</p>
          <a href={latestRelease.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] hover:text-[var(--accent-text)]">
            <Tag size={13} className="text-[var(--success)]" />
            <span className="truncate font-medium">{latestRelease.name}</span>
            {latestRelease.prerelease && <Badge tone="warning">pre</Badge>}
          </a>
          <p className="mt-0.5 pl-[21px] text-[11.5px] text-[var(--text-muted)]">{timeAgo(latestRelease.publishedAt)}</p>
        </div>
      )}

      {contributors.length > 0 && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Top contributors</p>
          <ul className="flex flex-wrap gap-1.5">
            {contributors.map((c) => (
              <li key={c.login}>
                <a href={c.url} target="_blank" rel="noopener noreferrer" title={`${c.login} · ${c.contributions.toLocaleString()} commits`}>
                  <img src={c.avatarUrl} alt={c.login} width={28} height={28} loading="lazy" className="h-7 w-7 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] transition-transform hover:scale-110" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function ReadmePane({ owner, repo, branch }: { owner: string; repo: string; branch: string }) {
  const readme = useQuery({
    queryKey: ['gh', 'readme', owner, repo],
    queryFn: ({ signal }) => githubApi.readme(owner, repo, undefined, signal),
    staleTime: 3 * 60_000,
    retry: 0,
  })

  const resolveUrl = useMemo(() => {
    const dir = readme.data?.path && readme.data.path.includes('/') ? readme.data.path.slice(0, readme.data.path.lastIndexOf('/') + 1) : ''
    return (url: string, kind: 'link' | 'image') => {
      if (/^(https?:|mailto:|#)/i.test(url)) return url
      const clean = url.replace(/^\.\//, '')
      const path = clean.startsWith('/') ? clean.slice(1) : dir + clean
      return kind === 'image' ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}` : `https://github.com/${owner}/${repo}/blob/${branch}/${path}`
    }
  }, [readme.data?.path, owner, repo, branch])

  return (
    <section aria-labelledby="readme-title" className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
        <BookOpen size={14} className="text-[var(--text-muted)]" />
        <h3 id="readme-title" className="text-[13px] font-semibold text-[var(--text-primary)]">
          {readme.data?.name ?? 'README'}
        </h3>
        {readme.data?.htmlUrl && (
          <a href={readme.data.htmlUrl} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            View on GitHub <ExternalLink size={11} />
          </a>
        )}
      </div>
      <div className="p-5 sm:p-7">
        {readme.isLoading ? (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-7 w-2/5" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${95 - ((i * 13) % 40)}%` }} />
            ))}
          </div>
        ) : readme.error ? (
          <ErrorNotice error={readme.error} onRetry={() => readme.refetch()} compact />
        ) : !readme.data?.found ? (
          <p className="text-sm text-[var(--text-muted)]">This repository has no README.</p>
        ) : (
          <Markdown text={readme.data.markdown} resolveUrl={resolveUrl} />
        )}
      </div>
    </section>
  )
}

export function RepoPage({ target }: { target: OpenRepo }) {
  const { owner, name } = target
  const back = useGithub((s) => s.back)
  const openCloneFor = useUIStore((s) => s.openCloneFor)
  const setCurrentView = useUIStore((s) => s.setCurrentView)
  const [tab, setTab] = useState<Tab>(target.path ? 'files' : 'overview')
  const [importing, setImporting] = useState(false)

  const overview = useQuery({
    queryKey: ['gh', 'overview', owner, name],
    queryFn: ({ signal }) => githubApi.overview(owner, name, signal),
    staleTime: 2 * 60_000,
    retry: 0,
  })

  useEffect(() => {
    setTab(target.path ? 'files' : 'overview')
  }, [owner, name, target.path])

  const remember = useGithub((s) => s.remember)
  const loadedName = overview.data?.repo.fullName
  useEffect(() => {
    if (loadedName) remember(loadedName)
  }, [loadedName, remember])

  const data = overview.data
  const branch = target.ref ?? data?.repo.defaultBranch ?? 'main'

  const openInFetcher = async () => {
    if (!data) return
    setImporting(true)
    try {
      const store = useDataStore.getState()
      const before = new Set(store.requests.map((r) => r.id))
      const res = await store.applyImport(githubCollection(data.repo.owner.login, data.repo.name, data.repo.defaultBranch), null)
      const created = useDataStore.getState().requests.filter((r) => !before.has(r.id))
      if (created[0]) openSavedRequest(created[0])
      setCurrentView('api-fetcher')
      toast.success('Added to API Fetcher', `${res.requests} requests for ${data.repo.fullName} are ready to send.`)
    } catch (err) {
      toast.error('Could not add the requests', (err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  if (overview.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-8" aria-busy aria-label="Loading repository">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid gap-4 pt-4 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (overview.error || !data) {
    return (
      <div className="px-6 py-8">
        <Button size="sm" variant="ghost" onClick={back}>
          <ArrowLeft size={13} /> All repositories
        </Button>
        <ErrorNotice error={overview.error} onRetry={() => overview.refetch()} />
      </div>
    )
  }

  const { repo } = data
  const tabs = [
    { value: 'overview' as const, label: <><BookOpen size={14} /> Overview</> },
    { value: 'files' as const, label: <><FolderTree size={14} /> Files</> },
    { value: 'commits' as const, label: <><GitCommit size={14} /> Commits</> },
    { value: 'issues' as const, label: <><CircleDot size={14} /> Issues</>, badge: repo.hasIssues ? <span className="rounded-full bg-[var(--bg-card)] px-1.5 font-mono text-[10.5px] text-[var(--text-muted)]">{compactNumber(repo.openIssues)}</span> : undefined },
    { value: 'pulls' as const, label: <><GitPullRequest size={14} /> Pull requests</> },
  ]

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-6">
      <Button size="sm" variant="ghost" onClick={back} className="-ml-2 mb-3 self-start">
        <ArrowLeft size={13} /> All repositories
      </Button>

      <motion.header variants={listStagger(0.05)} initial="hidden" animate="show" className="space-y-4">
        <motion.div variants={fadeUp} className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <img src={repo.owner.avatarUrl} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]" />
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
                <span className="truncate">
                  <span className="font-normal text-[var(--text-secondary)]">{repo.owner.login} / </span>
                  {repo.name}
                </span>
                <Badge>{repo.isPrivate ? 'private' : 'public'}</Badge>
                {repo.archived && <Badge tone="warning">archived</Badge>}
                {repo.fork && <Badge>fork</Badge>}
              </h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">{repo.description ?? 'No description provided.'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => openCloneFor(repo.cloneUrl)} title="Clone this repository into a CodePilot workspace">
              <GitFork size={14} /> Clone to workspace
            </Button>
            <Button onClick={() => void openInFetcher()} loading={importing} title="Create an API Fetcher collection with this repository's REST endpoints">
              <Network size={14} /> API Fetcher
            </Button>
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cp-press inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-[13px] font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
            >
              <ExternalLink size={14} /> GitHub
            </a>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat icon={<Star size={14} />} label="stars" value={repo.stars} />
          <Stat icon={<GitFork size={14} />} label="forks" value={repo.forks} />
          <Stat icon={<Eye size={14} />} label="watching" value={repo.watchers} />
          <Stat icon={<CircleDot size={14} />} label="open issues" value={repo.openIssues} />
        </motion.div>

        {repo.topics.length > 0 && (
          <motion.ul variants={fadeUp} className="flex flex-wrap gap-1.5" aria-label="Topics">
            {repo.topics.slice(0, 12).map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => useGithub.getState().openSearch(`topic:${t}`)}
                  className="rounded-full bg-[var(--accent-subtle)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent-text)] hover:brightness-125"
                >
                  {t}
                </button>
              </li>
            ))}
          </motion.ul>
        )}

        <motion.div variants={fadeUp}>
          <LanguageBar languages={data.languages} />
        </motion.div>
      </motion.header>

      <Tabs value={tab} onChange={setTab} items={tabs} ariaLabel="Repository sections" className="mt-6 overflow-x-auto" />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          role="tabpanel"
          className="pt-4"
        >
          {tab === 'overview' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <ReadmePane owner={owner} repo={name} branch={branch} />
              <div className="space-y-4">
                <RepoBrief owner={owner} repo={name} />
                <AboutCard data={data} />
              </div>
            </div>
          )}
          {tab === 'files' && (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" style={{ height: 'max(480px, calc(100vh - 11rem))' }} data-testid="file-panel">
              <FileBrowser owner={owner} repo={name} refName={branch} initialPath={target.path} rawBase={`https://raw.githubusercontent.com/${owner}/${name}/${branch}`} />
            </div>
          )}
          {tab === 'commits' && <CommitsList owner={owner} repo={name} refName={branch} />}
          {tab === 'issues' && <IssuesList owner={owner} repo={name} kind="issue" />}
          {tab === 'pulls' && <IssuesList owner={owner} repo={name} kind="pr" />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
