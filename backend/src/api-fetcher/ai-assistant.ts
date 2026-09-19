import { z } from 'zod'
import type { TaskCategory } from '../ai/provider.interface.js'
import { redactHeaderPairs, redactRequestDef, redactText, redactUrl, isSensitiveName, redactValue } from './redact.js'
import { requestDefSchema } from './schemas.js'
import { maskSecrets, type EnvironmentContext } from './store.js'

export const AI_ACTIONS = [
  'explain-response',
  'explain-error',
  'convert-code',
  'create-request',
  'find-json-problem',
  'generate-types',
  'explain-headers',
  'free',
] as const

export const aiChatSchema = z.object({
  message: z.string().max(4000).default(''),
  action: z.enum(AI_ACTIONS).default('free'),
  language: z.string().max(40).optional(),
  environmentId: z.string().max(64).nullable().optional(),
  request: requestDefSchema.optional(),
  response: z
    .object({
      status: z.number().int().optional(),
      statusText: z.string().max(200).optional(),
      url: z.string().max(16384).optional(),
      contentType: z.string().max(300).optional(),
      headers: z.array(z.tuple([z.string().max(500), z.string().max(8000)])).max(200).optional(),
      bodyText: z.string().max(6_000_000).optional(),
      durationMs: z.number().optional(),
      sizeBytes: z.number().optional(),
      redirects: z.array(z.object({ url: z.string(), status: z.number(), location: z.string() })).max(30).optional(),
      error: z.object({ code: z.string(), message: z.string(), cause: z.string().optional() }).optional(),
    })
    .optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20000) })).max(12).default([]),
})
export type AiChatInput = z.infer<typeof aiChatSchema>

const BODY_CHAR_LIMIT = 12_000

export const SYSTEM_PROMPT = `You are the API Assistant built into CodePilot's API Fetcher, a developer tool for building, sending and debugging HTTP requests.

Rules:
- Ground every answer in the request and response context supplied below. Quote the concrete status code, header names, URL parts or JSON fields you are reasoning about.
- If the context does not contain what you need, say exactly what is missing instead of guessing.
- Credentials are redacted as [REDACTED] and {{VARIABLES}} are unresolved placeholders. Never ask the user to paste secrets; in code, read secrets from environment variables or clearly named placeholders.
- Be concise and practical. Prefer short paragraphs and bullet lists. Use fenced code blocks with a language tag for all code.
- When the user wants a request created, reply with one short sentence and exactly one fenced \`\`\`json block containing an object of the form {"name": string, "method": "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS", "url": string, "headers": [{"key": string, "value": string, "enabled": true}], "body": {"mode": "none|json|raw", "json": string, "raw": string}, "auth": {"type": "none"} } and nothing else. Use {{VARIABLE}} placeholders for secrets.`

const ACTION_INSTRUCTIONS: Record<(typeof AI_ACTIONS)[number], string> = {
  'explain-response': 'Explain this API response: what the endpoint returned, what the important fields mean, and anything unusual (status, headers, pagination, errors).',
  'explain-error': 'Explain why this request returned this status or error. Give the most likely causes ranked by probability given the actual request, and concrete steps to fix it. If it is an authentication error, inspect how credentials were (or were not) sent.',
  'convert-code': 'Convert this request into runnable code in the requested language. Use environment variables or placeholders for secrets and include basic error handling.',
  'create-request': 'Create a request definition matching the user description, following the JSON format from the system rules.',
  'find-json-problem': 'Find the problem in the JSON request body (syntax errors, wrong types, missing fields the API might expect based on the response or error). Point to the exact location and show the corrected JSON.',
  'generate-types': 'Generate TypeScript types for the JSON response body. Mark fields optional when they may be missing, use union types for nullable values, and name nested types sensibly.',
  'explain-headers': 'Explain the request and response headers: what each notable header does, and flag anything security- or caching-relevant or likely to be misconfigured.',
  free: '',
}

