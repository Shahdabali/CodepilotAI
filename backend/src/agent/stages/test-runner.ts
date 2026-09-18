import { TaskContext } from '../context.js';
import { Sandbox } from '../../workspace/sandbox.js';

export class TestRunner {
  async run(ctx: TaskContext): Promise<void> {
    ctx.emit({ type: 'TESTING', taskId: ctx.taskId, data: { message: 'Running tests' } });
    
    const sandbox = new Sandbox(ctx.project.path, 60000);
    
    let command = '';
    let args: string[] = [];
    
    if (ctx.analysis?.packageManager === 'npm') {
      command = 'npm';
      args = ['test'];
    } else if (ctx.analysis?.testFramework === 'pytest') {
      command = 'pytest';
      args = [];
    } else if (ctx.analysis?.language === 'go') {
      command = 'go';
      args = ['test', './...'];
    } else if (ctx.analysis?.language === 'rust') {
      command = 'cargo';
      args = ['test'];
    } else {
      ctx.testResults = { passed: true, output: 'No test framework detected, skipping.' };
      ctx.emit({ type: 'TESTING_COMPLETE', taskId: ctx.taskId, data: { result: ctx.testResults } });
      return;
    }
    
    try {
      const result = await sandbox.execute(command, args);
      ctx.testResults = {
        passed: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr
      };
    } catch (e: any) {
      ctx.testResults = {
        passed: false,
        output: '',
        error: e.message
      };
    }
    
    ctx.emit({ type: 'TESTING_COMPLETE', taskId: ctx.taskId, data: { result: ctx.testResults } });
  }
}
