import type { AgentEvent, AgentEventType, AgentStage } from '../types/shared.js'

/**
 * The pipeline stages emit lifecycle events ("PLANNING", "IMPLEMENTING_FILE", "COMPLETED", …) whose text
 * lives in `data.message`. Everything downstream (the SSE stream, the task-status updater, the persisted
 * step log and the UI) works with a small canonical vocabulary instead:
 *
 *   stage_change · log · file_change · command_run · test_result · approval_required · approval_resolved
 *   complete · error · cancelled
 *
 * `EventNormalizer` translates one into the other, so every consumer sees the same shape:
 * `{ type, stage, message, data }`, with `message` always set.
 */

const STAGE_START: Record<string, AgentStage> = {
  UNDERSTANDING: 'UNDERSTANDING',
  PLANNING: 'PLANNING',
  INSPECTING: 'INSPECTING',
  IMPLEMENTING: 'IMPLEMENTING',
  RUNNING: 'RUNNING',
  TESTING: 'TESTING',
  DEBUGGING: 'DEBUGGING',
  DEBUGGING_FIX: 'DEBUGGING',
  OPTIMIZING: 'OPTIMIZING',
  VERIFYING: 'VERIFYING',
}

const CANONICAL = new Set<string>([
  'stage_change', 'log', 'file_change', 'command_run', 'command_output', 'test_result',
  'approval_required', 'approval_resolved', 'complete', 'error', 'cancelled', 'iteration', 'optimization', 'heartbeat',
])

const TERMINAL = new Set<string>(['complete', 'error', 'cancelled'])

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const asString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export interface NormalizerContext {
  /** Files written so far — used to write the completion summary. */
  filesChanged: () => string[]
  /** Changes the user declined; optional so older callers keep working. */
  skippedChanges?: () => string[]
}

export class EventNormalizer {
  private terminal = false
  private stage: AgentStage = 'UNDERSTANDING'

  constructor(private readonly ctx: NormalizerContext) {}

  get isTerminal() {
    return this.terminal
  }