export function categoryFor(action: AiChatInput['action']): TaskCategory {
  switch (action) {
    case 'convert-code':
    case 'generate-types':
    case 'create-request':
      return 'CODE_GENERATION'
    case 'explain-headers':
      return 'DOCUMENTATION'
    default:
      return 'DEBUGGING'
  }
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n... [truncated ${text.length - limit} characters]` : text
}

function describeBody(body: NonNullable<AiChatInput['request']>['body']): string {
  switch (body.mode) {
    case 'json':
      return body.json ? `JSON body:\n${clip(body.json, 6000)}` : 'JSON body: (empty)'
    case 'raw':
      return `Raw body (${body.rawContentType}):\n${clip(body.raw, 6000)}`
    case 'urlencoded':
      return `x-www-form-urlencoded: ${body.urlencoded.filter((f) => f.enabled).map((f) => `${f.key}=${f.value}`).join('&')}`
    case 'form-data':
      return `multipart form-data: ${body.form.filter((f) => f.enabled).map((f) => `${f.key}=${f.value}`).join(', ')}`
    default:
      return 'No body'
  }
}

/** Builds the redacted context block. Secrets never reach the model: names, patterns and known env secret values are masked. */
export function buildContext(input: AiChatInput, ctx: EnvironmentContext): string {
  const mask = (s: string) => maskSecrets(s, ctx.secrets)
  const lines: string[] = []

  if (input.request) {
    const req = redactRequestDef(input.request)
    lines.push('## Request')
    lines.push(`${req.method} ${mask(req.url)}`)
    const headers = req.headers.filter((h) => h.enabled && h.key)
    if (headers.length) lines.push('Headers:', ...headers.map((h) => `  ${h.key}: ${mask(h.value)}`))
    const params = req.params.filter((p) => p.enabled && p.key)
    if (params.length) lines.push('Query params:', ...params.map((p) => `  ${p.key}=${mask(p.value)}`))
    lines.push(`Authorization: ${req.auth.type === 'none' ? 'none configured' : `${req.auth.type} (credentials hidden)`}`)
    lines.push(mask(describeBody(req.body)))
  }

  if (input.response) {
    const r = input.response
    lines.push('', '## Response')
    if (r.error) {
      lines.push(`The request did not complete. Error ${r.error.code}: ${mask(r.error.message)}${r.error.cause ? ` (${mask(r.error.cause)})` : ''}`)
    }
    if (r.status !== undefined) lines.push(`Status: ${r.status} ${r.statusText ?? ''}`.trim())
    if (r.url) lines.push(`Final URL: ${mask(redactUrl(r.url))}`)
    if (r.durationMs !== undefined) lines.push(`Time: ${Math.round(r.durationMs)} ms`)
    if (r.sizeBytes !== undefined) lines.push(`Size: ${r.sizeBytes} bytes`)
    if (r.contentType) lines.push(`Content-Type: ${r.contentType}`)
    if (r.redirects?.length) lines.push('Redirects:', ...r.redirects.map((h) => `  ${h.status} ${mask(h.url)} -> ${mask(h.location)}`))
    if (r.headers?.length) {
      lines.push('Headers:', ...redactHeaderPairs(r.headers).map(([k, v]) => `  ${k}: ${mask(isSensitiveName(k) ? redactValue(v) : v)}`))
    }
    if (r.bodyText) lines.push('Body:', mask(clip(redactText(r.bodyText.slice(0, 60_000)), BODY_CHAR_LIMIT)))
  }

  return lines.join('\n')
}

export function buildPrompt(input: AiChatInput, ctx: EnvironmentContext): string {
  const parts: string[] = []
  const instruction = ACTION_INSTRUCTIONS[input.action]
  const context = buildContext(input, ctx)
  parts.push(context || '(No request or response context was provided.)')

  if (input.history.length) {
    parts.push('', '## Conversation so far')
    for (const turn of input.history) parts.push(`${turn.role === 'user' ? 'User' : 'Assistant'}: ${clip(turn.content, 4000)}`)
  }

  parts.push('', '## Task')
  if (instruction) parts.push(instruction)
  if (input.action === 'convert-code' && input.language) parts.push(`Target language: ${input.language}`)
  if (input.message.trim()) parts.push(`User message: ${input.message.trim()}`)
  return parts.join('\n')
}

const KEY_LIKE = /[A-Za-z0-9_-]{32,}/g

/** Provider errors can echo request details; strip anything key-shaped before showing it. */
export function sanitizeProviderError(message: string): string {
  return redactText(message).replace(KEY_LIKE, '[REDACTED]').slice(0, 500)
}
