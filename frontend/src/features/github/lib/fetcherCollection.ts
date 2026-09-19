import type { ImportResult, RequestDef } from '@/features/api-fetcher/types'
import { newKv, newRequest, syncParamsFromUrl } from '@/features/api-fetcher/lib/request'

const HEADERS = (accept = 'application/vnd.github+json') => [
  newKv('Accept', accept),
  newKv('X-GitHub-Api-Version', '2022-11-28'),
  // Off by default — public data needs no token. Turn it on after adding GITHUB_TOKEN to an environment.
  { ...newKv('Authorization', 'Bearer {{GITHUB_TOKEN}}', false), description: 'Enable and set GITHUB_TOKEN in an environment for 5,000 requests/hour' },
]

function req(name: string, path: string, opts: { accept?: string } = {}): RequestDef {
  const url = `https://api.github.com${path}`
  return newRequest({ name, method: 'GET', url, params: syncParamsFromUrl(url, []), headers: HEADERS(opts.accept) })
}

/**
 * The REST calls that back the explorer's tabs, as a ready-to-send API Fetcher collection.
 * Only GETs against api.github.com — nothing here writes to GitHub.
 */
export function githubCollection(owner: string, repo: string, defaultBranch: string): ImportResult {
  const base = `/repos/${owner}/${repo}`
  const requests: RequestDef[] = [
    req('Get repository', base),
    req('Languages', `${base}/languages`),
    req('README (raw)', `${base}/readme`, { accept: 'application/vnd.github.raw+json' }),
    req('List commits', `${base}/commits?per_page=10`),
    req('List open issues', `${base}/issues?state=open&per_page=10`),
    req('List open pull requests', `${base}/pulls?state=open&per_page=10`),
    req('Repository contents (root)', `${base}/contents`),
    req('Git tree (recursive)', `${base}/git/trees/${defaultBranch}?recursive=1`),
    req('Latest release', `${base}/releases/latest`),
    req('Top contributors', `${base}/contributors?per_page=10`),
    req('Rate limit status', '/rate_limit'),
  ]
  return {
    folder: { name: `GitHub · ${owner}/${repo}`, requests, folders: [] },
    summary: `${requests.length} requests for ${owner}/${repo}`,
    warnings: [],
  }
}
