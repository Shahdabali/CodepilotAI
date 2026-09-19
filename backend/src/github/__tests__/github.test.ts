/**
 * GitHub explorer backend: validation, mapping, caching, rate-limit handling, routes, and the AI briefing.
 * Run with:  npm run test:github -w backend          (offline, fetch is stubbed)
 *            GITHUB_TEST_ONLINE=1 npm run test:github -w backend   (also hits api.github.com for octocat/Hello-World)
 */
import assert from 'node:assert/strict'

const { _resetClientState, ghGetJson, assertRepoRef, encodeRepoPath, GithubError } = await import('../client.js')
const { mapFile, mapTree, mapRepo, mapIssue, MAX_FILE_BYTES } = await import('../mappers.js')
const { githubPlugin } = await import('../routes.js')
const { buildBriefPrompt } = await import('../brief.js')
const { aiRouter } = await import('../../ai/router.js')
const { default: Fastify } = await import('fastify')

let passed = 0
let failed = 0
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err: any) {
    failed++
    console.log(`  FAIL ${name}\n       ${String(err?.message ?? err).split('\n').join('\n       ')}`)
  }
}

// ─── fetch stub ─────────────────────────────────────────────────────────────────
type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>
let handler: Handler = () => new Response('{}', { status: 200 })
const calls: Array<{ url: string; headers: Record<string, string> }> = []
const realFetch = globalThis.fetch
;(globalThis as any).fetch = async (input: any, init: RequestInit = {}) => {
  const url = new URL(String(input))
  calls.push({ url: url.pathname + url.search, headers: { ...(init.headers as Record<string, string>) } })
  return handler(url, init)
}
const json = (body: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })

const REPO = {
  full_name: 'octo/hello', name: 'hello', owner: { login: 'octo', avatar_url: 'https://a/x.png', type: 'User' },
  description: 'A hello world', html_url: 'https://github.com/octo/hello', clone_url: 'https://github.com/octo/hello.git',
  homepage: '', language: 'TypeScript', stargazers_count: 1234, forks_count: 56, subscribers_count: 7, open_issues_count: 3,
  license: { spdx_id: 'MIT', name: 'MIT License' }, topics: ['demo', 'cli'], default_branch: 'main', size: 42,
  created_at: '2020-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', pushed_at: '2024-01-02T00:00:00Z',
  archived: false, fork: false, private: false, has_issues: true,
}

delete process.env.GITHUB_TOKEN
delete process.env.GH_TOKEN
delete process.env.GITHUB_API_KEY

// ─── Validation ─────────────────────────────────────────────────────────────────
console.log('\nValidation')

await test('accepts normal repository names', () => {
  assertRepoRef('facebook', 'react')
  assertRepoRef('vercel', 'next.js')
  assertRepoRef('a-b', 'c_d.e-f')
})

await test('rejects traversal, separators and odd characters in owner/repo', () => {
  for (const [o, r] of [['..', 'x'], ['a/b', 'c'], ['a', '../etc'], ['a', 'b c'], ['-a', 'b'], ['a', '.'], ['a', 'x.git'], ['a b', 'c'], ['a', '']]) {
    assert.throws(() => assertRepoRef(o, r), (e: any) => e instanceof GithubError && e.code === 'BAD_REQUEST', `${o}/${r}`)
  }
})

await test('encodeRepoPath encodes segments and refuses traversal', () => {
  assert.equal(encodeRepoPath('src/app/main.ts'), 'src/app/main.ts')
  assert.equal(encodeRepoPath('docs/hello world#1.md'), 'docs/hello%20world%231.md')
  for (const bad of ['../secret', 'a/../b', 'a\\b', 'a/./b']) assert.throws(() => encodeRepoPath(bad), GithubError, bad)
})

// ─── Client ─────────────────────────────────────────────────────────────────────
console.log('\nClient')

await test('sends the required GitHub headers and no Authorization without a token', async () => {
  _resetClientState()
  calls.length = 0
  handler = () => json(REPO)
  await ghGetJson('/repos/octo/hello')
  assert.equal(calls[0].headers['User-Agent'], 'CodePilot-AI-GitHub-Explorer')
  assert.equal(calls[0].headers['X-GitHub-Api-Version'], '2022-11-28')
  assert.equal(calls[0].headers.Authorization, undefined)
})

