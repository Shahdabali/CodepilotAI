import React from 'react'
import { AgentPanel } from '@/components/agent-panel/AgentPanel'

export function RightSidebar() {
  return (
    <div className="h-full border-l border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-color)] shrink-0">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">🤖 Agent</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <AgentPanel />
      </div>
    </div>
  )
}
