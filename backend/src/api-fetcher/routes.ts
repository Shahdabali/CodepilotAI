import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z, ZodError } from 'zod'
import { aiRouter } from '../ai/router.js'
import { AI_ACTIONS, aiChatSchema, buildPrompt, categoryFor, sanitizeProviderError, SYSTEM_PROMPT } from './ai-assistant.js'
import { diagnoseUrl, executeRequest, fetchOAuthToken, getMaxResponseBytes } from './execute.js'
import { responseCache } from './response-processor.js'
import { authSchema, environmentInputSchema, executeSchema, requestDefSchema, type RequestDef } from './schemas.js'
import * as store from './store.js'
import { getNetworkPolicy } from './url-guard.js'

const idParam = z.object({ id: z.string().min(1).max(64) })

interface ImportFolder {
  name: string
  requests: RequestDef[]
  folders: ImportFolder[]
}

const folderSchema: z.ZodType<ImportFolder, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    name: z.string().trim().min(1).max(200),
    requests: z.array(requestDefSchema).max(3000).default([]),
    folders: z.array(folderSchema).max(500).default([]),
  })
)

const importSchema = z.object({
  parentId: z.string().max(64).nullable().default(null),
  root: folderSchema.optional(),
  requests: z.array(requestDefSchema).max(3000).default([]),
  environment: environmentInputSchema.optional(),
})

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return reply.code(400).send({ error: `${first.path.join('.') || 'request'}: ${first.message}` })
  }
  if (err instanceof store.NotFoundError) return reply.code(404).send({ error: err.message })
  if (err instanceof store.ValidationError) return reply.code(400).send({ error: err.message })
  reply.log.error({ err: err instanceof Error ? err.message : 'unknown error' }, 'api-fetcher route failed')
  return reply.code(500).send({ error: 'Internal error while processing the API Fetcher request' })
}

