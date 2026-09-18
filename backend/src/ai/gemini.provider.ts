import { GoogleGenAI } from '@google/genai';
import { AIProvider, GenerateOptions, AnalysisResult } from './provider.interface.js';

export class GeminiProvider implements AIProvider {
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens,
          systemInstruction: options?.systemPrompt,
        }
      });
      return response.text || '';
    } catch (error: any) {
      throw new Error(`Gemini generate error: ${error.message}`);
    }
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string> {
    try {
      const responseStream = await this.ai.models.generateContentStream({
        model: this.model,
        contents: prompt,
        config: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens,
          systemInstruction: options?.systemPrompt,
        }
      });
      
      for await (const chunk of responseStream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (error: any) {
      throw new Error(`Gemini stream error: ${error.message}`);
    }
  }

  async structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T> {
    try {
      const sysPrompt = (options?.systemPrompt || '') + '\nRespond with JSON that matches this schema: ' + JSON.stringify(schema);
      const response = await this.generate(prompt, { ...options, systemPrompt: sysPrompt });
      
      let cleanText = response.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.substring(7);
      }
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.substring(3);
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.substring(0, cleanText.length - 3);
      }
      
      return JSON.parse(cleanText.trim()) as T;
    } catch (error: any) {
      throw new Error(`Gemini structuredOutput error: ${error.message}`);
    }
  }

  async analyze(content: string, task: string): Promise<AnalysisResult> {
    const prompt = `Task: ${task}\n\nContent:\n${content}`;
    const schema = {
      type: "object",
      properties: {
        summary: { type: "string" },
        findings: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } }
      },
      required: ["summary", "findings", "recommendations"]
    };
    return this.structuredOutput<AnalysisResult>(prompt, schema, {
      systemPrompt: "You are an expert code analyst. Analyze the provided content and task."
    });
  }
}
