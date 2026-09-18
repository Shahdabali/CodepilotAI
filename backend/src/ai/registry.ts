import type { ModelInfo, TaskCategory } from './provider.interface.js';
import { GEMINI_MODELS } from './gemini.provider.js';
import { GROQ_MODELS } from './providers/groq.provider.js';
import { OPENROUTER_MODELS } from './providers/openrouter.provider.js';
import { NVIDIA_MODELS } from './providers/nvidia.provider.js';
import { GITHUB_MODELS } from './providers/github.provider.js';
import { OLLAMA_DEFAULT_MODELS } from './providers/ollama.provider.js';

export interface ProviderMetadata {
  id: string;
  name: string;
  description: string;
  freeTierInfo: string;
  websiteUrl: string;
  docsUrl: string;
  envVar: string;
  settingKey: string;
  requiresKey: boolean;
}

export const PROVIDER_CATALOG: ProviderMetadata[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Ultra-fast, massive 1M-2M token context, state of the art coding and reasoning.',
    freeTierInfo: '15 RPM, 1,500 requests/day free with Gemini 2.0/2.5 Flash.',
    websiteUrl: 'https://aistudio.google.com/',
    docsUrl: 'https://ai.google.dev/docs',
    envVar: 'GEMINI_API_KEY',
    settingKey: 'geminiApiKey',
    requiresKey: true,
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    description: 'LPUs offering real-time 500+ tokens/second inference for Llama 3.3 and Qwen.',
    freeTierInfo: '30 RPM, 14,400 requests/day completely free on Groq Cloud.',
    websiteUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
    envVar: 'GROQ_API_KEY',
    settingKey: 'groqApiKey',
    requiresKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Aggregator with 35+ free models including DeepSeek-R1, Llama 3.3, and Qwen.',
    freeTierInfo: '20 RPM, 200 free requests/day with :free model suffixes.',
    websiteUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    envVar: 'OPENROUTER_API_KEY',
    settingKey: 'openRouterApiKey',
    requiresKey: true,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    description: 'Accelerated enterprise models hosted on NVIDIA DGX Cloud.',
    freeTierInfo: '1,000 free API credits on signup at build.nvidia.com.',
    websiteUrl: 'https://build.nvidia.com/',
    docsUrl: 'https://docs.api.nvidia.com/',
    envVar: 'NVIDIA_API_KEY',
    settingKey: 'nvidiaApiKey',
    requiresKey: true,
  },
  {
    id: 'github',
    name: 'GitHub Models',
    description: 'Direct access to leading models using your GitHub Personal Access Token.',
    freeTierInfo: '15 RPM, 150 requests/day free for GitHub accounts.',
    websiteUrl: 'https://github.com/marketplace/models',
    docsUrl: 'https://docs.github.com/en/github-models',
    envVar: 'GITHUB_API_KEY',
    settingKey: 'githubApiKey',
    requiresKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Self-hosted, 100% private and offline LLMs running locally on your hardware.',
    freeTierInfo: 'Unlimited, runs locally on your machine with zero cloud dependencies.',
    websiteUrl: 'https://ollama.com/',
    docsUrl: 'https://github.com/ollama/ollama',
    envVar: 'OLLAMA_BASE_URL',
    settingKey: 'ollamaEnabled',
    requiresKey: false,
  },
];

export class ModelRegistry {
  private static instance: ModelRegistry;
  private models: Map<string, ModelInfo> = new Map();

  private constructor() {
    this.registerModels(GEMINI_MODELS);
    this.registerModels(GROQ_MODELS);
    this.registerModels(OPENROUTER_MODELS);
    this.registerModels(NVIDIA_MODELS);
    this.registerModels(GITHUB_MODELS);
    this.registerModels(OLLAMA_DEFAULT_MODELS);
  }

  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  registerModels(models: ModelInfo[]): void {
    for (const model of models) {
      this.models.set(model.id, model);
    }
  }

  getAllModels(): ModelInfo[] {
    return Array.from(this.models.values());
  }

  getModel(id: string): ModelInfo | undefined {
    return this.models.get(id);
  }

  getModelsByProvider(providerId: string): ModelInfo[] {
    return this.getAllModels().filter(m => m.provider === providerId);
  }

  getModelsByTask(task: TaskCategory): ModelInfo[] {
    return this.getAllModels().filter(m => m.recommendedFor.includes(task));
  }

  getProviders(): ProviderMetadata[] {
    return PROVIDER_CATALOG;
  }

  getProviderMeta(providerId: string): ProviderMetadata | undefined {
    return PROVIDER_CATALOG.find(p => p.id === providerId);
  }
}

export const modelRegistry = ModelRegistry.getInstance();
