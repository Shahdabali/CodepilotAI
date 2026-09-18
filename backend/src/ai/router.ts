import { config } from '../config.js';
import { getAllSettings } from '../db/queries.js';
import type {
  AIProvider,
  GenerateOptions,
  AnalysisResult,
  HealthStatus,
  TaskCategory,
  ModelInfo,
} from './provider.interface.js';
import { GeminiProvider } from './gemini.provider.js';
import { GroqProvider } from './providers/groq.provider.js';
import { OpenRouterProvider } from './providers/openrouter.provider.js';
import { NvidiaProvider } from './providers/nvidia.provider.js';
import { GithubModelsProvider } from './providers/github.provider.js';
import { OllamaProvider } from './providers/ollama.provider.js';
import { modelRegistry } from './registry.js';

export interface ProviderCooldown {
  cooldownUntil: number;
  failureCount: number;
  lastError?: string;
}

export interface RouterMetrics {
  totalRequests: number;
  successfulRequests: number;
  fallbackCount: number;
  rateLimitHits: number;
  requestsByProvider: Record<string, number>;
  activeRoutingMode: string;
}

export class AIRouter {
  private static instance: AIRouter;

  private providers: Map<string, AIProvider> = new Map();
  private cooldowns: Map<string, ProviderCooldown> = new Map();
  private routingMode: string = 'auto';
  private metrics: RouterMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    fallbackCount: 0,
    rateLimitHits: 0,
    requestsByProvider: {},
    activeRoutingMode: 'auto',
  };

  private geminiProvider: GeminiProvider;
  private groqProvider: GroqProvider;
  private openRouterProvider: OpenRouterProvider;
  private nvidiaProvider: NvidiaProvider;
  private githubProvider: GithubModelsProvider;
  private ollamaProvider: OllamaProvider;

  private constructor() {
    this.geminiProvider = new GeminiProvider(config.geminiApiKey, config.geminiModel);
    this.groqProvider = new GroqProvider(config.groqApiKey);
    this.openRouterProvider = new OpenRouterProvider(config.openRouterApiKey);
    this.nvidiaProvider = new NvidiaProvider(config.nvidiaApiKey);
    this.githubProvider = new GithubModelsProvider(config.githubApiKey);
    this.ollamaProvider = new OllamaProvider(config.ollamaBaseUrl);

    this.registerProvider(this.geminiProvider);
    this.registerProvider(this.groqProvider);
    this.registerProvider(this.openRouterProvider);
    this.registerProvider(this.nvidiaProvider);
    this.registerProvider(this.githubProvider);
    this.registerProvider(this.ollamaProvider);

    this.routingMode = config.aiRoutingMode || 'auto';
    this.metrics.activeRoutingMode = this.routingMode;
  }

  static getInstance(): AIRouter {
    if (!AIRouter.instance) {
      AIRouter.instance = new AIRouter();
    }
    return AIRouter.instance;
  }

  private registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
    this.metrics.requestsByProvider[provider.id] = 0;
  }

  getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  setRoutingMode(mode: string): void {
    this.routingMode = mode;
    this.metrics.activeRoutingMode = mode;
  }

  getRoutingMode(): string {
    return this.routingMode;
  }

  /**
   * Synchronize API keys and settings from SQLite database
   */
  async syncWithSettings(): Promise<void> {
    try {
      const settings = await getAllSettings();

      const geminiKey = (settings['geminiApiKey'] as string) || config.geminiApiKey;
      if (geminiKey) this.geminiProvider.setApiKey(geminiKey);

      const groqKey = (settings['groqApiKey'] as string) || config.groqApiKey;
      if (groqKey) (this.groqProvider as any).setApiKey(groqKey);

      const openRouterKey = (settings['openRouterApiKey'] as string) || config.openRouterApiKey;
      if (openRouterKey) (this.openRouterProvider as any).setApiKey(openRouterKey);

      const nvidiaKey = (settings['nvidiaApiKey'] as string) || config.nvidiaApiKey;
      if (nvidiaKey) (this.nvidiaProvider as any).setApiKey(nvidiaKey);

      const githubKey = (settings['githubApiKey'] as string) || config.githubApiKey;
      if (githubKey) (this.githubProvider as any).setApiKey(githubKey);

      const ollamaEnabled = settings['ollamaEnabled'] === true || settings['ollamaEnabled'] === 'true';
      this.ollamaProvider.setEnabled(ollamaEnabled);

      const ollamaUrl = (settings['ollamaBaseUrl'] as string) || config.ollamaBaseUrl;
      if (ollamaUrl) this.ollamaProvider.setBaseURL(ollamaUrl);

      const savedMode = (settings['aiRoutingMode'] as string) || (settings['defaultProvider'] as string) || config.aiRoutingMode;
      if (savedMode) this.setRoutingMode(savedMode);
    } catch {
      // Ignore initial DB read error before DB is ready
    }
  }

  /**
   * Determine priority order of providers and models for a given task
   */
  getCandidateChain(category: TaskCategory = 'GENERAL'): Array<{ provider: AIProvider; modelId?: string }> {
    const configuredProviders = Array.from(this.providers.values()).filter(p => p.isConfigured());

    if (configuredProviders.length === 0) {
      throw new Error(
        'No AI provider is configured. Please configure an API key for Google Gemini, Groq, OpenRouter, NVIDIA NIM, GitHub Models, or enable local Ollama in Settings.'
      );
    }

    const now = Date.now();
    const isCoolingDown = (pId: string): boolean => {
      const cd = this.cooldowns.get(pId);
      return Boolean(cd && cd.cooldownUntil > now);
    };

    // If explicit routing mode is chosen (not 'auto')
    if (this.routingMode !== 'auto') {
      const explicit = this.providers.get(this.routingMode);
      if (explicit && explicit.isConfigured()) {
        const fallbacks = configuredProviders.filter(p => p.id !== explicit.id);
        const candidates = [explicit, ...fallbacks];
        return candidates.map(p => ({ provider: p }));
      }
    }

    // Intelligent Routing by task category:
    const candidates: Array<{ provider: AIProvider; modelId?: string }> = [];

    // Task-specific priority preferences
    switch (category) {
      case 'PLANNING':
      case 'REFACTORING':
      case 'DEBUGGING':
        // High reasoning priority: DeepSeek-R1 (Groq/OpenRouter/NVIDIA) > Gemini 1.5 Pro / 2.5 Flash > Llama 3.3 70B
        this.addCandidateIfAvailable(candidates, 'groq', 'deepseek-r1-distill-llama-70b');
        this.addCandidateIfAvailable(candidates, 'openrouter', 'deepseek/deepseek-r1:free');
        this.addCandidateIfAvailable(candidates, 'nvidia', 'deepseek-ai/deepseek-r1');
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-3.6-flash');
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-2.5-flash');
        this.addCandidateIfAvailable(candidates, 'groq', 'llama-3.3-70b-versatile');
        this.addCandidateIfAvailable(candidates, 'github', 'deepseek-r1');
        this.addCandidateIfAvailable(candidates, 'ollama', 'deepseek-r1:latest');
        break;

      case 'CODE_GENERATION':
      case 'TEST_GENERATION':
      case 'OPTIMIZATION':
        // Code-specialized priority: Qwen 2.5 Coder > Gemini 3.6 Flash > Llama 3.3 70B > GPT-4o-mini
        this.addCandidateIfAvailable(candidates, 'groq', 'qwen-2.5-coder-32b');
        this.addCandidateIfAvailable(candidates, 'openrouter', 'qwen/qwen-2.5-coder-32b-instruct:free');
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-3.6-flash');
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-2.5-flash');
        this.addCandidateIfAvailable(candidates, 'groq', 'llama-3.3-70b-versatile');
        this.addCandidateIfAvailable(candidates, 'nvidia', 'qwen/qwen2.5-coder-32b-instruct');
        this.addCandidateIfAvailable(candidates, 'github', 'gpt-4o-mini');
        this.addCandidateIfAvailable(candidates, 'ollama', 'qwen2.5-coder:latest');
        break;

      case 'PROJECT_ANALYSIS':
        // Context window priority: Gemini (1M-2M tokens) > DeepSeek R1 > Llama 3.3 70B
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-3.6-flash');
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-2.5-flash');
        this.addCandidateIfAvailable(candidates, 'openrouter', 'google/gemini-2.0-flash-exp:free');
        this.addCandidateIfAvailable(candidates, 'groq', 'llama-3.3-70b-versatile');
        this.addCandidateIfAvailable(candidates, 'nvidia', 'meta/llama-3.3-70b-instruct');
        break;

      case 'DOCUMENTATION':
      case 'GENERAL':
      default:
        // Speed & versatility priority: Groq Llama 3.1 8B / 3.3 70B > Gemini 3.6 Flash > GitHub GPT-4o-mini
        this.addCandidateIfAvailable(candidates, 'groq', 'llama-3.1-8b-instant');
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-3.6-flash');
        this.addCandidateIfAvailable(candidates, 'gemini', 'gemini-2.5-flash');
        this.addCandidateIfAvailable(candidates, 'groq', 'llama-3.3-70b-versatile');
        this.addCandidateIfAvailable(candidates, 'openrouter', 'meta-llama/llama-3.3-70b-instruct:free');
        this.addCandidateIfAvailable(candidates, 'github', 'gpt-4o-mini');
        this.addCandidateIfAvailable(candidates, 'ollama', 'llama3.2:latest');
        break;
    }

    // Append any remaining configured providers as safety net
    for (const p of configuredProviders) {
      if (!candidates.some(c => c.provider.id === p.id)) {
        candidates.push({ provider: p });
      }
    }

    // Sort so that providers not in cooldown come first
    candidates.sort((a, b) => {
      const aCool = isCoolingDown(a.provider.id);
      const bCool = isCoolingDown(b.provider.id);
      if (aCool && !bCool) return 1;
      if (!aCool && bCool) return -1;
      return 0;
    });

    return candidates;
  }

  private addCandidateIfAvailable(
    list: Array<{ provider: AIProvider; modelId?: string }>,
    providerId: string,
    modelId?: string
  ): void {
    const provider = this.providers.get(providerId);
    if (provider && provider.isConfigured()) {
      list.push({ provider, modelId });
    }
  }

  private markRateLimited(providerId: string, errorMsg: string): void {
    const current = this.cooldowns.get(providerId) || { cooldownUntil: 0, failureCount: 0 };
    const failureCount = current.failureCount + 1;
    // Exponential backoff: 30s -> 60s -> 120s -> max 300s
    const cooldownDuration = Math.min(30 * Math.pow(2, failureCount - 1), 300) * 1000;
    this.cooldowns.set(providerId, {
      cooldownUntil: Date.now() + cooldownDuration,
      failureCount,
      lastError: errorMsg,
    });
    this.metrics.rateLimitHits++;
    console.warn(`[AIRouter] Provider ${providerId} rate-limited. Cooldown for ${cooldownDuration / 1000}s.`);
  }

  private markSuccess(providerId: string): void {
    const current = this.cooldowns.get(providerId);
    if (current && current.failureCount > 0) {
      this.cooldowns.set(providerId, {
        cooldownUntil: 0,
        failureCount: 0,
      });
    }
    this.metrics.successfulRequests++;
    this.metrics.requestsByProvider[providerId] = (this.metrics.requestsByProvider[providerId] || 0) + 1;
  }

  /**
   * Execute an operation across the candidate chain with automated fallback
   */
  async executeWithFallback<T>(
    category: TaskCategory,
    operationName: string,
    executeFn: (provider: AIProvider, modelId?: string) => Promise<T>
  ): Promise<T> {
    this.metrics.totalRequests++;
    const candidates = this.getCandidateChain(category);
    const errors: Array<{ provider: string; message: string }> = [];

    for (let i = 0; i < candidates.length; i++) {
      const { provider, modelId } = candidates[i];
      try {
        if (i > 0) {
          this.metrics.fallbackCount++;
          console.warn(`[AIRouter] Fallback #${i} -> Using ${provider.name} (model: ${modelId || 'default'}) for ${operationName}`);
        }

        const result = await executeFn(provider, modelId);
        this.markSuccess(provider.id);
        return result;
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        errors.push({ provider: provider.name, message: errorMsg });

        if (
          errorMsg.includes('RATE_LIMIT') ||
          errorMsg.includes('429') ||
          errorMsg.toLowerCase().includes('quota') ||
          errorMsg.toLowerCase().includes('resource exhausted')
        ) {
          this.markRateLimited(provider.id, errorMsg);
        }

        // If this is the last candidate, rethrow comprehensive error
        if (i === candidates.length - 1) {
          const detail = errors.map(e => `[${e.provider}]: ${e.message}`).join(' | ');
          throw new Error(`All available AI providers failed for ${operationName}. Errors: ${detail}`);
        }
      }
    }

    throw new Error(`All providers failed for ${operationName}`);
  }

  async generate(prompt: string, options?: GenerateOptions, category: TaskCategory = 'GENERAL'): Promise<string> {
    return this.executeWithFallback(category, 'generate', (provider, modelId) =>
      provider.generate(prompt, { ...options, model: options?.model || modelId })
    );
  }

  async *stream(prompt: string, options?: GenerateOptions, category: TaskCategory = 'GENERAL'): AsyncGenerator<string> {
    this.metrics.totalRequests++;
    const candidates = this.getCandidateChain(category);

    for (let i = 0; i < candidates.length; i++) {
      const { provider, modelId } = candidates[i];
      try {
        if (i > 0) {
          this.metrics.fallbackCount++;
          console.warn(`[AIRouter] Fallback #${i} streaming with ${provider.name}`);
        }

        const stream = provider.stream(prompt, { ...options, model: options?.model || modelId });
        for await (const chunk of stream) {
          yield chunk;
        }

        this.markSuccess(provider.id);
        return;
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        if (
          errorMsg.includes('RATE_LIMIT') ||
          errorMsg.includes('429') ||
          errorMsg.toLowerCase().includes('quota')
        ) {
          this.markRateLimited(provider.id, errorMsg);
        }

        if (i === candidates.length - 1) {
          throw new Error(`Streaming failed across all providers: ${errorMsg}`);
        }
      }
    }
  }

  async structuredOutput<T>(
    prompt: string,
    schema: object,
    options?: GenerateOptions,
    category: TaskCategory = 'GENERAL'
  ): Promise<T> {
    return this.executeWithFallback(category, 'structuredOutput', (provider, modelId) =>
      provider.structuredOutput<T>(prompt, schema, { ...options, model: options?.model || modelId })
    );
  }

  async analyze(
    content: string,
    task: string,
    options?: GenerateOptions,
    category: TaskCategory = 'PROJECT_ANALYSIS'
  ): Promise<AnalysisResult> {
    return this.executeWithFallback(category, 'analyze', (provider, modelId) =>
      provider.analyze(content, task, { ...options, model: options?.model || modelId })
    );
  }

  async plan(prompt: string, options?: GenerateOptions, category: TaskCategory = 'PLANNING'): Promise<any> {
    return this.executeWithFallback(category, 'plan', (provider, modelId) =>
      provider.plan(prompt, { ...options, model: options?.model || modelId })
    );
  }

  async getHealthStatuses(): Promise<HealthStatus[]> {
    const statuses: HealthStatus[] = [];
    for (const provider of this.providers.values()) {
      try {
        const status = await provider.healthCheck();
        // Enrich with cooldown info if rate limited
        const cd = this.cooldowns.get(provider.id);
        if (cd && cd.cooldownUntil > Date.now()) {
          status.status = 'rate_limited';
          status.message = `In cooldown for ${Math.ceil((cd.cooldownUntil - Date.now()) / 1000)}s`;
        }
        statuses.push(status);
      } catch (err: any) {
        statuses.push({
          providerId: provider.id,
          providerName: provider.name,
          status: 'error',
          message: err.message || 'Health check failed',
          modelsCount: provider.getModels().length,
          lastChecked: new Date().toISOString(),
        });
      }
    }
    return statuses;
  }

  getMetrics(): RouterMetrics {
    return { ...this.metrics };
  }
}

export const aiRouter = AIRouter.getInstance();
export const getAIRouter = (): AIRouter => AIRouter.getInstance();
