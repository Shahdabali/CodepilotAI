import { TaskContext } from '../context.js';
import { getAIRouter } from '../../ai/index.js';
import { FileManager } from '../../workspace/file-manager.js';

export class FixGenerator {
  async run(ctx: TaskContext): Promise<void> {
    if (ctx.testResults?.passed) return;
    
    ctx.emit({ type: 'DEBUGGING_FIX', taskId: ctx.taskId, data: { message: 'Generating fixes' } });
    
    const ai = getAIRouter();
    const fileManager = new FileManager(ctx.project.path, ctx.taskId);
    
    for (const file of ctx.filesChanged) {
      if (!(await fileManager.fileExists(file))) continue;
      const content = await fileManager.readFile(file);
      
      const prompt = `File: ${file}
Errors: ${JSON.stringify(ctx.errors)}
Test Output: ${ctx.testResults?.output}
Current Content:
\`\`\`
${content}
\`\`\`
Fix the code. Return ONLY the fixed raw code without markdown wrappers.`;

      const response = await ai.generate(prompt, undefined, 'DEBUGGING');
      
      let cleanCode = response.trim();
      if (cleanCode.startsWith('```')) {
        const firstNewLine = cleanCode.indexOf('\n');
        cleanCode = cleanCode.substring(firstNewLine + 1);
        if (cleanCode.endsWith('```')) {
          cleanCode = cleanCode.substring(0, cleanCode.length - 3);
        }
      }
      
      await fileManager.writeFile(file, cleanCode.trim());
    }
    
    ctx.emit({ type: 'DEBUGGING_COMPLETE', taskId: ctx.taskId });
  }
}
