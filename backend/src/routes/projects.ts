import type { FastifyPluginAsync } from 'fastify'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import * as queries from '../db/queries.js'
import { FileManager } from '../workspace/file-manager.js'
import { GitService } from '../git/git-service.js'
import type { ProjectSettings } from '../types/shared.js'

const DEFAULT_SETTINGS: ProjectSettings = {
  autonomyLevel: 'BALANCED',
  defaultMode: 'BUILD',
  maxIterations: 10,
  executionTimeout: 60000,
  excludePatterns: ['node_modules', '.git', 'dist', '.next', '__pycache__'],
}

export const projectsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /api/projects - list all projects (sorted by last updated)
  fastify.get('/api/projects', async () => {
    return queries.getAllProjects()
  })

  // GET /api/projects/defaults - where new/cloned projects should go, so the UI never hard-codes a path
  fastify.get('/api/projects/defaults', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url)) // …/codepilot-ai/backend/{src|dist}/routes
    const appRoot = path.resolve(here, '..', '..', '..')
    const workspaceRoot = process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : path.dirname(appRoot)
    return { appRoot, workspaceRoot, homeDir: os.homedir(), separator: path.sep, platform: process.platform }
  })

  // POST /api/projects/validate-path - check if a local directory exists & is readable
  fastify.post<{
    Body: { path: string }
  }>('/api/projects/validate-path', async (request, reply) => {
    const { path: targetPath } = request.body || {}
    const result = await FileManager.validatePath(targetPath)
    return reply.send(result)
  })

  // POST /api/projects/browse - browse subdirectories for path selection
  fastify.post<{
    Body: { path?: string }
  }>('/api/projects/browse', async (request, reply) => {
    const { path: targetPath } = request.body || {}
    const result = await FileManager.browseDirectories(targetPath)
    return reply.send(result)
  })

  // POST /api/projects/reveal - open folder in OS native explorer
  fastify.post<{
    Body: { path: string }
  }>('/api/projects/reveal', async (request, reply) => {
    const { path: targetPath } = request.body || {}
    if (!targetPath) return reply.status(400).send({ error: 'path is required' })

    const resolved = path.resolve(targetPath)
    try {
      if (process.platform === 'win32') {
        execFile('explorer.exe', [resolved])
      } else if (process.platform === 'darwin') {
        execFile('open', [resolved])
      } else {
        execFile('xdg-open', [resolved])
      }
      return reply.send({ success: true, path: resolved })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to open directory in explorer' })
    }
  })

  // POST /api/projects/clone - clone a git repo and initialize as project
  fastify.post<{
    Body: { repoUrl: string; targetPath: string; name?: string }
  }>('/api/projects/clone', async (request, reply) => {
    const { repoUrl, targetPath, name } = request.body || {}
    if (!repoUrl || !targetPath) {
      return reply.status(400).send({ error: 'repoUrl and targetPath are required' })
    }
    // A leading dash would be read by git as an option (e.g. --upload-pack=…), not as a repository.
    if (repoUrl.trim().startsWith('-')) {
      return reply.status(400).send({ error: 'That does not look like a repository URL' })
    }

    const resolvedTarget = path.resolve(targetPath)

    try {
      // Check if target directory already exists with content
      try {
        const stats = await fs.stat(resolvedTarget)
        if (stats.isDirectory()) {
          const contents = await fs.readdir(resolvedTarget)
          if (contents.length > 0) {
            return reply.status(400).send({ error: 'Target directory already exists and is not empty' })
          }
        }
      } catch {
        // Directory doesn't exist yet, which is fine for git clone
      }

      await GitService.clone(repoUrl, resolvedTarget)

      const projectName = name?.trim() || path.basename(resolvedTarget) || 'Cloned Project'
      const fm = new FileManager(resolvedTarget)
      const analysis = await fm.getProjectAnalysis()

      const project = await queries.createProject({
        name: projectName,
        path: resolvedTarget,
        language: analysis.language,
        framework: analysis.framework,
        description: analysis.description ?? null,
        fileCount: analysis.fileCount,
        testFileCount: analysis.testFileCount,
        dependencies: analysis.dependencies || [],
        settings: DEFAULT_SETTINGS,
      })

      return reply.send({ project, analysis })
    } catch (err: any) {
      return reply.status(500).send({ error: `Git clone failed: ${err.message || String(err)}` })
    }
  })

  // POST /api/projects/scaffold - scaffold a brand new project directory
  fastify.post<{
    Body: { path: string; name?: string; template?: string }
  }>('/api/projects/scaffold', async (request, reply) => {
    const { path: targetPath, name, template = 'blank' } = request.body || {}
    if (!targetPath) return reply.status(400).send({ error: 'path is required' })

    const resolved = path.resolve(targetPath)
    await fs.mkdir(resolved, { recursive: true })

    const projectName = name?.trim() || path.basename(resolved) || 'New Project'

    // Write initial template files
    if (template === 'ts-node' || template === 'ts-react') {
      const isReact = template === 'ts-react'
      const pkgJson = {
        name: projectName.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: isReact ? 'vite' : 'tsx watch src/index.ts',
          build: isReact ? 'vite build' : 'tsc',
          test: 'vitest run',
        },
        dependencies: isReact ? { react: '^18.3.1', 'react-dom': '^18.3.1' } : {},
        devDependencies: {
          typescript: '^5.5.0',
          ...(isReact ? { vite: '^5.4.0', '@types/react': '^18.3.3' } : {}),
        },
      }
      await fs.writeFile(path.join(resolved, 'package.json'), JSON.stringify(pkgJson, null, 2))
      await fs.mkdir(path.join(resolved, 'src'), { recursive: true })
      if (isReact) {
        await fs.writeFile(
          path.join(resolved, 'src/App.tsx'),
          'export default function App() {\n  return <div><h1>Welcome to ' + projectName + '</h1></div>;\n}\n'
        )
      } else {
        await fs.writeFile(
          path.join(resolved, 'src/index.ts'),
          'console.log("Hello from ' + projectName + '!");\n'
        )
      }
    } else if (template === 'python') {
      await fs.writeFile(
        path.join(resolved, 'main.py'),
        'def main():\n    print("Hello from ' + projectName + '!")\n\nif __name__ == "__main__":\n    main()\n'
      )
      await fs.writeFile(path.join(resolved, 'requirements.txt'), '# Project dependencies\n')
    }

    await fs.writeFile(
      path.join(resolved, 'README.md'),
      `# ${projectName}\n\nCreated with CodePilot AI.\n`
    )

    const fm = new FileManager(resolved)
    const analysis = await fm.getProjectAnalysis()

    const project = await queries.createProject({
      name: projectName,
      path: resolved,
      language: analysis.language,
      framework: analysis.framework,
      description: analysis.description ?? null,
      fileCount: analysis.fileCount,
      testFileCount: analysis.testFileCount,
      dependencies: analysis.dependencies || [],
      settings: DEFAULT_SETTINGS,
    })

    return reply.send({ project, analysis })
  })

  // POST /api/projects — create / open project from existing local path
  fastify.post('/api/projects', async (request, reply) => {
    const body = (request.body as { path?: string; name?: string } | undefined) ?? {}
    const rawPath = body.path?.trim()
    if (!rawPath) return reply.status(400).send({ error: 'path is required' })

    const validation = await FileManager.validatePath(rawPath)
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error || 'Invalid directory path' })
    }

    const projectPath = validation.absolutePath

    // Check if project already exists for this path
    const all = await queries.getAllProjects()
    const existing = all.find((p) => path.resolve(p.path).toLowerCase() === projectPath.toLowerCase())

    const fm = new FileManager(projectPath)
    const analysis = await fm.getProjectAnalysis()

    if (existing) {
      // Update last modified & latest analysis
      await queries.updateProject(existing.id, {
        language: analysis.language,
        framework: analysis.framework,
        description: analysis.description ?? null,
        fileCount: analysis.fileCount,
        testFileCount: analysis.testFileCount,
        dependencies: analysis.dependencies,
      })
      const updated = await queries.getProject(existing.id)
      return reply.send({ project: updated, analysis })
    }

    const name = body.name?.trim() || validation.name || 'Project'

    const project = await queries.createProject({
      name,
      path: projectPath,
      language: analysis.language,
      framework: analysis.framework,
      description: analysis.description ?? null,
      fileCount: analysis.fileCount,
      testFileCount: analysis.testFileCount,
      dependencies: analysis.dependencies || [],
      settings: DEFAULT_SETTINGS,
    })

    return reply.send({ project, analysis })
  })

  // GET /api/projects/:id
  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await queries.getProject(id)
    if (!project) return reply.status(404).send({ error: 'Project not found' })
    return project
  })

  // PUT /api/projects/:id - update project details or rename
  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Record<string, unknown>
    await queries.updateProject(id, updates as any)
    return queries.getProject(id)
  })

  // DELETE /api/projects/:id — remove from recent projects list
  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await queries.deleteProject(id)
    return { success: true, message: 'Removed from recent projects' }
  })

  // POST /api/projects/:id/analyze — re-analyze project
  fastify.post('/api/projects/:id/analyze', async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await queries.getProject(id)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const fm = new FileManager(project.path, id)
    const analysis = await fm.getProjectAnalysis()
    await queries.updateProject(id, {
      language: analysis.language,
      framework: analysis.framework,
      description: analysis.description,
      fileCount: analysis.fileCount,
      testFileCount: analysis.testFileCount,
      dependencies: analysis.dependencies,
    })
    return reply.send({ project: await queries.getProject(id), analysis })
  })
}
