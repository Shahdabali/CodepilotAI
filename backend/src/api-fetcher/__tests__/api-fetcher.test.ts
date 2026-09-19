/* Integration tests for the API Fetcher backend. Run with: npm run test:fetcher -w backend
 * Uses local mock servers plus (optionally) real public APIs when FETCHER_TEST_ONLINE=1. */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'
import zlib from 'node:zlib'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apifetcher-test-'))
process.env.DB_PATH = path.join(tmp, 'test.db')
process.env.API_FETCHER_ALLOW_PRIVATE_NETWORK = 'true'
process.env.API_FETCHER_MAX_RESPONSE_BYTES = String(64 * 1024)
delete process.env.API_FETCHER_ENCRYPTION_KEY

const { default: Fastify } = await import('fastify')
const { initDb, closeDb } = await import('../../db/schema.js')
const { apiFetcherPlugin } = await import('../routes.js')
const redact = await import('../redact.js')
const guard = await import('../url-guard.js')
const { buildContext, aiChatSchema } = await import('../ai-assistant.js')

let passed = 0
let failed = 0
const failures: string[] = []
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    failed++
    failures.push(name)
    console.log(`  FAIL ${name}\n       ${(err as Error).message.split('\n').join('\n       ')}`)
  }
}

// ─── Mock upstream API ───────────────────────────────────────────────────────
interface Seen {
  method?: string
  url?: string
  headers: http.IncomingHttpHeaders
  body: string
}
let lastSeen: Seen = { headers: {}, body: '' }
let slowConnectionClosed = false

