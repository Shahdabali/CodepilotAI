// @ts-nocheck - runs under tsx (Node); fixtures are intentionally loose
/* Unit tests for the API Fetcher's pure logic. Run: npm run test:fetcher -w frontend */
import assert from 'node:assert/strict'
import { checkJson, formatJsonText, buildRows, searchJson, DEFAULT_EXPAND, pathToString, ancestorIds } from '../json'
import { applyParamsToUrl, syncParamsFromUrl, buildQuery, parseQuery, newKv, snapshotOf, newRequest, normalizeRequest } from '../request'
import { parseCurl, tokenizeShell } from '../curl'
import { importOpenApi, exampleFromSchema } from '../openapi'
import { generateTypes, inferShape, mergeShapes } from '../typegen'
import { generateCode, LANGUAGES, prepareRequest } from '../codegen'
import { importJson, exportRequestJson, exportCollectionJson } from '../transfer'
import { redactRequest, redactUrl, isSensitiveName, hasLiteralSecrets } from '../redact'
import { explainStatus, extractServerMessage } from '../http-info'
import { formatBytes, formatMs, statusClass } from '../format'
import { resolveForDisplay, variableState, findVariables } from '../variables'
import type { Environment, RequestDef } from '../../types'

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

const env: Environment = {
  id: 'e1',
  name: 'Dev',
  position: 0,
  updatedAt: '',
  variables: [
    { key: 'API_URL', value: 'https://dev-api.example.com', secret: false, hasValue: true },
    { key: 'API_TOKEN', value: '', secret: true, hasValue: true },
  ],
}

