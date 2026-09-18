import { OpenAICompatibleBase } from './openai-compatible.base.js';
import type { ModelInfo } from '../provider.interface.js';

export const GROQ_MODELS: ModelInfo[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: false,
      json: true,
    },
    rateLimits: { rpm: 30, rpd: 14400, tpm: 6000 },
    recommendedFor: ['CODE_GENERATION', 'DEBUGGING', 'GENERAL', 'CODE_REVIEW'],
    isFree: true,
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    provider: 'groq',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: false,
      json: true,
    },
    rateLimits: { rpm: 30, rpd: 14400, tpm: 6000 },
    recommendedFor: ['PLANNING', 'DEBUGGING', 'REFACTORING', 'PROJECT_ANALYSIS'],
    isFree: true,
  },
  {
    id: 'qwen-2.5-coder-32b',
    name: 'Qwen 2.5 Coder 32B',
    provider: 'groq',
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
    rateLimits: { rpm: 30, rpd: 14400, tpm: 6000 },
    recommendedFor: ['CODE_GENERATION', 'TEST_GENERATION', 'OPTIMIZATION'],
    isFree: true,
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'groq',
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
    rateLimits: { rpm: 30, rpd: 14400, tpm: 20000 },
    recommendedFor: ['DOCUMENTATION', 'GENERAL'],
    isFree: true,
  },
];

export class GroqProvider extends OpenAICompatibleBase {
  constructor(apiKey: string = '', defaultModel: string = 'llama-3.3-70b-versatile') {
    super({
      id: 'groq',
      name: 'Groq Cloud',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
      defaultModel,
      models: GROQ_MODELS,
    });
  }
}
