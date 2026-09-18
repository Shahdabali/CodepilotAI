import { TaskContext } from '../context.js';
import { getAIRouter } from '../../ai/index.js';
import { FileManager } from '../../workspace/file-manager.js';

interface OptimizationSuggestion {
  file: string;
  suggestion: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class Optimizer {
  async run(ctx: TaskContext): Promise<void> {
    ctx.emit({ type: 'OPTIMIZING', taskId: ctx.taskId, data: { message: 'Analyzing code for optimizations' } });
    
    const ai = getAIRouter();
    const fileManager = new FileManager(ctx.project.path, ctx.taskId);
    
    const suggestions: OptimizationSuggestion[] = [];
    
    for (const file of ctx.filesChanged) {
      if (!(await fileManager.fileExists(file))) continue;
      const content = await fileManager.readFile(file);
      
      const prompt = `Analyze this code for optimizations (performance, quality, security):
\`\`\`
${content}
\`\`\`
File: ${file}`;
      
      const schema = {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                suggestion: { type: "string" },
                riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] }
              },
              required: ["file", "suggestion", "riskLevel"]
            }
          }
        },
        required: ["suggestions"]
      };

      try {
        const result = await ai.structuredOutput<{ suggestions: OptimizationSuggestion[] }>(
          prompt,
          schema,
          undefined,
          'OPTIMIZATION'
        );
        suggestions.push(...result.suggestions);
        
        // Auto-apply LOW risk optimizations
        const lowRisk = result.suggestions.filter(s => s.riskLevel === 'LOW');
        if (lowRisk.length > 0) {
          const fixPrompt = `Apply these optimizations to the code: ${JSON.stringify(lowRisk)}\n\nOriginal Code:\n\`\`\`\n${content}\n\`\`\`\nReturn ONLY the new raw code.`;
          const optimized = await ai.generate(fixPrompt, undefined, 'OPTIMIZATION');
          
          let cleanCode = optimized.trim();
          if (cleanCode.startsWith('```')) {
            const firstNewLine = cleanCode.indexOf('\n');
            cleanCode = cleanCode.substring(firstNewLine + 1);
            if (cleanCode.endsWith('```')) {
              cleanCode = cleanCode.substring(0, cleanCode.length - 3);
            }
          }
          await fileManager.writeFile(file, cleanCode.trim());
        }
      } catch (e) {
        // Skip on error
      }
    }
    
    ctx.emit({ type: 'OPTIMIZING_COMPLETE', taskId: ctx.taskId, data: { suggestions } });
  }
}