console.log('\nJSON validation, formatting and tree')
await test('valid JSON passes; positions and messages are precise for errors', () => {
  assert.equal(checkJson('{"name":"John","email":"john@example.com"}'), null)
  assert.equal(checkJson('  [1, 2.5e3, -0.1, true, false, null, "x\\n\\u00e9"]  '), null)
  assert.equal(checkJson(''), null)
  const cases: Array<[string, RegExp, number]> = [
    ['{"a":1,}', /Trailing comma/, 7],
    ['{"a":1 "b":2}', /Expected ',' or '}'/, 7],
    ["{'a':1}", /double quotes/, 1],
    ['{"a":}', /Unexpected '}'/, 5],
    ['[1,2', /end of input/, 4],
    ['{"a":"x', /Unterminated string/, 5],
    ['{"a":01}', /Expected ',' or '}'/, 6],
    ['{"a":1}}', /after the end/, 7],
    ['{"a":"\\q"}', /Invalid escape/, 6],
    ['{"a":tru}', /Unexpected 't'|Unexpected/, 5],
  ]
  for (const [text, re, pos] of cases) {
    const err = checkJson(text)
    assert.ok(err, `expected an error for ${text}`)
    assert.match(err!.message, re, text)
    assert.equal(err!.pos, pos, `${text}: position`)
  }
  const multi = checkJson('{\n  "a": 1,\n  "b": ,\n}')
  assert.equal(multi!.line, 3)
})
await test('{{variables}} are valid values (quoted or bare) but not keys', () => {
  assert.equal(checkJson('{"id": {{USER_ID}}, "name": "{{NAME}}", "list": [{{A}}, {{B}}]}'), null)
  assert.ok(checkJson('{ {{K}}: 1 }'))
})
await test('format keeps unquoted variables intact and reports errors instead of throwing', () => {
  const r = formatJsonText('{"id":{{USER_ID}},"n":"{{N}}","a":[1,2]}')
  assert.ok(r.ok)
  if (r.ok) {
    assert.ok(r.text.includes('"id": {{USER_ID}}'))
    assert.ok(r.text.includes('"n": "{{N}}"'))
    assert.equal(r.text.split('\n').length, 8)
  }
  const min = formatJsonText('{\n "a": [1, 2]\n}', 0)
  assert.ok(min.ok && min.text === '{"a":[1,2]}')
  const bad = formatJsonText('{"a":')
  assert.equal(bad.ok, false)
})
await test('tree rows: collapse/expand, counts, closing brackets and commas', () => {
  const doc = { a: 1, b: { c: [1, 2, { d: null }], e: 'x' }, f: [] }
  const shallow = buildRows(doc, { depth: 1, open: new Set(), closed: new Set() }).rows
  assert.deepEqual(shallow.map((r) => r.text), ['{', '1', '{…}', '[]', '}'])
  assert.equal(shallow[2].childCount, 2)
  assert.equal(shallow[2].comma, true)
  const full = buildRows(doc, { depth: 99, open: new Set(), closed: new Set() }).rows
  assert.ok(full.length > 10)
  assert.equal(full.filter((r) => r.closing).length, 4)
  const forced = buildRows(doc, { depth: 1, open: new Set(['b']), closed: new Set() }).rows
  assert.ok(forced.some((r) => r.keyLabel === 'c'))
  assert.equal(buildRows(doc, DEFAULT_EXPAND).rows[0].depth, 0)
})
await test('tree handles very large arrays without blowing up', () => {
  const big = Array.from({ length: 50_000 }, (_, i) => ({ id: i, name: `n${i}` }))
  const t0 = Date.now()
  const collapsed = buildRows(big, { depth: 1, open: new Set(), closed: new Set() }).rows
  assert.equal(collapsed.length, 50_000 + 2)
  const expanded = buildRows(big, { depth: 2, open: new Set(), closed: new Set() }).rows
  assert.equal(expanded.length, 50_000 * 4 + 2)
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0}ms`)
})
await test('search finds keys and values in document order with reveal paths', () => {
  const doc = { users: [{ name: 'Alice', tags: ['x'] }, { name: 'Bob', nickname: 'alicia' }] }
  const { matches } = searchJson(doc, 'ali')
  assert.deepEqual(matches.map((m) => `${pathToString(m.path)}:${m.where}`), ['$.users[0].name:value', '$.users[1].nickname:value'])
  assert.deepEqual(searchJson(doc, 'NAME').matches.map((m) => m.where), ['key', 'key', 'key'], 'name, name and nickname')
  assert.equal(ancestorIds(matches[1].path).length, 3)
  assert.equal(pathToString(['a b', 0, 'c']), '$["a b"][0].c')
})

console.log('\nQuery params <-> URL')
await test('params build the query string, preserving {{vars}} and encoding the rest', () => {
  const params = [newKv('page', '1'), newKv('q', 'hello world&more'), newKv('skip', 'x', false), newKv('id', '{{USER_ID}}')]
  assert.equal(buildQuery(params), 'page=1&q=hello%20world%26more&id={{USER_ID}}')
  assert.equal(applyParamsToUrl('{{API_URL}}/users?old=1#top', params), '{{API_URL}}/users?page=1&q=hello%20world%26more&id={{USER_ID}}#top')
  assert.deepEqual(parseQuery('a=1&b=x%20y&c&d=%7B%7Bv%7D%7D'), [{ key: 'a', value: '1' }, { key: 'b', value: 'x y' }, { key: 'c', value: '' }, { key: 'd', value: '{{v}}'.replace('{{v}}', '{{v}}') }].map((x) => (x.key === 'd' ? { key: 'd', value: '{{v}}' } : x)))
})
await test('editing the URL updates params (keeping ids and disabled rows)', () => {
  const existing = [newKv('page', '1'), newKv('off', 'z', false)]
  const next = syncParamsFromUrl('https://x.com/a?page=2&limit=20', existing)
  assert.deepEqual(next.map((p) => [p.key, p.value, p.enabled]), [['page', '2', true], ['limit', '20', true], ['off', 'z', false]])
  assert.equal(next[0].id, existing[0].id)
})
await test('dirty snapshot ignores row ids', () => {
  const a = newRequest({ url: 'x', params: [newKv('a', '1')] })
  const b = { ...a, params: [{ ...a.params[0], id: 'other' }] }
  assert.equal(snapshotOf(a), snapshotOf(b))
  assert.notEqual(snapshotOf(a), snapshotOf({ ...a, url: 'y' }))
})

console.log('\ncURL import')
await test('the example from the spec converts to an editable request', () => {
  const r = parseCurl('curl -X GET "https://api.example.com/users"')
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.request.method, 'GET')
    assert.equal(r.request.url, 'https://api.example.com/users')
  }
})
await test('multi-line command with headers, JSON body, basic auth and query', () => {
  const r = parseCurl(`curl 'https://api.example.com/users?page=2&limit=5' \\
  -H 'Accept: application/json' \\
  -H 'Authorization: Bearer abc.def' \\
  -H 'Content-Type: application/json' \\
  --data-raw '{"name":"John","tags":["a"]}' --compressed`)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.request.method, 'POST')
  assert.deepEqual(r.request.params.map((p) => [p.key, p.value]), [['page', '2'], ['limit', '5']])
  assert.deepEqual(r.request.auth, { type: 'bearer', token: 'abc.def', prefix: 'Bearer' })
  assert.equal(r.request.body.mode, 'json')
  assert.deepEqual(JSON.parse(r.request.body.json), { name: 'John', tags: ['a'] })
  assert.ok(!r.request.headers.some((h) => h.key.toLowerCase() === 'content-type'), 'json content type is implied')
  assert.ok(r.request.headers.some((h) => h.key === 'Accept'))
})
await test('flags: -u, -F, --data-urlencode, -G, -I, -sSL combos, attached values', () => {
  let r = parseCurl('curl -sSL -u user:pa:ss -XDELETE https://x.com/a')
  assert.ok(r.ok && r.request.method === 'DELETE' && r.request.auth.type === 'basic' && (r.request.auth as any).password === 'pa:ss')
  r = parseCurl('curl https://x.com/up -F name=John -F "note=hi there"')
  assert.ok(r.ok && r.request.body.mode === 'form-data' && r.request.body.form.length === 2 && r.request.method === 'POST')
  r = parseCurl('curl -G https://x.com/s --data-urlencode "q=a b&c"')
  assert.ok(r.ok && r.request.method === 'GET' && r.request.url.includes('q=a%20b%26c'))
  r = parseCurl('curl -I https://x.com')
  assert.ok(r.ok && r.request.method === 'HEAD')
  r = parseCurl('curl https://x.com -d "a=1&b=2" -H "Content-Type: application/x-www-form-urlencoded"')
  assert.ok(r.ok && r.request.body.mode === 'urlencoded' && r.request.body.urlencoded.length === 2)
  r = parseCurl('curl https://x.com -d "plain text" ')
  assert.ok(r.ok && r.request.body.mode === 'raw')
})
await test('quoting: $\'…\' ANSI-C strings, escaped quotes, Windows ^ escapes', () => {
  assert.deepEqual(tokenizeShell(`curl -d $'{"a":"line\\nbreak"}' 'it'\\''s'`), ['curl', '-d', '{"a":"line\nbreak"}', "it's"])
  assert.deepEqual(tokenizeShell('curl "say \\"hi\\""'), ['curl', 'say "hi"'])
  const win = parseCurl('curl ^"https://x.com/a^" ^\n  -H ^"X-Test: 1^" ^\n  --data-raw ^"^{^\\^"a^\\^":1^}^"')
  assert.ok(win.ok, JSON.stringify(win))
})
await test('bad input yields clear errors', () => {
  assert.equal(parseCurl('').ok, false)
  assert.match((parseCurl('wget https://x.com') as any).error, /cURL/)
  assert.match((parseCurl('curl -H') as any).error, /expects a value/)
  assert.match((parseCurl('curl -X POST') as any).error, /No URL/)
})