  /** Returns the canonical event, or `null` if the event should be dropped (e.g. anything after the task ended). */
  normalize(raw: AgentEvent): AgentEvent | null {
    if (this.terminal) return null

    const type = raw.type as string
    const data = asRecord(raw.data)
    const timestamp = raw.timestamp ?? new Date().toISOString()

    const build = (
      out: AgentEventType,
      message: string,
      extra: Record<string, unknown> = {},
      stage: AgentStage = this.stage
    ): AgentEvent => {
      if (TERMINAL.has(out)) this.terminal = true
      return { type: out, taskId: raw.taskId, stage, message, data: { ...data, ...extra }, timestamp }
    }

    // Already canonical (the newer emitters) — just make sure `message` and `stage` are populated.
    if (CANONICAL.has(type)) {
      if (raw.stage) this.stage = raw.stage
      return build(type as AgentEventType, raw.message ?? asString(data.message) ?? type, {}, raw.stage ?? this.stage)
    }

    if (type in STAGE_START) {
      this.stage = STAGE_START[type]
      return build('stage_change', raw.message ?? asString(data.message) ?? this.stage.toLowerCase(), {}, this.stage)
    }

    switch (type) {
      case 'STARTED':
        return build('log', 'Task started')
      case 'UNDERSTANDING_COMPLETE': {
        const mode = asString(data.mode)
        return build('log', mode ? `Working in ${mode} mode` : 'Task understood', {}, 'UNDERSTANDING')
      }
      case 'PLANNING_COMPLETE': {
        const plan = asRecord(data.plan)
        const steps = Array.isArray(plan.steps) ? plan.steps.length : 0
        const create = Array.isArray(plan.filesToCreate) ? plan.filesToCreate.length : 0
        const modify = Array.isArray(plan.filesToModify) ? plan.filesToModify.length : 0
        return build(
          'log',
          `Plan ready — ${plural(steps, 'step')}, ${plural(create, 'new file')}, ${plural(modify, 'file')} to modify`,
          {},
          'PLANNING'
        )
      }
      case 'INSPECTING_COMPLETE': {
        const src = typeof data.sourceFileCount === 'number' ? data.sourceFileCount : undefined
        const stack = [asString(data.language), asString(data.framework)].filter(Boolean).join(' / ')
        return build(
          'log',
          `Project inspected${src !== undefined ? ` — ${plural(src, 'source file')}` : ''}${stack ? ` (${stack})` : ''}`,
          {},
          'INSPECTING'
        )
      }
      case 'IMPLEMENTING_FILE': {
        const file = asString(data.file) ?? asString(data.filePath) ?? 'file'
        return build('file_change', `Writing ${file}`, { filePath: file }, 'IMPLEMENTING')
      }
      case 'IMPLEMENTING_COMPLETE':
        return build('log', 'Code generation finished', {}, 'IMPLEMENTING')
      case 'RUNNING_COMPLETE': {
        const result = asRecord(data.result)
        const command = asString(result.command)
        if (!command) return build('log', asString(data.message) ?? 'Execution step finished', {}, 'RUNNING')
        const code = result.exitCode
        return build('command_run', `${command} → exit ${code === null || code === undefined ? '?' : String(code)}`, { command }, 'RUNNING')
      }
      case 'RUNNING_ERROR':
        // A failed build is fed to the fix loop — it does not end the task.
        return build('log', `Build step failed: ${asString(data.error) ?? 'unknown error'}`, { level: 'warn' }, 'RUNNING')
      case 'TESTING_COMPLETE': {
        const result = asRecord(data.result)
        const passed = result.passed === true
        const detail = asString(result.error) ?? asString(result.output)
        return build(
          'test_result',
          passed ? 'Tests passed' : `Tests failed${detail ? ` — ${detail.split('\n').find((l) => l.trim())?.slice(0, 160)}` : ''}`,
          { passed },
          'TESTING'
        )
      }
      case 'DEBUGGING_ANALYSIS': {
        const analysis = asRecord(data.analysis)
        return build('log', asString(analysis.summary) ?? 'Analyzed the failure', {}, 'DEBUGGING')
      }
      case 'DEBUGGING_COMPLETE':
        return build('log', 'Applied fixes — re-running checks', {}, 'DEBUGGING')
      case 'OPTIMIZING_COMPLETE':
        return build('log', 'Optimization pass finished', {}, 'OPTIMIZING')
      case 'VERIFYING_COMPLETE': {
        const ok = data.verified === true
        return build('log', asString(data.explanation) ?? (ok ? 'Verification passed' : 'Verification did not pass'), { verified: ok }, 'VERIFYING')
      }
      case 'APPROVED':
        return build('approval_resolved', 'Approved', { approved: true })
      case 'CANCELLED':
        return build('cancelled', raw.message ?? 'Task cancelled', {}, 'FAILED')
      case 'ERROR':
        return build('error', asString(data.error) ?? raw.message ?? 'The task failed', {}, 'FAILED')
      case 'COMPLETED': {
        const status = asString(data.status)
        if (status === 'SUCCESS') {
          // A read-only answer can be long markdown: keep the event line short and carry the text in data.summary.
          if (data.answer === true && asString(data.summary)) return build('complete', 'Answer ready', { summary: data.summary }, 'COMPLETE')
          const files = this.ctx.filesChanged()
          const skipped = this.ctx.skippedChanges?.() ?? []
          const summary =
            asString(data.summary) ??
            (files.length
              ? `Done — ${plural(files.length, 'file')} changed and verified.${skipped.length ? ` You skipped ${plural(skipped.length, 'change')}.` : ''}`
              : skipped.length
                ? `Finished without writing anything — you skipped ${plural(skipped.length, 'change')}.`
                : 'Done — no files needed to change.')
          return build('complete', summary, {}, 'COMPLETE')
        }
        if (status === 'FAILED_VERIFICATION') {
          return build('error', 'The work finished, but the checks did not pass. Review the changes before keeping them.', { verification: false }, 'FAILED')
        }
        return build('error', raw.message ?? 'The task failed', {}, 'FAILED')
      }
      default:
        return build('log', raw.message ?? asString(data.message) ?? type)
    }
  }
}
