import type { FastifyPluginAsync } from 'fastify'
import * as queries from '../db/queries.js'
import { AgentPipeline } from '../agent/pipeline.js'
import { TaskContext } from '../agent/context.js'
import { emitAgentEvent } from './agent.js'
import { RollbackService } from '../workspace/rollback.js'
import { generateTaskDiffs } from '../workspace/diff-engine.js'
import { config } from '../config.js'
import type { AgentMode, AgentEvent } from '../types/shared.js'

export const tasksPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /api/projects/:projectId/tasks
  fastify.get('/api/projects/:projectId/tasks', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return queries.getTasksByProject(projectId)
  })

  // POST /api/projects/:projectId/tasks — create and run a task
  fastify.post('/api/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = request.body as { command: string; mode?: string }

    const project = await queries.getProject(projectId)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const mode = (body.mode ?? 'BUILD') as AgentMode

    const task = await queries.createTask({ projectId, command: body.command, mode })
    await queries.updateTaskStatus(task.id, 'RUNNING', 'UNDERSTANDING')

    // Build emit function — bridges TaskContext → SSE
    const emit = (event: AgentEvent) => {
      // Persist step
      queries.addTaskStep({
        taskId: task.id,
        stage: event.stage ?? 'UNDERSTANDING',
        status: event.type === 'error' ? 'failed' : 'completed',
        message: event.message ?? String(event.type),
        data: event.data,
      }).catch(console.error)

      // Broadcast to SSE clients
      emitAgentEvent(task.id, event)

      // Update task status in DB when complete/failed
      if (event.type === 'complete') {
        queries.updateTaskStatus(task.id, 'COMPLETED', 'COMPLETE', {
          summary: event.message,
        }).catch(console.error)
      }
      if (event.type === 'error') {
        queries.updateTaskStatus(task.id, 'FAILED', 'FAILED').catch(console.error)
      }
    }

    const context = new TaskContext({
      taskId: task.id,
      projectId,
      command: body.command,
      mode,
      project,
      maxIterations: project.settings.maxIterations ?? config.maxIterations,
      emit,
    })

    // Run pipeline in background — do NOT await
    const pipeline = new AgentPipeline()
    pipeline.run(context).catch(async (err) => {
      console.error('Pipeline error:', err)
      await queries.updateTaskStatus(task.id, 'FAILED', 'FAILED').catch(console.error)
      emitAgentEvent(task.id, {
        type: 'error',
        taskId: task.id,
        stage: 'FAILED',
        message: `Pipeline error: ${err.message}`,
        timestamp: new Date().toISOString(),
      })
    })

    return task
  })

  // GET /api/tasks/:id
  fastify.get('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await queries.getTask(id)
    if (!task) return reply.status(404).send({ error: 'Task not found' })
    return task
  })

  // GET /api/tasks/:id/steps
  fastify.get('/api/tasks/:id/steps', async (request) => {
    const { id } = request.params as { id: string }
    return queries.getTaskSteps(id)
  })

  // GET /api/tasks/:id/diffs
  fastify.get('/api/tasks/:id/diffs', async (request) => {
    const { id } = request.params as { id: string }
    const snapshots = await queries.getFileSnapshots(id)
    return generateTaskDiffs(snapshots)
  })

  // POST /api/tasks/:id/cancel
  fastify.post('/api/tasks/:id/cancel', async (request) => {
    const { id } = request.params as { id: string }
    await queries.updateTaskStatus(id, 'CANCELLED')
    emitAgentEvent(id, {
      type: 'error',
      taskId: id,
      stage: 'FAILED',
      message: 'Task cancelled by user',
      timestamp: new Date().toISOString(),
    })
    return { success: true }
  })

  // POST /api/tasks/:id/rollback
  fastify.post('/api/tasks/:id/rollback', async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await queries.getTask(id)
    if (!task) return reply.status(404).send({ error: 'Task not found' })

    const snapshots = await queries.getFileSnapshots(id)
    const rollback = new RollbackService()
    await rollback.rollbackTask(id, snapshots)
    return { success: true }
  })

  // POST /api/tasks/:id/approve
  fastify.post('/api/tasks/:id/approve', async (request) => {
    const { id } = request.params as { id: string }
    await queries.resolveApprovalRequest(id, true)
    return { success: true }
  })
}