console.log('\nOpenAPI / Swagger import')
const OAS3_YAML = `
openapi: 3.0.3
info: { title: Pet Store, version: '1.0' }
servers: [ { url: 'https://{env}.petstore.io/v2', variables: { env: { default: api } } } ]
security: [ { bearerAuth: [] } ]
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    Pet:
      type: object
      required: [name]
      properties:
        id: { type: integer, format: int64 }
        name: { type: string, example: Rex }
        status: { type: string, enum: [available, sold] }
        owner: { $ref: '#/components/schemas/Owner' }
        born: { type: string, format: date-time }
    Owner:
      type: object
      properties:
        email: { type: string, format: email }
        pets: { type: array, items: { $ref: '#/components/schemas/Pet' } }
paths:
  /pets:
    get:
      tags: [pets]
      summary: List pets
      parameters:
        - { name: limit, in: query, schema: { type: integer, default: 20 } }
        - { name: status, in: query, required: true, schema: { type: string, enum: [available] } }
    post:
      tags: [pets]
      operationId: createPet
      requestBody:
        content:
          application/json: { schema: { $ref: '#/components/schemas/Pet' } }
  /pets/{petId}:
    parameters: [ { name: petId, in: path, required: true, schema: { type: integer }, example: 7 } ]
    delete:
      tags: [pets]
      security: []
      summary: Delete pet
  /login:
    post:
      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema: { type: object, properties: { user: { type: string }, pass: { type: string } } }
`
await test('OpenAPI 3 (YAML): folders by tag, env vars, examples from $ref schemas, auth, cyclic refs', async () => {
  const r = await importOpenApi(OAS3_YAML)
  assert.equal(r.folder!.name, 'Pet Store')
  assert.deepEqual(r.folder!.folders.map((f) => f.name).sort(), ['default', 'pets'])
  const pets = r.folder!.folders.find((f) => f.name === 'pets')!
  const list = pets.requests.find((x) => x.name === 'List pets')!
  assert.equal(list.method, 'GET')
  assert.equal(list.url, '{{baseUrl}}/pets?status=available&limit=20'.replace('status=available&limit=20', 'status=available'))
  assert.deepEqual(list.params.map((p) => [p.key, p.value, p.enabled]), [['limit', '20', false], ['status', 'available', true]])
  assert.equal(list.auth.type, 'bearer')
  const create = pets.requests.find((x) => x.name === 'createPet')!
  const body = JSON.parse(create.body.json)
  assert.equal(body.name, 'Rex')
  assert.equal(body.status, 'available')
  assert.equal(body.born, '2024-01-01T00:00:00Z')
  assert.equal(body.owner.email, 'user@example.com')
  assert.ok(Array.isArray(body.owner.pets), 'cyclic reference terminated')
  const del = pets.requests.find((x) => x.name === 'Delete pet')!
  assert.equal(del.url, '{{baseUrl}}/pets/{{petId}}')
  assert.equal(del.auth.type, 'none', 'operation-level security: [] disables auth')
  const login = r.folder!.folders.find((f) => f.name === 'default')!.requests[0]
  assert.equal(login.body.mode, 'urlencoded')
  const vars = Object.fromEntries(r.environment!.variables.map((v) => [v.key, v]))
  assert.equal(vars.baseUrl.value, 'https://api.petstore.io/v2')
  assert.equal(vars.petId.value, '7')
  assert.equal(vars.token.secret, true)
  assert.equal(vars.token.value, '')
})
await test('Swagger 2.0 (JSON): base url, body and formData params', async () => {
  const r = await importOpenApi(
    JSON.stringify({
      swagger: '2.0',
      info: { title: 'Legacy' },
      host: 'legacy.example.com',
      basePath: '/api',
      schemes: ['https'],
      securityDefinitions: { key: { type: 'apiKey', name: 'X-Key', in: 'header' } },
      security: [{ key: [] }],
      definitions: { U: { type: 'object', properties: { n: { type: 'string' } } } },
      paths: {
        '/u': { post: { parameters: [{ in: 'body', name: 'b', schema: { $ref: '#/definitions/U' } }] } },
        '/f': { post: { consumes: ['multipart/form-data'], parameters: [{ in: 'formData', name: 'file', type: 'string' }] } },
      },
    })
  )
  const reqs = r.folder!.folders[0].requests
  assert.equal(r.environment!.variables.find((v) => v.key === 'baseUrl')!.value, 'https://legacy.example.com/api')
  assert.deepEqual(JSON.parse(reqs[0].body.json), { n: 'string' })
  assert.equal(reqs[1].body.mode, 'form-data')
  assert.deepEqual(reqs[0].auth, { type: 'apikey', key: 'X-Key', value: '{{apiKey}}', in: 'header' })
})
await test('non-OpenAPI and empty specs are rejected with useful messages', async () => {
  await assert.rejects(() => importOpenApi('{"hello":1}'), /not an OpenAPI/)
  await assert.rejects(() => importOpenApi('openapi: 3.0.0\ninfo: {title: x}\npaths: {}'), /No operations/)
  await assert.rejects(() => importOpenApi('   '), /empty/)
  await assert.rejects(() => importOpenApi('{bad json'), /Invalid JSON/)
  assert.equal(exampleFromSchema({}, { type: 'integer', minimum: 5 }), 5)
})

