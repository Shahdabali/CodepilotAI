import { TaskContext } from './context.js';
import { TaskAnalyzer } from './stages/task-analyzer.js';
import { ContextAnalyzer } from './stages/context-analyzer.js';
import { ImplementationPlanner } from './stages/planner.js';
import { CodeGenerator } from './stages/code-generator.js';
import { ExecutionEngine } from './stages/execution-engine.js';
import { TestRunner } from './stages/test-runner.js';
import { ErrorAnalyzer } from './stages/error-analyzer.js';
import { FixGenerator } from './stages/fix-generator.js';
import { Optimizer } from './stages/optimizer.js';
import { VerificationEngine } from './stages/verification.js';

export class AgentPipeline {
  private taskAnalyzer = new TaskAnalyzer();
  private contextAnalyzer = new ContextAnalyzer();
  private planner = new ImplementationPlanner();
  private codeGenerator = new CodeGenerator();
  private executionEngine = new ExecutionEngine();
  private testRunner = new TestRunner();
  private errorAnalyzer = new ErrorAnalyzer();
  private fixGenerator = new FixGenerator();
  private optimizer = new Optimizer();
  private verificationEngine = new VerificationEngine();

  async run(context: TaskContext): Promise<void> {
    try {
      context.emit({ type: 'STARTED', taskId: context.taskId });

      await this.taskAnalyzer.run(context);
      await this.contextAnalyzer.run(context);
      await this.planner.run(context);
      await this.codeGenerator.run(context);

      let testsPassed = false;
      while (context.shouldContinue() && !testsPassed) {
        await this.executionEngine.run(context);
        await this.testRunner.run(context);

        if (context.testResults?.passed) {
          testsPassed = true;
        } else {
          context.incrementIteration();
          if (context.shouldContinue()) {
            await this.errorAnalyzer.run(context);
            await this.fixGenerator.run(context);
          }
        }
      }

      if (context.mode === 'OPTIMIZE' || context.command.toLowerCase().includes('optimize')) {
        await this.optimizer.run(context);
      }

      const verified = await this.verificationEngine.run(context);
      if (verified && testsPassed) {
        context.emit({ type: 'COMPLETED', taskId: context.taskId, data: { status: 'SUCCESS' } });
      } else {
        context.emit({ type: 'COMPLETED', taskId: context.taskId, data: { status: 'FAILED_VERIFICATION' } });
      }

    } catch (error: any) {
      context.addError(error.message);
      context.emit({ type: 'ERROR', taskId: context.taskId, data: { error: error.message } });
      context.emit({ type: 'COMPLETED', taskId: context.taskId, data: { status: 'FAILED' } });
    }
  }
}