await test('uses the server-side token when configured', async () => {
  _resetClientState()
  process.env.GITHUB_TOKEN = 'ghp_test_secret_token'
  calls.length = 0
  handler = () => json(REPO)
  await ghGetJson('/repos/octo/hello')
  assert.equal(calls[0].headers.Authorization, 'Bearer ghp_test_secret_token')
  delete process.env.GITHUB_TOKEN
})

await test('caches responses and revalidates with the ETag (a 304 reuses the cached body)', async () => {
  _resetClientState()
  calls.length = 0
  let n = 0
  handler = (_u, init) => {
    n++
    const inm = (init.headers as Record<string, string>)['If-None-Match']
    return inm === '"v1"' ? new Response(null, { status: 304 }) : json(REPO, { headers: { etag: '"v1"' } })
  }
  const a = await ghGetJson<any>('/repos/octo/hello', { ttl: 1 })
  await new Promise((r) => setTimeout(r, 5))
  const b = await ghGetJson<any>('/repos/octo/hello', { ttl: 60_000 }) // expired → revalidates, then stays fresh
  assert.equal(n, 2)
  assert.equal(calls[1].headers['If-None-Match'], '"v1"')
  assert.deepEqual(a, b)
  const c = await ghGetJson<any>('/repos/octo/hello') // still fresh after the revalidation
  assert.equal(n, 2, 'no network call while the cache is fresh')
  assert.equal(c.full_name, 'octo/hello')
})

await test('maps 404 to NOT_FOUND', async () => {
  _resetClientState()
  handler = () => json({ message: 'Not Found' }, { status: 404 })
  await assert.rejects(ghGetJson('/repos/octo/none'), (e: any) => e.code === 'NOT_FOUND' && e.status === 404)
})

await test('maps an exhausted rate limit to RATE_LIMITED with the reset time and an actionable hint', async () => {
  _resetClientState()
  const reset = Math.floor(Date.now() / 1000) + 600
  handler = () => json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } })
  await assert.rejects(ghGetJson('/repos/octo/hello'), (e: any) => {
    assert.equal(e.code, 'RATE_LIMITED')
    assert.equal(e.resetAt, reset)
    assert.match(e.message, /GITHUB_TOKEN/)
    return true
  })
})

await test('a rejected token falls back to anonymous access instead of failing public reads', async () => {
  _resetClientState()
  process.env.GITHUB_TOKEN = 'ghp_expired'
  calls.length = 0
  handler = (_u, init) => ((init.headers as Record<string, string>).Authorization ? json({ message: 'Bad credentials' }, { status: 401 }) : json(REPO))
  const r = await ghGetJson<any>('/repos/octo/hello')
  assert.equal(r.full_name, 'octo/hello')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].headers.Authorization, undefined)
  delete process.env.GITHUB_TOKEN
})

await test('a network failure becomes NETWORK, not an unhandled error', async () => {
  _resetClientState()
  handler = () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(ghGetJson('/repos/octo/hello'), (e: any) => e.code === 'NETWORK')
})

// ─── Mappers ────────────────────────────────────────────────────────────────────
console.log('\nMappers')

await test('mapRepo keeps only the fields the UI uses', () => {
  const r = mapRepo({ ...REPO, secret_field: 'x', owner: { ...REPO.owner, email: 'a@b.c' } })
  assert.equal(r.fullName, 'octo/hello')
  assert.equal(r.license, 'MIT')
  assert.equal(r.stars, 1234)
  assert.equal(r.homepage, null)
  assert.equal((r as any).secret_field, undefined)
  assert.equal((r.owner as any).email, undefined)
})

await test('mapFile decodes text, and flags binary, image and oversized files', () => {
  const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64')
  const base = { name: 'a.ts', path: 'src/a.ts', sha: 's', html_url: 'h', download_url: 'd', encoding: 'base64' }
  const text = mapFile({ ...base, size: 5, content: b64('héllo') })
  assert.equal(text.text, 'héllo')
  assert.equal(mapFile({ ...base, name: 'x.bin', size: 4, content: b64(Buffer.from([1, 0, 2, 3])) }).binary, true)
  assert.equal(mapFile({ ...base, name: 'logo.PNG', size: 10, content: '' }).image, true)
  const big = mapFile({ ...base, size: MAX_FILE_BYTES + 1, content: '' })
  assert.equal(big.tooLarge, true)
  assert.equal(big.text, undefined)
})