console.log('\nJSON / Postman import and export')
const sample: RequestDef = normalizeRequest({
  name: 'Create user',
  method: 'POST',
  url: '{{API_URL}}/users?api_key=SECRETKEY',
  headers: [{ key: 'Authorization', value: 'Bearer LITERALTOKEN', enabled: true }, { key: 'X-Trace', value: 'ok', enabled: true }],
  body: { mode: 'json', json: '{"name":"John","password":"pw123"}' },
  auth: { type: 'bearer', token: 'AUTHTOKEN', prefix: 'Bearer' },
})
await test('request export strips credentials by default and can include them on demand', () => {
  const safe = exportRequestJson(sample, false)
  for (const s of ['SECRETKEY', 'LITERALTOKEN', 'AUTHTOKEN', 'pw123']) assert.ok(!safe.includes(s), `${s} in safe export`)
  const full = exportRequestJson(sample, true)
  for (const s of ['SECRETKEY', 'LITERALTOKEN', 'AUTHTOKEN', 'pw123']) assert.ok(full.includes(s))
  const back = importJson(safe)
  assert.equal(back.requests![0].method, 'POST')
  assert.ok(back.warnings[0].includes('Credentials'))
})
await test('collection export/import round-trips folders and requests', () => {
  const cols = [{ id: 'r', name: 'My APIs', parentId: null, position: 0, createdAt: '', updatedAt: '' }, { id: 'a', name: 'Auth', parentId: 'r', position: 0, createdAt: '', updatedAt: '' }]
  const reqs = [{ id: '1', collectionId: 'a', name: 'Login', method: 'POST' as const, url: 'https://x.com/login', data: sample, position: 0, createdAt: '', updatedAt: '' }]
  const json = exportCollectionJson('r', cols, reqs, false)
  const back = importJson(json)
  assert.equal(back.folder!.name, 'My APIs')
  assert.equal(back.folder!.folders[0].name, 'Auth')
  assert.equal(back.folder!.folders[0].requests[0].name, 'Login')
  assert.ok(!json.includes('AUTHTOKEN'))
})
await test('bare request, array and Postman v2.1 collections are recognised', () => {
  assert.equal(importJson('{"method":"get","url":"https://x.com/a?b=1"}').requests![0].params[0].key, 'b')
  assert.equal(importJson('[{"url":"https://a.com"},{"url":"https://b.com","method":"DELETE"}]').requests!.length, 2)
  const pm = importJson(
    JSON.stringify({
      info: { name: 'PM', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'host', value: 'https://api.x.com' }],
      auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{tok}}' }] },
      item: [
        { name: 'Users', item: [{ name: 'Get', request: { method: 'GET', header: [{ key: 'A', value: 'b', disabled: true }], url: { raw: '{{host}}/users?x=1' } } }] },
        { name: 'Create', request: { method: 'POST', url: '{{host}}/users', body: { mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } } } },
      ],
    })
  )
  assert.equal(pm.folder!.folders[0].requests[0].url, '{{host}}/users?x=1')
  assert.equal(pm.folder!.folders[0].requests[0].headers[0].enabled, false)
  assert.equal(pm.folder!.requests[0].body.mode, 'json')
  assert.equal(pm.folder!.requests[0].auth.type, 'bearer')
  assert.equal(pm.environment!.variables[0].key, 'host')
  assert.throws(() => importJson('{"foo":1}'), /Unrecognised/)
  assert.throws(() => importJson('nope'), /Invalid JSON/)
})

