import type { Environment, RequestDef } from '../types'
import { isSensitiveName, isVariableReference } from './redact'
import { DYNAMIC_VARIABLES } from './variables'
import { splitUrl } from './request'

export type LangId = 'js-fetch' | 'js-axios' | 'ts-fetch' | 'py-requests' | 'py-httpx' | 'curl' | 'java' | 'csharp' | 'go' | 'php'

export interface Language {
  id: LangId
  label: string
  ext: string
  hl: 'javascript' | 'typescript' | 'python' | 'shell' | 'java' | 'csharp' | 'go' | 'php'
}

export const LANGUAGES: Language[] = [
  { id: 'js-fetch', label: 'JavaScript (Fetch)', ext: 'js', hl: 'javascript' },
  { id: 'js-axios', label: 'JavaScript (Axios)', ext: 'js', hl: 'javascript' },
  { id: 'ts-fetch', label: 'TypeScript', ext: 'ts', hl: 'typescript' },
  { id: 'py-requests', label: 'Python (Requests)', ext: 'py', hl: 'python' },
  { id: 'py-httpx', label: 'Python (HTTPX)', ext: 'py', hl: 'python' },
  { id: 'curl', label: 'cURL', ext: 'sh', hl: 'shell' },
  { id: 'java', label: 'Java', ext: 'java', hl: 'java' },
  { id: 'csharp', label: 'C#', ext: 'cs', hl: 'csharp' },
  { id: 'go', label: 'Go', ext: 'go', hl: 'go' },
  { id: 'php', label: 'PHP', ext: 'php', hl: 'php' },
]

export type PreparedBody =
  | { kind: 'none' }
  | { kind: 'json'; value: unknown; text: string }
  | { kind: 'raw'; text: string; contentType: string }
  | { kind: 'urlencoded'; fields: Array<[string, string]> }
  | { kind: 'form'; fields: Array<[string, string]> }

export interface Prepared {
  method: string
  url: string
  headers: Array<[string, string]>
  body: PreparedBody
  basic?: { user: string; pass: string }
}

export interface GenOptions {
  /** When the last response was JSON, TypeScript output can include its inferred types. */
  responseIsJson?: boolean
  typesBlock?: string
  rootType?: string
  timeoutSeconds?: number
}

const DYN = new Set(DYNAMIC_VARIABLES.map((d) => d.name))
const VAR_RE = /\{\{\s*([\w.$-]+)\s*\}\}/g

export const placeholderFor = (name: string): string => `YOUR_${name.replace(/^\$/, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'VALUE'}`

function substitute(text: string, env: Environment | null): string {
  if (!text.includes('{{')) return text
  return text.replace(VAR_RE, (_m, name: string) => {
    if (DYN.has(name)) return placeholderFor(name)
    const v = env?.variables.find((x) => x.key === name)
    return v && !v.secret ? v.value : placeholderFor(name)
  })
}

/** Replaces a literal credential with a placeholder (values that were only variable references are already handled by substitute). */
function guardValue(name: string, original: string, substituted: string): string {
  if (!isSensitiveName(name) || !substituted) return substituted
  if (isVariableReference(original) || substituted.startsWith('YOUR_')) return substituted
  const scheme = substituted.match(/^(Bearer|Basic|Token|Digest)\s+/i)
  if (scheme && /^(bearer)$/i.test(scheme[1])) return `${scheme[1]} YOUR_TOKEN`
  if (scheme) return `${scheme[1]} ${placeholderFor(name === 'Authorization' ? 'credentials' : name)}`
  if (/^(bearer|basic)\s+YOUR_/i.test(substituted)) return substituted
  return placeholderFor(name)
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 40 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => sanitizeJson(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveName(k) && typeof v === 'string' && v && !v.startsWith('YOUR_')) out[k] = placeholderFor(k)
    else out[k] = sanitizeJson(v, depth + 1)
  }
  return out
}

