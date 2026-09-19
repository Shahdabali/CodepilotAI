import type { CommitSummary, IssueSummary, RepoSummary, TreeEntry } from './mappers.js'

export const BRIEF_SYSTEM_PROMPT = [
  'You are a senior engineer writing a briefing on an open-source repository for a developer who is about to work with it.',
  'Use ONLY the facts provided in the user message (repository metadata, README excerpt, file tree, recent commits, open issues).',
  'Never invent files, commands, features or APIs. If something is not evident from the context, say it is not evident.',
  'Cite real file paths from the tree in backticks. Be concrete and concise. Output GitHub-flavored markdown with exactly these sections:',
  '## What it is',
  '## Tech stack',
  '## How it is organised',
  '## Getting started',
  '## Where to contribute',
  'Keep the whole briefing under 450 words.',
].join('\n')

export interface BriefContext {
  repo: RepoSummary
  languages: Record<string, number>
  readme: string
  tree: { entries: TreeEntry[]; truncated: boolean } | null
  commits: CommitSummary[]
  issues: IssueSummary[]
}

const README_CHARS = 9000
const TREE_LINES = 160

function languageShares(languages: Record<string, number>): string {
  const total = Object.values(languages).reduce((a, b) => a + b, 0)
  if (!total) return 'unknown'
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => `${name} ${Math.round((bytes / total) * 100)}%`)
    .join(', ')
}

/** Keep the top of the tree (shallow paths first) so the model sees the layout without thousands of files. */
function treeOutline(tree: BriefContext['tree']): string {
  if (!tree) return '(file tree unavailable)'
  const noise = /(^|\/)(node_modules|dist|build|vendor|\.git|__pycache__)(\/|$)/
  const shallow = tree.entries
    .filter((e) => !noise.test(e.path))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
    .slice(0, TREE_LINES)
    .map((e) => (e.type === 'tree' ? `${e.path}/` : e.path))
  const more = tree.entries.length - shallow.length
  return `${shallow.join('\n')}${more > 0 ? `\n… and ${more} more entries` : ''}${tree.truncated ? '\n(GitHub truncated this tree)' : ''}`
}

export function buildBriefPrompt(ctx: BriefContext): string {
  const { repo } = ctx
  const readme = ctx.readme.length > README_CHARS ? `${ctx.readme.slice(0, README_CHARS)}\n…(README truncated)` : ctx.readme
  return [
    `Repository: ${repo.fullName}`,
    `Description: ${repo.description ?? '(none)'}`,
    `Primary language: ${repo.language ?? 'unknown'}; languages by size: ${languageShares(ctx.languages)}`,
    `Stars ${repo.stars}, forks ${repo.forks}, open issues ${repo.openIssues}, license ${repo.license ?? 'none declared'}, default branch ${repo.defaultBranch}`,
    repo.topics.length ? `Topics: ${repo.topics.join(', ')}` : '',
    repo.archived ? 'NOTE: this repository is archived (read-only).' : '',
    '',
    '── README ──',
    readme || '(no README)',
    '',
    '── File tree (shallowest first) ──',
    treeOutline(ctx.tree),
    '',
    '── Recent commits ──',
    ctx.commits.length ? ctx.commits.map((c) => `- ${c.title} (${c.authorName}, ${c.date.slice(0, 10)})`).join('\n') : '(none)',
    '',
    '── Open issues ──',
    ctx.issues.length ? ctx.issues.map((i) => `- #${i.number} ${i.title}${i.labels.length ? ` [${i.labels.map((l) => l.name).join(', ')}]` : ''}`).join('\n') : '(none)',
  ]
    .filter((line) => line !== null)
    .join('\n')
}
