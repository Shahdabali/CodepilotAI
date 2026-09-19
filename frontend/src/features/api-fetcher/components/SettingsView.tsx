import React, { useState } from 'react'
import { AlertTriangle, Bot, Database, Download, Keyboard, Lock, RefreshCw, Server, Trash2, Upload } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useDataStore } from '../data.store'
import { useDialogs } from '../dialogs.store'
import { downloadText } from '../lib/download'
import { formatBytes } from '../lib/format'
import { exportWorkspaceJson } from '../lib/transfer'
import { useSession } from '../session.store'
import { errorMessage, toast } from '../toast'
import { Badge, Button, Callout, ConfirmDialog, Field, Toggle } from './ui'

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="af-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[var(--af-text-3)]">{icon}</span>
        <h2 className="text-[12.5px] font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export function SettingsView() {
  const prefs = useSession((s) => s.prefs)
  const setPrefs = useSession((s) => s.setPrefs)
  const data = useDataStore()
  const dialogs = useDialogs()
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const [confirmHistory, setConfirmHistory] = useState(false)

  return (
    <div className="af-scroll h-full min-w-0 flex-1 bg-[var(--af-bg)]">
      <div className="mx-auto max-w-[820px] space-y-4 p-5">
        <div>
          <h1 className="text-[16px] font-semibold">API Fetcher settings</h1>
          <p className="mt-0.5 text-[12px] text-[var(--af-text-3)]">Defaults for every request you send from this browser.</p>
        </div>

        <Card icon={<Server size={15} />} title="Request defaults">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timeout (seconds)" hint="Requests are aborted after this long. Maximum 300.">
              <input type="number" className="af-input af-mono" style={{ width: 120 }} min={1} max={300} value={Math.round(prefs.timeoutMs / 1000)} onChange={(e) => setPrefs({ timeoutMs: Math.min(300, Math.max(1, Number(e.target.value) || 30)) * 1000 })} />
            </Field>
            <Field label="Maximum redirects" hint="Only used when following redirects.">
              <input type="number" className="af-input af-mono" style={{ width: 120 }} min={0} max={20} value={prefs.maxRedirects} onChange={(e) => setPrefs({ maxRedirects: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })} />
            </Field>
          </div>
          <div className="mt-4 space-y-3">
            <Toggle checked={prefs.followRedirects} onChange={(v) => setPrefs({ followRedirects: v })} label="Follow redirects" description="Credentials are dropped when a redirect leaves the original host, and every hop is re-validated." />
            <Toggle checked={!prefs.insecureTls} onChange={(v) => setPrefs({ insecureTls: !v })} label="Verify TLS certificates" description="Keep this on. Disable only for trusted development servers with self-signed certificates." />
            {prefs.insecureTls && (
              <Callout tone="warn" icon={<AlertTriangle size={14} className="text-[var(--af-warn)]" />}>
                <span className="text-[11.5px]">Certificate verification is off for all requests. Turn it back on when you are done.</span>
              </Callout>
            )}
          </div>
        </Card>

        <Card icon={<Lock size={15} />} title="Security & backend">
          <div className="space-y-2 text-[12px]">
            <div className="flex items-center gap-2">
              <span className="w-[210px] text-[var(--af-text-3)]">Requests are sent by</span>
              <span>The CodePilot backend (server-side proxy). CORS does not apply, and secrets never reach the browser.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[210px] text-[var(--af-text-3)]">Private network access</span>
              {data.config ? (
                data.config.allowPrivateNetwork ? (
                  <Badge tone="warn">Allowed: localhost and LAN addresses are reachable</Badge>
                ) : (
                  <Badge tone="ok">Blocked: only public addresses can be requested</Badge>
                )
              ) : (
                <span className="text-[var(--af-text-3)]">Backend not reachable</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[210px] text-[var(--af-text-3)]">Cloud metadata endpoints</span>
              <Badge tone="ok">Always blocked</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[210px] text-[var(--af-text-3)]">Environment secrets at rest</span>
              {data.config?.secretsEncryptedAtRest ? <Badge tone="ok">Encrypted (AES-256-GCM)</Badge> : <Badge tone="warn">Stored unencrypted (set API_FETCHER_ENCRYPTION_KEY)</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[210px] text-[var(--af-text-3)]">Response capture limit</span>
              <span className="af-mono">{data.config ? formatBytes(data.config.maxResponseBytes) : 'n/a'}</span>
              <span className="text-[var(--af-text-3)]">(larger bodies are truncated safely; the captured part can be downloaded)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[210px] text-[var(--af-text-3)]">History</span>
              <span>Credentials and response bodies are never stored. The last {data.config?.historyLimit ?? 500} requests are kept.</span>
            </div>
          </div>
        </Card>

        <Card icon={<Bot size={15} />} title="AI assistant">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            {data.ai?.configured ? (
              <>
                <Badge tone="ok">Ready</Badge>
                <span>Using {data.ai.providers.map((p) => p.name).join(', ')} · routing: {data.ai.routingMode}</span>
              </>
            ) : (
              <>
                <Badge tone="warn">Not configured</Badge>
                <span className="text-[var(--af-text-2)]">Add a provider key to enable the assistant.</span>
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => void data.refreshAi()}>
                <RefreshCw size={12} /> Refresh
              </Button>
              <Button size="sm" onClick={() => setSettingsOpen(true)}>
                Open AI provider settings
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--af-text-3)]">The assistant shares the app-wide provider configuration. Before anything is sent, credentials, tokens, cookies and secret variable values are removed on the server.</p>
        </Card>

        <Card icon={<Database size={15} />} title="Your data">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => dialogs.setImportOpen(true)}>
              <Upload size={13} /> Import…
            </Button>
            <Button
              onClick={() => {
                downloadText('api-fetcher-workspace.json', exportWorkspaceJson(data.collections, data.requests, false), 'application/json')
                toast.success('Workspace exported', 'Credentials were removed from the file.')
              }}
              disabled={data.requests.length === 0}
            >
              <Download size={13} /> Export all requests
            </Button>
            <Button variant="ghost" onClick={() => setConfirmHistory(true)} disabled={data.history.length === 0}>
              <Trash2 size={13} /> Clear history ({data.history.length})
            </Button>
            <Button variant="ghost" onClick={() => dialogs.setShortcutsOpen(true)}>
              <Keyboard size={13} /> Keyboard shortcuts
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--af-text-3)]">
            {data.collections.length} collections · {data.requests.length} saved requests · {data.environments.length} environments
          </p>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmHistory}
        onOpenChange={setConfirmHistory}
        title="Clear all history?"
        danger
        confirmLabel="Clear history"
        description="This removes every recorded request from history. Saved requests are not affected."
        onConfirm={async () => {
          try {
            await data.clearHistory()
            toast.success('History cleared')
          } catch (e) {
            toast.error('Could not clear history', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
