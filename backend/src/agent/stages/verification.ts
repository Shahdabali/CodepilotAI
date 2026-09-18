import { TaskContext } from '../context.js';
import { getAIRouter } from '../../ai/index.js';

export class VerificationEngine {
  async run(ctx: TaskContext): Promise<boolean> {
    ctx.emit({ type: 'VERIFYING', taskId: ctx.taskId, data: { message: 'Verifying task completion' } });
    
    const ai = getAIRouter();
    
    const prompt = `Original Command: ${ctx.command}
Files Changed: ${JSON.stringify(ctx.filesChanged)}
Test Results: ${JSON.stringify(ctx.testResults)}
Errors Encountered: ${JSON.stringify(ctx.errors)}

Did we successfully satisfy the original command? Return true or false.`;
    
    const schema = {
      type: "object",
      properties: {
        verified: { type: "boolean" },
        explanation: { type: "string" }
      },
      required: ["verified", "explanation"]
    };
    
    try {
      const result = await ai.structuredOutput<{ verified: boolean; explanation: string }>(
        prompt,
        schema,
        undefined,
        'CODE_REVIEW'
      );
      ctx.emit({ type: 'VERIFYING_COMPLETE', taskId: ctx.taskId, data: result });
      return result.verified;
    } catch (e) {
      return false;
    }
  }
}
