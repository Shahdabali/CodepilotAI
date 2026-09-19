import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Braces, ChevronDown, Code2, Copy, Download, Eraser, Globe, MoreHorizontal, Save, Send, Square, Upload } from 'lucide-react'
import { HTTP_METHODS, type Environment, type HttpMethod } from '../types'
import { isDraftDirty, useSession } from '../session.store'
import { useDataStore } from '../data.store'
import { useDialogs } from '../dialogs.store'
import { saveCurrent } from '../actions'
import { parseCurl } from '../lib/curl'
import { toCurl } from '../lib/codegen'
import { copyText } from '../lib/download'
import { formatMs } from '../lib/format'
import { resolveForDisplay, variableState } from '../lib/variables'
import { toast } from '../toast'
import { Button, IconButton, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, MethodBadge, Tip } from './ui'

const VAR_SPLIT = /(\{\{\s*[\w.$-]+\s*\}\})/

function VariableHighlight({ text, env }: { text: string; env: Environment | null }) {
  const parts = text.split(VAR_SPLIT)
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\{\{\s*([\w.$-]+)\s*\}\}$/)
        if (!m) return <React.Fragment key={i}>{p}</React.Fragment>
        const state = variableState(m[1], env)
        return (
          <span key={i} className={state === 'missing' ? 'af-var-missing' : state === 'secret' ? 'af-var-secret' : 'af-var-ok'}>
            {p}
          </span>
        )
      })}
    </>
  )
}

function UrlField({ env, onSend }: { env: Environment | null; onSend: () => void }) {
  const url = useSession((s) => s.draft.url)
  const setUrl = useSession((s) => s.setUrl)
  const openRequest = useSession((s) => s.openRequest)
  const hl = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const syncScroll = () => {
    if (hl.current && input.current) hl.current.scrollLeft = input.current.scrollLeft
  }
  useEffect(syncScroll, [url])

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (/^\s*curl(\.exe)?\s/i.test(text)) {
      e.preventDefault()
      const r = parseCurl(text)
      if (r.ok) {
        openRequest(r.request, null)
        toast.success('Imported cURL command', r.warnings[0] ?? `${r.request.method} ${r.request.url}`)
      } else toast.error('Could not import cURL', r.error)
    }
  }

  return (
    <div className="af-url-wrap">
      <div ref={hl} className="af-url-hl" aria-hidden>
        <VariableHighlight text={url} env={env} />
      </div>
      <input
        ref={input}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onScroll={syncScroll}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) onSend()
        }}
        placeholder="https://api.example.com/users"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        aria-label="Request URL"
        id="af-url-input"
      />
    </div>
  )
}

