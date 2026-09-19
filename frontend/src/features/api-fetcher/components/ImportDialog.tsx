import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, Globe, Terminal } from 'lucide-react'
import type { ImportResult, RequestDef } from '../types'
import { useDataStore } from '../data.store'
import { useDialogs } from '../dialogs.store'
import { fetcherApi } from '../lib/client'
import { parseCurl } from '../lib/curl'
import { importOpenApi, isOpenApiDoc, parseSpecText } from '../lib/openapi'
import { newRequest } from '../lib/request'
import { flattenCollections } from '../lib/tree'
import { importJson } from '../lib/transfer'
import { useSession } from '../session.store'
import { errorMessage, toast } from '../toast'
import { Button, Callout, Field, Modal, Segmented } from './ui'

type Format = 'auto' | 'curl' | 'openapi' | 'json'

type Parsed =
  | { kind: 'request'; label: string; request: RequestDef; warnings: string[] }
  | { kind: 'bulk'; label: string; result: ImportResult }

async function analyse(text: string, format: Format): Promise<{ parsed?: Parsed; detected?: string; error?: string }> {
  const t = text.trim()
  if (!t) return {}
  let fmt = format
  if (fmt === 'auto') {
    if (/^curl(\.exe)?\s/i.test(t) || /^sudo\s+curl\s/i.test(t)) fmt = 'curl'
    else if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const doc = JSON.parse(t)
        fmt = doc && !Array.isArray(doc) && isOpenApiDoc(doc) ? 'openapi' : 'json'
      } catch {
        fmt = 'json'
      }
    } else {
      try {
        const doc = await parseSpecText(t)
        fmt = isOpenApiDoc(doc) ? 'openapi' : 'json'
      } catch {
        fmt = 'json'
      }
    }
  }
  try {
    if (fmt === 'curl') {
      const r = parseCurl(t)
      if (!r.ok) return { error: r.error, detected: 'cURL command' }
      return { detected: 'cURL command', parsed: { kind: 'request', label: `${r.request.method} ${r.request.url}`, request: r.request, warnings: r.warnings } }
    }
    if (fmt === 'openapi') {
      const r = await importOpenApi(t)
      return { detected: 'OpenAPI / Swagger', parsed: { kind: 'bulk', label: r.summary, result: r } }
    }
    const r = importJson(t)
    if (r.requests && r.requests.length === 1 && !r.folder) return { detected: 'JSON request definition', parsed: { kind: 'request', label: `${r.requests[0].method} ${r.requests[0].url}`, request: r.requests[0], warnings: r.warnings } }
    return { detected: r.folder ? 'JSON collection' : 'JSON requests', parsed: { kind: 'bulk', label: r.summary, result: r } }
  } catch (e) {
    return { error: errorMessage(e), detected: fmt === 'openapi' ? 'OpenAPI / Swagger' : fmt === 'json' ? 'JSON' : 'cURL command' }
  }
}

