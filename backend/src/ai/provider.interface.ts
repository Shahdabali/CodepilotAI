export type TaskCategory =
  | 'PLANNING'
  | 'CODE_GENERATION'
  | 'DEBUGGING'
  | 'CODE_REVIEW'
  | 'REFACTORING'
  | 'OPTIMIZATION'
  | 'DOCUMENTATION'
  | 'TEST_GENERATION'
  | 'PROJECT_ANALYSIS'
  | 'GENERAL'

export interface ModelCapability {
  coding: boolean
  reasoning: boolean
  tools: boolean
  streaming: boolean
  vision: boolean
  json: boolean
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  contextWindow: number
  maxOutputTokens: number
  capabilities: ModelCapability
  rateLimits?: { rpm?: number; rpd?: number; tpm?: number }
  recommendedFor: TaskCategory[]
  isFree: boolean
}

export interface GenerateOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  model?: string
  jsonSchema?: object
  stopSequences?: string[]
}

export interface AnalysisResult {
  summary: string
  findings: string[]
  recommendations: string[]
}

export interface HealthStatus {
  providerId: string
  providerName: string
  status: 'available' | 'degraded' | 'rate_limited' | 'unconfigured' | 'error'
  latencyMs?: number
  message?: string
  modelsCount: number
  lastChecked: string
}

export interface AIProvider {
  readonly id: string
  readonly name: string
  
  isConfigured(): boolean
  getModels(): ModelInfo[]
  healthCheck(): Promise<HealthStatus>
  
  generate(prompt: string, options?: GenerateOptions): Promise<string>
  stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string>
  structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T>
  analyze(content: string, task: string, options?: GenerateOptions): Promise<AnalysisResult>
  plan(prompt: string, options?: GenerateOptions): Promise<any>
  toolCall?(prompt: string, tools: any[], options?: GenerateOptions): Promise<any>
}
