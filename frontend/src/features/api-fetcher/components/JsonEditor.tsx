import React, { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder as cmPlaceholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, syntaxHighlighting, indentOnInput } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { json } from '@codemirror/lang-json'
import { tags as t } from '@lezer/highlight'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { checkJson, type JsonError } from '../lib/json'

// Colours are CSS variables, so the editor follows the app's light/dark switch without being reconfigured.
const highlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: 'var(--af-syn-key)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--af-syn-str)' },
  { tag: t.number, color: 'var(--af-syn-num)' },
  { tag: [t.bool, t.atom], color: 'var(--af-syn-bool)' },
  { tag: t.null, color: 'var(--af-syn-null)', fontStyle: 'italic' },
  { tag: [t.punctuation, t.separator, t.bracket, t.squareBracket, t.brace], color: 'var(--af-syn-punc)' },
  { tag: t.invalid, color: 'var(--af-err)' },
])

const baseTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--af-sunken)', color: 'var(--af-text)' },
  '.cm-content': { caretColor: 'var(--af-text)', padding: '6px 0' },
  '.cm-line': { padding: '0 10px' },
  '&.cm-focused .cm-matchingBracket, .cm-matchingBracket': { backgroundColor: 'var(--af-accent-soft)', outline: '1px solid var(--af-border-strong)' },
  '&.cm-focused .cm-nonmatchingBracket, .cm-nonmatchingBracket': { backgroundColor: 'var(--af-err-soft)', outline: '1px solid var(--af-err)' },
  '.cm-placeholder': { color: 'var(--af-text-3)' },
  '.cm-lint-marker-error': { content: '"●"' },
})

export interface JsonEditorHandle {
  focusAt: (pos: number) => void
}

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
}

const jsonLinter = linter(
  (view) => {
    const text = view.state.doc.toString()
    const err = checkJson(text)
    if (!err) return []
    const len = text.length
    let from = Math.min(err.pos, len)
    const to = Math.min(err.pos + 1, len)
    if (from === to && from > 0) from = to - 1
    const d: Diagnostic = { from, to, severity: 'error', message: err.message }
    return [d]
  },
  { delay: 250 }
)

export const JsonEditor = forwardRef<JsonEditorHandle, Props>(function JsonEditor({ value, onChange, placeholder, readOnly }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const readOnlyCompartment = useRef(new Compartment())

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          json(),
          syntaxHighlighting(highlightStyle),
          jsonLinter,
          lintGutter(),
          baseTheme,
          cmPlaceholder(placeholder ?? ''),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
          readOnlyCompartment.current.of(EditorState.readOnly.of(!!readOnly)),
          EditorView.contentAttributes.of({ 'aria-label': 'JSON request body', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // The editor instance is created once; value/readOnly are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(!!readOnly)) })
  }, [readOnly])

  useImperativeHandle(ref, () => ({
    focusAt: (pos: number) => {
      const v = view.current
      if (!v) return
      const p = Math.max(0, Math.min(pos, v.state.doc.length))
      v.dispatch({ selection: { anchor: p }, scrollIntoView: true })
      v.focus()
    },
  }))

  return <div ref={host} className="af-cm h-full min-h-0 overflow-hidden" />
})

/** Debounced validation state used by the status bar (kept out of the editor so large bodies never block typing). */
export function useJsonStatus(text: string): JsonError | null | 'empty' {
  const [status, setStatus] = useState<JsonError | null | 'empty'>(() => (text.trim() ? checkJson(text) : 'empty'))
  useEffect(() => {
    const id = setTimeout(() => setStatus(text.trim() ? checkJson(text) : 'empty'), text.length > 200_000 ? 500 : 120)
    return () => clearTimeout(id)
  }, [text])
  return status
}

export function JsonStatusBar({ text, onJump }: { text: string; onJump: (pos: number) => void }) {
  const status = useJsonStatus(text)
  const lines = useMemo(() => (text ? text.split('\n').length : 0), [text])
  if (status === 'empty') return <div className="flex h-6 items-center px-3 text-[11px] text-[var(--af-text-3)]">Empty body</div>
  if (status === null) {
    return (
      <div className="flex h-6 items-center gap-1.5 px-3 text-[11px] text-[var(--af-ok)]">
        <CheckCircle2 size={12} /> Valid JSON <span className="text-[var(--af-text-3)]">· {lines} lines · {text.length.toLocaleString()} chars</span>
      </div>
    )
  }
  return (
    <button type="button" onClick={() => onJump(status.pos)} className="flex h-6 w-full items-center gap-1.5 bg-[var(--af-err-soft)] px-3 text-left text-[11px] text-[var(--af-err)] hover:brightness-110" title="Jump to error">
      <AlertCircle size={12} className="shrink-0" />
      <span className="af-truncate">
        Line {status.line}, column {status.column}: {status.message}
      </span>
    </button>
  )
}