/** Normalises a request into what the generators need. Never includes real credentials. */
export function prepareRequest(def: RequestDef, env: Environment | null): Prepared {
  const { base, query, hash } = splitUrl(def.url)
  let url = substitute(base, env)
  const queryParts = query
    ? query.split('&').filter(Boolean).map((part) => {
        const eq = part.indexOf('=')
        const rawName = eq < 0 ? part : part.slice(0, eq)
        const rawValue = eq < 0 ? '' : part.slice(eq + 1)
        let name = rawName
        try {
          name = decodeURIComponent(rawName)
        } catch {
          /* keep */
        }
        const value = guardValue(name, rawValue, substitute(rawValue, env))
        return eq < 0 ? substitute(rawName, env) : `${substitute(rawName, env)}=${value}`
      })
    : []

  const headers: Array<[string, string]> = []
  for (const h of def.headers) {
    if (!h.enabled || !h.key.trim()) continue
    headers.push([substitute(h.key.trim(), env), guardValue(h.key, h.value, substitute(h.value, env))])
  }
  const setHeader = (name: string, value: string) => {
    const i = headers.findIndex(([k]) => k.toLowerCase() === name.toLowerCase())
    if (i >= 0) headers.splice(i, 1)
    headers.push([name, value])
  }

  let basic: Prepared['basic']
  const a = def.auth
  if (a.type === 'bearer' && a.token) setHeader('Authorization', `${a.prefix || 'Bearer'} ${isVariableReference(a.token) ? substitute(a.token, env) : 'YOUR_TOKEN'}`)
  else if (a.type === 'apikey' && a.key && a.value) {
    const value = isVariableReference(a.value) ? substitute(a.value, env) : placeholderFor(a.key)
    if (a.in === 'query') queryParts.push(`${encodeURIComponent(a.key)}=${value}`)
    else setHeader(a.key, value)
  } else if (a.type === 'basic' && (a.username || a.password)) {
    basic = { user: substitute(a.username, env), pass: isVariableReference(a.password) ? substitute(a.password, env) : 'YOUR_PASSWORD' }
  } else if (a.type === 'oauth2' && a.accessToken) {
    setHeader('Authorization', `${a.tokenPrefix || 'Bearer'} ${isVariableReference(a.accessToken) ? substitute(a.accessToken, env) : 'YOUR_ACCESS_TOKEN'}`)
  }

  if (queryParts.length) url += `?${queryParts.join('&')}`
  url += substitute(hash, env)

  let body: PreparedBody = { kind: 'none' }
  const b = def.body
  if (b.mode === 'json' && b.json.trim()) {
    const text = substitute(b.json, env)
    try {
      const value = sanitizeJson(JSON.parse(text))
      body = { kind: 'json', value, text: JSON.stringify(value, null, 2) }
    } catch {
      body = { kind: 'raw', text, contentType: 'application/json' }
    }
  } else if (b.mode === 'raw' && b.raw) {
    body = { kind: 'raw', text: substitute(b.raw, env), contentType: b.rawContentType || 'text/plain' }
  } else if (b.mode === 'urlencoded') {
    body = { kind: 'urlencoded', fields: b.urlencoded.filter((f) => f.enabled && f.key).map((f) => [substitute(f.key, env), guardValue(f.key, f.value, substitute(f.value, env))]) }
  } else if (b.mode === 'form-data') {
    body = { kind: 'form', fields: b.form.filter((f) => f.enabled && f.key).map((f) => [substitute(f.key, env), guardValue(f.key, f.value, substitute(f.value, env))]) }
  }

  const hasBody = body.kind !== 'none'
  const ctIdx = headers.findIndex(([k]) => k.toLowerCase() === 'content-type')
  if (hasBody) {
    if (body.kind === 'json' && ctIdx < 0) headers.push(['Content-Type', 'application/json'])
    if (body.kind === 'raw' && ctIdx < 0) headers.push(['Content-Type', body.contentType])
    if (body.kind === 'urlencoded' && ctIdx < 0) headers.push(['Content-Type', 'application/x-www-form-urlencoded'])
    if (body.kind === 'form' && ctIdx >= 0) headers.splice(ctIdx, 1) // boundary is set by the HTTP library
  }
  return { method: def.method, url, headers, body, basic }
}

// ─── Literal helpers ─────────────────────────────────────────────────────────

const q = (s: string) => JSON.stringify(s)
const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const phpStr = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const pad = (n: number) => ' '.repeat(n)
const indentLines = (text: string, n: number) => text.split('\n').map((l, i) => (i === 0 ? l : pad(n) + l)).join('\n')

function pyLiteral(v: unknown, indent = 0): string {
  if (v === null) return 'None'
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return q(v)
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    return `[\n${v.map((x) => `${pad(indent + 4)}${pyLiteral(x, indent + 4)}`).join(',\n')}\n${pad(indent)}]`
  }
  const entries = Object.entries(v as Record<string, unknown>)
  if (!entries.length) return '{}'
  return `{\n${entries.map(([k, x]) => `${pad(indent + 4)}${q(k)}: ${pyLiteral(x, indent + 4)}`).join(',\n')}\n${pad(indent)}}`
}

