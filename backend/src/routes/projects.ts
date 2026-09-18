import type { FastifyPluginAsync } from 'fastify'
import * as queries from '../db/queries.js'
import { FileManager } from '../workspace/file-manager.js'
import type { ProjectSettings } from '../types/shared.js'

const DEFAULT_SETTINGS: ProjectSettings = {
  autonomyLevel: 'BALANCED',
  defaultMode: 'BUILD',
  maxIterations: 10,
  executionTimeout: 60000,
  excludePatterns: ['node_modules', '.git', 'dist', '.next', '__pycache__'],
}

export const projectsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /api/projects
  fastify.get('/api/projects', async () => {
    return queries.getAllProjects()
  })

  // POST /api/projects — create project from path
  fastify.post('/api/projects', async (request, reply) => {
    const body = (request.body as { path?: string; name?: string } | undefined) ?? {}
    const projectPath = body.path?.trim()
    if (!projectPath) return reply.status(400).send({ error: 'path is required' })

    const name = body.name ?? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Project'

    // Create with defaults first
    const project = await queries.createProject({
      name,
      path: projectPath,
      language: null,
      framework: null,
      description: null,
      fileCount: 0,
      testFileCount: 0,
      dependencies: [],
      settings: DEFAULT_SETTINGS,
    })

    // Auto-analyze in background
    ;(async () => {
      try {
        const fm = new FileManager(projectPath, project.id)
        const analysis = await fm.getProjectAnalysis()
        await queries.updateProject(project.id, {
          language: analysis.language,
          framework: analysis.framework,
          description: analysis.description,
          fileCount: analysis.fileCount,
          testFileCount: analysis.testFileCount,
          dependencies: analysis.dependencies,
        })
      } catch (e) {
        console.error('Auto-analyze failed:', e)
      }
    })()

    return queries.getProject(project.id)
  })

  // GET /api/projects/:id
  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await queries.getProject(id)
    if (!project) return reply.status(404).send({ error: 'Project not found' })
    return project
  })

  // PUT /api/projects/:id
  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Record<string, unknown>
    await queries.updateProject(id, updates as any)
    return queries.getProject(id)
  })

  // DELETE /api/projects/:id
  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await queries.deleteProject(id)
    return { success: true }
  })

  // POST /api/projects/:id/analyze — re-analyze project
  fastify.post('/api/projects/:id/analyze', async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await queries.getProject(id)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const fm = new FileManager(project.path, id)
    const analysis = await fm.getProjectAnalysis()
    await queries.updateProject(id, {
      language: analysis.language,
      framework: analysis.framework,
      description: analysis.description,
      fileCount: analysis.fileCount,
      testFileCount: analysis.testFileCount,
      dependencies: analysis.dependencies,
    })
    return analysis
  })
}