await test('mapTree drops submodules and caps the entry count', () => {
  const tree = { sha: 't', truncated: false, tree: [{ path: 'a', type: 'blob', size: 1 }, { path: 'sub', type: 'commit' }, { path: 'd', type: 'tree' }] }
  const m = mapTree(tree)
  assert.deepEqual(m.entries.map((e) => e.path), ['a', 'd'])
  const huge = { sha: 't', truncated: true, tree: Array.from({ length: 9000 }, (_, i) => ({ path: `f${i}`, type: 'blob', size: 1 })) }
  const capped = mapTree(huge)
  assert.equal(capped.entries.length, 8000)
  assert.equal(capped.capped, true)
})

await test('mapIssue flags pull requests', () => {
  assert.equal(mapIssue({ number: 1, title: 't', pull_request: {} }).isPullRequest, true)
  assert.equal(mapIssue({ number: 2, title: 't' }).isPullRequest, false)
})

// ─── Routes ─────────────────────────────────────────────────────────────────────
console.log('\nRoutes')

const app = Fastify({ logger: false })
await app.register(githubPlugin)
await app.listen({ port: 0, host: '127.0.0.1' })
const base = `http://127.0.0.1:${(app.server.address() as any).port}`
const realFetchForApp = realFetch
const api = async (path: string, init?: RequestInit) => {
  // Requests to our own server must bypass the GitHub stub.
  const res = await realFetchForApp(base + path, init)
  return { status: res.status, body: (await res.json().catch(() => null)) as any, res }
}

await test('GET /repos/:owner/:repo aggregates the overview and survives a failing secondary call', async () => {
  _resetClientState()
  handler = (u) => {
    if (u.pathname === '/repos/octo/hello') return json(REPO)
    if (u.pathname.endsWith('/languages')) return json({ TypeScript: 9000, CSS: 1000 })
    if (u.pathname.endsWith('/releases/latest')) return json({ message: 'Not Found' }, { status: 404 })
    if (u.pathname.endsWith('/contributors')) return json([{ login: 'octo', avatar_url: 'a', html_url: 'u', contributions: 99 }])
    return json({}, { status: 500 })
  }
  const r = await api('/api/github/repos/octo/hello')
  assert.equal(r.status, 200)
  assert.equal(r.body.repo.fullName, 'octo/hello')
  assert.deepEqual(r.body.languages, { TypeScript: 9000, CSS: 1000 })
  assert.equal(r.body.latestRelease, null)
  assert.equal(r.body.contributors[0].login, 'octo')
})

await test('an unknown repository is a 404 with a readable message', async () => {
  _resetClientState()
  handler = () => json({ message: 'Not Found' }, { status: 404 })
  const r = await api('/api/github/repos/octo/none')
  assert.equal(r.status, 404)
  assert.equal(r.body.code, 'NOT_FOUND')
  assert.match(r.body.error, /not found/i)
})

await test('an invalid owner never reaches GitHub', async () => {
  _resetClientState()
  calls.length = 0
  const r = await api('/api/github/repos/..%2F..%2Fetc/passwd')
  assert.ok(r.status === 400 || r.status === 404)
  assert.equal(calls.length, 0)
})

await test('README: returns raw markdown, and found:false when there is none', async () => {
  _resetClientState()
  handler = (_u, init) =>
    (init.headers as Record<string, string>).Accept.includes('raw')
      ? new Response('# Hello\n\nWorld', { status: 200 })
      : json({ name: 'README.md', path: 'README.md', html_url: 'https://github.com/octo/hello/blob/main/README.md' })
  const ok = await api('/api/github/repos/octo/hello/readme')
  assert.equal(ok.body.found, true)
  assert.equal(ok.body.markdown, '# Hello\n\nWorld')
  _resetClientState()
  handler = () => json({ message: 'Not Found' }, { status: 404 })
  const none = await api('/api/github/repos/octo/hello/readme')
  assert.equal(none.status, 200)
  assert.equal(none.body.found, false)
})

