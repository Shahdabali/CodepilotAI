import type { FastifyPluginAsync } from 'fastify'
import * as queries from '../db/queries.js'
import { AgentPipeline } from '../agent/pipeline.js'
import { TaskContext } from '../agent/context.js'
import { EventNormalizer } from '../agent/events.js'
import { pendingApprovals, resolveApproval } from '../agent/approvals.js'
import { emitAgentEvent } from './agent.js'
import { RollbackService } from '../workspace/rollback.js'
import { generateTaskDiffs } from '../workspace/diff-engine.js'
import { config } from '../config.js'
import type { AgentMode, AgentEvent, AutonomyLevel } from '../types/shared.js'

const AUTONOMY_LEVELS = new Set<string>(['SAFE', 'BALANCED', 'AUTONOMOUS'])

interface RunningTask {
  context: TaskContext
  /** Pushes an event through the same normalize → persist → broadcast path the pipeline uses. */
  emit: (event: AgentEvent) => void
}

/** Tasks whose pipeline is executing in this process. */
const running = new Map<string, RunningTask>()

async function resolveAutonomy(requested: unknown): Promise<AutonomyLevel> {
  if (typeof requested === 'string' && AUTONOMY_LEVELS.has(requested)) return requested as AutonomyLevel
  // The Settings panel edits the global level; a project's own default is always the seeded 'BALANCED',
  // so it must not shadow what the user chose.
  const saved = await queries.getSetting('autonomyLevel').catch(() => null)
  if (typeof saved === 'string' && AUTONOMY_LEVELS.has(saved)) return saved as AutonomyLevel
  return config.defaultAutonomyLevel
}

