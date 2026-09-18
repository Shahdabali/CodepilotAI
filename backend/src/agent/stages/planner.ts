import { TaskContext, ImplementationPlan } from '../context.js';
import { getAIRouter } from '../../ai/index.js';

export class ImplementationPlanner {
  async run(ctx: TaskContext): Promise<void> {
    ctx.emit({ type: 'PLANNING', taskId: ctx.taskId, data: { message: 'Creating implementation plan' } });
    
    const ai = getAIRouter();
    
    const prompt = `Command: ${ctx.command}
Project Context: ${JSON.stringify(ctx.analysis)}
Mode: ${ctx.mode}
Create a detailed implementation plan.`;

    const schema = {
      type: "object",
      properties: {
        steps: { type: "array", items: { type: "string" } },
        filesToCreate: { type: "array", items: { type: "string" } },
        filesToModify: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } }
      },
      required: ["steps", "filesToCreate", "filesToModify", "risks"]
    };

    const plan = await ai.structuredOutput<ImplementationPlan>(
      prompt,
      schema,
      {
        systemPrompt: "You are an expert technical lead planning an implementation."
      },
      'PLANNING'
    );

    ctx.plan = plan;
    ctx.emit({ type: 'PLANNING_COMPLETE', taskId: ctx.taskId, data: { plan } });
  }
}
