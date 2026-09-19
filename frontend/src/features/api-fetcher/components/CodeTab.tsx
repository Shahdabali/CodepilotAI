import React, { useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { generateCode, LANGUAGES, type LangId } from '../lib/codegen'
import { downloadText } from '../lib/download'
import { highlight } from '../lib/highlight'
import { generateTypes, pascalCase, singularize } from '../lib/typegen'
import { useSession } from '../session.store'
import { toast } from '../toast'
import { useActiveEnv } from './EnvSelector'
import { useResponseJson } from './TypesTab'
import { Badge, Button, CopyButton, Toggle } from './ui'

const FILE_NAMES: Record<LangId, string> = {
  'js-fetch': 'request.mjs',
  'js-axios': 'request.mjs',
  'ts-fetch': 'request.ts',
  'py-requests': 'request.py',
  'py-httpx': 'request.py',
  curl: 'request.sh',
  java: 'ApiRequest.java',
  csharp: 'Program.cs',
  go: 'main.go',
  php: 'request.php',
}

export function rootNameFor(url: string, isArray: boolean): string {
  const path = url.split(/[?#]/)[0].replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
  const segs = path.split('/').filter((s) => s && !/^\d+$/.test(s) && !s.includes('{{') && !s.startsWith(':'))
  const last = segs[segs.length - 1]
  if (!last) return isArray ? 'Items' : 'Root'
  return pascalCase(isArray ? last : singularize(last))
}

export function CodeTab() {
  const draft = useSession((s) => s.draft)
  const lang = useSession((s) => s.codeLang)
  const setLang = useSession((s) => s.setCodeLang)
  const env = useActiveEnv()
  const json = useResponseJson()
  const [includeTypes, setIncludeTypes] = useState(true)
  const [nonce, setNonce] = useState(0)
  const language = LANGUAGES.find((l) => l.id === lang) ?? LANGUAGES[0]

  const code = useMemo(() => {
    const root = rootNameFor(draft.url, Array.isArray(json?.value))
    const typesBlock = lang === 'ts-fetch' && includeTypes && json ? generateTypes(json.value, 'ts-interface', root) : undefined
    return generateCode(draft, lang, env, { responseIsJson: !!json, typesBlock, rootType: Array.isArray(json?.value) ? `${pascalCase(root)}Item[]`.replace(/Item\[\]$/, 'Item[]') : pascalCase(root) })
    // nonce forces a fresh generation when the user presses Regenerate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, lang, env, json, includeTypes, nonce])

  const placeholders = useMemo(() => [...new Set(code.match(/YOUR_[A-Z0-9_]+/g) ?? [])], [code])
  const html = useMemo(() => highlight(code, language.hl), [code, language.hl])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--af-border)] px-3 py-1.5">
        <label className="flex items-center gap-2 text-[11px] text-[var(--af-text-3)]">
          Language
          <select className="af-input" style={{ width: 178 }} value={lang} onChange={(e) => setLang(e.target.value as LangId)} aria-label="Code language">
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        {lang === 'ts-fetch' && json && (
          <div className="ml-1">
            <Toggle checked={includeTypes} onChange={setIncludeTypes} label="Include response types" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNonce((n) => n + 1)
              toast.success('Code regenerated', 'Reflects the current request and environment.')
            }}
          >
            <RefreshCw size={13} /> Regenerate
          </Button>
          <CopyButton text={code} label="Copy code" message="Code copied" />
          <Button size="sm" variant="ghost" onClick={() => (downloadText(FILE_NAMES[lang], code), toast.success('Code downloaded', FILE_NAMES[lang]))}>
            <Download size={13} /> Download
          </Button>
        </div>
      </div>
      {placeholders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--af-border)] px-3 py-1.5 text-[11px] text-[var(--af-text-3)]">
          Replace before running:
          {placeholders.map((p) => (
            <Badge key={p} tone="warn" className="af-mono">
              {p}
            </Badge>
          ))}
        </div>
      )}
      <div className="af-scroll min-h-0 flex-1 bg-[var(--af-sunken)]">
        {!draft.url.trim() ? (
          <div className="af-empty h-full">
            <div className="text-[12px] font-medium text-[var(--af-text-2)]">Enter a URL to generate code</div>
            <div className="text-[11.5px]">The snippet updates live as you edit the request.</div>
          </div>
        ) : (
          <pre className="af-code" aria-label={`${language.label} code`} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  )
}
