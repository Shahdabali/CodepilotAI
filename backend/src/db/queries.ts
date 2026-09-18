import { getDb } from './schema.js'
import type {
  Project,
  Task,
  TaskStep,
  FileSnapshot,
  ApprovalRequest,
  AgentStage,
  AgentMode,
  TaskStatus,
} from '../types/shared.js'

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function now(): string {
  return new Date().toISOString()
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function createProject(
  data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Project> {
  const db = getDb()
  const id = newId()
  const ts = now()
  await db.execute({
    sql: `INSERT INTO projects 
      (id, name, path, language, framework, description, file_count, test_file_count, dependencies, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.name,
      data.path,
      data.language,
      data.framework,
      data.description,
      data.fileCount,
      data.testFileCount,
      JSON.stringify(data.dependencies),
      JSON.stringify(data.settings),
      ts,
      ts,
    ],
  })
  return { ...data, id, createdAt: ts, updatedAt: ts }
}

export async function getProject(id: string): Promise<Project | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return rowToProject(result.rows[0])
}

export async function getAllProjects(): Promise<Project[]> {
  const db = getDb()
  const result = await db.execute('SELECT * FROM projects ORDER BY updated_at DESC')
  return result.rows.map(rowToProject)
}

export async function updateProject(id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
  const db = getDb()
  const existing = await getProject(id)
  if (!existing) throw new Error(`Project ${id} not found`)
  const merged = { ...existing, ...data, updatedAt: now() }
  await db.execute({
    sql: `UPDATE projects SET name=?, path=?, language=?, framework=?, description=?,
          file_count=?, test_file_count=?, dependencies=?, settings=?, updated_at=? WHERE id=?`,
    args: [
      merged.name,
      merged.path,
      merged.language,
      merged.framework,
      merged.description,
      merged.fileCount,
      merged.testFileCount,
      JSON.stringify(merged.dependencies),
      JSON.stringify(merged.settings),
      merged.updatedAt,
      id,
    ],
  })
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [id] })
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    language: row.language as string | null,
    framework: row.framework as string | null,
    description: row.description as string | null,
    fileCount: row.file_count as number,
    testFileCount: row.test_file_count as number,
    dependencies: JSON.parse((row.dependencies as string) || '[]'),
    settings: JSON.parse((row.settings as string) || '{}'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function createTask(data: {
  projectId: string
  command: string
  mode: AgentMode
}): Promise<Task> {
  const db = getDb()
  const id = newId()
  const ts = now()
  await db.execute({
    sql: `INSERT INTO tasks (id, project_id, command, mode, status, created_at) VALUES (?, ?, ?, ?, 'PENDING', ?)`,
    args: [id, data.projectId, data.command, data.mode, ts],
  })
  return {
    id,
    projectId: data.projectId,
    command: data.command,
    mode: data.mode,
    status: 'PENDING',
    currentStage: null,
    iterationCount: 0,
    createdAt: ts,
    completedAt: null,
    summary: null,
    filesChanged: [],
  }
}

export async function getTask(id: string): Promise<Task | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return rowToTask(result.rows[0])
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  const db = getDb()
  const result = await db.execute({
    sql: 'SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC LIMIT 50',
    args: [projectId],
  })
  return result.rows.map(rowToTask)
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  stage?: AgentStage,
  extra?: { summary?: string; filesChanged?: string[]; iterationCount?: number }
): Promise<void> {
  const db = getDb()
  const completedAt = status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' ? now() : null
  await db.execute({
    sql: `UPDATE tasks SET status=?, current_stage=?, completed_at=?, summary=?, files_changed=?, iteration_count=? WHERE id=?`,
    args: [
      status,
      stage ?? null,
      completedAt,
      extra?.summary ?? null,
      JSON.stringify(extra?.filesChanged ?? []),
      extra?.iterationCount ?? 0,
      id,
    ],
  })
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    command: row.command as string,
    mode: row.mode as AgentMode,
    status: row.status as TaskStatus,
    currentStage: row.current_stage as AgentStage | null,
    iterationCount: row.iteration_count as number,
    createdAt: row.created_at as string,
    completedAt: row.completed_at as string | null,
    summary: row.summary as string | null,
    filesChanged: JSON.parse((row.files_changed as string) || '[]'),
  }
}

// ─── Task Steps ──────────────────────────────────────────────────────────────

export async function addTaskStep(data: {
  taskId: string
  stage: AgentStage
  status: 'running' | 'completed' | 'failed' | 'skipped'
  message: string
  data?: Record<string, unknown>
}): Promise<TaskStep> {
  const db = getDb()
  const id = newId()
  const ts = now()
  await db.execute({
    sql: `INSERT INTO task_steps (id, task_id, stage, status, message, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.taskId, data.stage, data.status, data.message, data.data ? JSON.stringify(data.data) : null, ts],
  })
  return { id, taskId: data.taskId, stage: data.stage, status: data.status, message: data.message, data: data.data ?? null, createdAt: ts }
}

export async function getTaskSteps(taskId: string): Promise<TaskStep[]> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM task_steps WHERE task_id = ? ORDER BY created_at ASC', args: [taskId] })
  return result.rows.map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    stage: row.stage as AgentStage,
    status: row.status as 'running' | 'completed' | 'failed' | 'skipped',
    message: row.message as string,
    data: row.data ? JSON.parse(row.data as string) : null,
    createdAt: row.created_at as string,
  }))
}

// ─── File Snapshots ───────────────────────────────────────────────────────────

export async function saveFileSnapshot(data: {
  taskId: string
  filePath: string
  contentBefore: string | null
  contentAfter: string | null
}): Promise<FileSnapshot> {
  const db = getDb()
  const id = newId()
  const ts = now()
  await db.execute({
    sql: `INSERT INTO file_snapshots (id, task_id, file_path, content_before, content_after, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, data.taskId, data.filePath, data.contentBefore, data.contentAfter, ts],
  })
  return { ...data, id, createdAt: ts }
}

export async function getFileSnapshots(taskId: string): Promise<FileSnapshot[]> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM file_snapshots WHERE task_id = ? ORDER BY created_at ASC', args: [taskId] })
  return result.rows.map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    filePath: row.file_path as string,
    contentBefore: row.content_before as string | null,
    contentAfter: row.content_after as string | null,
    createdAt: row.created_at as string,
  }))
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<unknown> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] })
  if (result.rows.length === 0) return null
  return JSON.parse(result.rows[0].value as string)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    args: [key, JSON.stringify(value), now()],
  })
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const db = getDb()
  const result = await db.execute('SELECT key, value FROM settings')
  const out: Record<string, unknown> = {}
  for (const row of result.rows) {
    out[row.key as string] = JSON.parse(row.value as string)
  }
  return out
}

// ─── Approval Requests ────────────────────────────────────────────────────────

export async function createApprovalRequest(data: {
  taskId: string
  type: string
  description: string
  details: Record<string, unknown>
}): Promise<ApprovalRequest> {
  const db = getDb()
  const id = newId()
  const ts = now()
  await db.execute({
    sql: `INSERT INTO approval_requests (id, task_id, type, description, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, data.taskId, data.type, data.description, JSON.stringify(data.details), ts],
  })
  return { id, taskId: data.taskId, type: data.type as ApprovalRequest['type'], description: data.description, details: data.details, createdAt: ts }
}

export async function resolveApprovalRequest(id: string, approved: boolean): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE approval_requests SET status=?, resolved_at=? WHERE id=?`,
    args: [approved ? 'approved' : 'rejected', now(), id],
  })
}
