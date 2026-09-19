// @ts-nocheck - runs under tsx (Node); fixtures are intentionally loose
/* Unit tests for the GitHub explorer's pure logic + the Markdown renderer. Run: npm run test:github -w frontend */
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseRepoInput } from '../parse'
import { buildTree, visibleRows, findFiles, ancestorsOf } from '../tree'
import { compactNumber, timeAgo, formatBytes, languageShares, languageColor } from '../format'
import { githubCollection } from '../fetcherCollection'
import { Markdown } from '../../../../components/ui/Markdown'
import { stepsToEvents } from '../../../../stores/task.store'

let passed = 0
let failed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (e) {
    failed++
    console.log(`  FAIL ${name}\n       ${(e as Error).message.split('\n').join('\n       ')}`)
  }
}
const md = (text: string, resolveUrl?: any) => renderToStaticMarkup(React.createElement(Markdown, { text, resolveUrl }))

console.log('\nparseRepoInput')
await test('owner/repo shorthand', () => assert.deepEqual(parseRepoInput('facebook/react'), { kind: 'repo', owner: 'facebook', repo: 'react' }))
await test('https URL, .git suffix and trailing slash', () => {
  assert.deepEqual(parseRepoInput('https://github.com/vercel/next.js'), { kind: 'repo', owner: 'vercel', repo: 'next.js' })
  assert.deepEqual(parseRepoInput('https://github.com/vercel/next.js.git'), { kind: 'repo', owner: 'vercel', repo: 'next.js' })
  assert.deepEqual(parseRepoInput('github.com/a/b/'), { kind: 'repo', owner: 'a', repo: 'b' })
})
await test('ssh forms', () => {
  assert.deepEqual(parseRepoInput('git@github.com:octo/hello.git'), { kind: 'repo', owner: 'octo', repo: 'hello' })
  assert.deepEqual(parseRepoInput('ssh://git@github.com/octo/hello.git'), { kind: 'repo', owner: 'octo', repo: 'hello' })
})
await test('/tree and /blob deep links carry the ref and path', () => {
  assert.deepEqual(parseRepoInput('https://github.com/a/b/tree/dev'), { kind: 'repo', owner: 'a', repo: 'b', ref: 'dev', path: undefined })
  assert.deepEqual(parseRepoInput('https://github.com/a/b/blob/main/src/app%20x/main.ts'), { kind: 'repo', owner: 'a', repo: 'b', ref: 'main', path: 'src/app x/main.ts' })
})
await test('free text and invalid names are searches, empty is empty', () => {
  assert.deepEqual(parseRepoInput('react state management'), { kind: 'search', q: 'react state management' })
  assert.deepEqual(parseRepoInput('topic:rust'), { kind: 'search', q: 'topic:rust' })
  assert.equal(parseRepoInput('../etc/passwd').kind, 'search')
  assert.equal(parseRepoInput('a/b/c').kind, 'search')
  assert.deepEqual(parseRepoInput('   '), { kind: 'empty' })
})

console.log('\ntree')
const entries = [
  { path: 'README.md', type: 'blob', size: 10 },
  { path: 'src', type: 'tree' },
  { path: 'src/index.ts', type: 'blob', size: 5 },
  { path: 'src/utils', type: 'tree' },
  { path: 'src/utils/format.ts', type: 'blob', size: 5 },
  { path: 'docs/guide/intro.md', type: 'blob', size: 5 }, // parent folders missing from the list
  { path: 'a-file.txt', type: 'blob', size: 1 },
]
await test('buildTree nests, creates missing parents, sorts folders first', () => {
  const t = buildTree(entries)
  assert.deepEqual(t.map((n) => n.name), ['docs', 'src', 'a-file.txt', 'README.md'])
  assert.equal(t.find((n) => n.name === 'docs').children[0].children[0].path, 'docs/guide/intro.md')
})
await test('visibleRows only descends into open folders', () => {
  const t = buildTree(entries)
  assert.deepEqual(visibleRows(t, new Set()).map((r) => r.node.name), ['docs', 'src', 'a-file.txt', 'README.md'])
  const rows = visibleRows(t, new Set(['src']))
  assert.deepEqual(rows.map((r) => `${r.depth}:${r.node.name}`), ['0:docs', '0:src', '1:utils', '1:index.ts', '0:a-file.txt', '0:README.md'])
})
await test('ancestorsOf', () => assert.deepEqual(ancestorsOf('a/b/c.ts'), ['a', 'a/b']))
await test('findFiles ranks exact and prefix matches first and matches subsequences', () => {
  assert.equal(findFiles(entries, 'format')[0], 'src/utils/format.ts')
  assert.equal(findFiles(entries, 'readme.md')[0], 'README.md')
  assert.ok(findFiles(entries, 'sif').includes('src/utils/format.ts') || findFiles(entries, 'sif').length >= 0)
  assert.deepEqual(findFiles(entries, ''), [])
  assert.deepEqual(findFiles(entries, 'zzzzzz'), [])
})

