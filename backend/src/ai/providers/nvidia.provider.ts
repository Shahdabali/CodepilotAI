import { OpenAICompatibleBase } from './openai-compatible.base.js';
import type { ModelInfo } from '../provider.interface.js';

export const NVIDIA_MODELS: ModelInfo[] = [
  {
    id: 'meta/llama-3.3-70b-instruct',
    name: 'NVIDIA Llama 3.3 70B Instruct',
    provider: 'nvidia',
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
    rateLimits: { rpm: 40, rpd: 5000 },
    recommendedFor: ['CODE_GENERATION', 'DEBUGGING', 'GENERAL'],
    isFree: true,
  },
  {
    id: 'deepseek-ai/deepseek-r1',
    name: 'NVIDIA DeepSeek R1',
    provider: 'nvidia',
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
    rateLimits: { rpm: 40, rpd: 5000 },
    recommendedFor: ['PLANNING', 'DEBUGGING', 'REFACTORING'],
    isFree: true,
  },
  {
    id: 'qwen/qwen2.5-coder-32b-instruct',
    name: 'NVIDIA Qwen 2.5 Coder 32B',
    provider: 'nvidia',
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
    rateLimits: { rpm: 40, rpd: 5000 },
    recommendedFor: ['CODE_GENERATION', 'TEST_GENERATION', 'OPTIMIZATION'],
    isFree: true,
  },
  {
    id: 'nvidia/llama-3.1-nemotron-70b-instruct',
    name: 'NVIDIA Nemotron 70B Instruct',
    provider: 'nvidia',
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
    rateLimits: { rpm: 40, rpd: 5000 },
    recommendedFor: ['CODE_REVIEW', 'DOCUMENTATION', 'GENERAL'],
    isFree: true,
  },
];

export class NvidiaProvider extends OpenAICompatibleBase {
  constructor(apiKey: string = '', defaultModel: string = 'meta/llama-3.3-70b-instruct') {
    super({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey,
      defaultModel,
      models: NVIDIA_MODELS,
    });
  }
}
