import { spawn } from 'child_process';
import { ALLOWED_COMMAND_PREFIXES, BLOCKED_COMMANDS, DANGEROUS_COMMANDS } from '../config.js';

export interface ExecutionResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
}

export class Sandbox {
  private workingDir: string;
  private timeout: number;

  constructor(workingDir: string, timeout: number = 60000) {
    this.workingDir = workingDir;
    this.timeout = timeout;
  }

  requiresApproval(command: string): boolean {
    return DANGEROUS_COMMANDS.some(cmd => command.startsWith(cmd) || command.includes(` ${cmd}`));
  }

  async execute(command: string, args: string[]): Promise<ExecutionResult> {
    const fullCmd = `${command} ${args.join(' ')}`.trim();
    
    if (BLOCKED_COMMANDS.some(cmd => fullCmd.includes(cmd))) {
      throw new Error(`Command blocked: ${fullCmd}`);
    }
    
    const allowed = ALLOWED_COMMAND_PREFIXES.some(prefix => fullCmd.startsWith(prefix));
    if (!allowed && ALLOWED_COMMAND_PREFIXES.length > 0) {
      // If we enforce prefixes strictly, uncomment throw
      // throw new Error(`Command not allowed: ${fullCmd}`);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(command, args, {
        cwd: this.workingDir,
        shell: true
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, this.timeout);

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          command: fullCmd,
          exitCode: code,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          timedOut
        });
      });
      
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
