import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import type { ProjectAnalysis, GitStatus } from '../types/shared.js';
import * as queries from '../db/queries.js';
import { GitService } from '../git/git-service.js';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  size?: number;
  extension?: string;
}

export interface PathValidationResult {
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
  error?: string;
  absolutePath: string;
  name: string;
}

export class FileManager {
  private projectPath: string;
  private taskId: string;

  constructor(projectPath: string, taskId: string = 'system') {
    this.projectPath = path.resolve(projectPath);
    this.taskId = taskId;
  }

  getProjectPath(): string {
    return this.projectPath;
  }

  resolveProjectPath(relativePath: string): string {
    const resolved = path.resolve(this.projectPath, relativePath);
    // Allow root directory lookup itself
    if (resolved !== this.projectPath && !resolved.startsWith(this.projectPath + path.sep)) {
      throw new Error('Path traversal detected: ' + relativePath);
    }
    return resolved;
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolveProjectPath(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async readFile(filePath: string): Promise<string> {
    const resolved = this.resolveProjectPath(filePath);
    return await fs.readFile(resolved, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = this.resolveProjectPath(filePath);

    let contentBefore: string | null = null;
    if (await this.fileExists(filePath)) {
      contentBefore = await fs.readFile(resolved, 'utf-8');
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');

    // Save snapshot in database if task id is set
    if (this.taskId && this.taskId !== 'system') {
      try {
        await queries.saveFileSnapshot({
          taskId: this.taskId,
          filePath: filePath,
          contentBefore,
          contentAfter: content,
        });
      } catch (err) {
        console.warn(`[FileManager] Could not save snapshot for ${filePath}:`, err);
      }
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const resolved = this.resolveProjectPath(filePath);
    if (await this.fileExists(filePath)) {
      const contentBefore = await fs.readFile(resolved, 'utf-8');
      await fs.unlink(resolved);

      if (this.taskId && this.taskId !== 'system') {
        try {
          await queries.saveFileSnapshot({
            taskId: this.taskId,
            filePath: filePath,
            contentBefore,
            contentAfter: null,
          });
        } catch (err) {
          console.warn(`[FileManager] Could not save snapshot for delete ${filePath}:`, err);
        }
      }
    }
  }

  async listFiles(dir: string = '.', maxDepth = 10, currentDepth = 0): Promise<FileNode[]> {
    if (currentDepth > maxDepth) return [];
    const resolved = this.resolveProjectPath(dir);
    
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(resolved, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes: FileNode[] = [];
    const skipNames = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '.nuxt',
      '__pycache__',
      '.pytest_cache',
      'target',
      '.venv',
      'venv',
      '.turbo',
      'coverage',
      '.DS_Store',
    ]);

    // Sort: directories first, then alphabetical
    const sorted = [...entries].sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of sorted) {
      if (skipNames.has(item.name)) continue;

      const relativeItemPath = dir === '.' ? item.name : path.join(dir, item.name).replace(/\\/g, '/');

      if (item.isDirectory()) {
        const children = await this.listFiles(relativeItemPath, maxDepth, currentDepth + 1);
        nodes.push({
          name: item.name,
          path: relativeItemPath,
          type: 'directory',
          children,
        });
      } else {
        let size: number | undefined;
        try {
          const stats = await fs.stat(path.resolve(this.projectPath, relativeItemPath));
          size = stats.size;
        } catch {}

        nodes.push({
          name: item.name,
          path: relativeItemPath,
          type: 'file',
          size,
          extension: path.extname(item.name).slice(1).toLowerCase(),
        });
      }
    }

    return nodes;
  }

  async readFileTree(dir: string = '.'): Promise<FileNode[]> {
    return this.listFiles(dir);
  }

  /**
   * Fast flat search by filename or relative path
   */
  async searchFiles(query: string, limit = 50): Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>> {
    const q = query.toLowerCase().trim();
    const results: Array<{ name: string; path: string; type: 'file' | 'directory' }> = [];
    const tree = await this.listFiles();

    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (results.length >= limit) return;
        if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
          results.push({ name: node.name, path: node.path, type: node.type });
        }
        if (node.children) {
          walk(node.children);
        }
      }
    };

    walk(tree);
    return results;
  }

