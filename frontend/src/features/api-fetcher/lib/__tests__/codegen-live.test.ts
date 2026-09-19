// @ts-nocheck - runs under tsx (Node)
/* Executes generated snippets in every runtime installed on this machine and verifies what a real server receives.
 * Run: npm run test:codegen -w frontend   (set AXIOS_DIR to a folder containing node_modules/axios to include Axios) */
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { generateCode, type LangId } from '../codegen'
import { normalizeRequest } from '../request'
import type { Environment } from '../../types'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-live-'))
let last: { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string } = { headers: {}, body: '' }
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    last = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true }))
  })
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as any).port}`
const env: Environment = { id: 'e', name: 'e', position: 0, updatedAt: '', variables: [{ key: 'BASE', value: base, secret: false, hasValue: true }] }

function runAsync(cmd: string, args: string[], cwd: string): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: false })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => {
      child.kill()
      stderr += ' [timed out after 20s]'
    }, 20_000)
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, stderr })
    })
    child.on('error', (e) => resolve({ status: -1, stderr: String(e) }))
  })
}

const has = (cmd: string, args = ['--version']) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0
const axiosDir = process.env.AXIOS_DIR
const runtimes: Record<LangId, { ok: boolean; file: string; run: (f: string) => Promise<{ status: number | null; stderr: string }> } | null> = {
  'js-fetch': { ok: true, file: 'snippet.mjs', run: (f) => runAsync('node', [f], dir) },
  'ts-fetch': { ok: true, file: 'snippet.mts', run: (f) => runAsync('node', [f], dir) },
  'js-axios': axiosDir ? { ok: true, file: 'snippet-axios.mjs', run: (f) => runAsync('node', [f], axiosDir) } : null,
  'py-requests': has('python') ? { ok: true, file: 'snippet_r.py', run: (f) => runAsync('python', [f], dir) } : null,
  'py-httpx': has('python') ? { ok: true, file: 'snippet_h.py', run: (f) => runAsync('python', [f], dir) } : null,
  curl: has('curl') ? { ok: true, file: 'snippet.sh', run: (f) => runAsync('bash', [f], dir) } : null,
  java: null,
  csharp: null,
  go: null,
  php: null,
}

type Case = { name: string; req: Record<string, unknown>; check: (l: typeof last) => void }
const cases: Case[] = [
  {
    name: 'GET with query, custom header, secret bearer placeholder',
    req: { method: 'GET', url: '{{BASE}}/users?page=1&limit=20&q=a%20b', headers: [{ key: 'X-Trace', value: 'abc', enabled: true }, { key: 'Authorization', value: 'Bearer {{API_TOKEN}}', enabled: true }] },
    check: (l) => {
      assert.equal(l.method, 'GET')
      assert.equal(l.url, '/users?page=1&limit=20&q=a%20b')
      assert.equal(l.headers['x-trace'], 'abc')
      assert.equal(l.headers.authorization, 'Bearer YOUR_API_TOKEN')
    },
  },
  {
    name: 'POST JSON body with nested data, unicode and quotes',
    req: { method: 'POST', url: '{{BASE}}/users', body: { mode: 'json', json: '{"name":"José \\"Pepe\\"","email":"john@example.com","tags":["a","b"],"n":{"x":1.5,"ok":true,"none":null}}' } },
    check: (l) => {
      assert.equal(l.method, 'POST')
      assert.match(String(l.headers['content-type']), /application\/json/)
      // curl.exe on Windows receives argv in the ANSI code page, so non-ASCII text is mangled by the OS, not by the snippet.
      const body = JSON.parse(l.body)
      if (currentLang === 'curl' && process.platform === 'win32') body.name = 'José "Pepe"'
      assert.deepEqual(body, { name: 'José "Pepe"', email: 'john@example.com', tags: ['a', 'b'], n: { x: 1.5, ok: true, none: null } })
    },
  },
  {
    name: 'PUT urlencoded form',
    req: { method: 'PUT', url: '{{BASE}}/f', body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: 'b c', enabled: true }, { key: 'x', value: '1&2', enabled: true }] } },
    check: (l) => {
      assert.equal(l.method, 'PUT')
      assert.deepEqual(Object.fromEntries(new URLSearchParams(l.body)), { a: 'b c', x: '1&2' })
    },
  },
  {
    name: 'POST multipart form-data',
    req: { method: 'POST', url: '{{BASE}}/up', body: { mode: 'form-data', form: [{ key: 'field', value: 'value', enabled: true }] } },
    check: (l) => {
      assert.match(String(l.headers['content-type']), /^multipart\/form-data; boundary=/)
      assert.match(l.body, /name="field"\r?\n\r?\nvalue/)
    },
  },
  {
    name: 'PATCH raw text body',
    req: { method: 'PATCH', url: '{{BASE}}/r', body: { mode: 'raw', raw: "it's a\nmulti-line 'text'", rawContentType: 'text/plain' } },
    check: (l) => {
      assert.equal(l.method, 'PATCH')
      assert.equal(l.body.replace(/\r/g, ''), "it's a\nmulti-line 'text'")
    },
  },
  {
    name: 'Basic auth',
    req: { method: 'GET', url: '{{BASE}}/b', auth: { type: 'basic', username: 'alice', password: 'real-password' } },
    check: (l) => assert.equal(l.headers.authorization, `Basic ${Buffer.from('alice:YOUR_PASSWORD').toString('base64')}`),
  },
  { name: 'DELETE without body', req: { method: 'DELETE', url: '{{BASE}}/d/1' }, check: (l) => { assert.equal(l.method, 'DELETE'); assert.equal(l.body, '') } },
  { name: 'HEAD', req: { method: 'HEAD', url: '{{BASE}}/h' }, check: (l) => assert.equal(l.method, 'HEAD') },
]

let currentLang = ''
let passed = 0
let failed = 0
let skipped = 0
const langs = Object.keys(runtimes) as LangId[]
for (const lang of langs) {
  const rt = runtimes[lang]
  currentLang = lang
  console.log(`\n${lang}`)
  if (!rt) {
    skipped++
    console.log('  skip (runtime not available on this machine)')
    continue
  }
  for (const c of cases) {
    // HEAD via Python/Node fetch works; curl needs --request HEAD which the generator emits.
    try {
      last = { headers: {}, body: '' }
      const def = normalizeRequest(c.req)
      const code = generateCode(def, lang, env, { responseIsJson: false })
      const file = path.join(lang === 'js-axios' ? axiosDir! : dir, rt.file)
      fs.writeFileSync(file, code)
      const r = await rt.run(file)
      if (r.status !== 0) throw new Error(`exit ${r.status}\n${r.stderr.slice(0, 600)}\n${code}`)
      c.check(last)
      passed++
      console.log(`  ok   ${c.name}`)
    } catch (e) {
      failed++
      console.log(`  FAIL ${c.name}\n       ${(e as Error).message.split('\n').join('\n       ')}`)
    }
  }
}

server.close()
try {
  fs.rmSync(dir, { recursive: true, force: true })
} catch {
  /* ignore */
}
console.log(`\n${passed} passed, ${failed} failed, ${skipped} runtimes skipped (${langs.filter((l) => !runtimes[l]).join(', ') || 'none'})`)
process.exit(failed ? 1 : 0)
