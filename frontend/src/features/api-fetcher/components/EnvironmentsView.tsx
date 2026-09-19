import React, { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Eye, EyeOff, Layers, Lock, Plus, Trash2 } from 'lucide-react'
import type { EnvVarInput, Environment } from '../types'
import { useDataStore } from '../data.store'
import { useSession } from '../session.store'
import { DYNAMIC_VARIABLES } from '../lib/variables'
import { shortId } from '../lib/format'
import { errorMessage, toast } from '../toast'
import { Badge, Button, Callout, ConfirmDialog, EmptyState, IconButton, Tip } from './ui'

interface EditRow {
  id: string
  key: string
  value: string
  secret: boolean
  hadSecretValue: boolean
  touched: boolean
}

const KEY_RE = /^[A-Za-z_][\w.-]*$/

const toRows = (env: Environment): EditRow[] =>
  env.variables.map((v) => ({ id: shortId(), key: v.key, value: v.secret ? '' : v.value, secret: v.secret, hadSecretValue: v.secret && v.hasValue, touched: false }))

export function EnvironmentsView() {
  const data = useDataStore()
  const activeEnvId = useSession((s) => s.activeEnvId)
  const setActiveEnv = useSession((s) => s.setActiveEnv)
  const envs = data.environments
  const [selectedId, setSelectedId] = useState<string | null>(activeEnvId ?? envs[0]?.id ?? null)
  const selected = envs.find((e) => e.id === selectedId) ?? null
  const [name, setName] = useState('')
  const [rows, setRows] = useState<EditRow[]>([])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [deleting, setDeleting] = useState<Environment | null>(null)

  useEffect(() => {
    if (!selected && envs.length) setSelectedId(envs[0].id)
  }, [envs, selected])

  useEffect(() => {
    if (selected) {
      setName(selected.name)
      setRows(toRows(selected))
      setRevealed(new Set())
      setErrors([])
    } else {
      setName('')
      setRows([])
    }
  }, [selected?.id, selected?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    if (!selected) return false
    if (name !== selected.name || rows.length !== selected.variables.length) return true
    return rows.some((r, i) => {
      const v = selected.variables[i]
      return !v || r.key !== v.key || r.secret !== v.secret || r.touched || (!r.secret && r.value !== v.value)
    })
  }, [selected, name, rows])

  const update = (id: string, patch: Partial<EditRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const setSecret = (row: EditRow, secret: boolean) => {
    if (!secret && row.hadSecretValue && !row.touched) update(row.id, { secret, value: '', touched: true, hadSecretValue: false })
    else update(row.id, { secret })
  }

  const validate = (): string[] => {
    const out: string[] = []
    const seen = new Set<string>()
    if (!name.trim()) out.push('The environment needs a name.')
    for (const r of rows) {
      const k = r.key.trim()
      if (!k) continue
      if (!KEY_RE.test(k)) out.push(`“${k}” is not a valid variable name (letters, digits, _ . - ; cannot start with a digit).`)
      if (seen.has(k)) out.push(`“${k}” is defined more than once.`)
      seen.add(k)
    }
    return out
  }

  const save = async () => {
    if (!selected) return
    const problems = validate()
    setErrors(problems)
    if (problems.length) return
    const variables: EnvVarInput[] = rows
      .filter((r) => r.key.trim())
      .map((r) => (r.secret ? (r.hadSecretValue && !r.touched ? { key: r.key.trim(), secret: true, keep: true } : { key: r.key.trim(), secret: true, value: r.value }) : { key: r.key.trim(), secret: false, value: r.value }))
    setBusy(true)
    try {
      await data.updateEnvironment(selected.id, name.trim(), variables)
      toast.success('Environment saved', name.trim())
    } catch (e) {
      setErrors([errorMessage(e)])
    } finally {
      setBusy(false)
    }
  }

  const create = async (nm = 'New environment', variables: EnvVarInput[] = [{ key: 'API_URL', value: '', secret: false }, { key: 'API_KEY', secret: true, value: '' }]) => {
    try {
      const e = await data.createEnvironment(nm, variables)
      setSelectedId(e.id)
      return e
    } catch (err) {
      toast.error('Could not create environment', errorMessage(err))
    }
  }

  const createExamples = async () => {
    const dev = await create('Development', [{ key: 'API_URL', value: 'https://dev-api.example.com', secret: false }, { key: 'API_KEY', value: '', secret: true }])
    await create('Production', [{ key: 'API_URL', value: 'https://api.example.com', secret: false }, { key: 'API_KEY', value: '', secret: true }])
    if (dev) setSelectedId(dev.id)
    toast.success('Example environments created', 'Replace the URLs and enter your real API keys. Keys are stored server-side and never shown again.')
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-[var(--af-border)] bg-[var(--af-panel)]">
        <div className="flex h-10 items-center gap-2 border-b border-[var(--af-border)] px-3">
          <h2 className="text-[12px] font-semibold">Environments</h2>
          <IconButton label="New environment" className="ml-auto" onClick={() => create()}>
            <Plus size={15} />
          </IconButton>
        </div>
        <div className="af-scroll min-h-0 flex-1 p-1.5">
          {envs.length === 0 ? (
            <EmptyState icon={<Layers size={18} />} title="No environments" description="Environments hold variables such as API_URL and API_KEY that you can use as {{API_URL}} in any request." action={<Button size="sm" variant="primary" onClick={createExamples}>Create Development + Production</Button>} />
          ) : (
            envs.map((e) => (
              <div key={e.id} className="af-list-item group" data-selected={selectedId === e.id || undefined} role="button" tabIndex={0} onClick={() => setSelectedId(e.id)} onKeyDown={(ev) => ev.key === 'Enter' && setSelectedId(e.id)}>
                <Layers size={14} className={activeEnvId === e.id ? 'text-[var(--af-accent-text)]' : 'text-[var(--af-text-3)]'} />
                <span className="af-truncate min-w-0 flex-1 text-[12px]">{e.name}</span>
                {activeEnvId === e.id && <Badge tone="accent">active</Badge>}
                <span className="af-item-meta text-[10.5px] text-[var(--af-text-3)]">{e.variables.length}</span>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="af-scroll min-h-0 min-w-0 flex-1 bg-[var(--af-bg)]">
        {!selected ? (
          <EmptyState icon={<Layers size={20} />} title="Select or create an environment" description="Switch between Development and Production with one click, and keep secrets out of your requests." />
        ) : (
          <div className="mx-auto max-w-[860px] space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <input className="af-input" style={{ width: 260, height: 32, fontSize: 14, fontWeight: 600 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Environment name" />
              {activeEnvId === selected.id ? (
                <Badge tone="accent">
                  <Check size={11} /> Active
                </Badge>
              ) : (
                <Button size="sm" onClick={() => (setActiveEnv(selected.id), toast.success(`Using “${selected.name}”`))}>
                  Set as active
                </Button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <Tip label="Duplicate">
                  <Button size="sm" onClick={async () => { try { const e = await data.duplicateEnvironment(selected.id); setSelectedId(e.id); toast.success('Environment duplicated', 'Secret values were copied.') } catch (err) { toast.error('Could not duplicate', errorMessage(err)) } }}>
                    <Copy size={13} /> Duplicate
                  </Button>
                </Tip>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(selected)}>
                  <Trash2 size={13} /> Delete
                </Button>
              </div>
            </div>

            <div className="af-panel overflow-hidden">
              <div className="grid items-center gap-2 border-b border-[var(--af-border)] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--af-text-3)]" style={{ gridTemplateColumns: 'minmax(120px,1fr) minmax(160px,1.6fr) 72px 26px' }}>
                <span>Variable</span>
                <span>Value</span>
                <span>Secret</span>
                <span />
              </div>
              {rows.map((r) => {
                const reveal = revealed.has(r.id)
                return (
                  <div key={r.id} className="af-kv-row" style={{ gridTemplateColumns: 'minmax(120px,1fr) minmax(160px,1.6fr) 72px 26px', padding: '0 12px' }}>
                    <input className="af-input" value={r.key} onChange={(e) => update(r.id, { key: e.target.value })} placeholder="API_URL" spellCheck={false} aria-label="Variable name" />
                    <div className="relative min-w-0">
                      <input
                        className="af-input"
                        style={{ paddingRight: r.secret && r.touched ? 28 : undefined }}
                        type={r.secret && !reveal ? 'password' : 'text'}
                        value={r.value}
                        onChange={(e) => update(r.id, { value: e.target.value, touched: true })}
                        placeholder={r.secret ? (r.hadSecretValue && !r.touched ? '•••••••• stored securely (type to replace)' : 'Enter a secret value') : 'Value'}
                        spellCheck={false}
                        autoComplete="off"
                        data-1p-ignore
                        aria-label={`Value of ${r.key || 'variable'}`}
                      />
                      {r.secret && r.touched && r.value && (
                        <button type="button" className="af-icon-btn absolute right-0.5 top-0" style={{ width: 24, height: 24 }} onClick={() => setRevealed((s) => { const n = new Set(s); if (!n.delete(r.id)) n.add(r.id); return n })} aria-label={reveal ? 'Hide' : 'Show'} tabIndex={-1}>
                          {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--af-text-2)]">
                      <input type="checkbox" className="af-check" checked={r.secret} onChange={(e) => setSecret(r, e.target.checked)} />
                      {r.secret && <Lock size={11} className="text-[var(--af-warn)]" />}
                    </label>
                    <IconButton label="Remove variable" tone="danger" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                )
              })}
              <button type="button" className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11.5px] text-[var(--af-accent-text)] hover:bg-[var(--af-hover)]" onClick={() => setRows((rs) => [...rs, { id: shortId(), key: '', value: '', secret: false, hadSecretValue: false, touched: false }])}>
                <Plus size={13} /> Add variable
              </button>
            </div>

            {errors.length > 0 && (
              <Callout tone="err">
                <ul className="list-disc pl-4 text-[11.5px]">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Callout>
            )}

            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={save} loading={busy} disabled={!dirty}>
                Save changes
              </Button>
              <Button variant="ghost" onClick={() => selected && (setName(selected.name), setRows(toRows(selected)), setErrors([]))} disabled={!dirty}>
                Discard
              </Button>
              {dirty && <span className="text-[11px] text-[var(--af-warn)]">Unsaved changes</span>}
            </div>

            <Callout tone="info" icon={<Lock size={14} className="text-[var(--af-info)]" />}>
              <div className="text-[11.5px] leading-relaxed text-[var(--af-text-2)]">
                <b>Secret</b> values are saved on the server and only substituted into requests there. The browser never receives them back, they are masked in history, exports, code samples and AI prompts
                {data.config?.secretsEncryptedAtRest ? ', and they are encrypted at rest.' : '. To encrypt them at rest, set API_FETCHER_ENCRYPTION_KEY on the backend.'}
              </div>
            </Callout>

            <div className="af-panel p-3">
              <h3 className="af-h mb-1.5">Built-in dynamic variables</h3>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {DYNAMIC_VARIABLES.map((v) => (
                  <div key={v.name} className="flex items-baseline gap-2 text-[11.5px]">
                    <code className="af-mono text-[var(--af-syn-var)]">{`{{${v.name}}}`}</code>
                    <span className="text-[var(--af-text-3)]">{v.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        danger
        confirmLabel="Delete environment"
        description="Its variables, including stored secrets, are permanently removed. Requests that use {{variables}} from it will report them as undefined."
        onConfirm={async () => {
          if (!deleting) return
          try {
            await data.deleteEnvironment(deleting.id)
            if (useSession.getState().activeEnvId === deleting.id) setActiveEnv(null)
            setSelectedId(null)
            toast.success('Environment deleted')
          } catch (e) {
            toast.error('Could not delete', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
