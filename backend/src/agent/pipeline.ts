import { TaskContext, TaskCancelledError } from './context.js';
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
import { ReadOnlyResponder, READ_ONLY_MODES } from './stages/answerer.js';

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
  private responder = new ReadOnlyResponder();

  async run(context: TaskContext): Promise<void> {
    try {
      context.emit({ type: 'STARTED', taskId: context.taskId });

      // Explain / review requests answer from the code; they never write files or run builds.
      if (READ_ONLY_MODES.has(context.mode)) {
        const answer = await this.responder.run(context);
        context.emit({ type: 'COMPLETED', taskId: context.taskId, data: { status: 'SUCCESS', summary: answer, answer: true } });
        return;
      }

      await this.taskAnalyzer.run(context);
      context.assertActive();
      await this.contextAnalyzer.run(context);
      context.assertActive();
      await this.planner.run(context);
      context.assertActive();
      await this.codeGenerator.run(context);

      let testsPassed = false;
      while (context.shouldContinue() && !testsPassed) {
        context.assertActive();
        await this.executionEngine.run(context);
        context.assertActive();
        await this.testRunner.run(context);
        context.assertActive();

        if (context.testResults?.passed) {
          testsPassed = true;
        } else {
          context.incrementIteration();
          if (context.shouldContinue()) {
            await this.errorAnalyzer.run(context);
            context.assertActive();
            await this.fixGenerator.run(context);
          }
        }
      }
      context.assertActive();

      if (context.mode === 'OPTIMIZE' || context.command.toLowerCase().includes('optimize')) {
        await this.optimizer.run(context);
        context.assertActive();
      }

      const verified = await this.verificationEngine.run(context);
      context.assertActive();
      if (verified && testsPassed) {
        context.emit({ type: 'COMPLETED', taskId: context.taskId, data: { status: 'SUCCESS' } });
      } else {
        context.emit({ type: 'COMPLETED', taskId: context.taskId, data: { status: 'FAILED_VERIFICATION' } });
      }

    } catch (error: any) {
      if (error instanceof TaskCancelledError || context.isCancelled) {
        context.emit({ type: 'CANCELLED', taskId: context.taskId, message: 'Task cancelled' });
        return;
      }
      context.addError(error.message);
      context.emit({ type: 'ERROR', taskId: context.taskId, data: { error: error.message } });
      context.emit({ type: 'COMPLETED', taskId: context.taskId, data: { status: 'FAILED' } });
    }
  }
}
