/** Trim GitHub's very large payloads down to what the UI shows (and nothing it could leak). */

type Json = Record<string, any>

export interface RepoSummary {
  fullName: string
  name: string
  owner: { login: string; avatarUrl: string; type: string }
  description: string | null
  htmlUrl: string
  cloneUrl: string
  homepage: string | null
  language: string | null
  stars: number
  forks: number
  watchers: number
  openIssues: number
  license: string | null
  topics: string[]
  defaultBranch: string
  sizeKb: number
  createdAt: string
  updatedAt: string
  pushedAt: string
  archived: boolean
  fork: boolean
  isPrivate: boolean
  hasIssues: boolean
}

export function mapRepo(r: Json): RepoSummary {
  return {
    fullName: String(r.full_name),
    name: String(r.name),
    owner: { login: String(r.owner?.login ?? ''), avatarUrl: String(r.owner?.avatar_url ?? ''), type: String(r.owner?.type ?? 'User') },
    description: r.description ?? null,
    htmlUrl: String(r.html_url),
    cloneUrl: String(r.clone_url ?? `${r.html_url}.git`),
    homepage: r.homepage ? String(r.homepage) : null,
    language: r.language ?? null,
    stars: Number(r.stargazers_count ?? 0),
    forks: Number(r.forks_count ?? 0),
    watchers: Number(r.subscribers_count ?? r.watchers_count ?? 0),
    openIssues: Number(r.open_issues_count ?? 0),
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? String(r.license.spdx_id) : r.license?.name ? String(r.license.name) : null,
    topics: Array.isArray(r.topics) ? r.topics.map(String) : [],
    defaultBranch: String(r.default_branch ?? 'main'),
    sizeKb: Number(r.size ?? 0),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
    pushedAt: String(r.pushed_at ?? ''),
    archived: !!r.archived,
    fork: !!r.fork,
    isPrivate: !!r.private,
    hasIssues: r.has_issues !== false,
  }
}

export interface UserRef {
  login: string
  avatarUrl: string
  url: string
}

function mapUser(u: Json | null | undefined): UserRef | null {
  if (!u) return null
  return { login: String(u.login ?? ''), avatarUrl: String(u.avatar_url ?? ''), url: String(u.html_url ?? '') }
}

export interface CommitSummary {
  sha: string
  title: string
  body: string
  author: UserRef | null
  authorName: string
  date: string
  url: string
}

export function mapCommit(c: Json): CommitSummary {
  const message = String(c.commit?.message ?? '')
  const [title, ...rest] = message.split('\n')
  return {
    sha: String(c.sha),
    title: title.slice(0, 300),
    body: rest.join('\n').trim().slice(0, 2000),
    author: mapUser(c.author),
    authorName: String(c.commit?.author?.name ?? c.author?.login ?? 'Unknown'),
    date: String(c.commit?.author?.date ?? c.commit?.committer?.date ?? ''),
    url: String(c.html_url ?? ''),
  }
}

export interface IssueSummary {
  number: number
  title: string
  state: string
  user: UserRef | null
  labels: Array<{ name: string; color: string }>
  comments: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
  url: string
  isPullRequest: boolean
  draft: boolean
  merged: boolean
}

export function mapIssue(i: Json): IssueSummary {
  return {
    number: Number(i.number),
    title: String(i.title ?? ''),
    state: String(i.state ?? 'open'),
    user: mapUser(i.user),
    labels: Array.isArray(i.labels)
      ? i.labels.map((l: Json | string) => (typeof l === 'string' ? { name: l, color: '888888' } : { name: String(l.name ?? ''), color: String(l.color ?? '888888') }))
      : [],
    comments: Number(i.comments ?? 0),
    createdAt: String(i.created_at ?? ''),
    updatedAt: String(i.updated_at ?? ''),
    closedAt: i.closed_at ?? null,
    url: String(i.html_url ?? ''),
    isPullRequest: !!i.pull_request || i.head !== undefined,
    draft: !!i.draft,
    merged: !!(i.merged_at ?? i.pull_request?.merged_at),
  }
}

export interface ReleaseSummary {
  tag: string
  name: string
  publishedAt: string
  url: string
  prerelease: boolean
}

export function mapRelease(r: Json): ReleaseSummary {
  return {
    tag: String(r.tag_name ?? ''),
    name: String(r.name || r.tag_name || ''),
    publishedAt: String(r.published_at ?? r.created_at ?? ''),
    url: String(r.html_url ?? ''),
    prerelease: !!r.prerelease,
  }
}

export interface Contributor {
  login: string
  avatarUrl: string
  url: string
  contributions: number
}

export function mapContributor(c: Json): Contributor {
  return { login: String(c.login ?? ''), avatarUrl: String(c.avatar_url ?? ''), url: String(c.html_url ?? ''), contributions: Number(c.contributions ?? 0) }
}

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

export const MAX_TREE_ENTRIES = 8000

export function mapTree(t: Json): { sha: string; truncated: boolean; capped: boolean; entries: TreeEntry[] } {
  const raw: Json[] = Array.isArray(t.tree) ? t.tree : []
  const entries: TreeEntry[] = []
  for (const e of raw) {
    // Submodules ("commit") and anything odd are not browsable here.
    if (e.type !== 'blob' && e.type !== 'tree') continue
    entries.push(e.type === 'blob' ? { path: String(e.path), type: 'blob', size: Number(e.size ?? 0) } : { path: String(e.path), type: 'tree' })
    if (entries.length >= MAX_TREE_ENTRIES) break
  }
  return { sha: String(t.sha ?? ''), truncated: !!t.truncated, capped: raw.length > MAX_TREE_ENTRIES, entries }
}

export const MAX_FILE_BYTES = 512 * 1024
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i

export interface FilePayload {
  path: string
  name: string
  size: number
  sha: string
  htmlUrl: string
  downloadUrl: string | null
  text?: string
  image?: boolean
  binary?: boolean
  tooLarge?: boolean
}

/** Turns a `/contents/{path}` file response into something the viewer can render. */
export function mapFile(c: Json): FilePayload {
  const base: FilePayload = {
    path: String(c.path),
    name: String(c.name),
    size: Number(c.size ?? 0),
    sha: String(c.sha ?? ''),
    htmlUrl: String(c.html_url ?? ''),
    downloadUrl: c.download_url ? String(c.download_url) : null,
  }
  if (IMAGE_EXT.test(base.name)) return { ...base, image: true }
  if (base.size > MAX_FILE_BYTES) return { ...base, tooLarge: true }
  if (c.encoding !== 'base64' || typeof c.content !== 'string') return { ...base, tooLarge: base.size > 0 }

  const buf = Buffer.from(c.content, 'base64')
  const probe = buf.subarray(0, 8000)
  if (probe.includes(0)) return { ...base, binary: true }
  return { ...base, text: buf.toString('utf8') }
}