const upstream = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    lastSeen = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }
    const u = new URL(req.url ?? '/', 'http://x')
    const p = u.pathname
    if (p === '/echo') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Set-Cookie', ['a=1; HttpOnly', 'b=2'])
      return void res.end(JSON.stringify({ method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers, body: lastSeen.body }))
    }
    if (p === '/status/404') return void res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"nope"}')
    if (p === '/status/500') return void res.writeHead(500).end('boom')
    if (p === '/status/429') return void res.writeHead(429, { 'Retry-After': '30' }).end('slow down')
    if (p === '/redirect1') return void res.writeHead(302, { Location: '/redirect2' }).end()
    if (p === '/redirect2') return void res.writeHead(301, { Location: '/echo?from=redirect' }).end()
    if (p === '/redirect-post') return void res.writeHead(302, { Location: '/echo' }).end()
    if (p === '/redirect-loop') return void res.writeHead(302, { Location: '/redirect-loop' }).end()
    if (p === '/redirect-cross') return void res.writeHead(302, { Location: `http://localhost:${(otherUpstream.address() as AddressInfo).port}/echo` }).end()
    if (p === '/redirect-meta') return void res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' }).end()
    if (p === '/gzip') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' })
      return void res.end(zlib.gzipSync(JSON.stringify({ hello: 'gzip', n: [1, 2, 3] })))
    }
    if (p === '/br') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'br' })
      return void res.end(zlib.brotliCompressSync(JSON.stringify({ hello: 'brotli' })))
    }
    if (p === '/big') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      return void res.end('x'.repeat(200 * 1024))
    }
    if (p === '/html') return void res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Hi</h1><script>alert(1)</script>')
    if (p === '/png') {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      return void res.writeHead(200, { 'Content-Type': 'image/png' }).end(png)
    }
    if (p === '/slow') {
      req.on('close', () => {
        slowConnectionClosed = true
      })
      setTimeout(() => {
        if (!res.destroyed) res.end('late')
      }, 3000)
      return
    }
    if (p === '/token') {
      res.setHeader('Content-Type', 'application/json')
      return void res.end(JSON.stringify({ access_token: 'tok_abc123456789', token_type: 'Bearer', expires_in: 3600, seen: lastSeen.body, auth: req.headers.authorization }))
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
  })
})
const otherUpstream = http.createServer((req, res) => {
  lastOther = { headers: req.headers }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ headers: req.headers }))
})
let lastOther: { headers: http.IncomingHttpHeaders } = { headers: {} }
await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r))
await new Promise<void>((r) => otherUpstream.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`

await initDb()
const app = Fastify()
await app.register(apiFetcherPlugin)
await app.listen({ port: 0, host: '127.0.0.1' })
const api = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/fetcher`

async function call(method: string, url: string, body?: unknown, signal?: AbortSignal) {
  const res = await fetch(`${api}${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

const kv = (key: string, value: string, enabled = true) => ({ key, value, enabled })
const req = (over: Record<string, unknown>) => ({ name: '', method: 'GET', url: `${base}/echo`, params: [], headers: [], body: { mode: 'none' }, auth: { type: 'none' }, ...over })
async function exec(request: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const r = await call('POST', '/execute', { request, ...extra })
  assert.equal(r.status, 200, `execute HTTP ${r.status}: ${JSON.stringify(r.json)}`)
  return r.json
}

console.log('\nRedaction')
await test('sensitive names are detected (incl. camelCase)', () => {
  for (const n of ['Authorization', 'x-api-key', 'accessToken', 'client_secret', 'password', 'Cookie', 'key', 'X-Auth-Token']) assert.ok(redact.isSensitiveName(n), n)
  for (const n of ['Content-Type', 'Accept', 'monkey', 'page', 'limit', 'keyboard']) assert.ok(!redact.isSensitiveName(n), n)
})
await test('variable references survive redaction, literals do not', () => {
  assert.equal(redact.redactValue('Bearer {{API_TOKEN}}'), 'Bearer {{API_TOKEN}}')
  assert.equal(redact.redactValue('Bearer abc.def.ghi'), '[REDACTED]')
  assert.equal(redact.redactValue('{{A}}suffix'), '[REDACTED]')
})
await test('URLs: userinfo removed and sensitive query params masked', () => {
  assert.equal(redact.redactUrl('https://u:p@x.com/a?page=1&api_key=SECRET&token={{T}}'), 'https://x.com/a?page=1&api_key=[REDACTED]&token={{T}}')
})
await test('JSON bodies redacted structurally, including nested keys', () => {
  const out = JSON.parse(redact.redactText('{"user":"a","password":"hunter2","nested":{"access_token":"zzz","ok":1}}'))
  assert.equal(out.password, '[REDACTED]')
  assert.equal(out.nested.access_token, '[REDACTED]')
  assert.equal(out.nested.ok, 1)
  assert.equal(out.user, 'a')
})

console.log('\nURL guard / SSRF policy')
await test('metadata and link-local addresses blocked even in permissive mode', () => {
  const permissive = { allowPrivateNetwork: true }
  assert.throws(() => guard.parseTargetUrl('http://169.254.169.254/latest', permissive), /Blocked/)
  assert.throws(() => guard.parseTargetUrl('http://[::ffff:169.254.169.254]/', permissive), /Blocked/)
  assert.throws(() => guard.parseTargetUrl('http://metadata.google.internal/', permissive), /metadata/)
  assert.throws(() => guard.parseTargetUrl('http://2852039166/', permissive), /Blocked/) // decimal form of 169.254.169.254
})
await test('private ranges blocked in strict mode, allowed in permissive mode', () => {
  const strict = { allowPrivateNetwork: false }
  for (const u of ['http://127.0.0.1/', 'http://10.1.2.3/', 'http://192.168.0.1/', 'http://172.20.0.1/', 'http://[::1]/', 'http://localhost:3000/', 'http://0x7f.1/', 'http://[::ffff:127.0.0.1]/'])
    assert.throws(() => guard.parseTargetUrl(u, strict), /Blocked/, u)
  assert.doesNotThrow(() => guard.parseTargetUrl('https://example.com/', strict))
  assert.doesNotThrow(() => guard.parseTargetUrl('http://127.0.0.1:8080/', { allowPrivateNetwork: true }))
})
await test('bad schemes, credentials and empty URLs rejected; scheme is inferred with a note', () => {
  const p = { allowPrivateNetwork: true }
  assert.throws(() => guard.parseTargetUrl('ftp://x.com', p), /Unsupported/)
  assert.throws(() => guard.parseTargetUrl('file:///etc/passwd', p), /Unsupported/)
  assert.throws(() => guard.parseTargetUrl('https://user:pw@x.com', p), /Credentials/)
  assert.throws(() => guard.parseTargetUrl('   ', p), /empty/)
  const inferred = guard.parseTargetUrl('example.com/users', p)
  assert.equal(inferred.url.href, 'https://example.com/users')
  assert.ok(inferred.notes[0].includes('https'))
  assert.equal(guard.parseTargetUrl('localhost:3000/x', p).url.protocol, 'http:')
})
await test('DNS-level guard rejects hostnames that resolve to blocked addresses', async () => {
  const lookup = guard.createGuardedLookup({ allowPrivateNetwork: false })
  const err = await new Promise<any>((resolve) => lookup('localhost', { all: true } as any, (e: any) => resolve(e)))
  assert.ok(err && /Blocked/.test(err.message), `expected block, got ${err?.message}`)
})

console.log('\nRequest execution')
await test('GET: query params, custom headers and default headers arrive; response metadata is real', async () => {
  const out = await exec(req({ url: `${base}/echo?page=1&limit=20`, headers: [kv('X-Trace', 'abc'), kv('X-Off', 'no', false)] }))
  assert.equal(out.ok, true)
  assert.equal(out.response.status, 200)
  const body = JSON.parse(out.response.bodyText)
  assert.deepEqual(body.query, { page: '1', limit: '20' })
  assert.equal(body.headers['x-trace'], 'abc')
  assert.equal(body.headers['x-off'], undefined)
  assert.match(body.headers['user-agent'], /CodePilot/)
  assert.equal(out.response.kind, 'json')
  assert.ok(out.timings.totalMs > 0 && out.timings.ttfbMs >= 0)
  assert.equal(out.network.remoteAddress, '127.0.0.1')
  assert.equal(out.response.sizeBytes, Buffer.byteLength(out.response.bodyText))
  assert.ok(out.response.headers.filter(([k]: string[]) => k.toLowerCase() === 'set-cookie').length === 2, 'both Set-Cookie headers preserved')
})
await test('POST JSON: body + default Content-Type', async () => {
  const out = await exec(req({ method: 'POST', body: { mode: 'json', json: '{"name":"John","email":"john@example.com"}' } }))
  const body = JSON.parse(out.response.bodyText)
  assert.equal(body.method, 'POST')
  assert.equal(body.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(body.body), { name: 'John', email: 'john@example.com' })
})
await test('PUT / PATCH / DELETE / HEAD / OPTIONS send the right verb', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const out = await exec(req({ method, body: method === 'PUT' || method === 'PATCH' ? { mode: 'raw', raw: 'payload', rawContentType: 'text/plain' } : { mode: 'none' } }))
    assert.equal(out.ok, true, method)
    assert.equal(lastSeen.method, method)
    if (method === 'PUT' || method === 'PATCH') assert.equal(lastSeen.body, 'payload')
    if (method === 'HEAD') assert.equal(out.response.sizeBytes, 0)
  }
})
await test('x-www-form-urlencoded and multipart bodies', async () => {
  await exec(req({ method: 'POST', body: { mode: 'urlencoded', urlencoded: [kv('a', '1 2'), kv('b', 'x&y'), kv('off', 'z', false)] } }))
  assert.equal(lastSeen.body, 'a=1+2&b=x%26y')
  assert.equal(lastSeen.headers['content-type'], 'application/x-www-form-urlencoded')
  await exec(req({ method: 'POST', body: { mode: 'form-data', form: [kv('field', 'value')] } }))
  assert.match(String(lastSeen.headers['content-type']), /^multipart\/form-data; boundary=/)
  assert.match(lastSeen.body, /name="field"\r\n\r\nvalue/)
})
await test('authorization: bearer, basic, api key (header + query), oauth token', async () => {
  await exec(req({ auth: { type: 'bearer', token: 'tok123', prefix: 'Bearer' } }))
  assert.equal(lastSeen.headers.authorization, 'Bearer tok123')
  await exec(req({ auth: { type: 'basic', username: 'user', password: 'pa:ss' } }))
  assert.equal(lastSeen.headers.authorization, `Basic ${Buffer.from('user:pa:ss').toString('base64')}`)
  await exec(req({ auth: { type: 'apikey', key: 'X-API-Key', value: 'k1', in: 'header' } }))
  assert.equal(lastSeen.headers['x-api-key'], 'k1')
  await exec(req({ url: `${base}/echo?keep=1`, auth: { type: 'apikey', key: 'api_key', value: 'a b', in: 'query' } }))
  assert.equal(new URL(lastSeen.url!, 'http://x').searchParams.get('api_key'), 'a b')
  assert.equal(new URL(lastSeen.url!, 'http://x').searchParams.get('keep'), '1')
  await exec(req({ auth: { type: 'oauth2', grantType: 'manual', accessToken: 'oa_tok', tokenPrefix: 'Bearer' } }))
  assert.equal(lastSeen.headers.authorization, 'Bearer oa_tok')
  const noTok = await exec(req({ auth: { type: 'oauth2', grantType: 'manual', accessToken: '' } }))
  assert.equal(noTok.ok, false)
  assert.equal(noTok.error.code, 'INVALID_REQUEST')
})
await test('sent-request preview never contains literal credentials', async () => {
  const out = await exec(req({ url: `${base}/echo?api_key=SUPERSECRET`, auth: { type: 'bearer', token: 'TOPSECRET', prefix: 'Bearer' }, headers: [kv('X-Api-Key', 'ALSOSECRET')] }))
  const dump = JSON.stringify(out.request)
  for (const s of ['SUPERSECRET', 'TOPSECRET', 'ALSOSECRET']) assert.ok(!dump.includes(s), `${s} leaked in request preview`)
})
await test('HTTP errors are returned as real responses (not faked as success or transport errors)', async () => {
  for (const [p, code] of [['/status/404', 404], ['/status/500', 500], ['/status/429', 429]] as const) {
    const out = await exec(req({ url: `${base}${p}` }))
    assert.equal(out.ok, true)
    assert.equal(out.response.status, code)
  }
})
await test('redirects: chain reported, method preserved rules followed', async () => {
  const out = await exec(req({ url: `${base}/redirect1` }))
  assert.equal(out.response.status, 200)
  assert.deepEqual(out.response.redirects.map((r: any) => r.status), [302, 301])
  assert.match(out.response.url, /\/echo\?from=redirect$/)
  const post = await exec(req({ method: 'POST', url: `${base}/redirect-post`, body: { mode: 'json', json: '{"a":1}' } }))
  assert.equal(lastSeen.method, 'GET', '302 after POST becomes GET')
  assert.equal(post.response.redirects.length, 1)
  const manual = await exec(req({ url: `${base}/redirect1` }), { options: { followRedirects: false } })
  assert.equal(manual.response.status, 302)
})
await test('redirect loops stop with TOO_MANY_REDIRECTS', async () => {
  const out = await exec(req({ url: `${base}/redirect-loop` }), { options: { maxRedirects: 3 } })
  assert.equal(out.ok, false)
  assert.equal(out.error.code, 'TOO_MANY_REDIRECTS')
})
await test('cross-origin redirects drop credentials', async () => {
  await exec(req({ url: `${base}/redirect-cross`, auth: { type: 'bearer', token: 'leakme', prefix: 'Bearer' }, headers: [kv('X-Api-Key', 'leakme2')] }))
  assert.equal(lastOther.headers.authorization, undefined)
  assert.equal(lastOther.headers['x-api-key'], undefined)
})
await test('redirects to blocked addresses are refused', async () => {
  const out = await exec(req({ url: `${base}/redirect-meta` }))
  assert.equal(out.ok, false)
  assert.equal(out.error.code, 'BLOCKED_HOST')
})
await test('gzip and brotli bodies are decoded; transfer vs decoded size reported', async () => {
  const g = await exec(req({ url: `${base}/gzip` }))
  assert.deepEqual(JSON.parse(g.response.bodyText), { hello: 'gzip', n: [1, 2, 3] })
  assert.equal(g.response.contentEncoding, 'gzip')
  assert.ok(g.response.transferBytes > 0)
  const b = await exec(req({ url: `${base}/br` }))
  assert.deepEqual(JSON.parse(b.response.bodyText), { hello: 'brotli' })
})
await test('body classification: html, image (base64), text', async () => {
  const h = await exec(req({ url: `${base}/html` }))
  assert.equal(h.response.kind, 'html')
  const i = await exec(req({ url: `${base}/png` }))
  assert.equal(i.response.kind, 'image')
  assert.ok(i.response.bodyBase64.startsWith('iVBOR'))
  const t = await exec(req({ url: `${base}/other` }))
  assert.equal(t.response.kind, 'text')
})
await test('oversized responses are capped, flagged and remain downloadable in full', async () => {
  const out = await exec(req({ url: `${base}/big` }))
  assert.equal(out.response.truncated, true)
  assert.equal(out.response.sizeBytes, 64 * 1024)
  assert.ok(out.notes.some((n: string) => /truncated/.test(n)))
  const dl = await fetch(`${api}/responses/${out.response.responseId}/download`)
  assert.equal(dl.status, 200)
  assert.equal(dl.headers.get('content-type'), 'application/octet-stream')
  assert.match(dl.headers.get('content-disposition') ?? '', /attachment/)
  assert.equal((await dl.arrayBuffer()).byteLength, 64 * 1024)
  assert.equal((await fetch(`${api}/responses/nope/download`)).status, 404)
})

console.log('\nFailures, timeout, cancellation')
await test('invalid URL / unsupported scheme / missing variables give structured errors', async () => {
  assert.equal((await exec(req({ url: 'http://exa mple.com' }))).error.code, 'INVALID_URL')
  assert.equal((await exec(req({ url: 'ftp://example.com' }))).error.code, 'INVALID_URL')
  const unresolved = await exec(req({ url: '{{NOPE}}/x' }))
  assert.equal(unresolved.error.code, 'UNRESOLVED_VARIABLES')
  assert.match(unresolved.error.message, /\{\{NOPE\}\}/)
  const badHeader = await exec(req({ headers: [kv('Bad Header', 'x')] }))
  assert.equal(badHeader.error.code, 'INVALID_REQUEST')
  const crlf = await exec(req({ headers: [kv('X-A', 'a\r\nInjected: 1')] }))
  assert.equal(crlf.error.code, 'INVALID_REQUEST')
})
await test('connection refused and DNS failure are classified', async () => {
  const refused = await exec(req({ url: 'http://127.0.0.1:1/' }))
  assert.equal(refused.ok, false)
  assert.equal(refused.error.code, 'CONNECTION_REFUSED')
  assert.ok(refused.error.suggestions.length > 0)
  const dns = await exec(req({ url: 'http://definitely-not-a-real-host.invalid/' }))
  assert.equal(dns.error.code, 'DNS_FAILED')
})
await test('timeout aborts and reports TIMEOUT', async () => {
  const t0 = Date.now()
  const out = await exec(req({ url: `${base}/slow` }), { options: { timeoutMs: 400 } })
  assert.equal(out.ok, false)
  assert.equal(out.error.code, 'TIMEOUT')
  assert.ok(Date.now() - t0 < 2500, 'returned promptly')
})
await test('cancelling the HTTP request aborts the upstream connection', async () => {
  slowConnectionClosed = false
  const ac = new AbortController()
  const pending = call('POST', '/execute', { request: req({ url: `${base}/slow` }) }, ac.signal).catch((e) => e)
  await new Promise((r) => setTimeout(r, 300))
  ac.abort()
  await pending
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(slowConnectionClosed, true, 'upstream saw the connection close')
})
await test('strict network policy blocks loopback through the API (production behaviour)', async () => {
  process.env.API_FETCHER_ALLOW_PRIVATE_NETWORK = 'false'
  try {
    const out = await exec(req({ url: `${base}/echo` }))
    assert.equal(out.ok, false)
    assert.equal(out.error.code, 'BLOCKED_HOST')
  } finally {
    process.env.API_FETCHER_ALLOW_PRIVATE_NETWORK = 'true'
  }
})

console.log('\nEnvironments and secrets')
let envId = ''
await test('create environment; secret values are never returned', async () => {
  const r = await call('POST', '/environments', {
    name: 'Development',
    variables: [
      { key: 'API_URL', value: base, secret: false },
      { key: 'API_KEY', value: 'sk_live_supersecret_value', secret: true },
    ],
  })
  assert.equal(r.status, 200)
  envId = r.json.id
  assert.ok(!JSON.stringify(r.json).includes('sk_live_supersecret_value'))
  const secretVar = r.json.variables.find((v: any) => v.key === 'API_KEY')
  assert.equal(secretVar.value, '')
  assert.equal(secretVar.hasValue, true)
  const ws = await call('GET', '/workspace')
  assert.ok(!JSON.stringify(ws.json).includes('sk_live_supersecret_value'))
})
await test('variables resolve server-side; the secret reaches the API but not the response preview or history', async () => {
  const out = await exec(req({ url: '{{API_URL}}/echo?q={{API_KEY}}', headers: [kv('Authorization', 'Bearer {{API_KEY}}')] }), { environmentId: envId })
  assert.equal(out.ok, true)
  assert.equal(lastSeen.headers.authorization, 'Bearer sk_live_supersecret_value')
  const dump = JSON.stringify({ request: out.request, url: out.response.url })
  assert.ok(!dump.includes('sk_live_supersecret_value'), 'secret leaked in preview')
  const hist = await call('GET', '/history')
  assert.ok(!JSON.stringify(hist.json).includes('sk_live_supersecret_value'))
  const entry = await call('GET', `/history/${out.historyId}`)
  assert.ok(!JSON.stringify(entry.json).includes('sk_live_supersecret_value'))
  assert.equal(entry.json.request.headers[0].value, 'Bearer {{API_KEY}}')
})
await test('updating an environment keeps secrets that are not re-sent', async () => {
  const r = await call('PUT', `/environments/${envId}`, {
    name: 'Development',
    variables: [
      { key: 'API_URL', value: base, secret: false },
      { key: 'API_KEY', secret: true, keep: true },
      { key: 'EXTRA', value: '1', secret: false },
    ],
  })
  assert.equal(r.status, 200)
  const out = await exec(req({ headers: [kv('X-K', '{{API_KEY}}')] }), { environmentId: envId })
  assert.equal(lastSeen.headers['x-k'], 'sk_live_supersecret_value')
  assert.equal(out.ok, true)
  const dup = await call('PUT', `/environments/${envId}`, { name: 'x', variables: [{ key: 'A', value: '1' }, { key: 'A', value: '2' }] })
  assert.equal(dup.status, 400)
  const badName = await call('POST', '/environments', { name: 'x', variables: [{ key: '1bad key', value: '1' }] })
  assert.equal(badName.status, 400)
})
await test('secret values echoed in error text are masked', async () => {
  const out = await exec(req({ url: '{{API_URL}}/echo', headers: [kv('X-Bad', 'line\nbreak sk_live_supersecret_value')] }), { environmentId: envId })
  assert.equal(out.ok, false)
  assert.ok(!JSON.stringify(out).includes('sk_live_supersecret_value'))
})
await test('OAuth client-credentials exchange returns a token without echoing the client secret', async () => {
  const r = await call('POST', '/oauth/token', {
    auth: { type: 'oauth2', grantType: 'client_credentials', accessTokenUrl: `${base}/token`, clientId: 'cid', clientSecret: 'csecret', scope: 'read', clientAuth: 'basic', tokenPrefix: 'Bearer', accessToken: '' },
  })
  assert.equal(r.json.ok, true)
  assert.equal(r.json.accessToken, 'tok_abc123456789')
  assert.match(lastSeen.body, /grant_type=client_credentials/)
  assert.equal(lastSeen.headers.authorization, `Basic ${Buffer.from('cid:csecret').toString('base64')}`)
  assert.ok(!JSON.stringify(r.json).includes('csecret'))
})

console.log('\nHistory')
await test('history records requests with redacted definitions; list/get/delete/clear work', async () => {
  await call('DELETE', '/history')
  const out = await exec(req({ url: `${base}/echo?api_key=LITERAL`, auth: { type: 'bearer', token: 'LITERALTOKEN', prefix: 'Bearer' }, headers: [kv('Cookie', 'sid=abc')] }))
  const failedOne = await exec(req({ url: 'http://127.0.0.1:1/' }))
  const list = await call('GET', '/history')
  assert.equal(list.json.history.length, 2)
  assert.equal(list.json.history[0].id, failedOne.historyId)
  assert.equal(list.json.history[0].errorCode, 'CONNECTION_REFUSED')
  assert.equal(list.json.history[1].status, 200)
  assert.ok(!JSON.stringify(list.json).includes('LITERAL'))
  const full = await call('GET', `/history/${out.historyId}`)
  assert.ok(!JSON.stringify(full.json).match(/LITERAL|sid=abc/))
  assert.equal(full.json.request.auth.token, '[REDACTED]')
  assert.equal((await call('DELETE', `/history/${out.historyId}`)).status, 200)
  assert.equal((await call('GET', '/history')).json.history.length, 1)
  await call('DELETE', '/history')
  assert.equal((await call('GET', '/history')).json.history.length, 0)
})

console.log('\nCollections and saved requests')
await test('collections: create nested, save requests, move, rename, duplicate, cascade delete', async () => {
  const root = (await call('POST', '/collections', { name: 'My APIs' })).json
  const auth = (await call('POST', '/collections', { name: 'Authentication', parentId: root.id })).json
  const users = (await call('POST', '/collections', { name: 'Users', parentId: root.id })).json
  const login = (await call('POST', '/requests', { name: 'Login', collectionId: auth.id, data: req({ method: 'POST', url: `${base}/echo` }) })).json
  const getUsers = (await call('POST', '/requests', { name: 'Get Users', collectionId: users.id, data: req({}) })).json
  assert.equal(login.data.method, 'POST')
  assert.equal(login.data.id, login.id)

  assert.equal((await call('PATCH', `/requests/${login.id}`, { collectionId: users.id })).json.collectionId, users.id)
  assert.equal((await call('PATCH', `/collections/${users.id}`, { name: 'People' })).json.name, 'People')
  const cycle = await call('PATCH', `/collections/${root.id}`, { parentId: users.id })
  assert.equal(cycle.status, 400, 'cannot move a collection into its own descendant')
  assert.equal((await call('PATCH', `/collections/${auth.id}`, { parentId: null })).json.parentId, null)

  const dup = await call('POST', `/collections/${root.id}/duplicate`)
  assert.equal(dup.json.collections.length, 2, 'root + People copied')
  assert.equal(dup.json.requests.length, 2)
  assert.ok(dup.json.collections.some((c: any) => c.name === 'My APIs copy'))

  const dupReq = await call('POST', `/requests/${getUsers.id}/duplicate`)
  assert.equal(dupReq.json.name, 'Get Users copy')

  assert.equal((await call('DELETE', `/collections/${root.id}`)).status, 200)
  const ws = await call('GET', '/workspace')
  assert.ok(!ws.json.requests.some((r: any) => r.id === login.id || r.id === getUsers.id), 'requests cascade-deleted with their collection')
  assert.ok(ws.json.collections.some((c: any) => c.id === auth.id), 'moved-out collection survives')
  assert.equal((await call('DELETE', '/collections/nope')).status, 404)
})
await test('bulk import creates a folder tree and an environment in one call', async () => {
  const r = await call('POST', '/import', {
    root: { name: 'Petstore', requests: [], folders: [{ name: 'pets', requests: [req({ name: 'List pets', url: '{{baseUrl}}/pets' })], folders: [] }] },
    environment: { name: 'Petstore', variables: [{ key: 'baseUrl', value: 'https://petstore.example.com', secret: false }] },
  })
  assert.equal(r.status, 200)
  assert.equal(r.json.collections.length, 2)
  assert.equal(r.json.requests[0].name, 'List pets')
  assert.equal(r.json.environment.name, 'Petstore')
})

console.log('\nDiagnostics and AI')
await test('diagnose performs a real DNS + TCP probe', async () => {
  const ok = await call('POST', '/diagnose', { url: `${base}/echo` })
  assert.equal(ok.json.tcp.ok, true)
  assert.equal(ok.json.addresses[0].address, '127.0.0.1')
  const closed = await call('POST', '/diagnose', { url: 'http://127.0.0.1:1/' })
  assert.equal(closed.json.tcp.ok, false)
  assert.equal(closed.json.tcp.error, 'ECONNREFUSED')
})
await test('AI context is built from the real request/response with all credentials redacted', () => {
  const input = aiChatSchema.parse({
    action: 'explain-error',
    request: req({ method: 'POST', url: 'https://api.example.com/users?api_key=QQQ', auth: { type: 'bearer', token: 'BEARERSECRET', prefix: 'Bearer' }, headers: [kv('X-Api-Key', 'HEADERSECRET'), kv('Accept', 'application/json')], body: { mode: 'json', json: '{"email":"a@b.c","password":"pw123"}' } }),
    response: {
      status: 401,
      statusText: 'Unauthorized',
      headers: [['WWW-Authenticate', 'Bearer realm="api"'], ['Set-Cookie', 'session=COOKIESECRET']],
      bodyText: '{"error":"invalid_token","access_token":"RESPONSESECRET","hint":"ENVSECRETVALUE1234"}',
    },
  })
  const ctx = buildContext(input, { vars: {}, secrets: [{ name: 'MY_KEY', value: 'ENVSECRETVALUE1234' }] })
  for (const s of ['QQQ', 'BEARERSECRET', 'HEADERSECRET', 'pw123', 'COOKIESECRET', 'RESPONSESECRET', 'ENVSECRETVALUE1234']) assert.ok(!ctx.includes(s), `${s} leaked into AI context`)
  assert.ok(ctx.includes('401 Unauthorized'))
  assert.ok(ctx.includes('WWW-Authenticate: Bearer realm="api"'))
  assert.ok(ctx.includes('POST https://api.example.com/users'))
  assert.ok(ctx.includes('{{MY_KEY}}'))
})
await test('AI chat streams a real answer when a provider is configured, else reports NO_PROVIDER', async () => {
  const status = await call('GET', '/ai/status')
  const res = await fetch(`${api}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'explain-error', request: req({ url: `${base}/status/404` }), response: { status: 404, statusText: 'Not Found', bodyText: '{"error":"nope"}' } }),
  })
  assert.equal(res.status, 200)
  const text = await res.text()
  const events = text.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
  if (status.json.configured) {
    const failure = events.find((e) => e.type === 'error')
    if (failure) {
      // A configured provider can still fail (quota, retired model). The route must surface that cleanly and leak nothing.
      assert.equal(failure.code, 'AI_FAILED')
      assert.ok(!/[A-Za-z0-9_-]{32,}/.test(failure.message), 'provider error must not contain key-like strings')
      console.log(`       (provider failed, surfaced cleanly: ${String(failure.message).slice(0, 110).replace(/\s+/g, ' ')}...)`)
    } else {
      assert.ok(events.some((e) => e.type === 'delta'), `expected streamed deltas, got ${text.slice(0, 200)}`)
      assert.ok(events.some((e) => e.type === 'done'))
      console.log(`       (live answer streamed via: ${status.json.providers.map((p: any) => p.name).join(', ')})`)
    }
  } else {
    assert.ok(events.some((e) => e.type === 'error' && e.code === 'NO_PROVIDER'))
  }
  const bad = await call('POST', '/ai/chat', { message: '' })
  assert.equal(bad.status, 400)
})

