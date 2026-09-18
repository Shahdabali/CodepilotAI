import { OpenAICompatibleBase } from './openai-compatible.base.js';
import type { ModelInfo } from '../provider.interface.js';

export const OPENROUTER_MODELS: ModelInfo[] = [
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 (Free)',
    provider: 'openrouter',
    contextWindow: 65536,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: false,
      streaming: true,
      vision: false,
      json: true,
    },
    rateLimits: { rpm: 20, rpd: 200 },
    recommendedFor: ['PLANNING', 'DEBUGGING', 'PROJECT_ANALYSIS'],
    isFree: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Instruct (Free)',
    provider: 'openrouter',
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
    rateLimits: { rpm: 20, rpd: 200 },
    recommendedFor: ['CODE_GENERATION', 'GENERAL', 'CODE_REVIEW'],
    isFree: true,
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    name: 'Qwen 2.5 Coder 32B Instruct (Free)',
    provider: 'openrouter',
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
    rateLimits: { rpm: 20, rpd: 200 },
    recommendedFor: ['CODE_GENERATION', 'TEST_GENERATION', 'OPTIMIZATION'],
    isFree: true,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash Exp (Free)',
    provider: 'openrouter',
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
    rateLimits: { rpm: 15, rpd: 200 },
    recommendedFor: ['PROJECT_ANALYSIS', 'GENERAL', 'DOCUMENTATION'],
    isFree: true,
  },
];

export class OpenRouterProvider extends OpenAICompatibleBase {
  constructor(apiKey: string = '', defaultModel: string = 'deepseek/deepseek-r1:free') {
    super({
      id: 'openrouter',
      name: 'OpenRouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultModel,
      extraHeaders: {
        'HTTP-Referer': 'https://codepilot.ai',
        'X-Title': 'CodePilot AI Autonomous Agent',
      },
      models: OPENROUTER_MODELS,
    });
  }
}
