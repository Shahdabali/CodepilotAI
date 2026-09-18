import { OpenAICompatibleBase } from './openai-compatible.base.js';
import type { HealthStatus, ModelInfo } from '../provider.interface.js';

export const OLLAMA_DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'qwen2.5-coder:latest',
    name: 'Ollama Qwen 2.5 Coder',
    provider: 'ollama',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: false,
      json: true,
    },
    recommendedFor: ['CODE_GENERATION', 'TEST_GENERATION', 'OPTIMIZATION'],
    isFree: true,
  },
  {
    id: 'deepseek-r1:latest',
    name: 'Ollama DeepSeek R1',
    provider: 'ollama',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: false,
      streaming: true,
      vision: false,
      json: true,
    },
    recommendedFor: ['PLANNING', 'DEBUGGING', 'REFACTORING'],
    isFree: true,
  },
  {
    id: 'llama3.2:latest',
    name: 'Ollama Llama 3.2',
    provider: 'ollama',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: false,
      tools: true,
      streaming: true,
      vision: false,
      json: true,
    },
    recommendedFor: ['GENERAL', 'DOCUMENTATION'],
    isFree: true,
  },
];

export class OllamaProvider extends OpenAICompatibleBase {
  private enabled: boolean = false;

  constructor(baseURL: string = 'http://localhost:11434/v1', defaultModel: string = 'qwen2.5-coder:latest') {
    super({
      id: 'ollama',
      name: 'Ollama (Local)',
      baseURL,
      apiKey: 'ollama-local',
      defaultModel,
      models: OLLAMA_DEFAULT_MODELS,
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setBaseURL(url: string): void {
    this.baseURL = url.replace(/\/+$/, '');
  }

  override isConfigured(): boolean {
    return this.enabled;
  }

  override async healthCheck(): Promise<HealthStatus> {
    if (!this.enabled) {
      return {
        providerId: this.id,
        providerName: this.name,
        status: 'unconfigured',
        message: 'Local Ollama is disabled',
        modelsCount: this.models.length,
        lastChecked: new Date().toISOString(),
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${this.baseURL}/models`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) {
        return {
          providerId: this.id,
          providerName: this.name,
          status: 'degraded',
          latencyMs: Date.now() - start,
          message: `Ollama returned HTTP ${res.status}`,
          modelsCount: this.models.length,
          lastChecked: new Date().toISOString(),
        };
      }

      const json = await res.json() as any;
      const discoveredModels: string[] = Array.isArray(json.data)
        ? json.data.map((m: any) => m.id)
        : [];

      return {
        providerId: this.id,
        providerName: this.name,
        status: 'available',
        latencyMs: Date.now() - start,
        message: discoveredModels.length > 0 ? `Detected ${discoveredModels.length} local models` : 'Connected',
        modelsCount: Math.max(discoveredModels.length, this.models.length),
        lastChecked: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        providerName: this.name,
        status: 'error',
        latencyMs: Date.now() - start,
        message: 'Cannot reach Ollama at ' + this.baseURL + ' (is Ollama running?)',
        modelsCount: this.models.length,
        lastChecked: new Date().toISOString(),
      };
    }
  }
}