  /**
   * Deep multi-stack analysis: detects 15+ languages/frameworks, git state, entry points, configs
   */
  async getProjectAnalysis(): Promise<ProjectAnalysis> {
    const analysis: ProjectAnalysis = {
      language: 'unknown',
      framework: null,
      packageManager: null,
      testFramework: null,
      buildTool: null,
      fileCount: 0,
      sourceFileCount: 0,
      testFileCount: 0,
      dependencies: [],
      devDependencies: [],
      hasTypeScript: false,
      hasTailwind: false,
      hasDocker: false,
      hasGit: false,
      entryPoint: null,
      scripts: {},
      description: null,
      gitStatus: null,
      configFiles: [],
    };

    const configCandidates = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'vite.config.js',
      'next.config.js',
      'next.config.mjs',
      'next.config.ts',
      'nuxt.config.ts',
      'tailwind.config.js',
      'tailwind.config.ts',
      'docker-compose.yml',
      'Dockerfile',
      'pyproject.toml',
      'requirements.txt',
      'Pipfile',
      'Cargo.toml',
      'go.mod',
      'pom.xml',
      'build.gradle',
      'Makefile',
      'CMakeLists.txt',
      '.env.example',
    ];

    for (const cfg of configCandidates) {
      if (await this.fileExists(cfg)) {
        analysis.configFiles!.push(cfg);
      }
    }

    // 1. JavaScript / TypeScript ecosystems
    if (await this.fileExists('package.json')) {
      try {
        const rawPkg = await this.readFile('package.json');
        const pkg = JSON.parse(rawPkg);

        analysis.description = pkg.description || null;
        analysis.scripts = pkg.scripts || {};

        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        analysis.dependencies = Object.keys(pkg.dependencies || {});
        analysis.devDependencies = Object.keys(pkg.devDependencies || {});

        // Package Manager detection
        if (await this.fileExists('pnpm-lock.yaml')) {
          analysis.packageManager = 'pnpm';
        } else if (await this.fileExists('yarn.lock')) {
          analysis.packageManager = 'yarn';
        } else if (await this.fileExists('bun.lockb') || await this.fileExists('bun.lock')) {
          analysis.packageManager = 'bun';
        } else {
          analysis.packageManager = 'npm';
        }

        // Language & TypeScript
        if (allDeps['typescript'] || await this.fileExists('tsconfig.json')) {
          analysis.language = 'typescript';
          analysis.hasTypeScript = true;
        } else {
          analysis.language = 'javascript';
        }

        // Frameworks
        const detectedFrameworks: string[] = [];
        if (allDeps['next']) detectedFrameworks.push('Next.js');
        if (allDeps['react'] && !allDeps['next']) detectedFrameworks.push('React');
        if (allDeps['nuxt']) detectedFrameworks.push('Nuxt');
        if (allDeps['vue'] && !allDeps['nuxt']) detectedFrameworks.push('Vue');
        if (allDeps['@sveltejs/kit']) detectedFrameworks.push('SvelteKit');
        else if (allDeps['svelte']) detectedFrameworks.push('Svelte');
        if (allDeps['@angular/core']) detectedFrameworks.push('Angular');
        if (allDeps['@remix-run/react']) detectedFrameworks.push('Remix');
        if (allDeps['astro']) detectedFrameworks.push('Astro');
        if (allDeps['electron']) detectedFrameworks.push('Electron');
        if (allDeps['express']) detectedFrameworks.push('Express');
        if (allDeps['fastify']) detectedFrameworks.push('Fastify');
        if (allDeps['@nestjs/core']) detectedFrameworks.push('NestJS');
        if (allDeps['hono']) detectedFrameworks.push('Hono');

        if (detectedFrameworks.length > 0) {
          analysis.framework = detectedFrameworks.join(' + ');
        }

        // Build tool
        if (allDeps['vite'] || await this.fileExists('vite.config.ts') || await this.fileExists('vite.config.js')) {
          analysis.buildTool = 'vite';
        } else if (allDeps['webpack']) {
          analysis.buildTool = 'webpack';
        } else if (allDeps['turbo']) {
          analysis.buildTool = 'turborepo';
        }

        // Styling
        if (allDeps['tailwindcss'] || await this.fileExists('tailwind.config.js') || await this.fileExists('tailwind.config.ts')) {
          analysis.hasTailwind = true;
        }

        // Test Framework
        if (allDeps['vitest']) {
          analysis.testFramework = 'vitest';
        } else if (allDeps['jest']) {
          analysis.testFramework = 'jest';
        } else if (allDeps['mocha']) {
          analysis.testFramework = 'mocha';
        } else if (allDeps['@playwright/test']) {
          analysis.testFramework = 'playwright';
        } else if (allDeps['cypress']) {
          analysis.testFramework = 'cypress';
        }
      } catch (err) {
        console.warn('[FileManager] Failed to parse package.json:', err);
      }
    }