export function ImportDialog() {
  const { importOpen, setImportOpen } = useDialogs()
  const data = useDataStore()
  const openRequest = useSession((s) => s.openRequest)
  const setPanel = useSession((s) => s.setPanel)
  const setActiveEnv = useSession((s) => s.setActiveEnv)
  const activeEnvId = useSession((s) => s.activeEnvId)
  const [text, setText] = useState('')
  const [format, setFormat] = useState<Format>('auto')
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyse>>>({})
  const [parentId, setParentId] = useState('')
  const [specUrl, setSpecUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!importOpen) return
    setText('')
    setAnalysis({})
    setSpecUrl('')
    setFormat('auto')
  }, [importOpen])

  useEffect(() => {
    let live = true
    const id = setTimeout(async () => {
      const a = await analyse(text, format)
      if (live) setAnalysis(a)
    }, 250)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [text, format])

  const flat = useMemo(() => flattenCollections(data.collections), [data.collections])

  const fetchSpec = async () => {
    if (!specUrl.trim()) return
    setFetching(true)
    try {
      const out = await fetcherApi.execute(newRequest({ url: specUrl.trim(), headers: [{ id: 'a', key: 'Accept', value: 'application/json, application/yaml, text/yaml, */*', enabled: true }] }), activeEnvId, { timeoutMs: 20_000, followRedirects: true, maxRedirects: 5, insecureTls: false }, new AbortController().signal)
      if (!out.ok) toast.error('Could not download the specification', out.error.message)
      else if (out.response.status >= 400) toast.error('Could not download the specification', `The server answered ${out.response.status} ${out.response.statusText}.`)
      else if (out.response.bodyText === undefined || out.response.bodyTextTruncated) toast.error('The response is not a text document or is too large to import')
      else {
        setText(out.response.bodyText)
        toast.success('Specification downloaded', `${out.response.sizeBytes.toLocaleString()} bytes`)
      }
    } catch (e) {
      toast.error('Download failed', errorMessage(e))
    } finally {
      setFetching(false)
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 20 * 1024 * 1024) return void toast.error('File is too large', 'Import files up to 20 MB.')
    setText(await f.text())
    toast.info('File loaded', f.name)
  }

  const p = analysis.parsed

  const doImport = async (mode: 'editor' | 'collection') => {
    if (!p) return
    setBusy(true)
    try {
      if (p.kind === 'request' && mode === 'editor') {
        openRequest(p.request, null)
        toast.success('Imported into the editor', p.label)
        setImportOpen(false)
        return
      }
      const result: ImportResult = p.kind === 'request' ? { requests: [p.request], summary: '1 request', warnings: p.warnings } : p.result
      const res = await data.applyImport(result, parentId || null)
      setPanel('collections')
      setImportOpen(false)
      toast.success(`Imported ${res.requests} request${res.requests === 1 ? '' : 's'}`, res.environmentId ? 'An environment with the API’s variables was created too.' : undefined, res.environmentId ? { label: 'Use environment', run: () => setActiveEnv(res.environmentId) } : undefined)
    } catch (e) {
      toast.error('Import failed', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={importOpen}
      onOpenChange={setImportOpen}
      title="Import"
      description="Paste a cURL command, an OpenAPI / Swagger document (JSON or YAML), or JSON request definitions (including Postman v2.1 collections)."
      width={660}
      footer={
        <>
          <Button onClick={() => setImportOpen(false)}>Cancel</Button>
          {p?.kind === 'request' && (
            <>
              <Button onClick={() => doImport('collection')} loading={busy}>
                Save to collection
              </Button>
              <Button variant="primary" onClick={() => doImport('editor')} loading={busy}>
                Open in editor
              </Button>
            </>
          )}
          {p?.kind === 'bulk' && (
            <Button variant="primary" onClick={() => doImport('collection')} loading={busy}>
              Import
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Format>
            value={format}
            onChange={setFormat}
            options={[
              { id: 'auto', label: 'Auto-detect' },
              { id: 'curl', label: 'cURL' },
              { id: 'openapi', label: 'OpenAPI / Swagger' },
              { id: 'json', label: 'JSON' },
            ]}
          />
          <input ref={file} type="file" accept=".json,.yaml,.yml,.txt,.sh,application/json,text/yaml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button size="sm" onClick={() => file.current?.click()}>
            <FileUp size={13} /> Choose file
          </Button>
        </div>

        <textarea
          className="af-input af-mono af-textarea"
          style={{ height: 190, resize: 'vertical' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`curl -X GET "https://api.example.com/users" -H "Authorization: Bearer {{TOKEN}}"\n\n…or paste an OpenAPI/Swagger spec, or JSON request definitions`}
          spellCheck={false}
          aria-label="Content to import"
        />

        <div className="flex items-end gap-2">
          <Field label="Or download an OpenAPI spec from a URL" className="flex-1">
            <div className="relative">
              <Globe size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--af-text-3)]" />
              <input className="af-input af-mono" style={{ paddingLeft: 24 }} value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} placeholder="https://petstore3.swagger.io/api/v3/openapi.json" onKeyDown={(e) => e.key === 'Enter' && fetchSpec()} />
            </div>
          </Field>
          <Button onClick={fetchSpec} loading={fetching} disabled={!specUrl.trim()}>
            Fetch
          </Button>
        </div>

        {analysis.error && (
          <Callout tone="err" icon={<AlertTriangle size={15} className="text-[var(--af-err)]" />}>
            <div className="text-[11.5px] font-medium text-[var(--af-text)]">{analysis.detected ? `Could not read this as ${analysis.detected}` : 'Could not read this'}</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--af-text-2)]">{analysis.error}</div>
          </Callout>
        )}
        {p && (
          <Callout tone="ok" icon={<CheckCircle2 size={15} className="text-[var(--af-ok)]" />}>
            <div className="text-[11.5px] font-semibold text-[var(--af-text)]">Detected: {analysis.detected}</div>
            <div className="af-mono mt-0.5 break-all text-[11.5px] text-[var(--af-text-2)]">{p.label}</div>
            {(p.kind === 'request' ? p.warnings : p.result.warnings).map((w) => (
              <div key={w} className="mt-1 flex gap-1.5 text-[11px] text-[var(--af-warn)]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
              </div>
            ))}
            {p.kind === 'bulk' && p.result.environment && <div className="mt-1 text-[11px] text-[var(--af-text-3)]">An environment “{p.result.environment.name}” with {p.result.environment.variables.length} variables will be created (secret values start empty).</div>}
          </Callout>
        )}
        {!text.trim() && (
          <div className="flex items-center gap-2 text-[11.5px] text-[var(--af-text-3)]">
            <Terminal size={13} /> Tip: pasting a cURL command straight into the URL bar also works.
          </div>
        )}

        {(p?.kind === 'bulk' || p?.kind === 'request') && (
          <Field label="Import into">
            <select className="af-input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Top level</option>
              {flat.map(({ collection, depth }) => (
                <option key={collection.id} value={collection.id}>
                  {'  '.repeat(depth)}
                  {depth ? '↳ ' : ''}
                  {collection.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  )
}
