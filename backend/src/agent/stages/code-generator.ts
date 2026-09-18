import { TaskContext } from '../context.js';
import { FileManager } from '../../workspace/file-manager.js';
import { createAIProvider } from '../../ai/index.js';

export class CodeGenerator {
  async run(ctx: TaskContext): Promise<void> {
    if (!ctx.plan) return;
    
    ctx.emit({ type: 'IMPLEMENTING', taskId: ctx.taskId, data: { message: 'Generating code' } });
    const fileManager = new FileManager(ctx.project.path, ctx.taskId);
    const ai = createAIProvider({ apiKey: process.env.GEMINI_API_KEY || '', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
    
    const allFiles = [...(ctx.plan.filesToCreate || []), ...(ctx.plan.filesToModify || [])];
    
    for (const filePath of allFiles) {
      ctx.emit({ type: 'IMPLEMENTING_FILE', taskId: ctx.taskId, data: { file: filePath } });
      
      let existingContent = '';
      if (await fileManager.fileExists(filePath)) {
        existingContent = await fileManager.readFile(filePath);
      }
      
      const prompt = `Task: ${ctx.command}
File: ${filePath}
Plan: ${JSON.stringify(ctx.plan.steps)}
Existing Content:
\`\`\`
${existingContent}
\`\`\`
Write the complete updated content for this file. Return ONLY the code.`;

      const response = await ai.generate(prompt, { systemPrompt: "You are an expert software engineer. Output ONLY valid raw code without markdown wrappers, unless it is a markdown file." });
      
      let cleanCode = response.trim();
      if (cleanCode.startsWith('\`\`\`')) {
        const firstNewLine = cleanCode.indexOf('\n');
        cleanCode = cleanCode.substring(firstNewLine + 1);
        if (cleanCode.endsWith('\`\`\`')) {
          cleanCode = cleanCode.substring(0, cleanCode.length - 3);
        }
      }
      
      await fileManager.writeFile(filePath, cleanCode.trim());
      ctx.addFileChanged(filePath);
    }
    
    ctx.emit({ type: 'IMPLEMENTING_COMPLETE', taskId: ctx.taskId });
  }
}
