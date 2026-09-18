import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { TerminalWebSocket } from '@/lib/ws'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'

const SESSION_COUNTER = { n: 0 }

export function Terminal() {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const wsRef = useRef<TerminalWebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [connected, setConnected] = React.useState(false)
  const [sessionId] = React.useState(() => `session-${++SESSION_COUNTER.n}-${Date.now()}`)

  const activeProject = useProjectStore((s) => s.activeProject)
  const theme = useUIStore((s) => s.theme)

  const isDark = theme === 'dark'

  function initTerminal() {
    if (!termRef.current || xtermRef.current) return

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      theme: isDark
        ? {
            background: '#0d1117',
            foreground: '#f0f6fc',
            cursor: '#2f81f7',
            selectionBackground: '#2f81f740',
            black: '#0d1117',
            red: '#f85149',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#2f81f7',
            magenta: '#bc8cff',
            cyan: '#39c5cf',
            white: '#8b949e',
            brightBlack: '#484f58',
            brightRed: '#ff7b72',
            brightGreen: '#56d364',
            brightYellow: '#e3b341',
            brightBlue: '#79c0ff',
            brightMagenta: '#d2a8ff',
            brightCyan: '#56d4dd',
            brightWhite: '#f0f6fc',
          }
        : {
            background: '#ffffff',
            foreground: '#111827',
            cursor: '#3b82f6',
            selectionBackground: '#3b82f640',
          },
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.open(termRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitRef.current = fitAddon

    term.writeln('\x1b[1;34m╔══════════════════════════════╗\x1b[0m')
    term.writeln('\x1b[1;34m║  CodePilot AI Terminal       ║\x1b[0m')
    term.writeln('\x1b[1;34m╚══════════════════════════════╝\x1b[0m')
    term.writeln('')

    if (activeProject) {
      connectWebSocket(term)
    } else {
      term.writeln('\x1b[33mOpen a project to start a terminal session.\x1b[0m')
    }
  }

  function connectWebSocket(term: XTerm) {
    if (!activeProject) return

    const ws = new TerminalWebSocket(sessionId, activeProject.path)
    wsRef.current = ws

    ws.onData((data) => term.write(data))
    ws.onClose(() => {
      setConnected(false)
      term.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m')
    })

    term.onData((data) => ws.send(data))

    ws.connect()
    setConnected(true)
    term.writeln(`\x1b[32m[Connected] Working in: ${activeProject.path}\x1b[0m\r\n`)
  }

  // Initialize on mount
  useEffect(() => {
    initTerminal()
    return () => {
      xtermRef.current?.dispose()
      xtermRef.current = null
      wsRef.current?.disconnect()
      wsRef.current = null
    }
  }, [])

  // Resize observer
  useEffect(() => {
    if (!termRef.current || !fitRef.current) return
    const observer = new ResizeObserver(() => {
      try { fitRef.current?.fit() } catch { /* ignore */ }
    })
    observer.observe(termRef.current)
    return () => observer.disconnect()
  }, [])

  function handleReconnect() {
    if (!xtermRef.current || !activeProject) return
    wsRef.current?.disconnect()
    xtermRef.current.writeln('\r\n\x1b[34m[Reconnecting…]\x1b[0m\r\n')
    connectWebSocket(xtermRef.current)
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">💻</span>
          <span className="text-xs font-medium text-[var(--text-secondary)]">Terminal</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-[var(--text-muted)]'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>
        <button
          onClick={handleReconnect}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2 py-0.5 rounded hover:bg-[var(--bg-tertiary)]"
        >
          {connected ? 'Reconnect' : 'Connect'}
        </button>
      </div>

      {/* xterm container */}
      <div ref={termRef} className="flex-1 overflow-hidden p-1" />
    </div>
  )
}