export const tasksPlugin: FastifyPluginAsync = async (fastify) => {
  const orphaned = await queries.failOrphanedTasks().catch(() => 0)
  if (orphaned > 0) fastify.log.warn(`Marked ${orphaned} interrupted task(s) as failed after restart`)

  // GET /api/projects/:projectId/tasks
  fastify.get('/api/projects/:projectId/tasks', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return queries.getTasksByProject(projectId)
  })

  // POST /api/projects/:projectId/tasks — create and run a task
  fastify.post('/api/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = (request.body as { command?: string; mode?: string; autonomy?: string } | undefined) ?? {}
    if (!body.command?.trim()) return reply.status(400).send({ error: 'command is required' })
    if (body.autonomy !== undefined && !AUTONOMY_LEVELS.has(body.autonomy)) {
      return reply.status(400).send({ error: 'autonomy must be SAFE, BALANCED or AUTONOMOUS' })
    }

    const project = await queries.getProject(projectId)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const mode = (body.mode ?? 'BUILD') as AgentMode
    const autonomy = await resolveAutonomy(body.autonomy)

    const task = await queries.createTask({ projectId, command: body.command, mode, autonomy })
    await queries.updateTaskStatus(task.id, 'RUNNING', 'UNDERSTANDING')

    let context: TaskContext | undefined
    const normalizer = new EventNormalizer({ filesChanged: () => context?.filesChanged ?? [], skippedChanges: () => context?.skipped ?? [] })

    // Persistence is chained so a late "stage" write can never overwrite the final status.
    let persistChain: Promise<unknown> = Promise.resolve()
    const persist = (fn: () => Promise<unknown>) => {
      persistChain = persistChain.then(fn).catch((err) => console.error('[tasks] persist failed:', err))
    }

    // Bridge TaskContext → normalize → persist → SSE
    const emit = (raw: AgentEvent) => {
      const event = normalizer.normalize(raw)
      if (!event) return

      persist(() =>
        queries.addTaskStep({
          taskId: task.id,
          stage: event.stage ?? 'UNDERSTANDING',
          status: event.type === 'error' ? 'failed' : 'completed',
          message: event.message ?? String(event.type),
          data: { ...(event.data ?? {}), eventType: event.type },
        })
      )

      if (event.type === 'stage_change' && event.stage) {
        persist(() => queries.updateTaskStatus(task.id, 'RUNNING', event.stage))
      }
      if (event.type === 'complete') {
        persist(() =>
          queries.updateTaskStatus(task.id, 'COMPLETED', 'COMPLETE', {
            summary: typeof event.data?.summary === 'string' ? event.data.summary : event.message,
            filesChanged: context?.filesChanged ?? [],
            iterationCount: context?.iterationCount ?? 0,
          })
        )
      }
      if (event.type === 'error') {
        persist(() =>
          queries.updateTaskStatus(task.id, 'FAILED', 'FAILED', {
            summary: event.message,
            filesChanged: context?.filesChanged ?? [],
            iterationCount: context?.iterationCount ?? 0,
          })
        )
      }
      if (event.type === 'cancelled') {
        persist(() =>
          queries.updateTaskStatus(task.id, 'CANCELLED', 'FAILED', {
            summary: 'Cancelled by user',
            filesChanged: context?.filesChanged ?? [],
            iterationCount: context?.iterationCount ?? 0,
          })
        )
      }

      emitAgentEvent(task.id, event)
      if (normalizer.isTerminal) running.delete(task.id)
    }

    context = new TaskContext({
      taskId: task.id,
      projectId,
      command: body.command,
      mode,
      project,
      maxIterations: project.settings.maxIterations ?? config.maxIterations,
      autonomy,
      emit,
    })
    running.set(task.id, { context, emit })

    // Run pipeline in background — do NOT await
    const pipeline = new AgentPipeline()
    pipeline.run(context).catch((err) => {
      console.error('Pipeline error:', err)
      emit({ type: 'ERROR', taskId: task.id, data: { error: `Pipeline error: ${err.message}` } })
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

  // POST /api/tasks/:id/cancel — actually stops the pipeline, not just the label
  fastify.post('/api/tasks/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await queries.getTask(id)
    if (!task) return reply.status(404).send({ error: 'Task not found' })

    const live = running.get(id)
    if (live) {
      live.context.cancel()
      live.emit({ type: 'CANCELLED', taskId: id, message: 'Task cancelled by user' })
    } else if (task.status === 'RUNNING' || task.status === 'PENDING') {
      // Not running in this process (server restarted) — just close it out.
      await queries.updateTaskStatus(id, 'CANCELLED', 'FAILED', { summary: 'Cancelled by user' })
    }

    // Give the chained writes a moment to land so the response reflects the final state.
    await new Promise((r) => setTimeout(r, 50))
    return (await queries.getTask(id)) ?? task
  })

  // GET /api/tasks/:id/approvals — questions the agent is waiting on (lets a reloaded UI show them again)
  fastify.get('/api/tasks/:id/approvals', async (request) => {
    const { id } = request.params as { id: string }
    return pendingApprovals(id)
  })

  // POST /api/tasks/:id/approvals/:approvalId  { approved: boolean }
  fastify.post('/api/tasks/:id/approvals/:approvalId', async (request, reply) => {
    const { id, approvalId } = request.params as { id: string; approvalId: string }
    const body = (request.body as { approved?: boolean } | undefined) ?? {}
    if (typeof body.approved !== 'boolean') return reply.status(400).send({ error: 'approved (boolean) is required' })
    if (!resolveApproval(id, approvalId, body.approved)) {
      return reply.status(409).send({ error: 'That request is no longer waiting for an answer.' })
    }
    return { success: true, approved: body.approved }
  })

  // POST /api/tasks/:id/approve — approve everything currently waiting for this task
  fastify.post('/api/tasks/:id/approve', async (request) => {
    const { id } = request.params as { id: string }
    const waiting = pendingApprovals(id)
    for (const a of waiting) resolveApproval(id, a.id, true)
    return { success: true, approved: waiting.length }
  })

  // GET /api/tasks/:id/rollback-conflicts
  fastify.get('/api/tasks/:id/rollback-conflicts', async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await queries.getTask(id)
    if (!task) return reply.status(404).send({ error: 'Task not found' })

    const project = await queries.getProject(task.projectId)
    const snapshots = await queries.getFileSnapshots(id)
    const rollback = new RollbackService()
    const conflicts = await rollback.checkConflicts(snapshots, project?.path || process.cwd())
    return reply.send({ conflicts })
  })

  // POST /api/tasks/:id/rollback
  fastify.post('/api/tasks/:id/rollback', async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await queries.getTask(id)
    if (!task) return reply.status(404).send({ error: 'Task not found' })

    const project = await queries.getProject(task.projectId)
    const snapshots = await queries.getFileSnapshots(id)
    const rollback = new RollbackService()
    const result = await rollback.rollbackTask(id, snapshots, project?.path)
    return reply.send({ success: true, ...result })
  })
}