console.log('\nRedaction')
await test('client redaction mirrors the server rules', () => {
  const r = redactRequest(sample)
  assert.equal(r.url, '{{API_URL}}/users?api_key=[REDACTED]')
  assert.equal(r.headers[0].value, '[REDACTED]')
  assert.equal(r.headers[1].value, 'ok')
  assert.equal((r.auth as any).token, '[REDACTED]')
  assert.ok(!r.body.json.includes('pw123'))
  assert.ok(hasLiteralSecrets(sample))
  assert.ok(!hasLiteralSecrets(normalizeRequest({ url: 'https://x.com', headers: [{ key: 'Authorization', value: 'Bearer {{T}}', enabled: true }], auth: { type: 'bearer', token: '{{T}}', prefix: 'Bearer' } })))
  assert.equal(redactUrl('https://u:p@h.com/x?token=abc&a=1'), 'https://h.com/x?token=[REDACTED]&a=1')
  assert.ok(isSensitiveName('X-Amz-Security-Token') && !isSensitiveName('Accept-Language'))
})

console.log('\nVariables')
await test('non-secret variables resolve for display; secrets never do', () => {
  assert.equal(resolveForDisplay('{{API_URL}}/x/{{API_TOKEN}}/{{NOPE}}', env), 'https://dev-api.example.com/x/{{API_TOKEN}}/{{NOPE}}')
  assert.deepEqual(['API_URL', 'API_TOKEN', 'NOPE', '$guid'].map((n) => variableState(n, env)), ['defined', 'secret', 'missing', 'dynamic'])
  assert.deepEqual(findVariables('{{ a }} {{b.c}} {{a}}'), ['a', 'b.c'])
})

