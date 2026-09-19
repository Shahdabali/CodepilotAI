import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { TerminalWebSocket } from '@/lib/ws'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'

const SESSION_COUNTER = { n: 0 }

const DARK_THEME = {
  background: '#0e1115',
  foreground: '#e8ebef',
  cursor: '#4cc9b6',
  selectionBackground: '#4cc9b638',
  black: '#0e1115',
  red: '#f0686a',
  green: '#3ccb8f',
  yellow: '#e6ac3a',
  blue: '#6db8e3',
  magenta: '#c9a2e8',
  cyan: '#4cc9b6',
  white: '#a6b0bc',
  brightBlack: '#5b6572',
  brightRed: '#ff8b8d',
  brightGreen: '#63dba8',
  brightYellow: '#f0c05f',
  brightBlue: '#8ccbee',
  brightMagenta: '#dcbaf2',
  brightCyan: '#7ddccd',
  brightWhite: '#f4f6f8',
}

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#1b1f24',
  cursor: '#0f766e',
  selectionBackground: '#0f766e33',
  black: '#1b1f24',
  red: '#b91c1c',
  green: '#15803d',
  yellow: '#a16207',
  blue: '#1f6fa5',
  magenta: '#7e3fa3',
  cyan: '#0f766e',
  white: '#626b77',
  brightBlack: '#464e58',
  brightRed: '#dc2626',
  brightGreen: '#16a34a',
  brightYellow: '#ca8a04',
  brightBlue: '#2563eb',
  brightMagenta: '#9333ea',
  brightCyan: '#0d9488',
  brightWhite: '#8a939f',
}

/**
 * xterm throws ("reading 'dimensions'") if it is fitted before it has been laid out or after it was disposed —
 * both happen while a lazy tab is animating in. Only fit a mounted, non-empty terminal, and never let it throw.
 */
function safeFit(fit: FitAddon | null, host: HTMLElement | null) {
  if (!fit || !host || host.clientWidth === 0 || host.clientHeight === 0) return
  try {
    fit.fit()
  } catch {
    /* not laid out yet — the ResizeObserver will fit again once it is */
  }
}

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
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.open(termRef.current)
    // Fit once the browser has laid the container out (not synchronously, when it may still be 0×0).
    requestAnimationFrame(() => safeFit(fitAddon, termRef.current))

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
    const host = termRef.current
    const observer = new ResizeObserver(() => safeFit(fitRef.current, host))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // Follow the app's light/dark switch instead of keeping the colours the terminal was created with.
  useEffect(() => {
    if (xtermRef.current) xtermRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME
  }, [isDark])

  function handleReconnect() {
    if (!xtermRef.current || !activeProject) return
    wsRef.current?.disconnect()
    xtermRef.current.writeln('\r\n\x1b[34m[Reconnecting…]\x1b[0m\r\n')
    connectWebSocket(xtermRef.current)
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-input)]">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Terminal</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'}`}
            role="img"
            aria-label={connected ? 'Connected' : 'Disconnected'}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-[11px] text-[var(--text-muted)]">{connected ? 'connected' : 'not connected'}</span>
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