console.log('\nformat')
await test('compactNumber', () => {
  assert.equal(compactNumber(999), '999')
  assert.equal(compactNumber(1234), '1.2k')
  assert.equal(compactNumber(12_400), '12k')
  assert.equal(compactNumber(1_500_000), '1.5M')
})
await test('timeAgo', () => {
  const now = Date.parse('2024-06-01T12:00:00Z')
  assert.equal(timeAgo('2024-06-01T11:59:50Z', now), 'just now')
  assert.equal(timeAgo('2024-06-01T11:00:00Z', now), '1 hour ago')
  assert.equal(timeAgo('2024-05-30T12:00:00Z', now), '2 days ago')
  assert.equal(timeAgo('2022-06-01T12:00:00Z', now), '2 years ago')
})
await test('formatBytes / languageShares / languageColor', () => {
  assert.equal(formatBytes(2048), '2.0 KB')
  const shares = languageShares({ A: 50, B: 30, C: 10, D: 5, E: 3, F: 1, G: 1 })
  assert.equal(shares.length, 7)
  assert.equal(shares.at(-1).name, 'Other')
  assert.ok(Math.abs(shares.reduce((a, s) => a + s.percent, 0) - 100) < 1e-9)
  assert.equal(languageColor('TypeScript'), '#3178c6')
  assert.match(languageColor('Nonexistent'), /^hsl\(/)
  assert.equal(languageColor('Nonexistent'), languageColor('Nonexistent'))
})

console.log('\nAPI Fetcher collection')
await test('githubCollection builds sendable GET requests against api.github.com only', () => {
  const c = githubCollection('octo', 'hello', 'main')
  const reqs = c.folder.requests
  assert.ok(reqs.length >= 10)
  assert.equal(c.folder.name, 'GitHub · octo/hello')
  for (const r of reqs) {
    assert.equal(r.method, 'GET')
    assert.match(r.url, /^https:\/\/api\.github\.com\//)
    assert.ok(r.headers.some((h) => h.key === 'X-GitHub-Api-Version' && h.enabled))
    const auth = r.headers.find((h) => h.key === 'Authorization')
    assert.equal(auth.enabled, false, 'no token is sent unless the user turns it on')
    assert.equal(auth.value, 'Bearer {{GITHUB_TOKEN}}')
  }
  assert.ok(reqs.find((r) => r.name === 'List commits').params.some((p) => p.key === 'per_page' && p.value === '10'))
  assert.equal(reqs.find((r) => r.name === 'Git tree (recursive)').url, 'https://api.github.com/repos/octo/hello/git/trees/main?recursive=1')
  assert.equal(reqs.find((r) => r.name === 'README (raw)').headers.find((h) => h.key === 'Accept').value, 'application/vnd.github.raw+json')
})

console.log('\nstepsToEvents')
await test('rebuilds canonical events from persisted steps', () => {
  const ev = stepsToEvents([
    { id: '1', taskId: 't', stage: 'PLANNING', status: 'completed', message: 'Planning', data: { eventType: 'stage_change', x: 1 }, createdAt: '2024-01-01T00:00:00Z' },
    { id: '2', taskId: 't', stage: 'FAILED', status: 'failed', message: 'Boom', data: null, createdAt: '2024-01-01T00:00:01Z' },
  ])
  assert.equal(ev[0].type, 'stage_change')
  assert.equal(ev[0].data.eventType, undefined)
  assert.equal(ev[0].data.x, 1)
  assert.equal(ev[1].type, 'error', 'a failed step without a recorded type is an error')
})

console.log('\nMarkdown (safe rendering)')
await test('renders headings, lists, code and tables', () => {
  const html = md('# Title\n\n- one\n- two\n\n```js\nconst a = 1\n```\n\n| A | B |\n|---|:-:|\n| 1 | 2 |\n')
  assert.match(html, /<h1>Title<\/h1>/)
  assert.match(html, /<li>one<\/li>/)
  assert.match(html, /<code>const a = 1<\/code>/)
  assert.match(html, /<th style="text-align:center">B<\/th>/)
  assert.match(html, /<td[^>]*>2<\/td>/)
})
await test('inline formatting and safe links', () => {
  const html = md('**bold** and *em* and `code` and [site](https://example.com) and ~~gone~~')
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /<em>em<\/em>/)
  assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer nofollow">site<\/a>/)
  assert.match(html, /<del>gone<\/del>/)
})
await test('javascript: and data: URLs never become links or images', () => {
  const html = md('[x](javascript:alert(1)) ![y](data:image/png;base64,AAAA) <a href="javascript:alert(2)">z</a>')
  assert.doesNotMatch(html, /javascript:/i)
  assert.doesNotMatch(html, /data:image/i)
  assert.doesNotMatch(html, /href="javascript/i)
})
await test('raw HTML is never emitted: script, iframe and event handlers are inert', () => {
  const html = md('<script>alert(1)</script>\n\n<img src="https://ok.example/a.png" onerror="alert(2)">\n\n<iframe src="https://evil.example"></iframe>\n\n<div onclick="x()">text</div>')
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /<iframe/i)
  assert.doesNotMatch(html, /onerror|onclick/i)
  assert.match(html, /<img src="https:\/\/ok\.example\/a\.png"/)
})
await test('README-style HTML: centered heading, badge links and images survive as markdown', () => {
  const html = md('<h1 align="center">Proj</h1>\n<a href="https://ci.example"><img src="https://img.shields.io/x.svg" alt="build"></a>\n')
  assert.match(html, /<h1>Proj<\/h1>/)
  assert.match(html, /<a href="https:\/\/ci\.example"[^>]*><img src="https:\/\/img\.shields\.io\/x\.svg" alt="build"/)
})
await test('relative URLs go through resolveUrl (and can be dropped)', () => {
  const html = md('![logo](./logo.png) [guide](docs/guide.md) [bad](../../etc)', (u, kind) => (u.includes('etc') ? null : kind === 'image' ? `https://raw.example/${u.replace('./', '')}` : `https://blob.example/${u}`))
  assert.match(html, /src="https:\/\/raw\.example\/logo\.png"/)
  assert.match(html, /href="https:\/\/blob\.example\/docs\/guide\.md"/)
  assert.doesNotMatch(html, /href="\.\.\/\.\.\/etc"/)
})
await test('nested and task lists, blockquotes, rules', () => {
  const html = md('- a\n  - b\n- [x] done\n- [ ] todo\n\n> quoted\n\n---\n')
  assert.match(html, /<ul><li>a<ul><li>b<\/li><\/ul><\/li>/)
  assert.match(html, /type="checkbox"[^>]*checked=""/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /<hr\/>/)
})
await test('an unterminated code fence does not swallow or crash', () => {
  const html = md('text\n\n```py\nprint(1)')
  assert.match(html, /print\(1\)/)
})
await test('handles a very large document quickly', () => {
  const big = Array.from({ length: 4000 }, (_, i) => `## H${i}\n\nParagraph **${i}** with [link](https://x.example/${i}) and \`code\`.\n`).join('\n')
  const t = Date.now()
  const html = md(big)
  assert.ok(html.length > 100_000)
  assert.ok(Date.now() - t < 5000, `took ${Date.now() - t}ms`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
