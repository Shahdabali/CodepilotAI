import { createClient, type Client } from '@libsql/client'
import { config } from '../config.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let _db: Client | null = null

export function getDb(): Client {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return _db
}

export async function initDb(): Promise<Client> {
  const dbPath = path.resolve(config.dbPath)
  _db = createClient({ url: `file:${dbPath}` })
  await runMigrations(_db)
  return _db
}

async function runMigrations(db: Client): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      language TEXT,
      framework TEXT,
      description TEXT,
      file_count INTEGER DEFAULT 0,
      test_file_count INTEGER DEFAULT 0,
      dependencies TEXT DEFAULT '[]',
      settings TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      command TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'BUILD',
      status TEXT NOT NULL DEFAULT 'PENDING',
      current_stage TEXT,
      iteration_count INTEGER DEFAULT 0,
      summary TEXT,
      files_changed TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS task_steps (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      message TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS file_snapshots (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content_before TEXT,
      content_after TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
      ('autonomyLevel', '"BALANCED"', datetime('now')),
      ('geminiModel', '"gemini-2.5-flash"', datetime('now')),
      ('theme', '"dark"', datetime('now')),
      ('fontSize', '14', datetime('now')),
      ('maxIterations', '10', datetime('now')),
      ('executionTimeout', '60000', datetime('now'));
  `)
}

export async function closeDb(): Promise<void> {
  if (_db) {
    _db.close()
    _db = null
  }
}
