import React from 'react'
import { motion } from 'framer-motion'
import { GitFork, Star } from 'lucide-react'
import { fadeUp } from '@/lib/motion'
import { Badge } from '@/components/ui/primitives'
import { compactNumber, languageColor, timeAgo } from '../lib/format'
import type { RepoSummary } from '../types'

export function RepoCard({ repo, onOpen }: { repo: RepoSummary; onOpen: () => void }) {
  return (
    <motion.li variants={fadeUp}>
      <button
        type="button"
        onClick={onOpen}
        className="cp-lift flex h-full w-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left hover:border-[var(--border-strong)]"
      >
        <span className="flex items-center gap-2.5">
          <img src={repo.owner.avatarUrl} alt="" width={22} height={22} loading="lazy" className="h-[22px] w-[22px] rounded-full bg-[var(--bg-card)]" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--text-primary)]">
            <span className="font-normal text-[var(--text-secondary)]">{repo.owner.login}/</span>
            {repo.name}
          </span>
          {repo.archived && <Badge tone="warning">archived</Badge>}
        </span>
        <span className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--text-secondary)]">{repo.description ?? 'No description provided.'}</span>
        <span className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-[var(--text-muted)]">
          {repo.language && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: languageColor(repo.language) }} aria-hidden />
              {repo.language}
            </span>
          )}
          <span className="flex items-center gap-1" title={`${repo.stars.toLocaleString()} stars`}>
            <Star size={12} /> {compactNumber(repo.stars)}
          </span>
          <span className="flex items-center gap-1" title={`${repo.forks.toLocaleString()} forks`}>
            <GitFork size={12} /> {compactNumber(repo.forks)}
          </span>
          {repo.pushedAt && <span>updated {timeAgo(repo.pushedAt)}</span>}
        </span>
      </button>
    </motion.li>
  )
}
