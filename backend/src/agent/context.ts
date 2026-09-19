import type { Project, AgentMode, AgentEvent, AgentStage, AutonomyLevel, ApprovalRequest, ImplementationPlan, ProjectAnalysis, TestResult, ExecutionResult } from '../types/shared.js'
import { requestApproval, cancelApprovals } from './approvals.js'
// Re-export types that stages import from context.ts for backwards compatibility
export type { ProjectAnalysis, ImplementationPlan, TestResult, ExecutionResult } from '../types/shared.js'

/** Thrown from `assertActive()` so a cancelled task unwinds out of whatever stage it is in. */
export class TaskCancelledError extends Error {
  constructor(message = 'Task cancelled by user') {
    super(message)
    this.name = 'TaskCancelledError'
  }
}

export interface TaskContextOptions {
  taskId: string
  projectId: string
  command: string
  mode: AgentMode
  project: Project
  maxIterations: number
  autonomy?: AutonomyLevel
  emit: (event: AgentEvent) => void
}

export class TaskContext {
  taskId: string
  projectId: string
  command: string
  mode: AgentMode
  project: Project
  autonomy: AutonomyLevel
  plan: ImplementationPlan | null = null
  analysis: ProjectAnalysis | null = null
  filesChanged: string[] = []
  /** Changes the user declined when asked, kept so the final summary can say so. */
  skipped: string[] = []
  errors: string[] = []
  testResults: TestResult | null = null
  iterationCount = 0
  maxIterations: number
  emit: (event: AgentEvent) => void
  private cancelled = false

  constructor(opts: TaskContextOptions) {
    this.taskId = opts.taskId
    this.projectId = opts.projectId
    this.command = opts.command
    this.mode = opts.mode
    this.project = opts.project
    this.maxIterations = opts.maxIterations
    this.autonomy = opts.autonomy ?? opts.project.settings?.autonomyLevel ?? 'BALANCED'
    this.emit = opts.emit
  }

  emitEvent(
    type: AgentEvent['type'],
    stage: AgentStage,
    message: string,
    data?: Record<string, unknown>
  ) {
    this.emit({
      type,
      taskId: this.taskId,
      stage,
      message,
      data,
      timestamp: new Date().toISOString(),
    })
  }

  addError(error: string) {
    this.errors.push(error)
  }

  addSkipped(what: string) {
    if (!this.skipped.includes(what)) this.skipped.push(what)
  }

  addFileChanged(file: string) {
    if (!this.filesChanged.includes(file)) {
      this.filesChanged.push(file)
    }
  }

  incrementIteration() {
    this.iterationCount++
  }

  shouldContinue(): boolean {
    return this.iterationCount < this.maxIterations && !this.cancelled
  }

  // ─── Cancellation ──────────────────────────────────────────────────────────

  get isCancelled() {
    return this.cancelled
  }

  cancel() {
    this.cancelled = true
    cancelApprovals(this.taskId)
  }

  /** Call between units of work; throws once the user has cancelled the task. */
  assertActive() {
    if (this.cancelled) throw new TaskCancelledError()
  }

  // ─── Human approval ────────────────────────────────────────────────────────

  /**
   * Whether this operation needs the user's go-ahead under the task's autonomy level.
   *   SAFE       → every file write and every dangerous command
   *   BALANCED   → dangerous commands only
   *   AUTONOMOUS → nothing (destructive commands are still blocked by the sandbox)
   */
  needsApproval(kind: ApprovalRequest['type']): boolean {
    if (this.autonomy === 'AUTONOMOUS') return false
    if (kind === 'file_write') return this.autonomy === 'SAFE'
    return true
  }

  /** Resolves true when the operation may go ahead. Pauses the task until the user answers. */
  async confirm(kind: ApprovalRequest['type'], description: string, details?: Record<string, unknown>): Promise<boolean> {
    this.assertActive()
    if (!this.needsApproval(kind)) return true
    const approved = await requestApproval({ taskId: this.taskId, type: kind, description, details, emit: this.emit })
    this.assertActive()
    return approved
  }
}
