import { TaskContext, ProjectAnalysis } from '../context.js';
import { FileManager } from '../../workspace/file-manager.js';

export class ContextAnalyzer {
  async run(ctx: TaskContext): Promise<void> {
    ctx.emit({ type: 'INSPECTING', taskId: ctx.taskId, data: { message: 'Analyzing project context' } });
    
    const fileManager = new FileManager(ctx.project.path, ctx.taskId);
    const analysis = await fileManager.getProjectAnalysis();
    
    ctx.analysis = analysis;
    ctx.emit({ 
      type: 'INSPECTING_COMPLETE', 
      taskId: ctx.taskId, 
      data: { 
        sourceFileCount: analysis.sourceFileCount, 
        testFileCount: analysis.testFileCount,
        language: analysis.language,
        framework: analysis.framework
      } 
    });
  }
}