const fieldsPy = (fields: Array<[string, string]>) => `{\n${fields.map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n')}\n}`
const headersPy = (headers: Array<[string, string]>) => `{\n${headers.map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n')}\n}`

// ─── Generators ──────────────────────────────────────────────────────────────

function genCurl(p: Prepared): string {
  const lines = [`curl --request ${p.method} \\`, `  --url ${sh(p.url)}`]
  const parts: string[] = []
  for (const [k, v] of p.headers) parts.push(`  --header ${sh(`${k}: ${v}`)}`)
  if (p.basic) parts.push(`  --user ${sh(`${p.basic.user}:${p.basic.pass}`)}`)
  const b = p.body
  if (b.kind === 'json') parts.push(`  --data-raw ${sh(b.text)}`)
  else if (b.kind === 'raw') parts.push(`  --data-raw ${sh(b.text)}`)
  else if (b.kind === 'urlencoded') for (const [k, v] of b.fields) parts.push(`  --data-urlencode ${sh(`${k}=${v}`)}`)
  else if (b.kind === 'form') for (const [k, v] of b.fields) parts.push(`  --form ${sh(`${k}=${v}`)}`)
  if (parts.length) lines[1] += ' \\'
  return [...lines, ...parts.map((l, i) => (i < parts.length - 1 ? `${l} \\` : l))].join('\n')
}

function genJsFetch(p: Prepared, o: GenOptions, ts = false): string {
  const out: string[] = []
  if (ts && o.typesBlock) out.push(o.typesBlock.trimEnd(), '')
  const hdrs = p.headers.map(([k, v]) => `    ${q(k)}: ${q(v)}`)
  if (p.basic) hdrs.push(`    "Authorization": "Basic " + btoa(${q(`${p.basic.user}:${p.basic.pass}`)})`)
  const b = p.body
  out.push(`const url = ${q(p.url)};`)
  if (b.kind === 'json') out.push('', `const payload = ${JSON.stringify(b.value, null, 2)};`)
  if (b.kind === 'form') out.push('', 'const form = new FormData();', ...b.fields.map(([k, v]) => `form.append(${q(k)}, ${q(v)});`))
  if (b.kind === 'urlencoded') out.push('', `const form = new URLSearchParams({\n${b.fields.map(([k, v]) => `  ${q(k)}: ${q(v)}`).join(',\n')}\n});`)
  out.push('', 'const options = {', `  method: ${q(p.method)},`)
  if (hdrs.length) out.push('  headers: {', hdrs.join(',\n'), '  },')
  if (b.kind === 'json') out.push('  body: JSON.stringify(payload),')
  else if (b.kind === 'raw') out.push(`  body: ${q(b.text)},`)
  else if (b.kind === 'form' || b.kind === 'urlencoded') out.push('  body: form,')
  out.push(`  signal: AbortSignal.timeout(${(o.timeoutSeconds ?? 30) * 1000}),`)
  out.push('};', '', 'try {', '  const response = await fetch(url, options);')
  out.push('  if (!response.ok) {', '    throw new Error(`HTTP ${response.status} ${response.statusText}`);', '  }')
  if (p.method === 'HEAD') out.push('  console.log(response.status, Object.fromEntries(response.headers));')
  else if (o.responseIsJson) out.push(ts ? `  const data = (await response.json()) as ${o.rootType ?? 'ApiResponse'};` : '  const data = await response.json();', '  console.log(data);')
  else out.push('  const data = await response.text();', '  console.log(data);')
  out.push('} catch (error) {', '  console.error("Request failed:", error);', '}')
  return out.join('\n')
}

