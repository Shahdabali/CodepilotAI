// Shared types between backend and frontend
// These are duplicated/re-exported on the frontend via src/types/index.ts

export type AutonomyLevel = 'SAFE' | 'BALANCED' | 'AUTONOMOUS'

export type AgentMode =
  | 'BUILD'
  | 'FIX'
  | 'OPTIMIZE'
  | 'EXPLAIN'
  | 'TEST'
  | 'REFACTOR'
  | 'REVIEW'
  | 'MIGRATE'
  | 'AUTONOMOUS'

export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type AgentStage =
  | 'UNDERSTANDING'
  | 'PLANNING'
  | 'INSPECTING'
  | 'IMPLEMENTING'
  | 'RUNNING'
  | 'TESTING'
  | 'DEBUGGING'
  | 'OPTIMIZING'
  | 'VERIFYING'
  | 'COMPLETE'
  | 'FAILED'

export type AgentEventType =
  | 'stage_change'
  | 'log'
  | 'file_change'
  | 'command_run'
  | 'command_output'
  | 'test_result'
  | 'error'
  | 'approval_required'
  | 'approval_resolved'
  | 'cancelled'
  | 'complete'
  | 'iteration'
  | 'optimization'
  | 'heartbeat'
  // Stage lifecycle events emitted by pipeline stages:
  | 'STARTED'
  | 'UNDERSTANDING'
  | 'UNDERSTANDING_COMPLETE'
  | 'PLANNING'
  | 'PLANNING_COMPLETE'
  | 'INSPECTING'
  | 'INSPECTING_COMPLETE'
  | 'IMPLEMENTING'
  | 'IMPLEMENTING_FILE'
  | 'IMPLEMENTING_COMPLETE'
  | 'RUNNING'
  | 'RUNNING_COMPLETE'
  | 'RUNNING_ERROR'
  | 'TESTING'
  | 'TESTING_COMPLETE'
  | 'DEBUGGING'
  | 'DEBUGGING_ANALYSIS'
  | 'DEBUGGING_FIX'
  | 'DEBUGGING_COMPLETE'
  | 'OPTIMIZING'
  | 'OPTIMIZING_COMPLETE'
  | 'VERIFYING'
  | 'VERIFYING_COMPLETE'
  | 'COMPLETED'
  | 'ERROR'
  | 'CANCELLED'
  | 'APPROVED'

export interface AgentEvent {
  type: AgentEventType
  taskId: string
  stage?: AgentStage
  message?: string
  data?: Record<string, unknown>
  timestamp?: string
}

export interface Project {
  id: string
  name: string
  path: string
  language: string | null
  framework: string | null
  description: string | null
  fileCount: number
  testFileCount: number
  dependencies: string[]
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
}

export interface ProjectSettings {
  autonomyLevel: AutonomyLevel
  defaultMode: AgentMode
  maxIterations: number
  executionTimeout: number
  excludePatterns: string[]
}

export interface Task {
  id: string
  projectId: string
  command: string
  mode: AgentMode
  status: TaskStatus
  currentStage: AgentStage | null
  iterationCount: number
  createdAt: string
  completedAt: string | null
  summary: string | null
  filesChanged: string[]
  /** How much the agent may do without asking, as chosen when the task was started. */
  autonomy: AutonomyLevel | null
}

export interface TaskStep {
  id: string
  taskId: string
  stage: AgentStage
  status: 'running' | 'completed' | 'failed' | 'skipped'
  message: string
  data: Record<string, unknown> | null
  createdAt: string
}

export interface FileSnapshot {
  id: string
  taskId: string
  filePath: string
  contentBefore: string | null
  contentAfter: string | null
  createdAt: string
}

export interface FileDiff {
  filePath: string
  before: string | null
  after: string | null
  diff: string
  additions: number
  deletions: number
  isNew: boolean
  isDeleted: boolean
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  language?: string
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  staged: string[]
  unstaged: string[]
  untracked: string[]
  ahead: number
  behind: number
}

export interface TestResult {
  passed: boolean
  total?: number
  passed_count?: number
  failed_count?: number
  skipped_count?: number
  duration?: number
  failures?: TestFailure[]
  output: string
  error?: string
}

export interface TestFailure {
  test: string
  message: string
  location?: string
}

export interface ExecutionResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  timedOut: boolean
}

export interface ImplementationPlan {
  summary?: string
  steps: (PlanStep | string)[]
  filesToCreate: string[]
  filesToModify: string[]
  filesToDelete?: string[]
  estimatedComplexity?: 'low' | 'medium' | 'high'
  risks: string[]
}

export interface PlanStep {
  order: number
  description: string
  type: 'create' | 'modify' | 'delete' | 'run' | 'test' | 'analyze'
  target?: string
}

export interface ProjectAnalysis {
  language: string
  framework: string | null
  packageManager: string | null
  testFramework: string | null
  buildTool?: string | null
  fileCount: number
  sourceFileCount?: number
  testFileCount: number
  dependencies?: string[]
  devDependencies?: string[]
  hasTypeScript?: boolean
  hasTailwind?: boolean
  hasDocker?: boolean
  hasGit?: boolean
  entryPoint?: string | null
  scripts?: Record<string, string>
  description?: string | null
  gitStatus?: GitStatus | null
  configFiles?: string[]
}

export interface OptimizationSuggestion {
  category: 'performance' | 'quality' | 'reliability' | 'security'
  description: string
  file: string
  before: string
  after: string
  reason: string
  severity: 'low' | 'medium' | 'high'
}

export interface ApprovalRequest {
  id: string
  taskId: string
  type: 'file_write' | 'dangerous_command' | 'git_push' | 'delete_file'
  description: string
  details: Record<string, unknown>
  createdAt: string
}

export interface AppSettings {
  autonomyLevel: AutonomyLevel
  geminiApiKey: string
  geminiModel: string
  theme: 'dark' | 'light'
  fontSize: number
  maxIterations: number
  executionTimeout: number
}
