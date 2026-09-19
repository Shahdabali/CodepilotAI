// Mirrors backend/src/github/mappers.ts — the server sends exactly these shapes.

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

export interface UserRef {
  login: string
  avatarUrl: string
  url: string
}

export interface ReleaseSummary {
  tag: string
  name: string
  publishedAt: string
  url: string
  prerelease: boolean
}

export interface Contributor extends UserRef {
  contributions: number
}

export interface RepoOverview {
  repo: RepoSummary
  languages: Record<string, number>
  latestRelease: ReleaseSummary | null
  contributors: Contributor[]
}

export interface ReadmePayload {
  found: boolean
  name: string | null
  path: string | null
  htmlUrl: string | null
  markdown: string
}

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

export interface TreePayload {
  ref: string
  sha: string
  truncated: boolean
  capped: boolean
  entries: TreeEntry[]
}

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
  maxBytes: number
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

export interface Paged<T> {
  page: number
  hasMore: boolean
  items: T[]
}

export interface SearchPayload {
  total: number
  incomplete: boolean
  page: number
  items: RepoSummary[]
}

export interface GithubStatus {
  reachable: boolean
  authenticated: boolean
  tokenConfigured: boolean
  tokenSource: string | null
  tokenRejected: boolean
  rate: { limit: number; remaining: number; reset: number; resource?: string } | null
}

export type IssueState = 'open' | 'closed' | 'all'
