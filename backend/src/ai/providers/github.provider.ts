import { OpenAICompatibleBase } from './openai-compatible.base.js';
import type { ModelInfo } from '../provider.interface.js';

export const GITHUB_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GitHub GPT-4o Mini',
    provider: 'github',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      streaming: true,
      vision: true,
      json: true,
    },
    rateLimits: { rpm: 15, rpd: 150 },
    recommendedFor: ['CODE_GENERATION', 'DEBUGGING', 'GENERAL'],
    isFree: true,
  },
  {
    id: 'deepseek-r1',
    name: 'GitHub DeepSeek R1',
    provider: 'github',
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
    rateLimits: { rpm: 15, rpd: 150 },
    recommendedFor: ['PLANNING', 'DEBUGGING', 'REFACTORING'],
    isFree: true,
  },
  {
    id: 'phi-4',
    name: 'GitHub Phi-4',
    provider: 'github',
    contextWindow: 16384,
    maxOutputTokens: 4096,
    capabilities: {
      coding: true,
      reasoning: true,
      tools: false,
      streaming: true,
      vision: false,
      json: true,
    },
    rateLimits: { rpm: 15, rpd: 150 },
    recommendedFor: ['OPTIMIZATION', 'TEST_GENERATION'],
    isFree: true,
  },
];

export class GithubModelsProvider extends OpenAICompatibleBase {
  constructor(apiKey: string = '', defaultModel: string = 'gpt-4o-mini') {
    super({
      id: 'github',
      name: 'GitHub Models',
      baseURL: 'https://models.inference.ai.azure.com',
      apiKey,
      defaultModel,
      models: GITHUB_MODELS,
    });
  }
}
