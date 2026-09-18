import type {
  AIProvider,
  GenerateOptions,
  AnalysisResult,
  HealthStatus,
  ModelInfo
} from '../provider.interface.js'

export interface OpenAICompatibleConfig {
  id: string
  name: string
  baseURL: string
  apiKey: string
  defaultModel: string
  extraHeaders?: Record<string, string>
  models: ModelInfo[]
}

export abstract class OpenAICompatibleBase implements AIProvider {
  readonly id: string
  readonly name: string
  protected baseURL: string
  protected apiKey: string
  protected defaultModel: string
  protected extraHeaders: Record<string, string>
  protected models: ModelInfo[]

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id
    this.name = config.name
    this.baseURL = config.baseURL.replace(/\/+$/, '')
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel
    this.extraHeaders = config.extraHeaders || {}
    this.models = config.models
  }

  setApiKey(key: string) {
    this.apiKey = key
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0)
  }

  getModels(): ModelInfo[] {
    return this.models
  }

  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    return headers
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        providerName: this.name,
        status: 'unconfigured',
        message: 'No API key configured',
        modelsCount: this.models.length,
        lastChecked: new Date().toISOString(),
      }
    }

    const start = Date.now()
    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      })

      const latencyMs = Date.now() - start

      if (res.status === 401 || res.status === 403) {
        return {
          providerId: this.id,
          providerName: this.name,
          status: 'error',
          latencyMs,
          message: 'Invalid API Key or unauthorized',
          modelsCount: this.models.length,
          lastChecked: new Date().toISOString(),
        }
      }

      if (res.status === 429) {
        return {
          providerId: this.id,
          providerName: this.name,
          status: 'rate_limited',
          latencyMs,
          message: 'Rate limit reached',
          modelsCount: this.models.length,
          lastChecked: new Date().toISOString(),
        }
      }

      if (!res.ok) {
        return {
          providerId: this.id,
          providerName: this.name,
          status: 'degraded',
          latencyMs,
          message: `HTTP ${res.status}: ${res.statusText}`,
          modelsCount: this.models.length,
          lastChecked: new Date().toISOString(),
        }
      }

      return {
        providerId: this.id,
        providerName: this.name,
        status: 'available',
        latencyMs,
        modelsCount: this.models.length,
        lastChecked: new Date().toISOString(),
      }
    } catch (err: any) {
      return {
        providerId: this.id,
        providerName: this.name,
        status: 'error',
        latencyMs: Date.now() - start,
        message: err.message || 'Connection failed',
        modelsCount: this.models.length,
        lastChecked: new Date().toISOString(),
      }
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(`Provider ${this.name} is not configured with an API key`)
    }

    const messages: Array<{ role: string; content: string }> = []
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const payload: Record<string, any> = {
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.2,
    }

    if (options?.maxTokens) {
      payload.max_tokens = options.maxTokens
    }

    if (options?.jsonSchema) {
      payload.response_format = { type: 'json_object' }
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      if (res.status === 429) {
        throw new Error(`[RATE_LIMIT] ${this.name} rate limit reached: ${errText}`)
      }
      throw new Error(`[HTTP_${res.status}] ${this.name} API error: ${errText || res.statusText}`)
    }

    const json = await res.json() as any
    const content = json.choices?.[0]?.message?.content ?? ''
    return content.trim()
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string> {
    if (!this.isConfigured()) {
      throw new Error(`Provider ${this.name} is not configured with an API key`)
    }

    const messages: Array<{ role: string; content: string }> = []
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const payload: Record<string, any> = {
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.2,
      stream: true,
    }

    if (options?.maxTokens) {
      payload.max_tokens = options.maxTokens
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      if (res.status === 429) {
        throw new Error(`[RATE_LIMIT] ${this.name} rate limit reached: ${errText}`)
      }
      throw new Error(`[HTTP_${res.status}] ${this.name} stream error: ${errText || res.statusText}`)
    }

    const body = res.body
    if (!body) return

    const reader = body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          if (trimmed === 'data: [DONE]') return

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6)
            try {
              const data = JSON.parse(dataStr)
              const chunk = data.choices?.[0]?.delta?.content
              if (chunk) {
                yield chunk
              }
            } catch {
              // ignore partial json
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T> {
    const sysPrompt = (options?.systemPrompt || '') +
      `\nYou must respond with valid raw JSON adhering strictly to this JSON Schema:\n${JSON.stringify(schema)}\nDo not include any conversational text or markdown code fences.`

    const raw = await this.generate(prompt, {
      ...options,
      systemPrompt: sysPrompt,
      jsonSchema: schema,
    })

    let clean = raw.trim()
    if (clean.startsWith('```json')) clean = clean.substring(7)
    if (clean.startsWith('```')) clean = clean.substring(3)
    if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3)
    clean = clean.trim()

    try {
      return JSON.parse(clean) as T
    } catch {
      // Fallback: extract the first JSON block {...}
      const match = clean.match(/\{[\s\S]*\}/)
      if (match) {
        return JSON.parse(match[0]) as T
      }
      throw new Error(`Failed to parse structured JSON response from ${this.name}: ${clean.slice(0, 100)}...`)
    }
  }

  async analyze(content: string, task: string, options?: GenerateOptions): Promise<AnalysisResult> {
    const prompt = `Task: ${task}\n\nContent:\n${content}`
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'findings', 'recommendations'],
    }

    return this.structuredOutput<AnalysisResult>(prompt, schema, {
      ...options,
      systemPrompt: 'You are an expert software engineer and code analyst. Analyze the provided content.',
    })
  }

  async plan(prompt: string, options?: GenerateOptions): Promise<any> {
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['create', 'modify', 'delete', 'run', 'test', 'analyze'] },
              target: { type: 'string' },
            },
            required: ['order', 'description', 'type'],
          },
        },
        filesToCreate: { type: 'array', items: { type: 'string' } },
        filesToModify: { type: 'array', items: { type: 'string' } },
        filesToDelete: { type: 'array', items: { type: 'string' } },
        estimatedComplexity: { type: 'string', enum: ['low', 'medium', 'high'] },
        risks: { type: 'array', items: { type: 'string' } },
      },
      required: ['steps', 'filesToCreate', 'filesToModify', 'risks'],
    }

    return this.structuredOutput(prompt, schema, {
      ...options,
      systemPrompt: 'You are an expert technical lead creating a structured implementation plan.',
    })
  }
}
