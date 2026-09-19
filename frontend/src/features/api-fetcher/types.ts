export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface KeyValue {
  id: string
  key: string
  value: string
  enabled: boolean
  description?: string
}

export type BodyMode = 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw'

export interface RequestBody {
  mode: BodyMode
  json: string
  raw: string
  rawContentType: string
  form: KeyValue[]
  urlencoded: KeyValue[]
}

export type OAuthGrant = 'client_credentials' | 'password' | 'manual'

export type AuthConfig =
  | { type: 'none' }
  | { type: 'bearer'; token: string; prefix: string }
  | { type: 'apikey'; key: string; value: string; in: 'header' | 'query' }
  | { type: 'basic'; username: string; password: string }
  | {
      type: 'oauth2'
      grantType: OAuthGrant
      accessTokenUrl: string
      clientId: string
      clientSecret: string
      username: string
      password: string
      scope: string
      clientAuth: 'basic' | 'body'
      tokenPrefix: string
      accessToken: string
      expiresAt?: number | null
    }

export type AuthType = AuthConfig['type']

export interface RequestDef {
  id?: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValue[]
  headers: KeyValue[]
  body: RequestBody
  auth: AuthConfig
}

export interface ExecOptions {
  timeoutMs: number
  followRedirects: boolean
  maxRedirects: number
  insecureTls: boolean
}

// ── Server payloads ────────────────────────────────────────────────────────

export interface Collection {
  id: string
  name: string
  parentId: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface SavedRequest {
  id: string
  collectionId: string | null
  name: string
  method: HttpMethod
  url: string
  data: RequestDef
  position: number
  createdAt: string
  updatedAt: string
}

export interface HistoryEntry {
  id: string
  method: HttpMethod
  url: string
  status: number | null
  statusText: string | null
  durationMs: number | null
  sizeBytes: number | null
  errorCode: string | null
  errorMessage: string | null
  environmentId: string | null
  createdAt: string
}

export interface EnvVariable {
  key: string
  value: string
  secret: boolean
  hasValue: boolean
}

export interface Environment {
  id: string
  name: string
  variables: EnvVariable[]
  position: number
  updatedAt: string
}

export type EnvVarInput = { key: string; value?: string; secret: boolean; keep?: boolean }

export type BodyKind = 'json' | 'html' | 'xml' | 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' | 'empty'

export interface RedirectHop {
  url: string
  status: number
  location: string
  durationMs: number
}

export interface Timings {
  dnsMs?: number
  tcpMs?: number
  tlsMs?: number
  ttfbMs: number
  downloadMs: number
  totalMs: number
}

export interface TlsInfo {
  protocol: string | null
  cipher: string | null
  authorized: boolean
  authorizationError?: string
  subject?: string
  issuer?: string
  validFrom?: string
  validTo?: string
  altNames?: string
}

export interface ErrorReport {
  code: string
  message: string
  cause: string
  suggestions: string[]
  stage?: 'validation' | 'dns' | 'connect' | 'tls' | 'request' | 'response'
}

export interface SentRequest {
  method: string
  url: string
  headers: Array<[string, string]>
  bodyBytes: number
}

export interface ResponseData {
  status: number
  statusText: string
  httpVersion: string
  headers: Array<[string, string]>
  url: string
  redirects: RedirectHop[]
  contentType: string
  charset: string
  contentEncoding: string
  kind: BodyKind
  sizeBytes: number
  transferBytes: number
  truncated: boolean
  bodyText?: string
  bodyTextTruncated?: boolean
  bodyBase64?: string
  responseId: string
  filename: string
}

export interface ExecuteSuccess {
  ok: true
  historyId: string | null
  notes: string[]
  request: SentRequest
  response: ResponseData
  timings: Timings
  network: { remoteAddress?: string; remotePort?: number; family?: string; tls?: TlsInfo }
}

export interface ExecuteFailure {
  ok: false
  historyId: string | null
  notes: string[]
  error: ErrorReport
  elapsedMs: number
  request?: SentRequest
}

export type ExecuteOutcome = ExecuteSuccess | ExecuteFailure

export interface DiagnoseResult {
  host: string
  port: number
  scheme: string
  addresses: Array<{ address: string; family: number }>
  dnsMs: number | null
  dnsError?: string
  tcp: { ok: boolean; ms: number | null; address?: string; error?: string } | null
  notes: string[]
}

export interface FetcherConfig {
  maxResponseBytes: number
  allowPrivateNetwork: boolean
  secretsEncryptedAtRest: boolean
  historyLimit: number
}

export interface AiStatus {
  configured: boolean
  providers: Array<{ id: string; name: string }>
  routingMode: string
}

export type AiAction = 'explain-response' | 'explain-error' | 'convert-code' | 'create-request' | 'find-json-problem' | 'generate-types' | 'explain-headers' | 'free'

export interface ImportFolder {
  name: string
  requests: RequestDef[]
  folders: ImportFolder[]
}

export interface ImportResult {
  folder?: ImportFolder
  requests?: RequestDef[]
  environment?: { name: string; variables: Array<{ key: string; value: string; secret: boolean }> }
  summary: string
  warnings: string[]
}
