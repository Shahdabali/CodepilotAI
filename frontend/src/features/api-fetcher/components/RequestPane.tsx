import React from 'react'
import { AlertTriangle, ChevronDown, Plus } from 'lucide-react'
import { useSession, type RequestTab } from '../session.store'
import { getHeader, newKv } from '../lib/request'
import { AuthEditor } from './AuthEditor'
import { BodyEditor } from './BodyEditor'
import { KeyValueEditor } from './KeyValueEditor'
import { Button, Callout, Field, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, TabBar, Toggle } from './ui'

const HEADER_PRESETS: Array<{ name: string; values: string[] }> = [
  { name: 'Content-Type', values: ['application/json', 'application/x-www-form-urlencoded', 'text/plain', 'application/xml', 'multipart/form-data'] },
  { name: 'Authorization', values: ['Bearer {{API_TOKEN}}', 'Basic {{BASIC_CREDENTIALS}}'] },
  { name: 'Accept', values: ['application/json', '*/*', 'text/html', 'application/xml'] },
  { name: 'User-Agent', values: ['CodePilot-API-Fetcher/1.0', 'Mozilla/5.0 (compatible; ApiFetcher)', 'curl/8.0'] },
  { name: 'Cache-Control', values: ['no-cache', 'max-age=0'] },
  { name: 'Accept-Language', values: ['en-US,en;q=0.9'] },
  { name: 'X-Requested-With', values: ['XMLHttpRequest'] },
]

function ParamsTab() {
  const params = useSession((s) => s.draft.params)
  const setParams = useSession((s) => s.setParams)
  const active = params.filter((p) => p.enabled && p.key).length
  return (
    <div className="af-scroll h-full">
      <KeyValueEditor rows={params} onChange={setParams} keyPlaceholder="Key" valuePlaceholder="Value" />
      <p className="px-3 py-2 text-[11px] text-[var(--af-text-3)]">
        {active > 0 ? `${active} query parameter${active === 1 ? '' : 's'} appended to the URL automatically.` : 'Add parameters such as page = 1 and limit = 20. They are added to the URL as you type, and editing the URL updates this table.'}
      </p>
    </div>
  )
}

function HeadersTab() {
  const headers = useSession((s) => s.draft.headers)
  const setHeaders = useSession((s) => s.setHeaders)
  const addPreset = (name: string, value: string) => {
    const existing = getHeader(headers, name)
    if (existing) setHeaders(headers.map((h) => (h.id === existing.id ? { ...h, value } : h)))
    else setHeaders([...headers, newKv(name, value)])
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--af-border)] px-3 py-1.5">
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm">
              <Plus size={13} /> Add preset <ChevronDown size={12} />
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            {HEADER_PRESETS.map((p, i) => (
              <React.Fragment key={p.name}>
                {i > 0 && <MenuSeparator />}
                <MenuLabel>{p.name}</MenuLabel>
                {p.values.map((v) => (
                  <MenuItem key={v} onSelect={() => addPreset(p.name, v)}>
                    <span className="af-mono text-[11.5px]">{v}</span>
                  </MenuItem>
                ))}
              </React.Fragment>
            ))}
          </MenuContent>
        </Menu>
        <span className="text-[11px] text-[var(--af-text-3)]">Sensitive values (Authorization, API keys, cookies) are masked until you reveal them.</span>
      </div>
      <div className="af-scroll min-h-0 flex-1">
        <KeyValueEditor rows={headers} onChange={setHeaders} keyPlaceholder="Header" valuePlaceholder="Value" suggestKeys maskSensitive />
        <p className="px-3 py-2 text-[11px] text-[var(--af-text-3)]">Default headers (User-Agent, Accept, Accept-Encoding) are added automatically unless you set them here.</p>
      </div>
    </div>
  )
}

function SettingsTab() {
  const prefs = useSession((s) => s.prefs)
  const setPrefs = useSession((s) => s.setPrefs)
  return (
    <div className="af-scroll h-full px-4 py-3">
      <div className="max-w-[520px] space-y-4">
        <p className="text-[11.5px] text-[var(--af-text-3)]">These settings apply to every request you send. They are also available under Settings.</p>
        <Field label="Timeout" hint="The request is aborted if the server has not finished responding in this time.">
          <div className="flex items-center gap-2">
            <input type="number" className="af-input af-mono" style={{ width: 110 }} min={1} max={300} value={Math.round(prefs.timeoutMs / 1000)} onChange={(e) => setPrefs({ timeoutMs: Math.min(300, Math.max(1, Number(e.target.value) || 30)) * 1000 })} />
            <span className="text-[11.5px] text-[var(--af-text-3)]">seconds (max 300)</span>
          </div>
        </Field>
        <Toggle checked={prefs.followRedirects} onChange={(followRedirects) => setPrefs({ followRedirects })} label="Follow redirects" description="Follow 301/302/303/307/308 responses. Credentials are dropped when a redirect leaves the original host." />
        {prefs.followRedirects && (
          <Field label="Maximum redirects">
            <input type="number" className="af-input af-mono" style={{ width: 110 }} min={0} max={20} value={prefs.maxRedirects} onChange={(e) => setPrefs({ maxRedirects: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })} />
          </Field>
        )}
        <Toggle checked={!prefs.insecureTls} onChange={(v) => setPrefs({ insecureTls: !v })} label="Verify TLS certificates" description="Turn off only for trusted development servers with self-signed certificates." />
        {prefs.insecureTls && (
          <Callout tone="warn" icon={<AlertTriangle size={15} className="text-[var(--af-warn)]" />}>
            <div className="text-[11.5px]">Certificate verification is off. Anyone on the network path could read or alter these requests, including credentials.</div>
          </Callout>
        )}
      </div>
    </div>
  )
}

export function RequestPane() {
  const tab = useSession((s) => s.requestTab)
  const setTab = useSession((s) => s.setRequestTab)
  const params = useSession((s) => s.draft.params)
  const headers = useSession((s) => s.draft.headers)
  const bodyMode = useSession((s) => s.draft.body.mode)
  const authType = useSession((s) => s.draft.auth.type)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabBar<RequestTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'params', label: 'Params', count: params.filter((p) => p.enabled && p.key).length },
          { id: 'headers', label: 'Headers', count: headers.filter((h) => h.enabled && h.key).length },
          { id: 'body', label: 'Body', dot: bodyMode !== 'none' },
          { id: 'auth', label: 'Authorization', dot: authType !== 'none' },
          { id: 'settings', label: 'Settings' },
        ]}
      />
      <div className="min-h-0 flex-1">
        {tab === 'params' && <ParamsTab />}
        {tab === 'headers' && <HeadersTab />}
        {tab === 'body' && <BodyEditor />}
        {tab === 'auth' && <AuthEditor />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