if (process.env.FETCHER_TEST_ONLINE === '1') {
  console.log('\nReal public APIs (online)')
  await test('GET https://jsonplaceholder.typicode.com/posts/1 (TLS, timings, JSON)', async () => {
    const out = await exec(req({ url: 'https://jsonplaceholder.typicode.com/posts/1' }))
    assert.equal(out.ok, true, JSON.stringify(out.error))
    assert.equal(out.response.status, 200)
    assert.equal(JSON.parse(out.response.bodyText).id, 1)
    assert.ok(out.network.tls?.protocol, 'TLS info present')
    assert.ok(out.timings.dnsMs !== undefined && out.timings.tlsMs !== undefined)
    console.log(`       ${out.response.status} ${Math.round(out.timings.totalMs)}ms ${out.response.sizeBytes}B ${out.network.tls.protocol} ${out.network.remoteAddress}`)
  })
  await test('POST https://jsonplaceholder.typicode.com/posts', async () => {
    const out = await exec(req({ method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts', body: { mode: 'json', json: '{"title":"foo","body":"bar","userId":1}' } }))
    assert.equal(out.response.status, 201)
    assert.equal(JSON.parse(out.response.bodyText).title, 'foo')
  })
  await test('PUT / PATCH / DELETE against jsonplaceholder', async () => {
    const put = await exec(req({ method: 'PUT', url: 'https://jsonplaceholder.typicode.com/posts/1', body: { mode: 'json', json: '{"id":1,"title":"x","body":"y","userId":1}' } }))
    assert.equal(put.response.status, 200)
    const patch = await exec(req({ method: 'PATCH', url: 'https://jsonplaceholder.typicode.com/posts/1', body: { mode: 'json', json: '{"title":"patched"}' } }))
    assert.equal(JSON.parse(patch.response.bodyText).title, 'patched')
    const del = await exec(req({ method: 'DELETE', url: 'https://jsonplaceholder.typicode.com/posts/1' }))
    assert.equal(del.response.status, 200)
  })
  await test('404 from a real API is a real 404', async () => {
    const out = await exec(req({ url: 'https://jsonplaceholder.typicode.com/posts/99999' }))
    assert.equal(out.response.status, 404)
  })
  await test('httpbin: headers, basic auth, gzip, redirect chain, status codes', async () => {
    const hdr = await exec(req({ url: 'https://httpbin.org/headers', headers: [kv('X-Custom', 'yes')] }))
    assert.equal(hdr.response.status, 200, 'httpbin reachable')
    assert.equal(JSON.parse(hdr.response.bodyText).headers['X-Custom'], 'yes')
    const basic = await exec(req({ url: 'https://httpbin.org/basic-auth/u/p', auth: { type: 'basic', username: 'u', password: 'p' } }))
    assert.equal(basic.response.status, 200)
    const bad = await exec(req({ url: 'https://httpbin.org/basic-auth/u/p', auth: { type: 'basic', username: 'u', password: 'wrong' } }))
    assert.equal(bad.response.status, 401)
    const red = await exec(req({ url: 'https://httpbin.org/redirect/2' }))
    assert.equal(red.response.redirects.length, 2)
    for (const code of [400, 403, 429, 502, 503]) assert.equal((await exec(req({ url: `https://httpbin.org/status/${code}` }))).response.status, code)
  })
  await test('real-host failures: expired cert reported as TLS error; bad DNS; slow endpoint times out', async () => {
    const tls = await exec(req({ url: 'https://expired.badssl.com/' }))
    assert.equal(tls.error?.code, 'TLS_ERROR', JSON.stringify(tls.error ?? tls.response?.status))
    const insecure = await exec(req({ url: 'https://expired.badssl.com/' }), { options: { insecureTls: true } })
    assert.equal(insecure.ok, true)
    const slow = await exec(req({ url: 'https://httpbin.org/delay/5' }), { options: { timeoutMs: 1000 } })
    assert.equal(slow.error?.code, 'TIMEOUT')
  })
}

await app.close()
upstream.close()
otherUpstream.close()
await closeDb()
try {
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  /* Windows may keep the sqlite file locked until the process exits */
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`Failed: ${failures.join('; ')}`)
  process.exit(1)
}
process.exit(0)
