import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { aiRouter } from '../ai/router.js'
import { sanitizeProviderError } from '../api-fetcher/ai-assistant.js'
import {
  GithubError,
  assertRef,
  assertRepoRef,
  encodeRepoPath,
  ghGetJson,
  ghGetText,
  lastRateLimit,
  tokenState,
  type RateLimit,
} from './client.js'
import {
  MAX_FILE_BYTES,
  mapCommit,
  mapContributor,
  mapFile,
  mapIssue,
  mapRelease,
  mapRepo,
  mapTree,
} from './mappers.js'
import { buildBriefPrompt, BRIEF_SYSTEM_PROMPT } from './brief.js'

function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof GithubError) {
    return reply.code(err.status >= 400 && err.status < 600 ? err.status : 502).send({ error: err.message, code: err.code, resetAt: err.resetAt })
  }
  if (err instanceof z.ZodError) return reply.code(400).send({ error: err.issues.map((i) => i.message).join('; '), code: 'BAD_REQUEST' })
  reply.log.error(err)
  return reply.code(500).send({ error: 'Something went wrong talking to GitHub.', code: 'UPSTREAM' })
}

const repoParams = z.object({ owner: z.string().min(1).max(100), repo: z.string().min(1).max(150) })
const pageQuery = z.coerce.number().int().min(1).max(50).default(1)

