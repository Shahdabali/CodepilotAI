import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? '.codepilot.db',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
  maxIterations: parseInt(process.env.MAX_ITERATIONS ?? '10', 10),
  defaultAutonomyLevel: (process.env.DEFAULT_AUTONOMY_LEVEL ?? 'BALANCED') as AutonomyLevel,
  executionTimeout: parseInt(process.env.EXECUTION_TIMEOUT ?? '60000', 10),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE ?? '5242880', 10), // 5MB
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
} as const

export type AutonomyLevel = 'SAFE' | 'BALANCED' | 'AUTONOMOUS'

export type AgentMode =
  | 'BUILD'
  | 'FIX'
  | 'OPTIMIZE'
  | 'EXPLAIN'
  | 'TEST'
  | 'REFACTOR'
  | 'REVIEW'
  | 'MIGRATE'
  | 'AUTONOMOUS'

// Commands that require explicit user approval before execution
export const DANGEROUS_COMMANDS = [
  'rm -rf',
  'rmdir /s',
  'del /f',
  'format',
  'DROP TABLE',
  'DROP DATABASE',
  'DROP SCHEMA',
  'TRUNCATE',
  'git push --force',
  'git reset --hard',
  'sudo',
  'chmod 777',
  ':(){:|:&};:',
  'dd if=',
  'mkfs',
  'fdisk',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
]

// Commands that are never allowed, ever
export const BLOCKED_COMMANDS = [
  'curl.*passwd',
  'wget.*passwd',
  'cat /etc/shadow',
  'cat /etc/passwd',
]

// Allowed commands in the execution sandbox
export const ALLOWED_COMMAND_PREFIXES = [
  'node',
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'python',
  'python3',
  'pip',
  'pip3',
  'tsc',
  'tsx',
  'ts-node',
  'jest',
  'vitest',
  'mocha',
  'cargo',
  'rustc',
  'go',
  'java',
  'javac',
  'mvn',
  'gradle',
  'make',
  'cmake',
  'gcc',
  'g++',
  'clang',
  'git status',
  'git diff',
  'git log',
  'git branch',
  'git show',
  'git add',
  'git commit',
  'git stash',
  'git checkout',
  'git merge',
  'ls',
  'dir',
  'pwd',
  'cat',
  'type',
  'echo',
  'find',
  'grep',
  'rg',
  'head',
  'tail',
  'wc',
  'diff',
  'which',
  'where',
]