    // 2. Python ecosystem
    if (
      await this.fileExists('pyproject.toml') ||
      await this.fileExists('requirements.txt') ||
      await this.fileExists('Pipfile') ||
      await this.fileExists('setup.py') ||
      await this.fileExists('main.py') ||
      await this.fileExists('app.py')
    ) {
      if (analysis.language === 'unknown') {
        analysis.language = 'python';
      }

      if (await this.fileExists('poetry.lock')) {
        analysis.packageManager = 'poetry';
      } else if (await this.fileExists('Pipfile')) {
        analysis.packageManager = 'pipenv';
      } else if (await this.fileExists('uv.lock')) {
        analysis.packageManager = 'uv';
      } else if (!analysis.packageManager) {
        analysis.packageManager = 'pip';
      }

      let reqContent = '';
      if (await this.fileExists('requirements.txt')) {
        try { reqContent += await this.readFile('requirements.txt'); } catch {}
      }
      if (await this.fileExists('pyproject.toml')) {
        try { reqContent += await this.readFile('pyproject.toml'); } catch {}
      }

      const reqLower = reqContent.toLowerCase();
      const pythonFrameworks: string[] = [];
      if (await this.fileExists('manage.py') || reqLower.includes('django')) pythonFrameworks.push('Django');
      if (reqLower.includes('fastapi')) pythonFrameworks.push('FastAPI');
      if (reqLower.includes('flask')) pythonFrameworks.push('Flask');
      if (reqLower.includes('streamlit')) pythonFrameworks.push('Streamlit');
      if (reqLower.includes('torch')) pythonFrameworks.push('PyTorch');

      if (pythonFrameworks.length > 0 && !analysis.framework) {
        analysis.framework = pythonFrameworks.join(' + ');
      }

      if (await this.fileExists('pytest.ini') || reqLower.includes('pytest')) {
        analysis.testFramework = 'pytest';
      }
    }

    // 3. Rust ecosystem
    if (await this.fileExists('Cargo.toml')) {
      analysis.language = 'rust';
      analysis.packageManager = 'cargo';
      analysis.testFramework = 'cargo test';
      analysis.buildTool = 'cargo';

      try {
        const cargoContent = (await this.readFile('Cargo.toml')).toLowerCase();
        const rustFrameworks: string[] = [];
        if (cargoContent.includes('axum')) rustFrameworks.push('Axum');
        if (cargoContent.includes('actix-web')) rustFrameworks.push('Actix');
        if (cargoContent.includes('rocket')) rustFrameworks.push('Rocket');
        if (cargoContent.includes('tokio')) rustFrameworks.push('Tokio');
        if (rustFrameworks.length > 0) {
          analysis.framework = rustFrameworks.join(' + ');
        }
      } catch {}
    }

