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

export interface HealthStatus {
  providerId: string;
  providerName: string;
  status: 'available' | 'degraded' | 'rate_limited' | 'unconfigured' | 'error';
  latencyMs?: number;
  message?: string;
  modelsCount: number;
  lastChecked: string;
}

export interface ModelCapability {
  coding: boolean;
  reasoning: boolean;
  tools: boolean;
  streaming: boolean;
  vision: boolean;
  json: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: ModelCapability;
  rateLimits?: { rpm?: number; rpd?: number; tpm?: number };
  recommendedFor: string[];
  isFree: boolean;
}

export interface ProviderItem {
  id: string;
  name: string;
  description: string;
  freeTierInfo: string;
  websiteUrl: string;
  docsUrl: string;
  envVar: string;
  settingKey: string;
  requiresKey: boolean;
  isConfigured: boolean;
  health: HealthStatus;
  models: ModelInfo[];
}

export interface ProvidersResponse {
  providers: ProviderItem[];
  routingMode: string;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    fallbackCount: number;
    rateLimitHits: number;
    requestsByProvider: Record<string, number>;
    activeRoutingMode: string;
  };
}

export interface AppSettings {
  autonomyLevel: AutonomyLevel;
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey?: string;
  openRouterApiKey?: string;
  nvidiaApiKey?: string;
  githubApiKey?: string;
  ollamaEnabled?: boolean | string;
  ollamaBaseUrl?: string;
  aiRoutingMode?: string;
  theme: 'dark'|'light';
  fontSize: number;
  maxIterations: number;
  executionTimeout: number;
}
