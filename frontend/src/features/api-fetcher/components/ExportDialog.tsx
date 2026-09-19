import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { useDataStore } from '../data.store'
import { useDialogs, type ExportKind } from '../dialogs.store'
import { generateCode, LANGUAGES, toCurl, type LangId } from '../lib/codegen'
import { downloadText, safeFilename } from '../lib/download'
import { redactRequest } from '../lib/redact'
import { flattenCollections } from '../lib/tree'
import { exportCollectionJson, exportRequestJson } from '../lib/transfer'
import { tryParseJson } from '../lib/json'
import { useSession } from '../session.store'
import { toast } from '../toast'
import { useActiveEnv } from './EnvSelector'
import { downloadFullResponse } from './ResponseBody'
import { Button, Callout, CopyButton, Field, Modal, Toggle } from './ui'

const KINDS: Array<{ id: ExportKind; label: string }> = [
  { id: 'curl', label: 'Request as cURL' },
  { id: 'request-json', label: 'Request as JSON' },
  { id: 'collection', label: 'Collection (JSON)' },
  { id: 'response', label: 'API response (JSON with metadata)' },
  { id: 'response-body', label: 'Response body only' },
  { id: 'code', label: 'Generated code' },
]

const PREVIEW_LIMIT = 30_000

export function ExportDialog() {
  const { exportState, closeExport } = useDialogs()
  const data = useDataStore()
  const draft = useSession((s) => s.draft)
  const outcome = useSession((s) => s.outcome)
  const codeLang = useSession((s) => s.codeLang)
  const env = useActiveEnv()
  const [kind, setKind] = useState<ExportKind>('curl')
  const [collectionId, setCollectionId] = useState('')
  const [lang, setLang] = useState<LangId>('js-fetch')
  const [includeSecrets, setIncludeSecrets] = useState(false)

  useEffect(() => {
    if (exportState.open) {
      setKind(exportState.kind)
      setCollectionId(exportState.collectionId ?? data.collections[0]?.id ?? '')
      setLang(codeLang)
      setIncludeSecrets(false)
    }
  }, [exportState.open]) // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(() => flattenCollections(data.collections), [data.collections])
  const ok = outcome?.ok ? outcome : null

  const { text, filename, mime, problem } = useMemo(() => {
    const base = safeFilename(draft.name || 'request')
    try {
      switch (kind) {
        case 'curl':
          return { text: toCurl(draft, env), filename: `${base}.sh`, mime: 'text/x-shellscript', problem: null }
        case 'request-json':
          return { text: exportRequestJson(draft, includeSecrets), filename: `${base}.request.json`, mime: 'application/json', problem: null }
        case 'collection': {
          if (!collectionId) return { text: '', filename: '', mime: 'application/json', problem: 'Create a collection first.' }
          const name = data.collections.find((c) => c.id === collectionId)?.name ?? 'collection'
          return { text: exportCollectionJson(collectionId, data.collections, data.requests, includeSecrets), filename: `${safeFilename(name)}.collection.json`, mime: 'application/json', problem: null }
        }
        case 'response': {
          if (!ok) return { text: '', filename: '', mime: 'application/json', problem: 'Send a request first.' }
          const r = ok.response
          const parsed = r.bodyText !== undefined && r.kind === 'json' && !r.bodyTextTruncated ? tryParseJson(r.bodyText) : null
          const doc = {
            format: 'codepilot-api-fetcher',
            type: 'response',
            exportedAt: new Date().toISOString(),
            request: { ...redactRequest(draft), method: ok.request.method, url: ok.request.url, headers: ok.request.headers },
            response: { status: r.status, statusText: r.statusText, url: r.url, headers: r.headers, contentType: r.contentType, sizeBytes: r.sizeBytes, truncated: r.truncated || !!r.bodyTextTruncated, body: parsed && parsed.ok ? parsed.value : (r.bodyText ?? (r.bodyBase64 ? `[base64 ${r.bodyBase64.length} chars omitted]` : null)) },
            timings: ok.timings,
          }
          return { text: JSON.stringify(doc, null, 2), filename: `${base}.response.json`, mime: 'application/json', problem: null }
        }
        case 'response-body': {
          if (!ok) return { text: '', filename: '', mime: 'text/plain', problem: 'Send a request first.' }
          const r = ok.response
          if (r.bodyText === undefined) return { text: '', filename: r.filename, mime: r.contentType, problem: 'This response is binary. Use “Download full response” instead.' }
          const parsed = r.kind === 'json' && !r.bodyTextTruncated ? tryParseJson(r.bodyText) : null
          return { text: parsed && parsed.ok ? JSON.stringify(parsed.value, null, 2) : r.bodyText, filename: r.filename, mime: r.contentType || 'text/plain', problem: null }
        }
        case 'code': {
          const l = LANGUAGES.find((x) => x.id === lang) ?? LANGUAGES[0]
          const names: Record<LangId, string> = { 'js-fetch': 'request.mjs', 'js-axios': 'request.mjs', 'ts-fetch': 'request.ts', 'py-requests': 'request.py', 'py-httpx': 'request.py', curl: 'request.sh', java: 'ApiRequest.java', csharp: 'Program.cs', go: 'main.go', php: 'request.php' }
          return { text: generateCode(draft, lang, env, { responseIsJson: ok?.response.kind === 'json' }), filename: names[l.id], mime: 'text/plain', problem: null }
        }
      }
    } catch (e) {
      return { text: '', filename: '', mime: 'text/plain', problem: (e as Error).message }
    }
  }, [kind, draft, env, includeSecrets, collectionId, lang, data.collections, data.requests, ok])

  const showSecretsToggle = kind === 'request-json' || kind === 'collection'

  return (
    <Modal
      open={exportState.open}
      onOpenChange={(o) => !o && closeExport()}
      title="Export"
      description="Credentials are replaced with placeholders unless you explicitly include them."
      width={680}
      footer={
        <>
          <Button onClick={closeExport}>Close</Button>
          {kind === 'response-body' && ok && (
            <Button onClick={() => downloadFullResponse(ok)}>
              <Download size={13} /> Full response
            </Button>
          )}
          <CopyButton text={text} label="Copy" message="Copied to clipboard" />
          <Button
            variant="primary"
            disabled={!text}
            onClick={() => {
              downloadText(filename, text, mime)
              toast.success('Exported', filename)
            }}
          >
            <Download size={13} /> Download
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="What to export" className="min-w-[220px] flex-1">
            <select className="af-input" value={kind} onChange={(e) => setKind(e.target.value as ExportKind)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          {kind === 'collection' && (
            <Field label="Collection" className="min-w-[180px] flex-1">
              <select className="af-input" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
                {flat.length === 0 && <option value="">No collections</option>}
                {flat.map(({ collection, depth }) => (
                  <option key={collection.id} value={collection.id}>
                    {'  '.repeat(depth)}
                    {collection.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === 'code' && (
            <Field label="Language" className="min-w-[180px] flex-1">
              <select className="af-input" value={lang} onChange={(e) => setLang(e.target.value as LangId)}>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {showSecretsToggle && <Toggle checked={includeSecrets} onChange={setIncludeSecrets} label="Include credentials" description="Writes tokens, passwords and API keys into the file in plain text. Prefer {{variables}} and share the environment separately." />}
        {includeSecrets && showSecretsToggle && (
          <Callout tone="warn" icon={<AlertTriangle size={14} className="text-[var(--af-warn)]" />}>
            <span className="text-[11.5px]">Anyone with this file can use these credentials. Environment secrets are never exported.</span>
          </Callout>
        )}
        {problem ? (
          <Callout tone="info">
            <span className="text-[11.5px]">{problem}</span>
          </Callout>
        ) : (
          <div className="overflow-hidden rounded-md border border-[var(--af-border)] bg-[var(--af-sunken)]">
            <div className="flex items-center justify-between border-b border-[var(--af-border)] px-3 py-1 text-[10.5px] text-[var(--af-text-3)]">
              <span className="af-mono">{filename}</span>
              <span>{text.length.toLocaleString()} characters</span>
            </div>
            <pre className="af-code af-scroll" style={{ maxHeight: 280, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {text.slice(0, PREVIEW_LIMIT)}
              {text.length > PREVIEW_LIMIT && `\n… ${(text.length - PREVIEW_LIMIT).toLocaleString()} more characters in the exported file`}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  )
}
