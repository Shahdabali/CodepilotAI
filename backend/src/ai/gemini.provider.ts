import { GoogleGenAI } from '@google/genai';
import type {
  AIProvider,
  GenerateOptions,
  AnalysisResult,
  HealthStatus,
  ModelInfo,
} from './provider.interface.js';

export const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'gemini',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: true,
      json: true,
    },
    rateLimits: { rpm: 15, rpd: 1500, tpm: 1000000 },
    recommendedFor: ['CODE_GENERATION', 'DEBUGGING', 'GENERAL', 'PROJECT_ANALYSIS', 'PLANNING'],
    isFree: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: true,
      json: true,
    },
    rateLimits: { rpm: 15, rpd: 1500, tpm: 1000000 },
    recommendedFor: ['CODE_GENERATION', 'DEBUGGING', 'GENERAL', 'TEST_GENERATION'],
    isFree: true,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'gemini',
    contextWindow: 2097152,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: true,
      json: true,
    },
    rateLimits: { rpm: 2, rpd: 50, tpm: 32000 },
    recommendedFor: ['PLANNING', 'CODE_REVIEW', 'REFACTORING', 'PROJECT_ANALYSIS'],
    isFree: true,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'gemini',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: true,
      json: true,
    },
    rateLimits: { rpm: 15, rpd: 1500, tpm: 1000000 },
    recommendedFor: ['DOCUMENTATION', 'OPTIMIZATION', 'GENERAL'],
    isFree: true,
  },
];

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  private ai: GoogleGenAI | null = null;
  private apiKey: string = '';
  private model: string;

  constructor(apiKey?: string, model: string = 'gemini-3.6-flash') {
    this.model = model;
    if (apiKey && apiKey.trim().length > 0) {
      this.setApiKey(apiKey.trim());
    }
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  setModel(model: string): void {
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0 && this.ai !== null);
  }

  getModels(): ModelInfo[] {
    return GEMINI_MODELS;
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        providerName: this.name,
        status: 'unconfigured',
        message: 'Gemini API Key not set',
        modelsCount: GEMINI_MODELS.length,
        lastChecked: new Date().toISOString(),
      };
    }

    const start = Date.now();
    try {
      const pingModel = this.model || 'gemini-3.6-flash';
      await this.ai!.models.generateContent({
        model: pingModel,
        contents: 'ping',
        config: { maxOutputTokens: 5 },
      });

      return {
        providerId: this.id,
        providerName: this.name,
        status: 'available',
        latencyMs: Date.now() - start,
        modelsCount: GEMINI_MODELS.length,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: any) {
      const msg = err.message || '';
      const latencyMs = Date.now() - start;

      if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource exhausted')) {
        return {
          providerId: this.id,
          providerName: this.name,
          status: 'rate_limited',
          latencyMs,
          message: 'Rate limit or quota exceeded',
          modelsCount: GEMINI_MODELS.length,
          lastChecked: new Date().toISOString(),
        };
      }

      if (msg.includes('API key not valid') || msg.includes('403') || msg.includes('401')) {
        return {
          providerId: this.id,
          providerName: this.name,
          status: 'error',
          latencyMs,
          message: 'Invalid Gemini API Key',
          modelsCount: GEMINI_MODELS.length,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        providerId: this.id,
        providerName: this.name,
        status: 'degraded',
        latencyMs,
        message: msg.slice(0, 120),
        modelsCount: GEMINI_MODELS.length,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    try {
      const targetModel = options?.model || this.model;
      const response = await this.ai!.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: options?.maxTokens,
          systemInstruction: options?.systemPrompt,
          stopSequences: options?.stopSequences,
        },
      });

      return (response.text || '').trim();
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('429') || msg.toLowerCase().includes('resource exhausted')) {
        throw new Error(`[RATE_LIMIT] Gemini quota/rate limit: ${msg}`);
      }
      throw new Error(`Gemini generate error: ${msg}`);
    }
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    try {
      const targetModel = options?.model || this.model;
      const responseStream = await this.ai!.models.generateContentStream({
        model: targetModel,
        contents: prompt,
        config: {
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: options?.maxTokens,
          systemInstruction: options?.systemPrompt,
          stopSequences: options?.stopSequences,
        },
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('429') || msg.toLowerCase().includes('resource exhausted')) {
        throw new Error(`[RATE_LIMIT] Gemini stream quota: ${msg}`);
      }
      throw new Error(`Gemini stream error: ${msg}`);
    }
  }

  async structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T> {
    const sysPrompt =
      (options?.systemPrompt || '') +
      `\nYou must respond with valid raw JSON adhering strictly to this schema:\n${JSON.stringify(schema)}\nDo not include code markdown formatting or explanation.`;

    const raw = await this.generate(prompt, {
      ...options,
      systemPrompt: sysPrompt,
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
      throw new Error(`Gemini structured output parsing failed: ${clean.slice(0, 100)}...`);
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
      systemPrompt: 'You are an expert code analyst and software architect. Analyze the provided content.',
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
              type: {
                type: 'string',
                enum: ['create', 'modify', 'delete', 'run', 'test', 'analyze'],
              },
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
      systemPrompt: 'You are a staff engineer designing an accurate, minimal, step-by-step implementation plan.',
    });
  }
}
