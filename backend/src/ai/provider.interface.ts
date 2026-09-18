export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AnalysisResult {
  summary: string;
  findings: string[];
  recommendations: string[];
}

export interface AIProvider {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string>;
  structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T>;
  analyze(content: string, task: string): Promise<AnalysisResult>;
}
