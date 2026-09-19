import fs from 'fs/promises'
import path from 'path'
import type { FileSnapshot } from '../types/shared.js'

export interface FileConflict {
  filePath: string
  hasConflict: boolean
  currentContent: string | null
  expectedContent: string | null
  snapshotBefore: string | null
}

export class RollbackService {
  /**
   * Check for conflicts before rollback (e.g. if the file was edited after task snapshot)
   */
  async checkConflicts(fileSnapshots: FileSnapshot[], projectPath: string): Promise<FileConflict[]> {
    const conflicts: FileConflict[] = []

    for (const snapshot of fileSnapshots) {
      const fullPath = path.isAbsolute(snapshot.filePath)
        ? snapshot.filePath
        : path.resolve(projectPath, snapshot.filePath)

      let currentContent: string | null = null
      try {
        currentContent = await fs.readFile(fullPath, 'utf-8')
      } catch {
        currentContent = null
      }

      // Conflict if current file on disk doesn't match what the task wrote
      const hasConflict = currentContent !== snapshot.contentAfter

      conflicts.push({
        filePath: snapshot.filePath,
        hasConflict,
        currentContent,
        expectedContent: snapshot.contentAfter,
        snapshotBefore: snapshot.contentBefore,
      })
    }

    return conflicts
  }

  /**
   * Restore all files from their before-snapshots.
   */
  async rollbackTask(
    taskId: string,
    fileSnapshots: FileSnapshot[],
    projectPath: string = process.cwd(),
    force: boolean = true
  ): Promise<{ restored: string[]; skipped: string[] }> {
    const restored: string[] = []
    const skipped: string[] = []

    for (const snapshot of fileSnapshots) {
      const fullPath = path.isAbsolute(snapshot.filePath)
        ? snapshot.filePath
        : path.resolve(projectPath, snapshot.filePath)

      if (!force) {
        let currentContent: string | null = null
        try {
          currentContent = await fs.readFile(fullPath, 'utf-8')
        } catch {
          currentContent = null
        }
        if (currentContent !== snapshot.contentAfter) {
          skipped.push(snapshot.filePath)
          continue
        }
      }

      if (snapshot.contentBefore === null) {
        // File was created by the agent — delete it
        try {
          await fs.unlink(fullPath)
          restored.push(snapshot.filePath)
        } catch {
          // Ignore if already gone
        }
      } else {
        // Restore previous content
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, snapshot.contentBefore, 'utf-8')
        restored.push(snapshot.filePath)
      }
    }

    return { restored, skipped }
  }
}
