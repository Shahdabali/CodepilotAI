import fs from 'fs/promises';
import path from 'path';
import type { ProjectAnalysis } from '../types/shared.js';
import * as queries from '../db/queries.js';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export class FileManager {
  private projectPath: string;
  private taskId: string;

  constructor(projectPath: string, taskId: string) {
    this.projectPath = projectPath;
    this.taskId = taskId;
  }

  resolveProjectPath(relativePath: string): string {
    const resolved = path.resolve(this.projectPath, relativePath);
    if (!resolved.startsWith(this.projectPath)) {
      throw new Error('Path traversal detected');
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
    
    let contentBefore = null;
    if (await this.fileExists(filePath)) {
      contentBefore = await fs.readFile(resolved, 'utf-8');
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');

    // Save snapshot
    await queries.saveFileSnapshot({
      taskId: this.taskId,
      filePath: filePath,
      contentBefore,
      contentAfter: content
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    const resolved = this.resolveProjectPath(filePath);
    if (await this.fileExists(filePath)) {
      const contentBefore = await fs.readFile(resolved, 'utf-8');
      await fs.unlink(resolved);
      
      await queries.saveFileSnapshot({
        taskId: this.taskId,
        filePath: filePath,
        contentBefore,
        contentAfter: null
      });
    }
  }

  async listFiles(dir: string = '.'): Promise<FileNode[]> {
    const resolved = this.resolveProjectPath(dir);
    const items = await fs.readdir(resolved, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const item of items) {
      if (['node_modules', '.git', 'dist'].includes(item.name)) continue;
      
      const itemPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        nodes.push({
          name: item.name,
          path: itemPath,
          type: 'directory',
          children: await this.listFiles(itemPath)
        });
      } else {
        nodes.push({
          name: item.name,
          path: itemPath,
          type: 'file'
        });
      }
    }
    return nodes;
  }

  async readFileTree(dir: string = '.'): Promise<FileNode[]> {
    return this.listFiles(dir);
  }

  async getProjectAnalysis(): Promise<ProjectAnalysis> {
    const analysis: ProjectAnalysis = {
      language: 'unknown',
      framework: 'unknown',
      packageManager: 'unknown',
      testFramework: 'unknown',
      fileCount: 0,
      sourceFileCount: 0,
      testFileCount: 0
    };

    if (await this.fileExists('package.json')) {
      analysis.packageManager = 'npm';
      const pkg = JSON.parse(await this.readFile('package.json'));
      if (pkg.dependencies?.react || pkg.devDependencies?.react) analysis.framework = 'react';
      if (pkg.devDependencies?.jest) analysis.testFramework = 'jest';
      if (pkg.devDependencies?.typescript) analysis.language = 'typescript';
      else analysis.language = 'javascript';
    } else if (await this.fileExists('pyproject.toml') || await this.fileExists('requirements.txt')) {
      analysis.language = 'python';
      analysis.packageManager = 'pip';
      if (await this.fileExists('pytest.ini')) analysis.testFramework = 'pytest';
    } else if (await this.fileExists('Cargo.toml')) {
      analysis.language = 'rust';
      analysis.packageManager = 'cargo';
      analysis.testFramework = 'cargo test';
    } else if (await this.fileExists('go.mod')) {
      analysis.language = 'go';
      analysis.packageManager = 'go mod';
      analysis.testFramework = 'go test';
    }

    // Rough counts
    const tree = await this.listFiles();
    const countFiles = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          analysis.fileCount = (analysis.fileCount || 0) + 1;
          if (node.name.includes('.test.') || node.name.includes('.spec.')) {
            analysis.testFileCount++;
          } else if (node.name.match(/\.(ts|js|py|rs|go|jsx|tsx)$/)) {
            analysis.sourceFileCount = (analysis.sourceFileCount || 0) + 1;
          }
        } else if (node.children) {
          countFiles(node.children);
        }
      }
    };
    countFiles(tree);

    return analysis;
  }
}