function genAxios(p: Prepared, o: GenOptions): string {
  const out = ['import axios from "axios";', '']
  const cfg: string[] = [`  method: ${q(p.method.toLowerCase())},`, `  url: ${q(p.url)},`]
  if (p.headers.length) cfg.push('  headers: {', p.headers.map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n'), '  },')
  if (p.basic) cfg.push(`  auth: { username: ${q(p.basic.user)}, password: ${q(p.basic.pass)} },`)
  const b = p.body
  if (b.kind === 'json') cfg.push(`  data: ${indentLines(JSON.stringify(b.value, null, 2), 2)},`)
  else if (b.kind === 'raw') cfg.push(`  data: ${q(b.text)},`)
  else if (b.kind === 'urlencoded') cfg.push(`  data: new URLSearchParams({\n${b.fields.map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n')}\n  }),`)
  else if (b.kind === 'form') {
    out.push('const form = new FormData();', ...b.fields.map(([k, v]) => `form.append(${q(k)}, ${q(v)});`), '')
    cfg.push('  data: form,')
  }
  cfg.push(`  timeout: ${(o.timeoutSeconds ?? 30) * 1000},`)
  out.push('try {', '  const response = await axios.request({', ...cfg.map((l) => `  ${l}`), '  });', '  console.log(response.status);', '  console.log(response.data);')
  out.push('} catch (error) {', '  if (axios.isAxiosError(error)) {', '    console.error(error.response?.status, error.response?.data ?? error.message);', '  } else {', '    throw error;', '  }', '}')
  return out.join('\n')
}

function genPython(p: Prepared, lib: 'requests' | 'httpx', o: GenOptions): string {
  const out = [`import ${lib}`, '', `url = ${q(p.url)}`]
  const b = p.body
  if (p.headers.length) out.push(`headers = ${headersPy(p.headers)}`)
  if (b.kind === 'json') out.push(`payload = ${pyLiteral(b.value)}`)
  if (b.kind === 'urlencoded' || b.kind === 'form') out.push(`fields = ${fieldsPy(b.fields)}`)
  if (b.kind === 'raw') out.push(`data = ${q(b.text)}`)
  out.push('')
  const args: string[] = [q(p.method), 'url']
  if (p.headers.length) args.push('headers=headers')
  if (b.kind === 'json') args.push('json=payload')
  else if (b.kind === 'raw') args.push(lib === 'httpx' ? 'content=data' : 'data=data')
  else if (b.kind === 'urlencoded') args.push('data=fields')
  else if (b.kind === 'form') args.push('files={k: (None, v) for k, v in fields.items()}')
  if (p.basic) args.push(`auth=(${q(p.basic.user)}, ${q(p.basic.pass)})`)
  args.push(`timeout=${o.timeoutSeconds ?? 30}`)
  const call = `${lib === 'requests' ? 'requests.request' : 'client.request'}(${args.join(', ')})`
  if (lib === 'requests') {
    out.push(`response = ${call}`)
  } else {
    out.push('with httpx.Client(follow_redirects=True) as client:', `    response = ${call}`)
  }
  const ind = lib === 'requests' ? '' : '    '
  out.push(`${ind}response.raise_for_status()`)
  if (p.method === 'HEAD') out.push(`${ind}print(response.status_code, dict(response.headers))`)
  else if (o.responseIsJson) out.push(`${ind}print(response.json())`)
  else out.push(`${ind}print(response.text)`)
  return out.join('\n')
}

function genJava(p: Prepared, o: GenOptions): string {
  const b = p.body
  const out = ['import java.net.URI;', 'import java.net.http.HttpClient;', 'import java.net.http.HttpRequest;', 'import java.net.http.HttpResponse;', 'import java.time.Duration;']
  if (p.basic) out.push('import java.util.Base64;')
  out.push('', 'public class ApiRequest {', '    public static void main(String[] args) throws Exception {')
  out.push(`        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(${o.timeoutSeconds ?? 30})).followRedirects(HttpClient.Redirect.NORMAL).build();`, '')

  let publisher = 'HttpRequest.BodyPublishers.noBody()'
  const headers = [...p.headers]
  const textBody = b.kind === 'json' ? b.text : b.kind === 'raw' ? b.text : null
  if (textBody !== null) {
    const lines = textBody.split('\n')
    out.push('        String body = String.join("\\n",', lines.map((l, i) => `            ${q(l)}${i < lines.length - 1 ? ',' : ''}`).join('\n'), '        );', '')
    publisher = 'HttpRequest.BodyPublishers.ofString(body)'
  } else if (b.kind === 'urlencoded') {
    out.push('        String body = String.join("&",', b.fields.map(([k, v], i) => `            java.net.URLEncoder.encode(${q(k)}, java.nio.charset.StandardCharsets.UTF_8) + "=" + java.net.URLEncoder.encode(${q(v)}, java.nio.charset.StandardCharsets.UTF_8)${i < b.fields.length - 1 ? ',' : ''}`).join('\n'), '        );', '')
    publisher = 'HttpRequest.BodyPublishers.ofString(body)'
  } else if (b.kind === 'form') {
    out.push('        String boundary = "----ApiFetcherBoundary";', '        StringBuilder form = new StringBuilder();')
    for (const [k, v] of b.fields) out.push(`        form.append("--").append(boundary).append("\\r\\nContent-Disposition: form-data; name=\\"").append(${q(k)}).append("\\"\\r\\n\\r\\n").append(${q(v)}).append("\\r\\n");`)
    out.push('        form.append("--").append(boundary).append("--\\r\\n");', '')
    headers.push(['Content-Type', 'multipart/form-data; boundary=----ApiFetcherBoundary'])
    publisher = 'HttpRequest.BodyPublishers.ofString(form.toString())'
  }

  out.push('        HttpRequest request = HttpRequest.newBuilder()', `            .uri(URI.create(${q(p.url)}))`, `            .timeout(Duration.ofSeconds(${o.timeoutSeconds ?? 30}))`)
  for (const [k, v] of headers) out.push(`            .header(${q(k)}, ${q(v)})`)
  if (p.basic) out.push(`            .header("Authorization", "Basic " + Base64.getEncoder().encodeToString(${q(`${p.basic.user}:${p.basic.pass}`)}.getBytes()))`)
  out.push(`            .method(${q(p.method)}, ${publisher})`, '            .build();', '')
  out.push('        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());', '        System.out.println(response.statusCode());', '        System.out.println(response.body());', '    }', '}')
  return out.join('\n')
}

