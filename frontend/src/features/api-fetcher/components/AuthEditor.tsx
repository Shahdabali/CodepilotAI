import React, { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useSession } from '../session.store'
import { fetcherApi } from '../lib/client'
import { defaultAuth } from '../lib/request'
import { isVariableReference } from '../lib/redact'
import { toast, errorMessage } from '../toast'
import type { AuthConfig, AuthType } from '../types'
import { SecretInput } from './KeyValueEditor'
import { Button, Callout, Field } from './ui'

const TYPES: Array<{ id: AuthType; label: string }> = [
  { id: 'none', label: 'No Auth' },
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'apikey', label: 'API Key' },
  { id: 'basic', label: 'Basic Auth' },
  { id: 'oauth2', label: 'OAuth 2.0' },
]

export function AuthEditor() {
  const auth = useSession((s) => s.draft.auth)
  const setAuth = useSession((s) => s.setAuth)
  const activeEnvId = useSession((s) => s.activeEnvId)
  const [fetching, setFetching] = useState(false)

  const patch = (p: Record<string, unknown>) => setAuth({ ...auth, ...p } as AuthConfig)
  const literalSecret =
    (auth.type === 'bearer' && auth.token && !isVariableReference(auth.token)) ||
    (auth.type === 'apikey' && auth.value && !isVariableReference(auth.value)) ||
    (auth.type === 'basic' && auth.password && !isVariableReference(auth.password))

  const getToken = async () => {
    if (auth.type !== 'oauth2') return
    setFetching(true)
    try {
      const r = await fetcherApi.oauthToken(auth, activeEnvId)
      if (!r.ok || !r.accessToken) {
        toast.error('Could not get an access token', r.error)
        return
      }
      setAuth({ ...auth, accessToken: r.accessToken, tokenPrefix: r.tokenType && r.tokenType.toLowerCase() !== 'bearer' ? r.tokenType : 'Bearer', expiresAt: r.expiresIn ? Date.now() + r.expiresIn * 1000 : null })
      toast.success('Access token received', r.expiresIn ? `Expires in ${Math.round(r.expiresIn / 60)} min` : undefined)
    } catch (e) {
      toast.error('Token request failed', errorMessage(e))
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="af-scroll h-full px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="af-auth-type" className="text-[11px] font-medium text-[var(--af-text-2)]">
          Type
        </label>
        <select id="af-auth-type" className="af-input" style={{ width: 200 }} value={auth.type} onChange={(e) => setAuth(defaultAuth(e.target.value as AuthType))}>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="max-w-[560px] space-y-3">
        {auth.type === 'none' && (
          <Callout icon={<KeyRound size={15} className="text-[var(--af-text-3)]" />}>
            <div className="text-[12px] text-[var(--af-text-2)]">This request is sent without authorization. Choose a type above, or add an Authorization header yourself.</div>
          </Callout>
        )}

        {auth.type === 'bearer' && (
          <>
            <Field label="Token" hint="Sent as “Authorization: Bearer <token>”.">
              <SecretInput value={auth.token} onChange={(token) => patch({ token })} placeholder="{{API_TOKEN}}" ariaLabel="Bearer token" />
            </Field>
            <Field label="Prefix">
              <input className="af-input af-mono" style={{ width: 140 }} value={auth.prefix} onChange={(e) => patch({ prefix: e.target.value })} />
            </Field>
          </>
        )}

        {auth.type === 'apikey' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Key name">
                <input className="af-input af-mono" value={auth.key} onChange={(e) => patch({ key: e.target.value })} placeholder="X-API-Key" spellCheck={false} />
              </Field>
              <Field label="Add to">
                <select className="af-input" value={auth.in} onChange={(e) => patch({ in: e.target.value })}>
                  <option value="header">Header</option>
                  <option value="query">Query parameter</option>
                </select>
              </Field>
            </div>
            <Field label="Value">
              <SecretInput value={auth.value} onChange={(value) => patch({ value })} placeholder="{{API_KEY}}" ariaLabel="API key value" />
            </Field>
            {auth.in === 'query' && <Callout tone="warn">Keys in the URL can end up in server logs and browser history. Prefer a header when the API allows it. This tool masks the key in history and code samples.</Callout>}
          </>
        )}

        {auth.type === 'basic' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <input className="af-input af-mono" value={auth.username} onChange={(e) => patch({ username: e.target.value })} spellCheck={false} autoComplete="off" />
            </Field>
            <Field label="Password">
              <SecretInput value={auth.password} onChange={(password) => patch({ password })} ariaLabel="Password" />
            </Field>
          </div>
        )}

        {auth.type === 'oauth2' && (
          <>
            <Field label="Grant type">
              <select className="af-input" style={{ width: 260 }} value={auth.grantType} onChange={(e) => patch({ grantType: e.target.value })}>
                <option value="client_credentials">Client Credentials</option>
                <option value="password">Password (Resource Owner)</option>
                <option value="manual">Use an existing access token</option>
              </select>
            </Field>
            {auth.grantType !== 'manual' && (
              <>
                <Field label="Access Token URL">
                  <input className="af-input af-mono" value={auth.accessTokenUrl} onChange={(e) => patch({ accessTokenUrl: e.target.value })} placeholder="https://auth.example.com/oauth/token" spellCheck={false} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Client ID">
                    <input className="af-input af-mono" value={auth.clientId} onChange={(e) => patch({ clientId: e.target.value })} spellCheck={false} autoComplete="off" />
                  </Field>
                  <Field label="Client Secret">
                    <SecretInput value={auth.clientSecret} onChange={(clientSecret) => patch({ clientSecret })} placeholder="{{CLIENT_SECRET}}" ariaLabel="Client secret" />
                  </Field>
                </div>
                {auth.grantType === 'password' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Username">
                      <input className="af-input af-mono" value={auth.username} onChange={(e) => patch({ username: e.target.value })} spellCheck={false} autoComplete="off" />
                    </Field>
                    <Field label="Password">
                      <SecretInput value={auth.password} onChange={(password) => patch({ password })} ariaLabel="Password" />
                    </Field>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Scope" hint="Space-separated.">
                    <input className="af-input af-mono" value={auth.scope} onChange={(e) => patch({ scope: e.target.value })} placeholder="read write" spellCheck={false} />
                  </Field>
                  <Field label="Send client credentials">
                    <select className="af-input" value={auth.clientAuth} onChange={(e) => patch({ clientAuth: e.target.value })}>
                      <option value="basic">As Basic Auth header</option>
                      <option value="body">In the request body</option>
                    </select>
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="primary" onClick={getToken} loading={fetching} disabled={!auth.accessTokenUrl.trim()}>
                    <ShieldCheck size={14} /> Get new access token
                  </Button>
                  <span className="text-[11px] text-[var(--af-text-3)]">The token request is made by the CodePilot backend, so the client secret is never sent from the browser to a third party.</span>
                </div>
              </>
            )}
            <Field label="Access token" hint={auth.expiresAt ? (auth.expiresAt > Date.now() ? `Expires ${new Date(auth.expiresAt).toLocaleTimeString()}` : 'This token has expired. Get a new one.') : 'Sent as “Authorization: <prefix> <token>”.'}>
              <SecretInput value={auth.accessToken} onChange={(accessToken) => patch({ accessToken, expiresAt: null })} placeholder="{{ACCESS_TOKEN}}" ariaLabel="Access token" />
            </Field>
            <p className="text-[11px] text-[var(--af-text-3)]">Authorization Code and PKCE flows need a browser redirect and are not available here. Paste a token you obtained elsewhere with “Use an existing access token”.</p>
          </>
        )}

        {literalSecret ? (
          <Callout tone="info" icon={<ShieldCheck size={15} className="text-[var(--af-info)]" />}>
            <div className="text-[11.5px] text-[var(--af-text-2)]">
              This credential is typed directly into the request. It is masked in history, exports, code samples and AI prompts, but you can keep it out of saved requests entirely by storing it as a <b>secret variable</b> in Environments and using <code className="af-mono">{'{{NAME}}'}</code> here.
            </div>
          </Callout>
        ) : null}
      </div>
    </div>
  )
}
