import { TaskContext } from '../context.js';
import { getAIRouter } from '../../ai/index.js';
import type { AgentMode } from '../../types/shared.js';

export class TaskAnalyzer {
  async run(ctx: TaskContext): Promise<void> {
    ctx.emit({ type: 'UNDERSTANDING', taskId: ctx.taskId, data: { message: 'Analyzing task command' } });
    
    // Fallback if no mode provided
    if (!ctx.mode) {
      const ai = getAIRouter();
      const analysis = await ai.structuredOutput<{ mode: AgentMode }>(
        `Determine the intent of this command: "${ctx.command}".`,
        { type: "object", properties: { mode: { type: "string", enum: ["BUILD", "FIX", "OPTIMIZE", "TEST", "REFACTOR"] } }, required: ["mode"] },
        undefined,
        'PLANNING'
      );
      ctx.mode = analysis.mode;
    }

    ctx.emit({ type: 'UNDERSTANDING_COMPLETE', taskId: ctx.taskId, data: { mode: ctx.mode } });
  }
}
