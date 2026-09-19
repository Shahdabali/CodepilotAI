const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

export type ParsedInput =
  | { kind: 'empty' }
  | { kind: 'repo'; owner: string; repo: string; ref?: string; path?: string }
  | { kind: 'search'; q: string }

const clean = (repo: string) => repo.replace(/\.git$/i, '')

function valid(owner: string, repo: string): boolean {
  return OWNER_RE.test(owner) && REPO_RE.test(repo) && repo !== '.' && repo !== '..'
}

/**
 * Understands what people paste: `owner/repo`, https://github.com/owner/repo(.git), a /tree/<ref>/<path> or
 * /blob/<ref>/<path> deep link, or git@github.com:owner/repo.git. Anything else is treated as a search.
 */
export function parseRepoInput(raw: string): ParsedInput {
  const input = raw.trim()
  if (!input) return { kind: 'empty' }

  // git@github.com:owner/repo.git
  const scp = input.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i)
  if (scp && valid(scp[1], clean(scp[2]))) return { kind: 'repo', owner: scp[1], repo: clean(scp[2]) }

  // URLs (with or without scheme)
  const urlMatch = input.match(/^(?:(?:https?|ssh|git):\/\/)?(?:[^@/\s]+@)?(?:www\.)?github\.com[/:]([^/\s]+)\/([^/\s?#]+)(\/[^\s?#]*)?/i)
  if (urlMatch) {
    const owner = urlMatch[1]
    const repo = clean(urlMatch[2])
    if (valid(owner, repo)) {
      const rest = (urlMatch[3] ?? '').split('/').filter(Boolean)
      if ((rest[0] === 'tree' || rest[0] === 'blob') && rest[1]) {
        return { kind: 'repo', owner, repo, ref: decodeURIComponent(rest[1]), path: rest.length > 2 ? rest.slice(2).map(decodeURIComponent).join('/') : undefined }
      }
      return { kind: 'repo', owner, repo }
    }
  }

  // owner/repo shorthand
  const short = input.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (short && valid(short[1], clean(short[2]))) return { kind: 'repo', owner: short[1], repo: clean(short[2]) }

  return { kind: 'search', q: input }
}

export function repoFullName(owner: string, repo: string): string {
  return `${owner}/${repo}`
}
