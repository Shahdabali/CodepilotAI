import type { Project, AgentMode, AgentEvent, AgentStage, ImplementationPlan, ProjectAnalysis, TestResult, ExecutionResult } from '../types/shared.js'
// Re-export types that stages import from context.ts for backwards compatibility
export type { ProjectAnalysis, ImplementationPlan, TestResult, ExecutionResult } from '../types/shared.js'


export interface TaskContextOptions {
  taskId: string
  projectId: string
  command: string
  mode: AgentMode
  project: Project
  maxIterations: number
  emit: (event: AgentEvent) => void
}

export class TaskContext {
  taskId: string
  projectId: string
  command: string
  mode: AgentMode
  project: Project
  plan: ImplementationPlan | null = null
  analysis: ProjectAnalysis | null = null
  filesChanged: string[] = []
  errors: string[] = []
  testResults: TestResult | null = null
  iterationCount = 0
  maxIterations: number
  emit: (event: AgentEvent) => void

  constructor(opts: TaskContextOptions) {
    this.taskId = opts.taskId
    this.projectId = opts.projectId
    this.command = opts.command
    this.mode = opts.mode
    this.project = opts.project
    this.maxIterations = opts.maxIterations
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

  addFileChanged(file: string) {
    if (!this.filesChanged.includes(file)) {
      this.filesChanged.push(file)
    }
  }

  incrementIteration() {
    this.iterationCount++
  }

  shouldContinue(): boolean {
    return this.iterationCount < this.maxIterations
  }
}
