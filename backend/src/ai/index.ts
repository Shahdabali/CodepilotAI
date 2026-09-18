import { GeminiProvider } from './gemini.provider.js';
import type { AIProvider } from './provider.interface.js';
import { aiRouter, getAIRouter, AIRouter } from './router.js';

export function createAIProvider(config?: { apiKey?: string; model?: string }): AIProvider {
  if (config?.apiKey) {
    return new GeminiProvider(config.apiKey, config.model);
  }
  return aiRouter as unknown as AIProvider;
}

export * from './provider.interface.js';
export * from './gemini.provider.js';
export * from './providers/groq.provider.js';
export * from './providers/openrouter.provider.js';
export * from './providers/nvidia.provider.js';
export * from './providers/github.provider.js';
export * from './providers/ollama.provider.js';
export * from './providers/openai-compatible.base.js';
export * from './registry.js';
export * from './context-manager.js';
export * from './router.js';