function genCsharp(p: Prepared, o: GenOptions): string {
  const b = p.body
  const out = ['using System;', 'using System.Collections.Generic;', 'using System.Net.Http;', 'using System.Net.Http.Headers;', 'using System.Text;', '']
  out.push(`using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(${o.timeoutSeconds ?? 30}) };`, `using var request = new HttpRequestMessage(new HttpMethod(${q(p.method)}), ${q(p.url)});`)
  const hasContent = b.kind !== 'none'
  for (const [k, v] of p.headers) {
    if (hasContent && /^content-(type|length)$/i.test(k)) continue
    out.push(`request.Headers.TryAddWithoutValidation(${q(k)}, ${q(v)});`)
  }
  if (p.basic) out.push(`request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(${q(`${p.basic.user}:${p.basic.pass}`)})));`)
  const verbatim = (s: string) => `@"${s.replace(/"/g, '""')}"`
  if (b.kind === 'json') out.push(`request.Content = new StringContent(${verbatim(b.text)}, Encoding.UTF8, "application/json");`)
  else if (b.kind === 'raw') out.push(`request.Content = new StringContent(${verbatim(b.text)}, Encoding.UTF8, ${q(b.contentType.split(';')[0])});`)
  else if (b.kind === 'urlencoded') out.push('request.Content = new FormUrlEncodedContent(new Dictionary<string, string>', '{', ...b.fields.map(([k, v]) => `    { ${q(k)}, ${q(v)} },`), '});')
  else if (b.kind === 'form') out.push('var form = new MultipartFormDataContent();', ...b.fields.map(([k, v]) => `form.Add(new StringContent(${q(v)}), ${q(k)});`), 'request.Content = form;')
  out.push('', 'using var response = await client.SendAsync(request);', 'Console.WriteLine((int)response.StatusCode);', 'Console.WriteLine(await response.Content.ReadAsStringAsync());')
  return out.join('\n')
}

