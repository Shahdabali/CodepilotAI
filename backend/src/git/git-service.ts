import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'
import type { TaskContext } from '../agent/context.js'
import { getAIRouter } from '../ai/index.js'

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  staged: string[]
  unstaged: string[]
  untracked: string[]
  ahead: number
  behind: number
}

export class GitService {
  private git: SimpleGit
  private projectPath: string

  constructor(projectPath: string) {
    this.projectPath = projectPath
    this.git = simpleGit(projectPath)
  }

  static async clone(repoUrl: string, targetPath: string): Promise<void> {
    const git = simpleGit()
    await git.clone(repoUrl, targetPath)
  }

  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo()
    } catch {
      return false
    }
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status()
    return {
      isRepo: true,
      branch: status.current,
      staged: status.staged,
      unstaged: status.modified,
      untracked: status.not_added,
      ahead: status.ahead,
      behind: status.behind,
    }
  }

  async getDiff(staged = false): Promise<string> {
    return staged ? this.git.diff(['--cached']) : this.git.diff()
  }

  async getLog(limit = 10): Promise<Array<{ hash: string; message: string; author: string; date: string }>> {
    const log = await this.git.log({ maxCount: limit })
    return log.all.map((l) => ({
      hash: l.hash,
      message: l.message,
      author: l.author_name,
      date: l.date,
    }))
  }

  async commit(message: string, files?: string[]): Promise<string> {
    if (files && files.length > 0) {
      await this.git.add(files)
    } else {
      await this.git.add('.')
    }
    const result = await this.git.commit(message)
    return result.commit || ''
  }

  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name)
  }

  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status()
    return status.current ?? 'main'
  }

  async generateCommitMessage(ctx: TaskContext): Promise<string> {
    const ai = getAIRouter()
    const prompt = `Generate a concise conventional commit message (50 chars max) for these changes.
Command: ${ctx.command}
Files changed: ${ctx.filesChanged.join(', ')}
Reply with ONLY the commit message, no quotes.`
    const msg = await ai.generate(prompt, undefined, 'DOCUMENTATION')
    return msg.trim().replace(/^['"]+|['"]+$/g, '').slice(0, 72)
  }
}
