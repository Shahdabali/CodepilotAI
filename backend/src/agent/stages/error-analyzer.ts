import type { TaskContext } from '../context.js'
import { createAIProvider } from '../../ai/index.js'

export class ErrorAnalyzer {
  async run(ctx: TaskContext): Promise<void> {
    const results = ctx.testResults as Record<string, unknown> | null
    const passed = results?.passed === true
    const output = typeof results?.output === 'string' ? results.output : ''
    const hasError = typeof results?.error === 'string' ? results.error : ''

    if (passed && !hasError) {
      return
    }

    if (ctx.errors.length === 0 && !output.toLowerCase().includes('fail') && !hasError) {
      return
    }

    ctx.emit({
      type: 'DEBUGGING',
      taskId: ctx.taskId,
      data: { message: 'Analyzing errors and test failures' },
    })

    const ai = createAIProvider({
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    })

    const errorContext = [
      ctx.errors.length > 0 ? `Errors:\n${ctx.errors.join('\n')}` : '',
      output ? `Test output:\n${output}` : '',
      hasError ? `Error details:\n${hasError}` : '',
    ].filter(Boolean).join('\n\n')

    const analysis = await ai.analyze(
      `The following errors occurred during execution:\n${errorContext}\n\nCommand: ${ctx.command}`,
      'Root cause analysis'
    )

    ctx.emit({
      type: 'DEBUGGING_ANALYSIS',
      taskId: ctx.taskId,
      data: { analysis },
    })

    ctx.addError(analysis.summary)
  }
}
