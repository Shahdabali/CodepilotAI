import React, { useMemo, useState } from 'react'
import { Braces, Download } from 'lucide-react'
import { downloadText } from '../lib/download'
import { highlight } from '../lib/highlight'
import { tryParseJson } from '../lib/json'
import { generateTypes, pascalCase, TYPE_TARGETS, type TypeTarget } from '../lib/typegen'
import { useSession } from '../session.store'
import { toast } from '../toast'
import { rootNameFor } from './CodeTab'
import { Button, CopyButton, EmptyState, Segmented } from './ui'

/** The last response as parsed JSON, when it is one and was captured completely. */
export function useResponseJson(): { value: unknown } | null {
  const outcome = useSession((s) => s.outcome)
  const responseId = outcome?.ok ? outcome.response.responseId : null
  return useMemo(() => {
    if (!outcome?.ok) return null
    const r = outcome.response
    if (r.bodyText === undefined || r.bodyTextTruncated) return null
    if (r.kind !== 'json' && !(r.kind === 'text' && /^\s*[[{]/.test(r.bodyText))) return null
    const parsed = tryParseJson(r.bodyText)
    return parsed.ok ? { value: parsed.value } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId])
}

export function TypesTab() {
  const target = useSession((s) => s.typeTarget)
  const setTarget = useSession((s) => s.setTypeTarget)
  const url = useSession((s) => s.draft.url)
  const bodyJson = useSession((s) => s.draft.body.json)
  const bodyMode = useSession((s) => s.draft.body.mode)
  const responseJson = useResponseJson()
  const [source, setSource] = useState<'response' | 'request'>('response')
  const [nameOverride, setNameOverride] = useState<string | null>(null)

  const requestJson = useMemo(() => {
    if (bodyMode !== 'json' || !bodyJson.trim()) return null
    const r = tryParseJson(bodyJson)
    return r.ok ? { value: r.value } : null
  }, [bodyMode, bodyJson])

  const active = source === 'response' ? responseJson : requestJson
  const suggested = useMemo(() => (active ? rootNameFor(url, Array.isArray(active.value)) : 'Root'), [active, url])
  const rootName = nameOverride ?? suggested
  const t = TYPE_TARGETS.find((x) => x.id === target) ?? TYPE_TARGETS[0]

  const output = useMemo(() => {
    if (!active) return ''
    try {
      return generateTypes(active.value, target, pascalCase(rootName))
    } catch (e) {
      return `// Could not generate types: ${(e as Error).message}`
    }
  }, [active, target, rootName])
  const html = useMemo(() => highlight(output, t.hl === 'json' ? 'json' : t.hl), [output, t.hl])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--af-border)] px-3 py-1.5">
        <Segmented options={[{ id: 'response', label: 'From response' }, { id: 'request', label: 'From request body' }]} value={source} onChange={setSource} />
        <select className="af-input" style={{ width: 190 }} value={target} onChange={(e) => setTarget(e.target.value as TypeTarget)} aria-label="Type output">
          {TYPE_TARGETS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--af-text-3)]">
          Root name
          <input className="af-input af-mono" style={{ width: 130 }} value={rootName} onChange={(e) => setNameOverride(e.target.value)} spellCheck={false} />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton text={output} label="Copy types" message="Types copied" />
          <Button size="sm" variant="ghost" disabled={!output} onClick={() => (downloadText(`types.${t.ext}`, output, t.ext === 'json' ? 'application/json' : 'text/plain'), toast.success('Types downloaded', `types.${t.ext}`))}>
            <Download size={13} /> Download
          </Button>
        </div>
      </div>
      <div className="af-scroll min-h-0 flex-1 bg-[var(--af-sunken)]">
        {active ? (
          <pre className="af-code" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <EmptyState
            icon={<Braces size={18} />}
            title={source === 'response' ? 'No JSON response to generate types from' : 'The request body is not valid JSON'}
            description={source === 'response' ? 'Send a request that returns JSON (fully captured), and TypeScript interfaces, Python dataclasses or a JSON Schema will be generated from the real data.' : 'Set the body type to JSON and fix any validation errors first.'}
          />
        )}
      </div>
    </div>
  )
}
