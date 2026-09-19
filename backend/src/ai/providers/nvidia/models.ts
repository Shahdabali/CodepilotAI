import type { ModelInfo, TaskCategory } from '../../provider.interface.js';

export interface NvidiaRawModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  root?: string;
  parent?: string;
}

export const FALLBACK_NVIDIA_MODELS: ModelInfo[] = [
  {
    id: 'nvidia/llama-3.1-nemotron-70b-instruct',
    name: 'NVIDIA Nemotron 70B Instruct',
    provider: 'nvidia',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    capabilities: { coding: true, reasoning: true, tools: true, streaming: true, vision: false, json: true },
    recommendedFor: ['PLANNING', 'CODE_GENERATION', 'DEBUGGING', 'GENERAL'],
    isFree: true,
  },
  {
    id: 'mistralai/codestral-22b-instruct-v0.1',
    name: 'Mistral Codestral 22B',
    provider: 'nvidia',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: { coding: true, reasoning: true, tools: true, streaming: true, vision: false, json: true },
    recommendedFor: ['CODE_GENERATION', 'TEST_GENERATION', 'OPTIMIZATION'],
    isFree: true,
  },
  {
    id: 'meta/codellama-70b',
    name: 'Meta CodeLlama 70B',
    provider: 'nvidia',
    contextWindow: 16384,
    maxOutputTokens: 4096,
    capabilities: { coding: true, reasoning: true, tools: false, streaming: true, vision: false, json: true },
    recommendedFor: ['CODE_GENERATION', 'REFACTORING'],
    isFree: true,
  },
  {
    id: 'deepseek-ai/deepseek-coder-6.7b-instruct',
    name: 'DeepSeek Coder 6.7B Instruct',
    provider: 'nvidia',
    contextWindow: 16384,
    maxOutputTokens: 4096,
    capabilities: { coding: true, reasoning: true, tools: false, streaming: true, vision: false, json: true },
    recommendedFor: ['CODE_GENERATION', 'DEBUGGING'],
    isFree: true,
  },
  {
    id: 'nvidia/nemotron-4-340b-instruct',
    name: 'NVIDIA Nemotron 4 340B Instruct',
    provider: 'nvidia',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    capabilities: { coding: true, reasoning: true, tools: true, streaming: true, vision: false, json: true },
    recommendedFor: ['PLANNING', 'CODE_REVIEW', 'GENERAL'],
    isFree: true,
  },
];

export function parseNvidiaModel(raw: NvidiaRawModel): ModelInfo {
  const id = raw.id;
  const isCode = /code|granite.*code|starcoder|codestral/i.test(id);
  const isVision = /vision|vlm|kosmos|vila/i.test(id);
  const isReasoning = /reason|nemotron.*reason|r1/i.test(id);

  const recommended: TaskCategory[] = ['GENERAL'];
  if (isCode) {
    recommended.push('CODE_GENERATION', 'TEST_GENERATION', 'OPTIMIZATION');
  }
  if (isReasoning) {
    recommended.push('PLANNING', 'DEBUGGING', 'REFACTORING');
  }

  // Friendly display name
  const nameParts = id.split('/');
  const modelName = nameParts.length > 1 ? nameParts[1] : id;
  const formattedName = modelName
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    id,
    name: `NVIDIA ${formattedName}`,
    provider: 'nvidia',
    contextWindow: isCode ? 32768 : 131072,
    maxOutputTokens: 8192,
    capabilities: {
      coding: true,
      reasoning: isReasoning || !isCode,
      tools: !isReasoning,
      streaming: true,
      vision: isVision,
      json: true,
    },
    rateLimits: { rpm: 40, rpd: 5000 },
    recommendedFor: recommended,
    isFree: true,
  };
}