async function repoOf(owner: string, repo: string) {
  assertRepoRef(owner, repo)
  return mapRepo(await ghGetJson<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`))
}

export const githubPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /api/github/status — token + rate limit (the /rate_limit call is free)
  fastify.get('/api/github/status', async (_req, reply) => {
    const token = tokenState()
    let rate: RateLimit | null = lastRateLimit()
    let reachable = true
    try {
      const r = await ghGetJson<{ resources?: { core?: { limit: number; remaining: number; reset: number } } }>('/rate_limit', { ttl: 5_000 })
      const core = r.resources?.core
      if (core) rate = { limit: core.limit, remaining: core.remaining, reset: core.reset, resource: 'core' }
    } catch (err) {
      if (err instanceof GithubError && (err.code === 'NETWORK' || err.code === 'TIMEOUT')) reachable = false
      else if (!(err instanceof GithubError)) return fail(reply, err)
    }
    return {
      reachable,
      authenticated: token.configured && !token.rejected,
      tokenConfigured: token.configured,
      tokenSource: token.source,
      tokenRejected: token.rejected,
      rate,
    }
  })

  // GET /api/github/search?q=&sort=&page=
  fastify.get('/api/github/search', async (request, reply) => {
    try {
      const q = z
        .object({
          q: z.string().trim().min(1, 'Type something to search for.').max(256),
          sort: z.enum(['stars', 'forks', 'updated', 'best']).default('best'),
          page: pageQuery,
        })
        .parse(request.query)
      const params = new URLSearchParams({ q: q.q, per_page: '12', page: String(q.page) })
      if (q.sort !== 'best') params.set('sort', q.sort)
      const res = await ghGetJson<{ total_count: number; incomplete_results: boolean; items: any[] }>(`/search/repositories?${params}`, { ttl: 60_000 })
      return { total: res.total_count, incomplete: res.incomplete_results, page: q.page, items: res.items.map(mapRepo) }
    } catch (err) {
      return fail(reply, err)
    }
  })

  // GET /api/github/repos/:owner/:repo — overview (repo + languages + latest release + top contributors)
  fastify.get('/api/github/repos/:owner/:repo', async (request, reply) => {
    try {
      const { owner, repo } = repoParams.parse(request.params)
      assertRepoRef(owner, repo)
      const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
      const summary = mapRepo(await ghGetJson<any>(base))

      // Secondary panels: a failure in one must not hide the repo itself.
      const [languages, release, contributors] = await Promise.allSettled([
        ghGetJson<Record<string, number>>(`${base}/languages`),
        ghGetJson<any>(`${base}/releases/latest`),
        ghGetJson<any[]>(`${base}/contributors?per_page=8`),
      ])
      return {
        repo: summary,
        languages: languages.status === 'fulfilled' ? languages.value : {},
        latestRelease: release.status === 'fulfilled' && release.value && !Array.isArray(release.value) ? mapRelease(release.value) : null,
        contributors: contributors.status === 'fulfilled' && Array.isArray(contributors.value) ? contributors.value.map(mapContributor) : [],
      }
    } catch (err) {
      return fail(reply, err)
    }
  })

  // GET /api/github/repos/:owner/:repo/readme?ref=
  fastify.get('/api/github/repos/:owner/:repo/readme', async (request, reply) => {
    try {
      const { owner, repo } = repoParams.parse(request.params)
      const { ref } = z.object({ ref: z.string().max(200).optional() }).parse(request.query)
      assertRepoRef(owner, repo)
      if (ref) assertRef(ref)
      const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`
      try {
        const meta = await ghGetJson<{ name: string; path: string; html_url: string }>(base)
        const raw = await ghGetText(base, { accept: 'application/vnd.github.raw+json' })
        return { found: true, name: meta.name, path: meta.path, htmlUrl: meta.html_url, markdown: raw.text.slice(0, 400_000) }
      } catch (err) {
        if (err instanceof GithubError && err.code === 'NOT_FOUND') return { found: false, name: null, path: null, htmlUrl: null, markdown: '' }
        throw err
      }
    } catch (err) {
      return fail(reply, err)
    }
  })

  // GET /api/github/repos/:owner/:repo/tree?ref=
  fastify.get('/api/github/repos/:owner/:repo/tree', async (request, reply) => {
    try {
      const { owner, repo } = repoParams.parse(request.params)
      const { ref } = z.object({ ref: z.string().max(200).optional() }).parse(request.query)
      assertRepoRef(owner, repo)
      if (ref) assertRef(ref)
      const branch = ref ?? (await repoOf(owner, repo)).defaultBranch
      const tree = await ghGetJson<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { ttl: 180_000 })
      return { ref: branch, ...mapTree(tree) }
    } catch (err) {
      return fail(reply, err)
    }
  })

  // GET /api/github/repos/:owner/:repo/file?path=&ref=
  fastify.get('/api/github/repos/:owner/:repo/file', async (request, reply) => {
    try {
      const { owner, repo } = repoParams.parse(request.params)
      const q = z.object({ path: z.string().min(1).max(1000), ref: z.string().max(200).optional() }).parse(request.query)
      assertRepoRef(owner, repo)
      if (q.ref) assertRef(q.ref)
      const encoded = encodeRepoPath(q.path)
      if (!encoded) throw new GithubError('BAD_REQUEST', 'A file path is required.', 400)
      const data = await ghGetJson<any>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encoded}${q.ref ? `?ref=${encodeURIComponent(q.ref)}` : ''}`,
        { ttl: 180_000 }
      )
      if (Array.isArray(data)) throw new GithubError('BAD_REQUEST', 'That path is a folder, not a file.', 400)
      if (data.type !== 'file') throw new GithubError('BAD_REQUEST', 'Only regular files can be previewed.', 400)
      return { ...mapFile(data), maxBytes: MAX_FILE_BYTES }
    } catch (err) {
      return fail(reply, err)
    }
  })

  // GET /api/github/repos/:owner/:repo/commits?path=&sha=&page=
  fastify.get('/api/github/repos/:owner/:repo/commits', async (request, reply) => {
    try {
      const { owner, repo } = repoParams.parse(request.params)
      const q = z.object({ path: z.string().max(1000).optional(), sha: z.string().max(200).optional(), page: pageQuery }).parse(request.query)
      assertRepoRef(owner, repo)
      if (q.sha) assertRef(q.sha)
      const params = new URLSearchParams({ per_page: '20', page: String(q.page) })
      if (q.sha) params.set('sha', q.sha)
      if (q.path) params.set('path', encodeRepoPath(q.path))
      const list = await ghGetJson<any[]>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params}`, { ttl: 60_000 })
      return { page: q.page, hasMore: list.length === 20, items: list.map(mapCommit) }
    } catch (err) {
      return fail(reply, err)
    }
  })

  // GET /api/github/repos/:owner/:repo/issues?state=&kind=&page=
  fastify.get('/api/github/repos/:owner/:repo/issues', async (request, reply) => {
    try {
      const { owner, repo } = repoParams.parse(request.params)
      const q = z
        .object({ state: z.enum(['open', 'closed', 'all']).default('open'), kind: z.enum(['issue', 'pr']).default('issue'), page: pageQuery })
        .parse(request.query)
      assertRepoRef(owner, repo)
      const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
      const params = new URLSearchParams({ state: q.state, per_page: '30', page: String(q.page), sort: 'updated', direction: 'desc' })
      const list = await ghGetJson<any[]>(`${base}/${q.kind === 'pr' ? 'pulls' : 'issues'}?${params}`, { ttl: 60_000 })
      // The issues endpoint also returns pull requests; keep this list to real issues.
      const items = (q.kind === 'issue' ? list.filter((i) => !i.pull_request) : list).map(mapIssue)
      return { page: q.page, hasMore: list.length === 30, items }
    } catch (err) {
      return fail(reply, err)
    }
  })

  // POST /api/github/repos/:owner/:repo/brief — AI briefing, streamed as SSE. Context is fetched here, from GitHub.
  fastify.post('/api/github/repos/:owner/:repo/brief', async (request, reply) => {
    let params: { owner: string; repo: string }
    let context: Awaited<ReturnType<typeof gatherBriefContext>>
    try {
      params = repoParams.parse(request.params)
      assertRepoRef(params.owner, params.repo)
      await aiRouter.syncWithSettings()
      if (!aiRouter.getAllProviders().some((p) => p.isConfigured())) {
        return reply.code(400).send({ error: 'No AI provider is configured. Add an API key (or enable Ollama) in Settings to use the briefing.', code: 'NO_PROVIDER' })
      }
      context = await gatherBriefContext(params.owner, params.repo)
    } catch (err) {
      return fail(reply, err)
    }

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
      'X-Accel-Buffering': 'no',
    })
    let closed = false
    raw.on('close', () => {
      closed = true
    })
    const send = (event: Record<string, unknown>) => {
      if (!closed) raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    try {
      const stream = aiRouter.stream(buildBriefPrompt(context), { systemPrompt: BRIEF_SYSTEM_PROMPT, temperature: 0.2 }, 'PROJECT_ANALYSIS')
      for await (const chunk of stream) {
        if (closed) break
        send({ type: 'delta', text: chunk })
      }
      send({ type: 'done' })
    } catch (err) {
      send({ type: 'error', code: 'AI_FAILED', message: sanitizeProviderError(err instanceof Error ? err.message : 'The AI request failed') })
    } finally {
      raw.end()
    }
  })
}

async function gatherBriefContext(owner: string, repo: string) {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const summary = mapRepo(await ghGetJson<any>(base))
  const [languages, readme, tree, commits, issues] = await Promise.allSettled([
    ghGetJson<Record<string, number>>(`${base}/languages`),
    ghGetText(`${base}/readme`, { accept: 'application/vnd.github.raw+json' }),
    ghGetJson<any>(`${base}/git/trees/${encodeURIComponent(summary.defaultBranch)}?recursive=1`, { ttl: 180_000 }),
    ghGetJson<any[]>(`${base}/commits?per_page=8`),
    ghGetJson<any[]>(`${base}/issues?state=open&per_page=10&sort=updated`),
  ])
  return {
    repo: summary,
    languages: languages.status === 'fulfilled' ? languages.value : {},
    readme: readme.status === 'fulfilled' ? readme.value.text : '',
    tree: tree.status === 'fulfilled' ? mapTree(tree.value) : null,
    commits: commits.status === 'fulfilled' && Array.isArray(commits.value) ? commits.value.map(mapCommit) : [],
    issues: issues.status === 'fulfilled' && Array.isArray(issues.value) ? issues.value.filter((i) => !i.pull_request).map(mapIssue) : [],
  }
}