await test('file route: decodes content, refuses folders and traversal', async () => {
  _resetClientState()
  handler = (u) =>
    u.pathname.endsWith('/contents/src')
      ? json([{ name: 'a.ts' }])
      : json({ type: 'file', name: 'a.ts', path: 'src/a.ts', size: 2, sha: 's', html_url: 'h', download_url: 'd', encoding: 'base64', content: Buffer.from('hi').toString('base64') })
  const ok = await api('/api/github/repos/octo/hello/file?path=src/a.ts&ref=main')
  assert.equal(ok.body.text, 'hi')
  const dir = await api('/api/github/repos/octo/hello/file?path=src')
  assert.equal(dir.status, 400)
  calls.length = 0
  const bad = await api('/api/github/repos/octo/hello/file?path=' + encodeURIComponent('../../etc/passwd'))
  assert.equal(bad.status, 400)
  assert.equal(calls.length, 0)
})

await test('issues route filters pull requests out of the issue list', async () => {
  _resetClientState()
  handler = () => json([{ number: 1, title: 'bug', state: 'open' }, { number: 2, title: 'a PR', state: 'open', pull_request: {} }])
  const r = await api('/api/github/repos/octo/hello/issues?kind=issue')
  assert.deepEqual(r.body.items.map((i: any) => i.number), [1])
})

await test('search validates its query and maps results', async () => {
  _resetClientState()
  handler = () => json({ total_count: 1, incomplete_results: false, items: [REPO] })
  assert.equal((await api('/api/github/search?q=')).status, 400)
  const r = await api('/api/github/search?q=hello&sort=stars')
  assert.equal(r.body.total, 1)
  assert.equal(r.body.items[0].fullName, 'octo/hello')
})

await test('status never exposes the token, only whether one is set and where it came from', async () => {
  _resetClientState()
  process.env.GITHUB_TOKEN = 'ghp_super_secret_value'
  handler = () => json({ resources: { core: { limit: 5000, remaining: 4990, reset: 1 } } })
  const r = await api('/api/github/status')
  assert.equal(r.body.authenticated, true)
  assert.equal(r.body.tokenSource, 'GITHUB_TOKEN')
  assert.equal(r.body.rate.limit, 5000)
  assert.ok(!JSON.stringify(r.body).includes('ghp_super_secret_value'))
  delete process.env.GITHUB_TOKEN
})

await test('AI briefing: streams SSE, grounds the prompt in fetched repo data, never includes the token', async () => {
  _resetClientState()
  process.env.GITHUB_TOKEN = 'ghp_must_not_leak'
  handler = (u) => {
    if (u.pathname === '/repos/octo/hello') return json(REPO)
    if (u.pathname.endsWith('/readme')) return new Response('# Hello\nUnique README marker 7f3a', { status: 200 })
    if (u.pathname.includes('/git/trees/')) return json({ sha: 't', truncated: false, tree: [{ path: 'src', type: 'tree' }, { path: 'src/index.ts', type: 'blob', size: 10 }] })
    if (u.pathname.endsWith('/commits')) return json([{ sha: 'abc', commit: { message: 'feat: first\n\nbody', author: { name: 'Octo', date: '2024-01-01T00:00:00Z' } }, html_url: 'u' }])
    if (u.pathname.endsWith('/issues')) return json([{ number: 9, title: 'Good first issue', state: 'open', labels: [{ name: 'good first issue', color: 'fff' }] }])
    if (u.pathname.endsWith('/languages')) return json({ TypeScript: 100 })
    return json({})
  }
  let seenPrompt = ''
  const realStream = aiRouter.stream.bind(aiRouter)
  const realProviders = aiRouter.getAllProviders.bind(aiRouter)
  const realSync = aiRouter.syncWithSettings.bind(aiRouter)
  ;(aiRouter as any).getAllProviders = () => [{ isConfigured: () => true }]
  ;(aiRouter as any).syncWithSettings = async () => {}
  ;(aiRouter as any).stream = async function* (prompt: string) {
    seenPrompt = prompt
    yield '## What it is\n'
    yield 'A demo.'
  }
  const res = await realFetchForApp(`${base}/api/github/repos/octo/hello/brief`, { method: 'POST' })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/)
  const text = await res.text()
  ;(aiRouter as any).stream = realStream
  ;(aiRouter as any).getAllProviders = realProviders
  ;(aiRouter as any).syncWithSettings = realSync
  assert.match(text, /"type":"delta"/)
  assert.match(text, /"type":"done"/)
  assert.match(seenPrompt, /Unique README marker 7f3a/)
  assert.match(seenPrompt, /src\/index\.ts/)
  assert.match(seenPrompt, /Good first issue/)
  assert.ok(!seenPrompt.includes('ghp_must_not_leak'), 'token must not reach the model')
  assert.ok(!text.includes('ghp_must_not_leak'))
  delete process.env.GITHUB_TOKEN
})

