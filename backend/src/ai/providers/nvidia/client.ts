import { NvidiaApiError } from './errors.js';
import type { NvidiaRawModel } from './models.js';

export class NvidiaClient {
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey: string = '', baseURL: string = 'https://integrate.api.nvidia.com/v1') {
    this.apiKey = apiKey.trim();
    this.baseURL = baseURL.replace(/\/+$/, '');
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
  }

  setBaseURL(url: string): void {
    this.baseURL = url.replace(/\/+$/, '');
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async listModels(): Promise<NvidiaRawModel[]> {
    const url = `${this.baseURL}/models`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err: any) {
      throw new NvidiaApiError(
        `Failed to reach NVIDIA models endpoint at ${url}: ${err.message}`,
        0,
        { suggestedAction: 'Verify internet connectivity or check if your self-hosted NIM is running.' }
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw NvidiaApiError.parse(res.status, text);
    }

    const data = (await res.json()) as any;
    if (Array.isArray(data?.data)) {
      return data.data;
    }
    return [];
  }

  async createChatCompletion(payload: Record<string, any>): Promise<any> {
    const url = `${this.baseURL}/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      });
    } catch (err: any) {
      throw new NvidiaApiError(
        `Network error calling NVIDIA NIM at ${url}: ${err.message}`,
        0,
        { suggestedAction: 'Check your connection or verify that the NIM service is healthy.' }
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw NvidiaApiError.parse(res.status, text, payload.model);
    }

    return res.json();
  }

  async streamChatCompletion(payload: Record<string, any>): Promise<Response> {
    const url = `${this.baseURL}/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...payload, stream: true }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (err: any) {
      throw new NvidiaApiError(
        `Network error establishing stream to NVIDIA NIM at ${url}: ${err.message}`,
        0
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw NvidiaApiError.parse(res.status, text, payload.model);
    }

    return res;
  }
}
