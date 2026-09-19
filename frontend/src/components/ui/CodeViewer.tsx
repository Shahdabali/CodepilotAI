import React, { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view'
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Colours are CSS variables so the viewer follows the light/dark switch without being reconfigured.
const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: 'var(--syn-func)' },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: 'var(--syn-type)' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--syn-prop)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.squareBracket, t.brace, t.angleBracket], color: 'var(--syn-punct)' },
  { tag: t.heading, color: 'var(--syn-func)', fontWeight: '600' },
  { tag: t.link, color: 'var(--accent-text)', textDecoration: 'underline' },
  { tag: t.invalid, color: 'var(--danger)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { padding: '8px 0', caretColor: 'transparent' },
  '.cm-line': { padding: '0 14px' },
  '.cm-gutters': { backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)', border: 'none', borderRight: '1px solid var(--border-subtle)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '38px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-secondary)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 35%, transparent) !important' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-subtle)', outline: '1px solid var(--border-strong)' },
})

/** Languages load on demand so opening one file doesn't ship every grammar. */
async function loadLanguage(path: string): Promise<Extension | null> {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  switch (ext) {
    case 'js': case 'mjs': case 'cjs': case 'jsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: ext === 'jsx' })
    case 'ts': case 'mts': case 'cts':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
    case 'tsx':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true })
    case 'json': case 'jsonc': case 'json5': case 'webmanifest':
      return (await import('@codemirror/lang-json')).json()
    case 'py': case 'pyi':
      return (await import('@codemirror/lang-python')).python()
    case 'java':
      return (await import('@codemirror/lang-java')).java()
    case 'rs':
      return (await import('@codemirror/lang-rust')).rust()
    case 'css': case 'scss': case 'less':
      return (await import('@codemirror/lang-css')).css()
    case 'html': case 'htm': case 'vue': case 'svelte': case 'xml': case 'svg':
      return (await import('@codemirror/lang-html')).html()
    default:
      return null
  }
}

export function CodeViewer({ path, text, wrap = false, label }: { path: string; text: string; wrap?: boolean; label?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  const wrapping = useRef(new Compartment())

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          bracketMatching(),
          syntaxHighlighting(highlightStyle),
          theme,
          EditorState.readOnly.of(true),
          EditorView.editable.of(true), // focusable + selectable for keyboard users, but not editable
          language.current.of([]),
          wrapping.current.of(wrap ? EditorView.lineWrapping : []),
          EditorView.contentAttributes.of({ 'aria-label': label ?? 'File contents (read-only)', 'aria-readonly': 'true', spellcheck: 'false' }),
        ],
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // Created once; text/path/wrap are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== text) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: 0 }, scrollIntoView: true })
      v.scrollDOM.scrollTop = 0
    }
  }, [text])

  useEffect(() => {
    let cancelled = false
    loadLanguage(path).then((ext) => {
      if (!cancelled) view.current?.dispatch({ effects: language.current.reconfigure(ext ?? []) })
    })
    return () => {
      cancelled = true
    }
  }, [path])

  useEffect(() => {
    view.current?.dispatch({ effects: wrapping.current.reconfigure(wrap ? EditorView.lineWrapping : []) })
  }, [wrap])

  return <div ref={host} className="h-full min-h-0 w-full overflow-hidden" />
}
