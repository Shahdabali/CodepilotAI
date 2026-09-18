import React from 'react'
import { FileTree } from '@/components/sidebar/FileTree'
import { GitPanel } from '@/components/sidebar/GitPanel'
import { TaskHistory } from '@/components/sidebar/TaskHistory'
import { ProjectList } from '@/components/sidebar/ProjectList'
import { useUIStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'

type Tab = 'files' | 'git' | 'history' | 'projects'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'files', icon: '📂', label: 'Files' },
  { id: 'git', icon: '🌿', label: 'Git' },
  { id: 'history', icon: '📜', label: 'History' },
  { id: 'projects', icon: '🗂️', label: 'Projects' },
]

export function LeftSidebar() {
  const { sidebarTab, setSidebarTab } = useUIStore()

  return (
    <div className="flex h-full border-r border-[var(--border-color)] bg-[var(--bg-secondary)]">
      {/* Icon strip */}
      <div className="flex flex-col items-center py-2 w-10 border-r border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidebarTab(tab.id)}
            title={tab.label}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded mb-0.5 transition-colors text-sm',
              sidebarTab === tab.id
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            )}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {sidebarTab === 'files' && <FileTree />}
        {sidebarTab === 'git' && <GitPanel />}
        {sidebarTab === 'history' && <TaskHistory />}
        {sidebarTab === 'projects' && <ProjectList />}
      </div>
    </div>
  )
}