function genGo(p: Prepared, o: GenOptions): string {
  const b = p.body
  const imports = new Set(['fmt', 'io', 'net/http', 'time'])
  const body: string[] = []
  let reader = 'nil'
  const extraHeaders: Array<[string, string]> = []
  const goRaw = (s: string) => (s.includes('`') ? q(s) : `\`${s}\``)
  if (b.kind === 'json' || b.kind === 'raw') {
    imports.add('strings')
    body.push(`\tpayload := strings.NewReader(${goRaw(b.text)})`)
    reader = 'payload'
  } else if (b.kind === 'urlencoded') {
    imports.add('net/url').add('strings')
    body.push('\tform := url.Values{}', ...b.fields.map(([k, v]) => `\tform.Set(${q(k)}, ${q(v)})`), '\tpayload := strings.NewReader(form.Encode())')
    reader = 'payload'
  } else if (b.kind === 'form') {
    imports.add('bytes').add('mime/multipart')
    body.push('\tpayload := &bytes.Buffer{}', '\twriter := multipart.NewWriter(payload)', ...b.fields.map(([k, v]) => `\t_ = writer.WriteField(${q(k)}, ${q(v)})`), '\tif err := writer.Close(); err != nil {', '\t\tpanic(err)', '\t}')
    reader = 'payload'
    extraHeaders.push(['Content-Type', '__WRITER__'])
  }
  const out = ['package main', '', 'import (', ...[...imports].sort().map((i) => `\t${q(i)}`), ')', '', 'func main() {', `\tclient := &http.Client{Timeout: ${o.timeoutSeconds ?? 30} * time.Second}`, ...body]
  out.push(`\treq, err := http.NewRequest(${q(p.method)}, ${q(p.url)}, ${reader})`, '\tif err != nil {', '\t\tpanic(err)', '\t}')
  for (const [k, v] of p.headers) out.push(`\treq.Header.Set(${q(k)}, ${q(v)})`)
  if (extraHeaders.length) out.push('\treq.Header.Set("Content-Type", writer.FormDataContentType())')
  if (p.basic) out.push(`\treq.SetBasicAuth(${q(p.basic.user)}, ${q(p.basic.pass)})`)
  out.push('', '\tresp, err := client.Do(req)', '\tif err != nil {', '\t\tpanic(err)', '\t}', '\tdefer resp.Body.Close()', '', '\tdata, err := io.ReadAll(resp.Body)', '\tif err != nil {', '\t\tpanic(err)', '\t}', '\tfmt.Println(resp.StatusCode)', '\tfmt.Println(string(data))', '}')
  return out.join('\n')
}

function genPhp(p: Prepared, o: GenOptions): string {
  const b = p.body
  const out = ['<?php', '']
  if (b.kind === 'json' || b.kind === 'raw') out.push("$payload = <<<'BODY'", b.text, 'BODY;', '')
  const opts = [`    CURLOPT_URL => ${phpStr(p.url)},`, '    CURLOPT_RETURNTRANSFER => true,', '    CURLOPT_FOLLOWLOCATION => true,', `    CURLOPT_TIMEOUT => ${o.timeoutSeconds ?? 30},`]
  if (p.method === 'HEAD') opts.push('    CURLOPT_NOBODY => true,')
  else opts.push(`    CURLOPT_CUSTOMREQUEST => ${phpStr(p.method)},`)
  const headers = p.headers.map(([k, v]) => `        ${phpStr(`${k}: ${v}`)},`)
  if (headers.length) opts.push('    CURLOPT_HTTPHEADER => [', ...headers, '    ],')
  if (p.basic) opts.push(`    CURLOPT_USERPWD => ${phpStr(`${p.basic.user}:${p.basic.pass}`)},`)
  if (b.kind === 'json' || b.kind === 'raw') opts.push('    CURLOPT_POSTFIELDS => $payload,')
  else if (b.kind === 'urlencoded') opts.push(`    CURLOPT_POSTFIELDS => http_build_query([${b.fields.map(([k, v]) => `${phpStr(k)} => ${phpStr(v)}`).join(', ')}]),`)
  else if (b.kind === 'form') opts.push(`    CURLOPT_POSTFIELDS => [${b.fields.map(([k, v]) => `${phpStr(k)} => ${phpStr(v)}`).join(', ')}],`)
  out.push('$curl = curl_init();', 'curl_setopt_array($curl, [', ...opts, ']);', '', '$response = curl_exec($curl);', 'if ($response === false) {', '    throw new RuntimeException(curl_error($curl));', '}', '$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);', 'curl_close($curl);', '', 'echo $status . PHP_EOL . $response . PHP_EOL;')
  return out.join('\n')
}

export function generateCode(def: RequestDef, lang: LangId, env: Environment | null, options: GenOptions = {}): string {
  const p = prepareRequest(def, env)
  switch (lang) {
    case 'curl':
      return genCurl(p)
    case 'js-fetch':
      return genJsFetch(p, options)
    case 'ts-fetch':
      return genJsFetch(p, options, true)
    case 'js-axios':
      return genAxios(p, options)
    case 'py-requests':
      return genPython(p, 'requests', options)
    case 'py-httpx':
      return genPython(p, 'httpx', options)
    case 'java':
      return genJava(p, options)
    case 'csharp':
      return genCsharp(p, options)
    case 'go':
      return genGo(p, options)
    case 'php':
      return genPhp(p, options)
  }
}

/** cURL for export. Credentials are always replaced with placeholders. */
export function toCurl(def: RequestDef, env: Environment | null): string {
  return genCurl(prepareRequest(def, env))
}

