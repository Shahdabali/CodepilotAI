import type {
  AIProvider,
  GenerateOptions,
  AnalysisResult,
  HealthStatus,
  ModelInfo,
} from '../provider.interface.js';
import {
  NvidiaClient,
  NvidiaApiError,
  parseNvidiaModel,
  FALLBACK_NVIDIA_MODELS,
  runNvidiaDiagnostic,
  parseNvidiaSSEStream,
  type NvidiaDetailedHealth,
} from './nvidia/index.js';

export { FALLBACK_NVIDIA_MODELS as NVIDIA_MODELS };

export class NvidiaProvider implements AIProvider {
  readonly id = 'nvidia';
  readonly name = 'NVIDIA NIM';

  private client: NvidiaClient;
  private defaultModel: string;
  private cachedModels: ModelInfo[] = [...FALLBACK_NVIDIA_MODELS];
  private lastDiscovery: number = 0;

  constructor(
    apiKey: string = '',
    baseURL: string = 'https://integrate.api.nvidia.com/v1',
    defaultModel: string = 'nvidia/llama-3.1-nemotron-70b-instruct'
  ) {
    this.client = new NvidiaClient(apiKey, baseURL);
    this.defaultModel = defaultModel;
  }

  setApiKey(key: string): void {
    this.client.setApiKey(key);
  }

  setBaseURL(url: string): void {
    this.client.setBaseURL(url);
  }

  getBaseURL(): string {
    return this.client.getBaseURL();
  }

  setModel(model: string): void {
    this.defaultModel = model;
  }

  getModel(): string {
    return this.defaultModel;
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  getModels(): ModelInfo[] {
    return this.cachedModels;
  }

  /**
   * Discover models live from the NVIDIA NIM endpoint (/v1/models)
   */
  async discoverModels(forceRefresh = false): Promise<ModelInfo[]> {
    if (!this.isConfigured()) {
      return this.cachedModels;
    }

    const now = Date.now();
    // Cache discovery for 5 minutes unless forced
    if (!forceRefresh && this.lastDiscovery > 0 && now - this.lastDiscovery < 300000) {
      return this.cachedModels;
    }

    try {
      const rawList = await this.client.listModels();
      if (rawList.length > 0) {
        this.cachedModels = rawList.map(parseNvidiaModel);
        this.lastDiscovery = now;
      }
    } catch {
      // Keep existing cached or fallback models on failure
    }
    return this.cachedModels;
  }

  async healthCheck(): Promise<HealthStatus> {
    const detailed = await this.detailedHealthCheck();
    return {
      providerId: detailed.providerId,
      providerName: detailed.providerName,
      status: detailed.status,
      latencyMs: detailed.latencyMs,
      message: detailed.message,
      modelsCount: detailed.modelsCount,
      lastChecked: detailed.lastChecked,
    };
  }

  async detailedHealthCheck(): Promise<NvidiaDetailedHealth> {
    // Also refresh models during diagnostic
    const health = await runNvidiaDiagnostic(this.client, this.defaultModel);
    if (health.discoveredModels.length > 0) {
      this.cachedModels = health.discoveredModels.map((id) => parseNvidiaModel({ id }));
      this.lastDiscovery = Date.now();
    }
    return health;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('NVIDIA NIM API key is not configured.');
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const model = options?.model || this.defaultModel;
    const payload: Record<string, any> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.2,
    };

    if (options?.maxTokens) {
      payload.max_tokens = options.maxTokens;
    }

    if (options?.jsonSchema) {
      payload.response_format = { type: 'json_object' };
    }

    const res = await this.client.createChatCompletion(payload);
    const content = res.choices?.[0]?.message?.content ?? '';
    return content.trim();
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string> {
    if (!this.isConfigured()) {
      throw new Error('NVIDIA NIM API key is not configured.');
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const model = options?.model || this.defaultModel;
    const payload: Record<string, any> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.2,
    };

    if (options?.maxTokens) {
      payload.max_tokens = options.maxTokens;
    }

    const response = await this.client.streamChatCompletion(payload);
    yield* parseNvidiaSSEStream(response);
  }

  async structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T> {
    const sysPrompt =
      (options?.systemPrompt || '') +
      `\nYou must respond with valid raw JSON adhering strictly to this JSON Schema:\n${JSON.stringify(schema)}\nDo not include conversational text or markdown code fences.`;

    const raw = await this.generate(prompt, {
      ...options,
      systemPrompt: sysPrompt,
      jsonSchema: schema,
    });

    let clean = raw.trim();
    if (clean.startsWith('```json')) clean = clean.substring(7);
    if (clean.startsWith('```')) clean = clean.substring(3);
    if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
    clean = clean.trim();

    try {
      return JSON.parse(clean) as T;
    } catch {
      const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]) as T;
      }
      throw new Error(`Failed to parse JSON response from NVIDIA NIM: ${clean.slice(0, 100)}...`);
    }
  }

  async analyze(content: string, task: string, options?: GenerateOptions): Promise<AnalysisResult> {
    const prompt = `Task: ${task}\n\nContent:\n${content}`;
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'findings', 'recommendations'],
    };

    return this.structuredOutput<AnalysisResult>(prompt, schema, {
      ...options,
      systemPrompt: 'You are an expert software engineer and code analyst. Analyze the provided content.',
    });
  }

  async plan(prompt: string, options?: GenerateOptions): Promise<any> {
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['create', 'modify', 'delete', 'run', 'test', 'analyze'] },
              target: { type: 'string' },
            },
            required: ['order', 'description', 'type'],
          },
        },
        filesToCreate: { type: 'array', items: { type: 'string' } },
        filesToModify: { type: 'array', items: { type: 'string' } },
        filesToDelete: { type: 'array', items: { type: 'string' } },
        estimatedComplexity: { type: 'string', enum: ['low', 'medium', 'high'] },
        risks: { type: 'array', items: { type: 'string' } },
      },
      required: ['steps', 'filesToCreate', 'filesToModify', 'risks'],
    };

    return this.structuredOutput(prompt, schema, {
      ...options,
      systemPrompt: 'You are an expert technical lead creating a structured implementation plan.',
    });
  }
}