export const apiFetcherPlugin: FastifyPluginAsync = async (fastify) => {
  await store.ensureFetcherSchema()

  // ── Workspace / config ────────────────────────────────────────────────────
  fastify.get('/api/fetcher/workspace', async (_req, reply) => {
    try {
      const [collections, requests, environments] = await Promise.all([store.listCollections(), store.listRequests(), store.listEnvironments()])
      return { collections, requests, environments }
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.get('/api/fetcher/config', async () => ({
    maxResponseBytes: getMaxResponseBytes(),
    allowPrivateNetwork: getNetworkPolicy().allowPrivateNetwork,
    secretsEncryptedAtRest: store.isEncryptionEnabled(),
    historyLimit: 500,
  }))

  // ── Execution ─────────────────────────────────────────────────────────────
  fastify.post('/api/fetcher/execute', { bodyLimit: 30 * 1024 * 1024 }, async (request, reply) => {
    const parsed = executeSchema.safeParse(request.body)
    if (!parsed.success) return sendError(reply, parsed.error)
    const ac = new AbortController()
    const onClose = () => {
      if (!reply.raw.writableFinished) ac.abort()
    }
    reply.raw.on('close', onClose)
    try {
      return await executeRequest(parsed.data, ac.signal)
    } catch (e) {
      return sendError(reply, e)
    } finally {
      reply.raw.off('close', onClose)
    }
  })

  fastify.get('/api/fetcher/responses/:id/download', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const entry = responseCache.get(id)
    if (!entry) return reply.code(404).send({ error: 'The full response is no longer available. Send the request again to re-capture it.' })
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(entry.filename)}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', 'sandbox')
      .header('X-Original-Content-Type', entry.contentType)
      .header('Cache-Control', 'no-store')
      .send(entry.body)
  })

  fastify.post('/api/fetcher/diagnose', async (request, reply) => {
    try {
      const { url } = z.object({ url: z.string().min(1).max(16384) }).parse(request.body)
      const ac = new AbortController()
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) ac.abort()
      })
      return await diagnoseUrl(url, ac.signal)
    } catch (e) {
      if (e instanceof Error && 'fetchCode' in e) return reply.code(400).send({ error: e.message })
      return sendError(reply, e)
    }
  })

  fastify.post('/api/fetcher/oauth/token', async (request, reply) => {
    try {
      const body = z.object({ auth: authSchema, environmentId: z.string().max(64).nullable().optional() }).parse(request.body)
      if (body.auth.type !== 'oauth2') return reply.code(400).send({ error: 'auth must be an oauth2 configuration' })
      const ac = new AbortController()
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) ac.abort()
      })
      return await fetchOAuthToken(body.auth, body.environmentId ?? null, ac.signal)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  // ── History ───────────────────────────────────────────────────────────────
  fastify.get('/api/fetcher/history', async (request, reply) => {
    try {
      const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(request.query)
      return { history: await store.listHistory(limit) }
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.get('/api/fetcher/history/:id', async (request, reply) => {
    try {
      const { id } = idParam.parse(request.params)
      const found = await store.getHistoryRequest(id)
      if (!found) return reply.code(404).send({ error: 'History entry not found' })
      return found
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.delete('/api/fetcher/history/:id', async (request, reply) => {
    try {
      await store.deleteHistory(idParam.parse(request.params).id)
      return { success: true }
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.delete('/api/fetcher/history', async (_req, reply) => {
    try {
      await store.clearHistory()
      return { success: true }
    } catch (e) {
      return sendError(reply, e)
    }
  })

  // ── Collections ───────────────────────────────────────────────────────────
  fastify.post('/api/fetcher/collections', async (request, reply) => {
    try {
      const body = z.object({ name: z.string().trim().min(1).max(200), parentId: z.string().max(64).nullable().default(null) }).parse(request.body)
      return await store.createCollection(body.name, body.parentId)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.patch('/api/fetcher/collections/:id', async (request, reply) => {
    try {
      const { id } = idParam.parse(request.params)
      const body = z.object({ name: z.string().trim().min(1).max(200).optional(), parentId: z.string().max(64).nullable().optional() }).parse(request.body)
      return await store.updateCollection(id, body)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.delete('/api/fetcher/collections/:id', async (request, reply) => {
    try {
      await store.deleteCollection(idParam.parse(request.params).id)
      return { success: true }
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.post('/api/fetcher/collections/:id/duplicate', async (request, reply) => {
    try {
      return await store.duplicateCollection(idParam.parse(request.params).id)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  // ── Saved requests ────────────────────────────────────────────────────────
  fastify.post('/api/fetcher/requests', async (request, reply) => {
    try {
      const body = z.object({ name: z.string().trim().min(1).max(200), collectionId: z.string().max(64).nullable().default(null), data: requestDefSchema }).parse(request.body)
      return await store.createRequest(body)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.patch('/api/fetcher/requests/:id', async (request, reply) => {
    try {
      const { id } = idParam.parse(request.params)
      const body = z
        .object({ name: z.string().trim().min(1).max(200).optional(), collectionId: z.string().max(64).nullable().optional(), data: requestDefSchema.optional() })
        .parse(request.body)
      return await store.updateRequest(id, body)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.delete('/api/fetcher/requests/:id', async (request, reply) => {
    try {
      await store.deleteRequest(idParam.parse(request.params).id)
      return { success: true }
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.post('/api/fetcher/requests/:id/duplicate', async (request, reply) => {
    try {
      return await store.duplicateRequest(idParam.parse(request.params).id)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  // ── Environments ──────────────────────────────────────────────────────────
  fastify.post('/api/fetcher/environments', async (request, reply) => {
    try {
      const body = environmentInputSchema.parse(request.body)
      return await store.createEnvironment(body.name, body.variables)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.put('/api/fetcher/environments/:id', async (request, reply) => {
    try {
      const { id } = idParam.parse(request.params)
      const body = environmentInputSchema.parse(request.body)
      return await store.updateEnvironment(id, body.name, body.variables)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.delete('/api/fetcher/environments/:id', async (request, reply) => {
    try {
      await store.deleteEnvironment(idParam.parse(request.params).id)
      return { success: true }
    } catch (e) {
      return sendError(reply, e)
    }
  })

  fastify.post('/api/fetcher/environments/:id/duplicate', async (request, reply) => {
    try {
      return await store.duplicateEnvironment(idParam.parse(request.params).id)
    } catch (e) {
      return sendError(reply, e)
    }
  })

  // ── Import (OpenAPI / collection JSON are parsed client-side, persisted here in one call) ──
  fastify.post('/api/fetcher/import', { bodyLimit: 30 * 1024 * 1024 }, async (request, reply) => {
    try {
      const body = importSchema.parse(request.body)
      const created = { collections: [] as store.CollectionRow[], requests: [] as store.SavedRequestRow[], environment: null as store.EnvironmentView | null }
      const addFolder = async (folder: ImportFolder, parentId: string | null) => {
        const col = await store.createCollection(folder.name, parentId)
        created.collections.push(col)
        for (const r of folder.requests) created.requests.push(await store.createRequest({ name: r.name || `${r.method} ${r.url}`.slice(0, 120), collectionId: col.id, data: r }))
        for (const child of folder.folders) await addFolder(child, col.id)
      }
      if (body.root) await addFolder(body.root, body.parentId)
      for (const r of body.requests) created.requests.push(await store.createRequest({ name: r.name || `${r.method} ${r.url}`.slice(0, 120), collectionId: body.parentId, data: r }))
      if (body.environment) created.environment = await store.createEnvironment(body.environment.name, body.environment.variables)
      return created
    } catch (e) {
      return sendError(reply, e)
    }
  })

  // ── AI assistant (reuses the existing provider router; context is redacted server-side) ──
  fastify.get('/api/fetcher/ai/status', async () => {
    await aiRouter.syncWithSettings()
    const configured = aiRouter.getAllProviders().filter((p) => p.isConfigured())
    return { configured: configured.length > 0, providers: configured.map((p) => ({ id: p.id, name: p.name })), routingMode: aiRouter.getRoutingMode(), actions: AI_ACTIONS }
  })

  fastify.post('/api/fetcher/ai/chat', { bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    const parsed = aiChatSchema.safeParse(request.body)
    if (!parsed.success) return sendError(reply, parsed.error)
    const input = parsed.data
    if (!input.message.trim() && input.action === 'free') return reply.code(400).send({ error: 'message is required' })

    let ctx: store.EnvironmentContext = { vars: {}, secrets: [] }
    if (input.environmentId) {
      try {
        ctx = await store.getEnvironmentContext(input.environmentId)
      } catch {
        /* an unknown environment simply means no secrets to mask */
      }
    }
    // Only the masking data is used; variable values themselves are never placed in the prompt.
    ctx = { vars: {}, secrets: ctx.secrets }

    await aiRouter.syncWithSettings()
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
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
      if (!aiRouter.getAllProviders().some((p) => p.isConfigured())) {
        send({ type: 'error', code: 'NO_PROVIDER', message: 'No AI provider is configured. Add an API key (or enable Ollama) in Settings to use the assistant.' })
        return
      }
      const stream = aiRouter.stream(buildPrompt(input, ctx), { systemPrompt: SYSTEM_PROMPT, temperature: 0.2 }, categoryFor(input.action))
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