console.log('\nCode generation')
const genReq = normalizeRequest({
  name: 'Create user',
  method: 'POST',
  url: '{{API_URL}}/users?page=1&api_key=LITERALKEY',
  headers: [{ key: 'X-Trace', value: 'abc', enabled: true }, { key: 'Authorization', value: 'Bearer {{API_TOKEN}}', enabled: true }],
  body: { mode: 'json', json: '{"name":"John","email":"john@example.com","password":"hunter2","address":{"city":"Paris"},"tags":["a","b"],"active":true,"none":null}' },
})
await test('every language generates non-empty code with resolved public vars and NO credentials', () => {
  for (const lang of LANGUAGES) {
    const code = generateCode(genReq, lang.id, env, { responseIsJson: true, rootType: 'Root' })
    assert.ok(code.length > 50, lang.id)
    assert.ok(code.includes('https://dev-api.example.com/users'), `${lang.id}: API_URL should resolve`)
    assert.ok(code.includes('YOUR_API_TOKEN'), `${lang.id}: secret var becomes placeholder`)
    for (const leak of ['LITERALKEY', 'hunter2']) assert.ok(!code.includes(leak), `${lang.id} leaked ${leak}`)
    assert.ok(code.includes('john@example.com'), `${lang.id}: body kept`)
  }
})
await test('the example shape from the spec (fetch) is produced', () => {
  const code = generateCode(normalizeRequest({ url: 'https://api.example.com/users', headers: [{ key: 'Authorization', value: 'Bearer TOKEN', enabled: true }] }), 'js-fetch', null, { responseIsJson: true })
  assert.ok(code.includes('method: "GET"'))
  assert.ok(code.includes('"Authorization": "Bearer YOUR_TOKEN"'))
  assert.ok(code.includes('await fetch(url, options)'))
  assert.ok(code.includes('await response.json()'))
})
await test('auth types map to idiomatic constructs', () => {
  const basic = normalizeRequest({ url: 'https://x.com', auth: { type: 'basic', username: 'u', password: 'secret' } })
  assert.ok(generateCode(basic, 'curl', null).includes("--user 'u:YOUR_PASSWORD'"))
  assert.ok(generateCode(basic, 'py-requests', null).includes('auth=("u", "YOUR_PASSWORD")'))
  assert.ok(generateCode(basic, 'go', null).includes('req.SetBasicAuth("u", "YOUR_PASSWORD")'))
  assert.ok(generateCode(basic, 'php', null).includes("CURLOPT_USERPWD => 'u:YOUR_PASSWORD'"))
  assert.ok(!generateCode(basic, 'js-fetch', null).includes('secret'))
  const apikey = normalizeRequest({ url: 'https://x.com/a', auth: { type: 'apikey', key: 'api_key', value: 'zzz', in: 'query' } })
  assert.ok(generateCode(apikey, 'curl', null).includes('api_key=YOUR_API_KEY'))
  const oauth = normalizeRequest({ url: 'https://x.com', auth: { type: 'oauth2', grantType: 'manual', accessToken: 'tok', tokenPrefix: 'Bearer', accessTokenUrl: '', clientId: '', clientSecret: '', username: '', password: '', scope: '', clientAuth: 'basic' } })
  assert.ok(generateCode(oauth, 'js-axios', null).includes('Bearer YOUR_ACCESS_TOKEN'))
})
await test('other body types: urlencoded, form-data, raw, HEAD/GET without body', () => {
  const form = normalizeRequest({ method: 'POST', url: 'https://x.com', body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: 'b c', enabled: true }] } })
  assert.ok(generateCode(form, 'curl', null).includes("--data-urlencode 'a=b c'"))
  assert.ok(generateCode(form, 'js-fetch', null).includes('new URLSearchParams'))
  const multi = normalizeRequest({ method: 'POST', url: 'https://x.com', body: { mode: 'form-data', form: [{ key: 'a', value: 'b', enabled: true }] } })
  assert.ok(generateCode(multi, 'curl', null).includes("--form 'a=b'"))
  assert.ok(generateCode(multi, 'csharp', null).includes('MultipartFormDataContent'))
  assert.ok(generateCode(multi, 'go', null).includes('multipart.NewWriter'))
  const raw = normalizeRequest({ method: 'PUT', url: 'https://x.com', body: { mode: 'raw', raw: "it's <xml/>", rawContentType: 'application/xml' } })
  assert.ok(generateCode(raw, 'curl', null).includes(`--data-raw 'it'\\''s <xml/>'`))
  assert.ok(generateCode(normalizeRequest({ method: 'HEAD', url: 'https://x.com' }), 'php', null).includes('CURLOPT_NOBODY'))
  assert.ok(!generateCode(normalizeRequest({ url: 'https://x.com' }), 'java', null).includes('String body'))
})
await test('prepareRequest omits disabled rows and adds implied Content-Type', () => {
  const p = prepareRequest(normalizeRequest({ method: 'POST', url: 'https://x.com', headers: [{ key: 'X-Off', value: '1', enabled: false }], body: { mode: 'json', json: '{"a":1}' } }), null)
  assert.deepEqual(p.headers, [['Content-Type', 'application/json']])
})

