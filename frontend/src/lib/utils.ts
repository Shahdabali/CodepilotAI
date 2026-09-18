import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { AgentStage, TaskStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

export function getLanguageIcon(lang: string | null): string {
  switch (lang?.toLowerCase()) {
    case 'typescript': return '🔷'
    case 'javascript': return '🟨'
    case 'python': return '🐍'
    case 'rust': return '🦀'
    case 'go': return '🐹'
    case 'java': return '☕'
    case 'c++': return '⚙️'
    case 'c': return '⚙️'
    default: return '📄'
  }
}

export function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': return '🔷'
    case 'js': case 'jsx': case 'mjs': return '🟨'
    case 'py': return '🐍'
    case 'rs': return '🦀'
    case 'go': return '🐹'
    case 'java': return '☕'
    case 'json': return '📋'
    case 'md': return '📝'
    case 'css': case 'scss': return '🎨'
    case 'html': return '🌐'
    case 'env': return '🔐'
    case 'toml': case 'yaml': case 'yml': return '⚙️'
    case 'sh': case 'bash': return '💻'
    case 'sql': return '🗄️'
    case 'test': case 'spec': return '🧪'
    default: return '📄'
  }
}

export function getStageIcon(stage: AgentStage): string {
  switch (stage) {
    case 'UNDERSTANDING': return '🧠'
    case 'PLANNING': return '📋'
    case 'INSPECTING': return '🔍'
    case 'IMPLEMENTING': return '⚡'
    case 'RUNNING': return '▶️'
    case 'TESTING': return '🧪'
    case 'DEBUGGING': return '🐛'
    case 'OPTIMIZING': return '⚡'
    case 'VERIFYING': return '✅'
    case 'COMPLETE': return '🎉'
    case 'FAILED': return '❌'
    default: return '⏳'
  }
}

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'COMPLETED': return 'text-green-400'
    case 'FAILED': return 'text-red-400'
    case 'RUNNING': return 'text-blue-400'
    case 'CANCELLED': return 'text-yellow-400'
    default: return 'text-[var(--text-muted)]'
  }
}

export function getStatusDot(status: TaskStatus): string {
  switch (status) {
    case 'COMPLETED': return 'bg-green-400'
    case 'FAILED': return 'bg-red-400'
    case 'RUNNING': return 'bg-blue-400 animate-pulse'
    case 'CANCELLED': return 'bg-yellow-400'
    default: return 'bg-[var(--text-muted)]'
  }
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}
