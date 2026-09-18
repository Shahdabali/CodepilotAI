import fs from 'fs/promises'
import path from 'path'
import type { FileSnapshot } from '../types/shared.js'

export class RollbackService {
  /**
   * Restore all files from their before-snapshots.
   * Each snapshot's filePath is relative to the project root stored in the snapshot metadata.
   * We use the filePath as-is if it's absolute, otherwise resolve it relative to cwd.
   */
  async rollbackTask(taskId: string, fileSnapshots: FileSnapshot[]): Promise<void> {
    for (const snapshot of fileSnapshots) {
      const fullPath = path.isAbsolute(snapshot.filePath)
        ? snapshot.filePath
        : path.resolve(process.cwd(), snapshot.filePath)

      if (snapshot.contentBefore === null) {
        // File was created by the agent — delete it
        try {
          await fs.unlink(fullPath)
        } catch {
          // Ignore if already gone
        }
      } else {
        // Restore previous content
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, snapshot.contentBefore, 'utf-8')
      }
    }
  }
}