function Elapsed({ since }: { since: number | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  return <span className="af-mono tabular-nums">{since ? formatMs(now - since) : ''}</span>
}

export function RequestBar({ env }: { env: Environment | null }) {
  const method = useSession((s) => s.draft.method)
  const url = useSession((s) => s.draft.url)
  const sending = useSession((s) => s.sending)
  const sendStartedAt = useSession((s) => s.sendStartedAt)
  const dirty = useSession(isDraftDirty)
  const savedId = useSession((s) => s.savedId)
  const setMethod = useSession((s) => s.setMethod)
  const send = useSession((s) => s.send)
  const cancel = useSession((s) => s.cancel)
  const duplicateDraft = useSession((s) => s.duplicateDraft)
  const setLowerTab = useSession((s) => s.setLowerTab)
  const draft = useSession((s) => s.draft)
  const dialogs = useDialogs()
  const savedExists = useDataStore((s) => (savedId ? s.requests.some((r) => r.id === savedId) : false))

  const resolved = useMemo(() => (url.includes('{{') ? resolveForDisplay(url, env) : null), [url, env])
  const missing = useMemo(() => [...url.matchAll(/\{\{\s*([\w.$-]+)\s*\}\}/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i && variableState(n, env) === 'missing'), [url, env])

  const onClear = () => {
    if (dirty) dialogs.setClearConfirmOpen(true)
    else useSession.getState().newDraft()
  }

  return (
    <div className="border-b border-[var(--af-border)] bg-[var(--af-panel)] px-3 pb-2 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-[1_1_420px] items-center gap-2">
          <Menu>
            <Tip label="HTTP method">
              <MenuTrigger asChild>
                <button type="button" className="af-btn af-btn-lg" style={{ width: 104, justifyContent: 'space-between', background: 'var(--af-sunken)' }} aria-label={`Method ${method}`}>
                  <span className={`af-method af-m-${method}`} style={{ fontSize: 12 }}>
                    {method}
                  </span>
                  <ChevronDown size={13} className="text-[var(--af-text-3)]" />
                </button>
              </MenuTrigger>
            </Tip>
            <MenuContent align="start" style={{ minWidth: 130 }}>
              {HTTP_METHODS.map((m) => (
                <MenuItem key={m} onSelect={() => setMethod(m as HttpMethod)}>
                  <MethodBadge method={m} className="w-14" /> {m === method && <span className="ml-auto text-[10px] text-[var(--af-text-3)]">current</span>}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <div className="af-url-field">
            <UrlField env={env} onSend={() => send()} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sending ? (
            <Button variant="danger" size="lg" onClick={cancel} aria-label="Cancel request" style={{ minWidth: 104 }}>
              <Square size={12} fill="currentColor" /> Cancel <Elapsed since={sendStartedAt} />
            </Button>
          ) : (
            <Tip label="Send request" shortcut="Ctrl+Enter">
              <Button variant="primary" size="lg" onClick={() => send()} disabled={!url.trim()} style={{ minWidth: 92 }}>
                <Send size={14} /> Send
              </Button>
            </Tip>
          )}
          <Tip label={savedId && savedExists ? 'Save changes' : 'Save request'} shortcut="Ctrl+S">
            <Button size="lg" onClick={() => saveCurrent()} className="relative">
              <Save size={14} /> Save
              {dirty && (savedExists || !!url.trim()) && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--af-warn)]" title="Unsaved changes" />}
            </Button>
          </Tip>
          <Tip label="Clear the request">
            <Button size="lg" onClick={onClear} aria-label="Clear request">
              <Eraser size={14} /> <span className="hidden xl:inline">Clear</span>
            </Button>
          </Tip>
          <Tip label="Duplicate as a new request">
            <Button
              size="lg"
              onClick={() => {
                duplicateDraft()
                toast.success('Duplicated', 'Editing an unsaved copy.')
              }}
              aria-label="Duplicate request"
            >
              <Copy size={14} /> <span className="hidden xl:inline">Duplicate</span>
            </Button>
          </Tip>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="More actions" style={{ width: 32, height: 32 }}>
                <MoreHorizontal size={16} />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>Import</MenuLabel>
              <MenuItem icon={<Upload size={14} />} onSelect={() => dialogs.setImportOpen(true)}>
                Import cURL / OpenAPI / JSON…
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Export</MenuLabel>
              <MenuItem
                icon={<Copy size={14} />}
                onSelect={async () => ((await copyText(toCurl(draft, env))) ? toast.success('Copied as cURL', 'Credentials are replaced with placeholders.') : toast.error('Copy failed'))}
              >
                Copy as cURL
              </MenuItem>
              <MenuItem icon={<Braces size={14} />} onSelect={() => dialogs.openExport('request-json')}>
                Request as JSON…
              </MenuItem>
              <MenuItem icon={<Download size={14} />} onSelect={() => dialogs.openExport('curl')}>
                Export dialog…
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Code2 size={14} />} onSelect={() => setLowerTab('code')}>
                Generate code
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      {(resolved !== null || missing.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-[11px]">
          {resolved !== null && (
            <span className="af-mono af-truncate max-w-full text-[var(--af-text-3)]" title={resolved}>
              <Globe size={11} className="mr-1 inline-block -translate-y-px" />
              {resolved}
            </span>
          )}
          {missing.length > 0 && (
            <span className="text-[var(--af-err)]">
              Undefined {missing.length === 1 ? 'variable' : 'variables'}: {missing.map((m) => `{{${m}}}`).join(', ')}
              {env ? ` in “${env.name}”` : ' (no environment selected)'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

