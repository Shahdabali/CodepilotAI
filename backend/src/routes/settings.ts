import type { FastifyPluginAsync } from 'fastify'
import * as queries from '../db/queries.js'
import type { AppSettings } from '../types/shared.js'

export const settingsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /api/settings
  fastify.get('/api/settings', async () => {
    return queries.getAllSettings()
  })

  // PUT /api/settings
  fastify.put('/api/settings', async (request) => {
    const updates = request.body as Partial<AppSettings>
    for (const [key, value] of Object.entries(updates)) {
      await queries.setSetting(key, value)
    }
    return queries.getAllSettings()
  })
}
