import React, { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { java } from '@codemirror/lang-java'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'
import { useUIStore } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { api } from '@/lib/api'
import {
  Sparkles,
  Play,
  Wrench,
  Zap,
  BookOpen,
  TestTube,
  RotateCcw,
  FileText,
  Copy,
  Check
} from 'lucide-react'
import type { AgentMode } from '@/types'

interface CodeEditorProps {
  filePath: string | null
  projectId: string | null
  readOnly?: boolean
}

const languageCompartment = new Compartment()
const editableCompartment = new Compartment()
const themeCompartment = new Compartment()

function getLangExtension(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'js': case 'jsx': case 'mjs': return javascript({ jsx: true })
    case 'ts': case 'tsx': return javascript({ jsx: true, typescript: true })
    case 'py': return python()
    case 'rs': return rust()
    case 'java': return java()
    case 'css': case 'scss': return css()
    case 'html': case 'htm': return html()
    default: return javascript()
  }
}

export function CodeEditor({ filePath, projectId, readOnly = true }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedCode, setSelectedCode] = useState('')
  const [copied, setCopied] = useState(false)

  const theme = useUIStore((s) => s.theme)
  const { setCurrentView } = useUIStore()
  const { addTask } = useTaskStore()

  // Load file content when filePath changes
  useEffect(() => {
    if (!filePath || !projectId) {
      setContent('')
      setSelectedCode('')
      return
    }
    setLoading(true)
    setError(null)
    setSelectedCode('')
    api.files.getContent(projectId, filePath)
      .then((d) => setContent(d.content ?? ''))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filePath, projectId])

  // Build/update CodeMirror instance
  useEffect(() => {
    if (!containerRef.current || loading) return
    const extensions = [
      basicSetup,
      languageCompartment.of(filePath ? getLangExtension(filePath) : javascript()),
      editableCompartment.of(EditorView.editable.of(!readOnly && isEditing)),
      themeCompartment.of(theme === 'dark' ? oneDark : []),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const range = update.state.selection.main
          if (!range.empty) {
            const text = update.state.sliceDoc(range.from, range.to).trim()
            setSelectedCode(text)
          } else {
            setSelectedCode('')
          }
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto', height: '100%' },
      }),
    ]

    if (!editorRef.current) {
      editorRef.current = new EditorView({
        state: EditorState.create({ doc: content, extensions }),
        parent: containerRef.current,
      })
    } else {
      editorRef.current.dispatch({
        changes: { from: 0, to: editorRef.current.state.doc.length, insert: content },
        effects: [
          languageCompartment.reconfigure(filePath ? getLangExtension(filePath) : javascript()),
          editableCompartment.reconfigure(EditorView.editable.of(!readOnly && isEditing)),
          themeCompartment.reconfigure(theme === 'dark' ? oneDark : []),
        ],
      })
    }
  }, [content, filePath, readOnly, isEditing, theme, loading])

  useEffect(() => () => {
    editorRef.current?.destroy()
    editorRef.current = null
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isEditing) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEditing, projectId, filePath])

  async function handleSave() {
    if (!projectId || !filePath || !editorRef.current) return
    setSaving(true)
    try {
      await api.files.writeContent(projectId, filePath, editorRef.current.state.doc.toString())
      setIsEditing(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    const textToCopy = selectedCode || content
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRunAiAction = async (actionName: string, mode: AgentMode = 'BUILD') => {
    if (!projectId || !filePath) return

    let commandText = ''
    if (selectedCode) {
      commandText = `${actionName} in @file:${filePath} for selected snippet:\n\`\`\`\n${selectedCode}\n\`\`\``
    } else {
      commandText = `${actionName} in @file:${filePath}`
    }

    try {
      const task = await api.tasks.create(projectId, {
        command: commandText,
        mode,
      })
      addTask(task)
      setCurrentView('task')
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch AI task')
    }
  }

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] select-none flex-col gap-3">
        <div className="text-5xl opacity-30">📄</div>
        <p className="text-sm">Select a file to view and edit</p>
        <p className="text-xs opacity-60">Use the file explorer on the left or press Ctrl+P</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Top Header & Actions Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-medium text-[var(--text-primary)] truncate max-w-[240px]" title={filePath}>
            {filePath}
          </span>
          {loading && <span className="text-[10px] text-[var(--text-muted)]">Loading…</span>}
          {error && <span className="text-[10px] text-red-400 truncate max-w-[140px]" title={error}>⚠ {error}</span>}
          {saving && <span className="text-[10px] text-amber-400">Saving…</span>}
        </div>

        {/* AI Quick Actions Bar */}
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => handleRunAiAction('Explain the logic and architecture', 'EXPLAIN')}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
            title="Explain this file"
          >
            <BookOpen size={11} />
            <span className="hidden sm:inline">Explain</span>
          </button>
          <button
            type="button"
            onClick={() => handleRunAiAction('Find and fix potential bugs, edge cases, and runtime issues', 'FIX')}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
            title="Fix bugs in this file"
          >
            <Wrench size={11} />
            <span className="hidden sm:inline">Fix</span>
          </button>
          <button
            type="button"
            onClick={() => handleRunAiAction('Optimize execution speed and memory consumption', 'OPTIMIZE')}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
            title="Optimize performance"
          >
            <Zap size={11} />
            <span className="hidden sm:inline">Optimize</span>
          </button>
          <button
            type="button"
            onClick={() => handleRunAiAction('Generate automated unit tests', 'TEST')}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
            title="Generate unit tests for this file"
          >
            <TestTube size={11} />
            <span className="hidden sm:inline">Tests</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
            title="Copy code"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>

          <div className="w-[1px] h-3.5 bg-[var(--border-subtle)] mx-1" />

          {/* Edit / Save toggles */}
          {!readOnly && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-[11px] px-2.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-colors font-medium"
            >
              Edit
            </button>
          )}
          {isEditing && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleSave}
                className="text-[11px] px-2.5 py-0.5 rounded bg-[var(--accent)] text-white hover:opacity-90 font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Selection Toolbar when code is highlighted */}
      {selectedCode && (
        <div className="absolute top-10 right-6 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-xl animate-in fade-in slide-in-from-top-1 text-xs">
          <span className="text-[10px] font-semibold text-[var(--accent)] px-1.5 flex items-center gap-1">
            <Sparkles size={11} /> Selection:
          </span>
          <button
            type="button"
            onClick={() => handleRunAiAction('Explain this selection', 'EXPLAIN')}
            className="px-2 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11px]"
          >
            Explain
          </button>
          <button
            type="button"
            onClick={() => handleRunAiAction('Fix issues in this selection', 'FIX')}
            className="px-2 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11px]"
          >
            Fix
          </button>
          <button
            type="button"
            onClick={() => handleRunAiAction('Refactor and clean up this selection', 'REFACTOR')}
            className="px-2 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11px]"
          >
            Refactor
          </button>
          <button
            type="button"
            onClick={() => handleRunAiAction('Optimize this selection', 'OPTIMIZE')}
            className="px-2 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11px]"
          >
            Optimize
          </button>
        </div>
      )}

      {/* Editor Body */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div ref={containerRef} className="h-full" />
        )}
      </div>
    </div>
  )
}
