import React from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { CenterPanel } from './CenterPanel'
import { RightSidebar } from './RightSidebar'
import { StatusBar } from './StatusBar'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { useUIStore } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { useAgentSSE } from '@/hooks/useAgent'

export default function IDEShell() {
  const rightPanelVisible = useUIStore((s) => s.rightPanelVisible)
  const activeTask = useTaskStore((s) => s.activeTask)
  useAgentSSE(activeTask?.id ?? null)

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <TopBar />

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          <Panel defaultSize={20} minSize={14} maxSize={32}>
            <LeftSidebar />
          </Panel>

          <PanelResizeHandle className="w-px bg-[var(--border-color)] hover:bg-[var(--accent)] hover:w-0.5 cursor-col-resize transition-all" />

          <Panel defaultSize={rightPanelVisible ? 55 : 80} minSize={30}>
            <CenterPanel />
          </Panel>

          {rightPanelVisible && (
            <>
              <PanelResizeHandle className="w-px bg-[var(--border-color)] hover:bg-[var(--accent)] hover:w-0.5 cursor-col-resize transition-all" />
              <Panel defaultSize={25} minSize={18} maxSize={40}>
                <RightSidebar />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      <StatusBar />

      {/* Global overlays */}
      <CommandPalette />
      <SettingsPanel />
    </div>
  )
}
