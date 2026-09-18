import React from 'react'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { DiffViewer } from '@/components/editor/DiffViewer'
import { Terminal } from '@/components/terminal/Terminal'
import { AgentPanel } from '@/components/agent-panel/AgentPanel'
import { CommandInput } from '@/components/command-input/CommandInput'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'editor', label: 'Editor', icon: '📄' },
  { id: 'diff', label: 'Changes', icon: '📊' },
  { id: 'terminal', label: 'Terminal', icon: '💻' },
  { id: 'agent', label: 'Agent', icon: '🤖' },
] as const

export function CenterPanel() {
  const { centerTab, setCenterTab, selectedFile } = useUIStore()
  const activeProject = useProjectStore((s) => s.activeProject)

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setCenterTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
              centerTab === tab.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content - takes remaining space above the command input */}
      <div className="flex-1 overflow-hidden">
        <div className={cn('h-full', centerTab !== 'editor' && 'hidden')}>
          <CodeEditor filePath={selectedFile} projectId={activeProject?.id ?? null} readOnly={false} />
        </div>
        <div className={cn('h-full', centerTab !== 'diff' && 'hidden')}>
          <DiffViewer />
        </div>
        <div className={cn('h-full', centerTab !== 'terminal' && 'hidden')}>
          <Terminal />
        </div>
        <div className={cn('h-full overflow-y-auto', centerTab !== 'agent' && 'hidden')}>
          <AgentPanel />
        </div>
      </div>

      {/* Command input — always visible at bottom */}
      <CommandInput />
    </div>
  )
}