await test('AI briefing without a configured provider is a clear 400', async () => {
  _resetClientState()
  const realProviders = aiRouter.getAllProviders.bind(aiRouter)
  const realSync = aiRouter.syncWithSettings.bind(aiRouter)
  ;(aiRouter as any).getAllProviders = () => [{ isConfigured: () => false }]
  ;(aiRouter as any).syncWithSettings = async () => {}
  const r = await api('/api/github/repos/octo/hello/brief', { method: 'POST' })
  ;(aiRouter as any).getAllProviders = realProviders
  ;(aiRouter as any).syncWithSettings = realSync
  assert.equal(r.status, 400)
  assert.equal(r.body.code, 'NO_PROVIDER')
})

await test('buildBriefPrompt trims a huge README and lists the layout', () => {
  const prompt = buildBriefPrompt({
    repo: mapRepo(REPO), languages: { TypeScript: 3, CSS: 1 }, readme: 'x'.repeat(50_000),
    tree: { truncated: false, entries: Array.from({ length: 500 }, (_, i) => ({ path: `d${i % 5}/f${i}.ts`, type: 'blob' as const, size: 1 })) },
    commits: [], issues: [],
  })
  assert.ok(prompt.length < 20_000)
  assert.match(prompt, /README truncated/)
  assert.match(prompt, /TypeScript 75%/)
  assert.match(prompt, /and \d+ more entries/)
})

await app.close()

// ─── Optional live check ────────────────────────────────────────────────────────
if (process.env.GITHUB_TEST_ONLINE === '1') {
  console.log('\nLive (api.github.com)')
  ;(globalThis as any).fetch = realFetch
  _resetClientState()
  const live = Fastify({ logger: false })
  await live.register(githubPlugin)
  await live.listen({ port: 0, host: '127.0.0.1' })
  const liveBase = `http://127.0.0.1:${(live.server.address() as any).port}`
  const get = async (p: string) => {
    const res = await fetch(liveBase + p)
    return { status: res.status, body: (await res.json()) as any }
  }
  await test('octocat/Hello-World overview, README, tree, file and commits', async () => {
    const o = await get('/api/github/repos/octocat/Hello-World')
    assert.equal(o.status, 200, JSON.stringify(o.body))
    assert.equal(o.body.repo.fullName, 'octocat/Hello-World')
    const readme = await get('/api/github/repos/octocat/Hello-World/readme')
    assert.equal(readme.body.found, true)
    assert.match(readme.body.markdown, /Hello/i)
    const tree = await get(`/api/github/repos/octocat/Hello-World/tree?ref=${o.body.repo.defaultBranch}`)
    assert.ok(tree.body.entries.some((e: any) => e.path === 'README'))
    const file = await get('/api/github/repos/octocat/Hello-World/file?path=README')
    assert.match(file.body.text, /Hello World/)
    const commits = await get('/api/github/repos/octocat/Hello-World/commits')
    assert.ok(commits.body.items.length > 0)
  })
  await test('a missing repository is a clean 404', async () => {
    const r = await get('/api/github/repos/octocat/definitely-not-a-real-repo-xyz')
    assert.equal(r.status, 404)
  })
  await live.close()
}

;(globalThis as any).fetch = realFetch
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
