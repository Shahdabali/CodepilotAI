import React, { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Bookmark, Check, Clock, Code2, FolderTree, Layers, Search, Send, Settings, Sparkles, WifiOff, X } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import '../api-fetcher.css'
import { useDataStore } from '../data.store'
import { useDialogs } from '../dialogs.store'
import { saveCurrent } from '../actions'
import { isDraftDirty, useSession } from '../session.store'
import { useToastStore } from '../toast'
import { AiPanel } from './AiPanel'
import { CollectionsPanel, SavedPanel } from './CollectionsPanel'
import { EnvSelector, useActiveEnv } from './EnvSelector'
import { EnvironmentsView } from './EnvironmentsView'
import { ExportDialog } from './ExportDialog'
import { HistoryPanel } from './HistoryPanel'
import { ImportDialog } from './ImportDialog'
import { RequestBar } from './RequestBar'
import { RequestPane } from './RequestPane'
import { ResponsePane } from './ResponsePane'
import { SaveDialog } from './SaveDialog'
import { SearchPalette, ShortcutsDialog } from './SearchPalette'
import { SettingsView } from './SettingsView'
import { Button, ConfirmDialog, TipProvider, Tip } from './ui'

function useNarrow(query = '(max-width: 1023px)'): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return narrow
}

function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="af-toaster" role="region" aria-label="Notifications" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="af-toast" data-kind={t.kind} role={t.kind === 'error' ? 'alert' : 'status'}>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-[var(--af-text)]">{t.title}</div>
            {t.description && <div className="mt-0.5 break-words text-[11.5px] text-[var(--af-text-2)]">{t.description}</div>}
            {t.action && (
              <button
                type="button"
                className="mt-1 text-[11.5px] font-medium text-[var(--af-accent-text)] hover:underline"
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button type="button" className="af-icon-btn" style={{ width: 20, height: 20 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

function RailButton({ label, icon, active, onClick, shortcut }: { label: string; icon: React.ReactNode; active?: boolean; onClick: () => void; shortcut?: string }) {
  return (
    <Tip label={label} side="right" shortcut={shortcut}>
      <button type="button" className="af-rail-btn" data-active={active || undefined} onClick={onClick} aria-label={label} aria-pressed={!!active}>
        {icon}
      </button>
    </Tip>
  )
}

function Rail() {
  const section = useSession((s) => s.section)
  const panel = useSession((s) => s.panel)
  const lowerTab = useSession((s) => s.lowerTab)
  const aiOpen = useSession((s) => s.aiOpen)
  const s = useSession.getState

  return (
    <nav className="af-rail" aria-label="API Fetcher sections">
      <RailButton label="API Fetcher" icon={<Send size={17} />} active={section === 'workspace' && !panel && lowerTab !== 'code'} onClick={() => (s().setSection('workspace'), s().setPanel(null), s().lowerTab === 'code' && s().setLowerTab('response'))} />
      <RailButton label="Request History" icon={<Clock size={17} />} active={section === 'workspace' && panel === 'history'} onClick={() => s().togglePanel('history')} />
      <RailButton label="Saved Requests" icon={<Bookmark size={17} />} active={section === 'workspace' && panel === 'saved'} onClick={() => s().togglePanel('saved')} />
      <RailButton label="Collections" icon={<FolderTree size={17} />} active={section === 'workspace' && panel === 'collections'} onClick={() => s().togglePanel('collections')} />
      <RailButton label="Environments" icon={<Layers size={17} />} active={section === 'environments'} onClick={() => s().setSection('environments')} />
      <RailButton label="Generated Code" icon={<Code2 size={17} />} active={section === 'workspace' && lowerTab === 'code'} onClick={() => (s().setSection('workspace'), s().setLowerTab('code'))} />
      <div className="flex-1" />
      <RailButton label="Search" icon={<Search size={17} />} shortcut="Ctrl+K" onClick={() => s().setSearchOpen(true)} />
      <RailButton label="AI Assistant" icon={<Sparkles size={17} />} active={aiOpen} shortcut="Ctrl+Shift+A" onClick={() => s().setAiOpen(!aiOpen)} />
      <RailButton label="Settings" icon={<Settings size={17} />} active={section === 'settings'} onClick={() => s().setSection(section === 'settings' ? 'workspace' : 'settings')} />
    </nav>
  )
}

function WorkspaceHeader() {
  const name = useSession((s) => s.draft.name)
  const setName = useSession((s) => s.setName)
  const dirty = useSession(isDraftDirty)
  const savedId = useSession((s) => s.savedId)
  const aiOpen = useSession((s) => s.aiOpen)
  const setAiOpen = useSession((s) => s.setAiOpen)
  const savedName = useDataStore((s) => (savedId ? s.requests.find((r) => r.id === savedId)?.name : undefined))
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[var(--af-border)] bg-[var(--af-panel)] px-3">
      <input
        className="af-input"
        style={{ width: 'min(320px, 42%)', height: 26, background: 'transparent', borderColor: 'transparent', fontWeight: 600, fontSize: 12.5 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Untitled request"
        aria-label="Request name"
      />
      {savedId && savedName !== undefined ? (
        <span className="flex items-center gap-1 text-[11px] text-[var(--af-text-3)]">{dirty ? <span className="text-[var(--af-warn)]">● Unsaved changes</span> : <><Check size={12} className="text-[var(--af-ok)]" /> Saved</>}</span>
      ) : (
        dirty && <span className="text-[11px] text-[var(--af-text-3)]">Not saved</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <EnvSelector />
        <Tip label="AI assistant" shortcut="Ctrl+Shift+A">
          <Button size="sm" variant={aiOpen ? 'primary' : 'default'} onClick={() => setAiOpen(!aiOpen)} aria-pressed={aiOpen}>
            <Sparkles size={13} /> <span className="hidden md:inline">Assistant</span>
          </Button>
        </Tip>
      </div>
    </div>
  )
}

function Workspace() {
  const env = useActiveEnv()
  const loadError = useDataStore((s) => s.loadError)
  const load = useDataStore((s) => s.load)
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <WorkspaceHeader />
      {loadError && (
        <div className="flex items-center gap-2 border-b border-[var(--af-border)] bg-[var(--af-err-soft)] px-3 py-1.5 text-[11.5px] text-[var(--af-err)]">
          <WifiOff size={13} /> {loadError}
          <Button size="sm" className="ml-auto" onClick={() => load()}>
            Retry
          </Button>
        </div>
      )}
      <RequestBar env={env} />
      <PanelGroup direction="vertical" autoSaveId="af-v2" className="min-h-0 flex-1">
        <Panel id="req" order={1} defaultSize={40} minSize={18} className="min-h-0 bg-[var(--af-panel)]">
          <RequestPane />
        </Panel>
        <PanelResizeHandle className="af-resize-y" />
        <Panel id="res" order={2} defaultSize={60} minSize={20} className="min-h-0">
          <ResponsePane />
        </Panel>
      </PanelGroup>
    </div>
  )
}

function SidePanelContent() {
  const panel = useSession((s) => s.panel)
  return panel === 'history' ? <HistoryPanel /> : panel === 'saved' ? <SavedPanel /> : panel === 'collections' ? <CollectionsPanel /> : null
}

function Overlay({ side, onClose, children, width }: { side: 'left' | 'right'; onClose: () => void; children: React.ReactNode; width: number }) {
  return (
    <>
      <div className="absolute inset-0 z-20 bg-black/40 af-fade-in" onClick={onClose} aria-hidden />
      <div className="af-fade-in absolute bottom-0 top-0 z-30 flex flex-col overflow-hidden shadow-2xl" style={{ [side]: 0, width: `min(${width}px, 92%)`, background: 'var(--af-panel)', borderLeft: side === 'right' ? '1px solid var(--af-border)' : undefined, borderRight: side === 'left' ? '1px solid var(--af-border)' : undefined }}>
        {children}
      </div>
    </>
  )
}

export default function ApiFetcherView() {
  const load = useDataStore((s) => s.load)
  const loaded = useDataStore((s) => s.loaded)
  const section = useSession((s) => s.section)
  const panel = useSession((s) => s.panel)
  const aiOpen = useSession((s) => s.aiOpen)
  const setPanel = useSession((s) => s.setPanel)
  const setAiOpen = useSession((s) => s.setAiOpen)
  const dialogs = useDialogs()
  const narrow = useNarrow()

  useEffect(() => {
    void load().then(() => {
      useSession.getState().syncSaved()
      const { activeEnvId } = useSession.getState()
      if (activeEnvId && !useDataStore.getState().environments.some((e) => e.id === activeEnvId)) useSession.getState().setActiveEnv(null)
    })
    if (window.innerWidth < 1100) useUIStore.getState().setSidebarCollapsed(true)
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const st = useSession.getState()
      if (mod && e.key === 'Enter') {
        // Capture phase + stopPropagation: a focused menu button must not also treat this Enter as "open".
        e.preventDefault()
        e.stopPropagation()
        void st.send()
      } else if (mod && !e.shiftKey && key === 's') {
        e.preventDefault()
        void saveCurrent()
      } else if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault()
        st.setSearchOpen(!st.searchOpen)
      } else if (mod && e.shiftKey && key === 'a') {
        e.preventDefault()
        st.setAiOpen(!st.aiOpen)
      } else if (mod && e.shiftKey && key === 'f') {
        const el = document.getElementById('af-response-search')
        if (el) {
          e.preventDefault()
          el.focus()
        }
      } else if (e.altKey && !mod && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        st.setSection('workspace')
        st.setRequestTab((['params', 'headers', 'body', 'auth'] as const)[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const main =
    section === 'environments' ? <EnvironmentsView /> : section === 'settings' ? <SettingsView /> : <Workspace />

  const showSide = section === 'workspace' && panel !== null
  const showAi = section === 'workspace' && aiOpen

  return (
    <TipProvider>
      <div className="af-root" data-loaded={loaded}>
        <Rail />
        <div className="relative flex min-h-0 min-w-0 flex-1">
          {narrow ? (
            <>
              {main}
              {showSide && (
                <Overlay side="left" width={340} onClose={() => setPanel(null)}>
                  <SidePanelContent />
                </Overlay>
              )}
              {showAi && (
                <Overlay side="right" width={420} onClose={() => setAiOpen(false)}>
                  <AiPanel />
                </Overlay>
              )}
            </>
          ) : (
            <PanelGroup direction="horizontal" autoSaveId="af-h2" className="min-h-0 min-w-0 flex-1">
              {showSide && (
                <>
                  <Panel id="side" order={1} defaultSize={22} minSize={15} maxSize={40} className="min-w-0 border-r border-[var(--af-border)]">
                    <SidePanelContent />
                  </Panel>
                  <PanelResizeHandle className="af-resize-x" />
                </>
              )}
              <Panel id="main" order={2} minSize={30} className="min-w-0">
                {main}
              </Panel>
              {showAi && (
                <>
                  <PanelResizeHandle className="af-resize-x" />
                  <Panel id="ai" order={3} defaultSize={30} minSize={20} maxSize={48} className="min-w-0">
                    <AiPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          )}
        </div>
      </div>

      <SearchPalette />
      <SaveDialog />
      <ImportDialog />
      <ExportDialog />
      <ShortcutsDialog />
      <ConfirmDialog
        open={dialogs.clearConfirmOpen}
        onOpenChange={dialogs.setClearConfirmOpen}
        title="Clear this request?"
        description="Your unsaved changes will be discarded. Saved requests and history are not affected."
        confirmLabel="Clear"
        danger
        onConfirm={() => useSession.getState().newDraft()}
      />
      <Toaster />
    </TipProvider>
  )
}

