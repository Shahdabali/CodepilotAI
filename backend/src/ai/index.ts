import { GeminiProvider } from './gemini.provider.js';
import { AIProvider } from './provider.interface.js';

export function createAIProvider(config: { apiKey: string; model: string }): AIProvider {
  return new GeminiProvider(config.apiKey, config.model);
}

export * from './provider.interface.js';
export * from './gemini.provider.js';