console.log('\nType generation')
const RESP = {
  id: 1,
  name: 'John',
  email: 'john@example.com',
  created_at: '2024-01-01T10:00:00Z',
  score: 4.5,
  isAdmin: false,
  address: { street: '1 Main', geo: { lat: 1.5, lng: -2 } },
  posts: [
    { id: 1, title: 'a', tags: ['x'], author: null },
    { id: 2, title: 'b', tags: [], extra: 1, author: { name: 'Z' } },
  ],
  settings: { theme: 'dark' },
  'weird-key': 1,
  mixed: [1, 'a'],
}
await test('TypeScript interfaces: names, optionals, unions, nested and quoted keys', () => {
  const ts = generateTypes(RESP, 'ts-interface', 'User')
  assert.match(ts, /export interface User \{/)
  assert.match(ts, /id: number;/)
  assert.match(ts, /posts: Post\[\];/)
  assert.match(ts, /export interface Post \{[^}]*extra\?: number;/s)
  assert.match(ts, /author: Author \| null;/)
  assert.match(ts, /tags: string\[\];/)
  assert.match(ts, /"weird-key": number;/)
  assert.match(ts, /mixed: \(number \| string\)\[\];/)
  assert.match(ts, /settings: Settings;/)
  assert.ok(!ts.includes('Setting {'), 'objects are not singularized')
  const asType = generateTypes(RESP, 'ts-type', 'User')
  assert.match(asType, /export type User = \{/)
})
await test('root arrays and primitives produce sensible aliases', () => {
  const arr = generateTypes([{ a: 1 }, { a: 2, b: 'x' }], 'ts-interface', 'Root')
  assert.match(arr, /export type Root = RootItem\[\];/)
  assert.match(arr, /export interface RootItem \{\s*a: number;\s*b\?: string;/)
  assert.match(generateTypes('hello', 'ts-interface', 'Root'), /export type Root = string;/)
  assert.equal(inferShape([]).t, 'array')
  assert.match(generateTypes({ list: [] }, 'ts-interface', 'R'), /list: unknown\[\]/)
})
await test('identical nested shapes are reused, shape merge is symmetric for optionality', () => {
  const ts = generateTypes({ a: { x: 1 }, b: { x: 2 } }, 'ts-interface', 'R')
  assert.equal((ts.match(/interface /g) ?? []).length, 2, 'a and b share one type')
  assert.match(ts, /a: A;\s*b: A;/)
  const m = mergeShapes(inferShape({ a: 1 }), inferShape({ b: 1 }))
  assert.ok(m.t === 'object' && [...m.fields.values()].every((f) => f.optional))
})
await test('JSON Schema output is valid draft-07 with required/format/nullable', () => {
  const schema = JSON.parse(generateTypes(RESP, 'json-schema', 'User'))
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  assert.equal(schema.type, 'object')
  assert.ok(schema.required.includes('id') && !schema.required.includes('missing'))
  assert.equal(schema.properties.id.type, 'integer')
  assert.equal(schema.properties.score.type, 'number')
  assert.deepEqual(schema.properties.created_at, { type: 'string', format: 'date-time' })
  assert.deepEqual(schema.properties.email, { type: 'string', format: 'email' })
  const post = schema.properties.posts.items
  assert.ok(!post.required.includes('extra'))
  assert.deepEqual(post.properties.author.type, ['object', 'null'])
})
await test('Python dataclasses: ordering, keywords, optional defaults, from_dict', () => {
  const py = generateTypes({ id: 1, class: 'x', items: [{ n: 1 }, { n: 2, m: 'q' }], nested: { a: [1] }, camelCase: null }, 'python', 'Root')
  assert.match(py, /^from dataclasses import dataclass\nfrom typing import /)
  assert.match(py, /class_: str/)
  assert.match(py, /camel_case: None/)
  assert.match(py, /m: Optional\[str\] = None/)
  assert.ok(py.indexOf('class Item') < py.indexOf('class Root'), 'dependencies first')
  assert.match(py, /items=\[Item\.from_dict\(x\) for x in data\["items"\]\]/)
  assert.match(py, /JSON keys: class_ <- "class"/)
})

console.log('\nStatus explanations')
await test('401 explains missing vs rejected credentials; 429 reads Retry-After; 405 reads Allow', () => {
  const none = explainStatus({ status: 401, responseHeaders: [['WWW-Authenticate', 'Bearer realm="x"']], request: normalizeRequest({ url: 'https://x.com' }), bodyText: '{"message":"Missing token"}' })!
  assert.equal(none.title, '401 Unauthorized')
  assert.ok(none.causes[0].includes('No credentials were sent'))
  assert.ok(none.causes.some((c) => c.includes('WWW-Authenticate')))
  assert.equal(none.serverMessage, 'Missing token')
  const sent = explainStatus({ status: 401, responseHeaders: [], request: normalizeRequest({ url: 'https://x.com', auth: { type: 'bearer', token: 'x', prefix: 'Bearer' } }) })!
  assert.ok(sent.causes[0].includes('rejected'))
  assert.ok(explainStatus({ status: 429, responseHeaders: [['Retry-After', '30'], ['X-RateLimit-Remaining', '0']] })!.causes.join(' ').includes('30 seconds'))
  assert.ok(explainStatus({ status: 405, responseHeaders: [['Allow', 'GET, POST']] })!.causes[0].includes('GET, POST'))
  for (const s of [400, 403, 404, 500, 502, 503, 504]) assert.ok(explainStatus({ status: s, responseHeaders: [] })!.suggestions.length > 0, String(s))
  assert.equal(explainStatus({ status: 200, responseHeaders: [] }), null)
  assert.equal(extractServerMessage('{"errors":[{"detail":"bad field"}]}'), 'bad field')
})
await test('formatting helpers', () => {
  assert.equal(formatBytes(4915), '4.8 KB')
  assert.equal(formatBytes(500), '500 B')
  assert.equal(formatMs(184), '184ms')
  assert.equal(formatMs(1500), '1.50s')
  assert.equal([200, 301, 404, 503, null].map((s) => statusClass(s as number)).join(), '2xx,3xx,4xx,5xx,error')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
