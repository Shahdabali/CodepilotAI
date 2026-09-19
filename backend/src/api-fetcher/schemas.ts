import { z } from 'zod'

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export const keyValueSchema = z.object({
  id: z.string().max(64).optional(),
  key: z.string().max(2048),
  value: z.string().max(262144),
  enabled: z.boolean().default(true),
  description: z.string().max(1024).optional(),
})
export type KeyValue = z.infer<typeof keyValueSchema>

const str = (max = 8192) => z.string().max(max).default('')

export const authSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: str(16384), prefix: z.string().max(32).default('Bearer') }),
  z.object({
    type: z.literal('apikey'),
    key: str(256),
    value: str(16384),
    in: z.enum(['header', 'query']).default('header'),
  }),
  z.object({ type: z.literal('basic'), username: str(1024), password: str(4096) }),
  z.object({
    type: z.literal('oauth2'),
    grantType: z.enum(['client_credentials', 'password', 'manual']).default('client_credentials'),
    accessTokenUrl: str(),
    clientId: str(1024),
    clientSecret: str(4096),
    username: str(1024),
    password: str(4096),
    scope: str(2048),
    clientAuth: z.enum(['basic', 'body']).default('basic'),
    tokenPrefix: z.string().max(32).default('Bearer'),
    accessToken: str(16384),
    expiresAt: z.number().nullable().optional(),
  }),
])
export type AuthConfig = z.infer<typeof authSchema>

export const bodySchema = z.object({
  mode: z.enum(['none', 'json', 'form-data', 'urlencoded', 'raw']).default('none'),
  json: z.string().max(20_000_000).default(''),
  raw: z.string().max(20_000_000).default(''),
  rawContentType: z.string().max(200).default('text/plain'),
  form: z.array(keyValueSchema).max(500).default([]),
  urlencoded: z.array(keyValueSchema).max(500).default([]),
})
export type RequestBody = z.infer<typeof bodySchema>

export const requestDefSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().max(200).default(''),
  method: z.enum(HTTP_METHODS).default('GET'),
  url: z.string().max(16384).default(''),
  params: z.array(keyValueSchema).max(500).default([]),
  headers: z.array(keyValueSchema).max(500).default([]),
  body: bodySchema.default({}),
  auth: authSchema.default({ type: 'none' }),
})
export type RequestDef = z.infer<typeof requestDefSchema>

export const execOptionsSchema = z.object({
  timeoutMs: z.number().int().min(100).max(300_000).default(30_000),
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().int().min(0).max(20).default(10),
  insecureTls: z.boolean().default(false),
})
export type ExecOptions = z.infer<typeof execOptionsSchema>

export const executeSchema = z.object({
  request: requestDefSchema,
  environmentId: z.string().max(64).nullable().optional(),
  options: execOptionsSchema.default({}),
})

export const envVarInputSchema = z.object({
  key: z.string().min(1).max(128).regex(/^[A-Za-z_][\w.-]*$/, 'Variable names may contain letters, digits, _ . - and cannot start with a digit'),
  value: z.string().max(65536).optional(),
  secret: z.boolean().default(false),
  keep: z.boolean().optional(),
})
export type EnvVarInput = z.infer<typeof envVarInputSchema>

export const environmentInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  variables: z.array(envVarInputSchema).max(500).default([]),
})
