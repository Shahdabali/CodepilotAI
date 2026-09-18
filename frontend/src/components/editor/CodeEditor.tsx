import React, { useEffect, useRef } from 'react'
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
import { api } from '@/lib/api'

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
  const [content, setContent] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const theme = useUIStore((s) => s.theme)

  // Load file content when filePath changes
  useEffect(() => {
    if (!filePath || !projectId) { setContent(''); return }
    setLoading(true)
    setError(null)
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

  useEffect(() => () => { editorRef.current?.destroy(); editorRef.current = null }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isEditing) { e.preventDefault(); handleSave() }
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
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] select-none flex-col gap-3">
        <div className="text-5xl opacity-30">📄</div>
        <p className="text-sm">Select a file to view its contents</p>
        <p className="text-xs opacity-60">Use the file explorer on the left</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <span className="text-xs font-mono text-[var(--text-secondary)] truncate max-w-[60%]">{filePath}</span>
        <div className="flex items-center gap-2 shrink-0">
          {loading && <span className="text-xs text-[var(--text-muted)]">Loading…</span>}
          {error && <span className="text-xs text-red-400 truncate max-w-[120px]" title={error}>{error}</span>}
          {saving && <span className="text-xs text-yellow-400">Saving…</span>}
          {!readOnly && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Edit</button>
          )}
          {isEditing && <>
            <button onClick={handleSave} className="text-xs px-2 py-0.5 rounded bg-[var(--accent)] text-white hover:opacity-90">Save</button>
            <button onClick={() => setIsEditing(false)} className="text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
          </>}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading
          ? <div className="flex h-full items-center justify-center"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>
          : <div ref={containerRef} className="h-full" />}
      </div>
    </div>
  )
}
