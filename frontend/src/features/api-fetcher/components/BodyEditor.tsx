import React, { useRef } from 'react'
import { AlignLeft, Minimize2, Wand2 } from 'lucide-react'
import { useSession } from '../session.store'
import { formatJsonText, minifyJsonText } from '../lib/json'
import { toast } from '../toast'
import type { BodyMode } from '../types'
import { JsonEditor, JsonStatusBar, type JsonEditorHandle } from './JsonEditor'
import { KeyValueEditor } from './KeyValueEditor'
import { Button, Segmented, CopyButton } from './ui'

const MODES: Array<{ id: BodyMode; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'form-data', label: 'Form Data' },
  { id: 'urlencoded', label: 'x-www-form-urlencoded' },
  { id: 'raw', label: 'Raw' },
]

const RAW_TYPES = ['text/plain', 'application/xml', 'text/xml', 'text/html', 'application/javascript', 'application/x-yaml', 'application/graphql', 'application/octet-stream']

export function BodyEditor() {
  const body = useSession((s) => s.draft.body)
  const method = useSession((s) => s.draft.method)
  const patchBody = useSession((s) => s.patchBody)
  const editor = useRef<JsonEditorHandle>(null)

  const format = (minify = false) => {
    const r = minify ? minifyJsonText(body.json) : formatJsonText(body.json)
    if (!r.ok) {
      toast.error(`Can't ${minify ? 'minify' : 'format'}: invalid JSON`, `Line ${r.error.line}, column ${r.error.column}: ${r.error.message}`)
      editor.current?.focusAt(r.error.pos)
      return
    }
    patchBody({ json: r.text })
    toast.success(minify ? 'JSON minified' : 'JSON formatted')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--af-border)] px-3 py-2">
        <Segmented options={MODES} value={body.mode} onChange={(mode) => patchBody({ mode })} />
        {body.mode === 'json' && (
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => format(false)} disabled={!body.json.trim()}>
              <Wand2 size={13} /> Format
            </Button>
            <Button size="sm" variant="ghost" onClick={() => format(true)} disabled={!body.json.trim()}>
              <Minimize2 size={13} /> Minify
            </Button>
            <CopyButton text={body.json} label="Copy body" />
          </div>
        )}
        {body.mode === 'raw' && (
          <label className="ml-auto flex items-center gap-2 text-[11px] text-[var(--af-text-3)]">
            Content-Type
            <select className="af-input af-mono" style={{ width: 200 }} value={body.rawContentType} onChange={(e) => patchBody({ rawContentType: e.target.value })}>
              {!RAW_TYPES.includes(body.rawContentType) && <option value={body.rawContentType}>{body.rawContentType}</option>}
              {RAW_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {body.mode === 'none' && (
          <div className="af-empty h-full">
            <AlignLeft size={20} />
            <div className="text-[12px] font-medium text-[var(--af-text-2)]">This request has no body</div>
            {(method === 'POST' || method === 'PUT' || method === 'PATCH') && <div className="text-[11.5px]">{method} requests usually send data. Choose JSON, Form Data, x-www-form-urlencoded or Raw above.</div>}
          </div>
        )}
        {body.mode === 'json' && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <JsonEditor ref={editor} value={body.json} onChange={(json) => patchBody({ json })} placeholder={'{\n  "name": "John",\n  "email": "john@example.com"\n}'} />
            </div>
            <div className="shrink-0 border-t border-[var(--af-border)]">
              <JsonStatusBar text={body.json} onJump={(pos) => editor.current?.focusAt(pos)} />
            </div>
          </div>
        )}
        {body.mode === 'form-data' && (
          <div className="af-scroll h-full">
            <KeyValueEditor rows={body.form} onChange={(form) => patchBody({ form })} maskSensitive />
            <p className="px-3 py-2 text-[11px] text-[var(--af-text-3)]">Text fields only. Sent as multipart/form-data; file uploads are not supported.</p>
          </div>
        )}
        {body.mode === 'urlencoded' && (
          <div className="af-scroll h-full">
            <KeyValueEditor rows={body.urlencoded} onChange={(urlencoded) => patchBody({ urlencoded })} maskSensitive />
          </div>
        )}
        {body.mode === 'raw' && (
          <textarea
            className="af-input af-mono af-textarea h-full w-full rounded-none border-0"
            style={{ resize: 'none', background: 'var(--af-sunken)' }}
            value={body.raw}
            onChange={(e) => patchBody({ raw: e.target.value })}
            placeholder="Raw request body"
            spellCheck={false}
            aria-label="Raw request body"
          />
        )}
      </div>
    </div>
  )
}
