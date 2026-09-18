export type AutonomyLevel = 'SAFE' | 'BALANCED' | 'AUTONOMOUS';
export type AgentMode = 'BUILD'|'FIX'|'OPTIMIZE'|'EXPLAIN'|'TEST'|'REFACTOR'|'REVIEW'|'MIGRATE'|'AUTONOMOUS';
export type TaskStatus = 'PENDING'|'RUNNING'|'COMPLETED'|'FAILED'|'CANCELLED';
export type AgentStage = 'UNDERSTANDING'|'PLANNING'|'INSPECTING'|'IMPLEMENTING'|'RUNNING'|'TESTING'|'DEBUGGING'|'OPTIMIZING'|'VERIFYING'|'COMPLETE'|'FAILED';
export type AgentEventType = 'stage_change'|'log'|'file_change'|'command_run'|'command_output'|'test_result'|'error'|'approval_required'|'complete'|'iteration'|'optimization'|'heartbeat';

export interface AgentEvent {
  type: AgentEventType;
  taskId: string;
  stage: AgentStage;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface Project {
  id: string; name: string; path: string;
  language: string | null; framework: string | null; description: string | null;
  fileCount: number; testFileCount: number; dependencies: string[];
  createdAt: string; updatedAt: string;
  settings: ProjectSettings;
}
export interface ProjectSettings {
  autonomyLevel: AutonomyLevel; defaultMode: AgentMode;
  maxIterations: number; executionTimeout: number; excludePatterns: string[];
}
export interface Task {
  id: string; projectId: string; command: string; mode: AgentMode;
  status: TaskStatus; currentStage: AgentStage | null; iterationCount: number;
  createdAt: string; completedAt: string | null; summary: string | null; filesChanged: string[];
}
export interface TaskStep {
  id: string; taskId: string; stage: AgentStage;
  status: 'running'|'completed'|'failed'|'skipped'; message: string;
  data: Record<string,unknown> | null; createdAt: string;
}
export interface FileDiff {
  filePath: string; before: string|null; after: string|null;
  diff: string; additions: number; deletions: number; isNew: boolean; isDeleted: boolean;
}
export interface FileNode {
  name: string; path: string; type: 'file'|'directory'; children?: FileNode[]; size?: number; language?: string;
}
export interface GitStatus {
  isRepo: boolean; branch: string|null; staged: string[]; unstaged: string[]; untracked: string[]; ahead: number; behind: number;
}
export interface TestResult {
  passed: boolean; total: number; passed_count: number; failed_count: number; skipped_count: number; duration: number; failures: TestFailure[]; output: string;
}
export interface TestFailure { test: string; message: string; location?: string; }
export interface AppSettings {
  autonomyLevel: AutonomyLevel; geminiApiKey: string; geminiModel: string;
  theme: 'dark'|'light'; fontSize: number; maxIterations: number; executionTimeout: number;
}