    // 4. Go ecosystem
    if (await this.fileExists('go.mod')) {
      analysis.language = 'go';
      analysis.packageManager = 'go mod';
      analysis.testFramework = 'go test';
      analysis.buildTool = 'go build';

      try {
        const goMod = (await this.readFile('go.mod')).toLowerCase();
        const goFrameworks: string[] = [];
        if (goMod.includes('github.com/gin-gonic/gin')) goFrameworks.push('Gin');
        if (goMod.includes('github.com/gofiber/fiber')) goFrameworks.push('Fiber');
        if (goMod.includes('github.com/labstack/echo')) goFrameworks.push('Echo');
        if (goMod.includes('github.com/go-chi/chi')) goFrameworks.push('Chi');
        if (goFrameworks.length > 0) {
          analysis.framework = goFrameworks.join(' + ');
        }
      } catch {}
    }

    // 5. Java / Kotlin ecosystem
    if (await this.fileExists('pom.xml')) {
      if (analysis.language === 'unknown') analysis.language = 'java';
      analysis.packageManager = 'maven';
      analysis.buildTool = 'maven';
      try {
        const pom = (await this.readFile('pom.xml')).toLowerCase();
        if (pom.includes('spring-boot')) analysis.framework = 'Spring Boot';
        if (pom.includes('junit')) analysis.testFramework = 'junit';
      } catch {}
    } else if (await this.fileExists('build.gradle') || await this.fileExists('build.gradle.kts')) {
      if (analysis.language === 'unknown') {
        analysis.language = (await this.fileExists('build.gradle.kts')) ? 'kotlin' : 'java';
      }
      analysis.packageManager = 'gradle';
      analysis.buildTool = 'gradle';
      try {
        const gradle = (await this.readFile(await this.fileExists('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle')).toLowerCase();
        if (gradle.includes('spring-boot')) analysis.framework = 'Spring Boot';
      } catch {}
    }

    // 6. C / C++ ecosystem
    if (await this.fileExists('CMakeLists.txt')) {
      if (analysis.language === 'unknown') analysis.language = 'c++';
      analysis.buildTool = 'cmake';
    } else if (await this.fileExists('Makefile') && analysis.language === 'unknown') {
      analysis.buildTool = 'make';
    }

    // 7. Docker
    if (await this.fileExists('Dockerfile') || await this.fileExists('docker-compose.yml')) {
      analysis.hasDocker = true;
    }

    // 8. Entry point detection
    const entryPointCandidates = [
      'src/main.tsx',
      'src/main.ts',
      'src/index.tsx',
      'src/index.ts',
      'src/App.tsx',
      'src/App.vue',
      'src/index.js',
      'src/main.js',
      'pages/index.tsx',
      'app/page.tsx',
      'app/layout.tsx',
      'main.py',
      'app.py',
      'src/main.rs',
      'main.go',
      'cmd/main.go',
      'src/Main.java',
    ];

    for (const ep of entryPointCandidates) {
      if (await this.fileExists(ep)) {
        analysis.entryPoint = ep;
        break;
      }
    }

    // 9. Git inspection
    const gitService = new GitService(this.projectPath);
    if (await gitService.isRepo()) {
      analysis.hasGit = true;
      try {
        const rawStatus = await gitService.getStatus();
        analysis.gitStatus = {
          isRepo: true,
          branch: rawStatus.branch,
          staged: rawStatus.staged,
          unstaged: rawStatus.unstaged,
          untracked: rawStatus.untracked,
          ahead: rawStatus.ahead,
          behind: rawStatus.behind,
        };
      } catch (err) {
        console.warn('[FileManager] Failed to fetch git status:', err);
      }
    }

    // 10. Accurate File & Code Counters & Monorepo detection
    const tree = await this.listFiles('.', 12);
    let hasTs = false;
    let hasJs = false;
    let hasPy = false;
    let hasRs = false;
    let hasGo = false;
    let hasReactFile = false;

    const countFiles = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          analysis.fileCount = (analysis.fileCount || 0) + 1;
          const isTest =
            node.name.includes('.test.') ||
            node.name.includes('.spec.') ||
            node.name.startsWith('test_') ||
            node.path.includes('/__tests__/') ||
            node.path.includes('/tests/');

          if (isTest) {
            analysis.testFileCount++;
          } else if (node.name.match(/\.(ts|tsx|js|jsx|py|rs|go|java|kt|c|cpp|h|hpp|vue|svelte|php|rb|cs)$/i)) {
            analysis.sourceFileCount = (analysis.sourceFileCount || 0) + 1;
          }

          if (node.name.endsWith('.ts') || node.name.endsWith('.tsx') || node.name.endsWith('tsconfig.json')) {
            hasTs = true;
          }
          if (node.name.endsWith('.js') || node.name.endsWith('.jsx')) {
            hasJs = true;
          }
          if (node.name.endsWith('.tsx') || node.name.endsWith('.jsx')) {
            hasReactFile = true;
          }
          if (node.name.endsWith('.py')) hasPy = true;
          if (node.name.endsWith('.rs')) hasRs = true;
          if (node.name.endsWith('.go')) hasGo = true;

          if (node.name.includes('vite.config.') && !analysis.buildTool) {
            analysis.buildTool = 'vite';
          }
          if (node.name.includes('tailwind.config.')) {
            analysis.hasTailwind = true;
          }
        } else if (node.children) {
          countFiles(node.children);
        }
      }
    };
    countFiles(tree);

    // If TypeScript files exist, elevate to TypeScript
    if (hasTs) {
      analysis.language = 'typescript';
      analysis.hasTypeScript = true;
    } else if (analysis.language === 'unknown') {
      if (hasJs) analysis.language = 'javascript';
      else if (hasPy) analysis.language = 'python';
      else if (hasRs) analysis.language = 'rust';
      else if (hasGo) analysis.language = 'go';
    }

    if (hasReactFile && !analysis.framework) {
      analysis.framework = 'React';
    }

    return analysis;
  }

  /**
   * Static path validation helper
   */
  static async validatePath(targetPath: string): Promise<PathValidationResult> {
    const trimmed = (targetPath || '').trim();
    if (!trimmed) {
      return {
        valid: false,
        exists: false,
        isDirectory: false,
        error: 'Path cannot be empty',
        absolutePath: '',
        name: '',
      };
    }

    const absPath = path.resolve(trimmed);
    try {
      const stats = await fs.stat(absPath);
      if (!stats.isDirectory()) {
        return {
          valid: false,
          exists: true,
          isDirectory: false,
          error: 'The path points to a file, not a directory',
          absolutePath: absPath,
          name: path.basename(absPath),
        };
      }

      // Check read permissions
      await fs.access(absPath, fsSync.constants.R_OK);

      return {
        valid: true,
        exists: true,
        isDirectory: true,
        absolutePath: absPath,
        name: path.basename(absPath) || absPath,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return {
          valid: false,
          exists: false,
          isDirectory: false,
          error: 'Directory does not exist on disk',
          absolutePath: absPath,
          name: path.basename(absPath),
        };
      }
      return {
        valid: false,
        exists: false,
        isDirectory: false,
        error: err.message || 'Cannot access directory',
        absolutePath: absPath,
        name: path.basename(absPath),
      };
    }
  }

  /**
   * Static folder browsing helper for project pickers
   */
  static async browseDirectories(basePath?: string): Promise<{ current: string; parent: string | null; folders: string[] }> {
    let target = basePath ? path.resolve(basePath) : process.cwd();

    try {
      const stats = await fs.stat(target);
      if (!stats.isDirectory()) {
        target = path.dirname(target);
      }
    } catch {
      target = process.cwd();
    }

    const parent = path.dirname(target) !== target ? path.dirname(target) : null;
    const folders: string[] = [];

    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          folders.push(entry.name);
        }
      }
    } catch {}

    folders.sort((a, b) => a.localeCompare(b));
    return { current: target, parent, folders };
  }
}
