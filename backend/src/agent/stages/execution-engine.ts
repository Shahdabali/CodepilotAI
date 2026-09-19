import { TaskContext } from '../context.js';
import { Sandbox } from '../../workspace/sandbox.js';

export class ExecutionEngine {
  async run(ctx: TaskContext): Promise<void> {
    ctx.emit({ type: 'RUNNING', taskId: ctx.taskId, data: { message: 'Executing commands' } });
    
    const sandbox = new Sandbox(ctx.project.path, 60000);
    
    let command = '';
    let args: string[] = [];
    
    if (ctx.analysis?.packageManager === 'npm') {
      command = 'npm';
      args = ['run', 'build']; // default try build
    } else if (ctx.analysis?.language === 'python') {
      command = 'python';
      args = ['-m', 'compileall', '.'];
    } else {
      ctx.emit({ type: 'RUNNING_COMPLETE', taskId: ctx.taskId, data: { message: 'Skipped execution' } });
      return;
    }
    
    const fullCommand = `${command} ${args.join(' ')}`.trim();
    if (sandbox.requiresApproval(fullCommand) && !(await ctx.confirm('dangerous_command', `Run: ${fullCommand}`, { command: fullCommand }))) {
      ctx.emit({ type: 'RUNNING_COMPLETE', taskId: ctx.taskId, data: { message: 'Skipped execution (not approved)' } });
      return;
    }

    try {
      const result = await sandbox.execute(command, args);
      ctx.emit({ type: 'RUNNING_COMPLETE', taskId: ctx.taskId, data: { result } });
    } catch (e: any) {
      ctx.emit({ type: 'RUNNING_ERROR', taskId: ctx.taskId, data: { error: e.message } });
    }
  }
}
