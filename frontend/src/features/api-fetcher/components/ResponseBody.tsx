import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Download, FoldVertical, Search, UnfoldVertical, Wand2, X } from 'lucide-react'
import type { ExecuteSuccess } from '../types'
import { ancestorIds, DEFAULT_EXPAND, searchJson, tryParseJson, type ExpandState } from '../lib/json'
import { fetcherApi } from '../lib/client'
import { base64ToBlob, downloadBlob, downloadText } from '../lib/download'
import { formatBytes } from '../lib/format'
import { langForContentType } from '../lib/highlight'
import { toast, errorMessage } from '../toast'
import { HeadersView, PreviewView } from './ResponseViews'
import { JsonTree } from './JsonTree'
import { findRawMatches, RawView, toVisualLines } from './RawView'
import { Button, Callout, CopyButton, EmptyState, IconButton, TabBar } from './ui'

type BodyTab = 'pretty' | 'raw' | 'preview' | 'headers'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export async function downloadFullResponse(outcome: ExecuteSuccess): Promise<void> {
  const r = outcome.response
  try {
    const blob = await fetcherApi.downloadResponse(r.responseId)
    downloadBlob(r.filename, new Blob([blob], { type: r.contentType || 'application/octet-stream' }))
    toast.success('Response downloaded', `${r.filename} · ${formatBytes(r.sizeBytes)}`)
  } catch (e) {
    if (r.bodyText !== undefined) {
      downloadText(r.filename, r.bodyText)
      toast.warning('Downloaded the inline copy', `${errorMessage(e)} ${r.bodyTextTruncated ? 'The inline copy is truncated.' : ''}`)
    } else if (r.bodyBase64) {
      downloadBlob(r.filename, base64ToBlob(r.bodyBase64, r.contentType))
    } else toast.error('Download failed', errorMessage(e))
  }
}

export function ResponseBody({ outcome }: { outcome: ExecuteSuccess }) {
  const { response } = outcome
  const text = response.bodyText ?? ''
  const isTextual = response.kind === 'json' || response.kind === 'html' || response.kind === 'xml' || response.kind === 'text'

  const parsed = useMemo(() => {
    if (!isTextual || response.bodyTextTruncated) return null
    if (response.kind !== 'json' && !(response.kind === 'text' && /^\s*[[{]/.test(text) && text.length < 3_000_000)) return null
    const r = tryParseJson(text)
    return r.ok ? r : null
  }, [response.responseId, response.bodyTextTruncated]) // eslint-disable-line react-hooks/exhaustive-deps

  const defaultTab: BodyTab = isTextual ? 'pretty' : response.kind === 'binary' ? 'headers' : 'preview'
  const [tab, setTab] = useState<BodyTab>(defaultTab)
  const [expand, setExpand] = useState<ExpandState>(DEFAULT_EXPAND)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [formatRaw, setFormatRaw] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTab(defaultTab)
    setExpand(DEFAULT_EXPAND)
    setQuery('')
    setMatchIndex(0)
    setFormatRaw(false)
  }, [response.responseId]) // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedQuery = useDebounced(query.trim(), 180)
  const rawText = useMemo(() => (formatRaw && parsed ? JSON.stringify(parsed.value, null, 2) : text), [formatRaw, parsed, text])
  const rawLines = useMemo(() => (tab === 'raw' || (tab === 'pretty' && !parsed) ? toVisualLines(rawText) : []), [tab, parsed, rawText])
  const lang = langForContentType(response.kind, response.contentType)

  const jsonSearch = useMemo(() => (tab === 'pretty' && parsed ? searchJson(parsed.value, debouncedQuery) : { matches: [], capped: false }), [tab, parsed, debouncedQuery])
  const rawSearch = useMemo(() => (rawLines.length ? findRawMatches(rawLines, debouncedQuery) : { matches: [], capped: false }), [rawLines, debouncedQuery])
  const usingTree = tab === 'pretty' && !!parsed
  const matchCount = usingTree ? jsonSearch.matches.length : rawSearch.matches.length
  const capped = usingTree ? jsonSearch.capped : rawSearch.capped

  const reveal = useCallback(
    (index: number) => {
      if (usingTree) {
        const m = jsonSearch.matches[index]
        if (m) {
          const ids = ancestorIds(m.path)
          setExpand((s) => ({ ...s, open: new Set([...s.open, ...ids]), closed: new Set([...s.closed].filter((x) => !ids.includes(x))) }))
        }
      }
      setNonce((n) => n + 1)
    },
    [usingTree, jsonSearch.matches]
  )

  useEffect(() => {
    setMatchIndex(0)
    reveal(0)
  }, [debouncedQuery, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const step = (dir: 1 | -1) => {
    if (!matchCount) return
    const next = (matchIndex + dir + matchCount) % matchCount
    setMatchIndex(next)
    reveal(next)
  }

  const copyAll = () => (parsed ? JSON.stringify(parsed.value, null, 2) : text)
  const searchable = tab === 'pretty' || tab === 'raw'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabBar<BodyTab>
        value={tab}
        onChange={setTab}
        className="!border-b-0"
        tabs={[
          { id: 'pretty', label: 'Pretty' },
          { id: 'raw', label: 'Raw' },
          { id: 'preview', label: 'Preview' },
          { id: 'headers', label: 'Headers', count: response.headers.length },
        ]}
        right={
          <>
            {searchable && isTextual && (
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--af-text-3)]" />
                  <input
                    ref={searchRef}
                    id="af-response-search"
                    className="af-input"
                    style={{ width: 168, height: 24, paddingLeft: 24, paddingRight: query ? 22 : 8 }}
                    placeholder="Search response"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
                      if (e.key === 'Escape') setQuery('')
                    }}
                    aria-label="Search inside response"
                  />
                  {query && (
                    <button type="button" className="af-icon-btn absolute right-0.5 top-0.5" style={{ width: 20, height: 20 }} onClick={() => setQuery('')} aria-label="Clear search">
                      <X size={11} />
                    </button>
                  )}
                </div>
                {debouncedQuery && (
                  <>
                    <span className="af-mono min-w-[48px] text-center text-[10.5px] text-[var(--af-text-3)]">{matchCount ? `${matchIndex + 1}/${matchCount}${capped ? '+' : ''}` : '0/0'}</span>
                    <IconButton label="Previous match" shortcut="Shift+Enter" onClick={() => step(-1)} disabled={!matchCount} style={{ width: 22, height: 22 }}>
                      <ChevronUp size={13} />
                    </IconButton>
                    <IconButton label="Next match" shortcut="Enter" onClick={() => step(1)} disabled={!matchCount} style={{ width: 22, height: 22 }}>
                      <ChevronDown size={13} />
                    </IconButton>
                  </>
                )}
              </div>
            )}
            {usingTree && (
              <>
                <IconButton label="Expand all" onClick={() => setExpand({ depth: Infinity, open: new Set(), closed: new Set() })}>
                  <UnfoldVertical size={14} />
                </IconButton>
                <IconButton label="Collapse all" onClick={() => setExpand({ depth: 1, open: new Set(), closed: new Set() })}>
                  <FoldVertical size={14} />
                </IconButton>
              </>
            )}
            {tab === 'raw' && parsed && (
              <Button size="sm" variant={formatRaw ? 'primary' : 'ghost'} onClick={() => setFormatRaw((f) => !f)} aria-pressed={formatRaw}>
                <Wand2 size={12} /> Format JSON
              </Button>
            )}
            {isTextual && <CopyButton text={copyAll} label={parsed ? 'Copy JSON' : 'Copy response'} message={parsed ? 'JSON copied' : 'Response copied'} />}
            <IconButton label="Download full response" onClick={() => downloadFullResponse(outcome)}>
              <Download size={14} />
            </IconButton>
          </>
        }
      />

      {(response.truncated || response.bodyTextTruncated) && (
        <Callout tone="warn" icon={<AlertTriangle size={14} className="text-[var(--af-warn)]" />} className="mx-2 mb-1 shrink-0 !py-1.5">
          <span className="text-[11.5px]">
            {response.truncated ? `The response is larger than the capture limit; only the first ${formatBytes(response.sizeBytes)} were kept.` : `Showing the first ${formatBytes(text.length)} of ${formatBytes(response.sizeBytes)}; JSON tree view is disabled for partial bodies.`}{' '}
            <button type="button" className="underline" onClick={() => downloadFullResponse(outcome)}>
              Download {response.truncated ? 'captured data' : 'full response'}
            </button>
          </span>
        </Callout>
      )}

      <div className="min-h-0 flex-1 border-t border-[var(--af-border)] bg-[var(--af-sunken)]">
        {tab === 'pretty' &&
          (parsed ? (
            <JsonTree root={parsed.value} expand={expand} onExpandChange={setExpand} query={debouncedQuery} matches={jsonSearch.matches} currentMatch={matchIndex} revealNonce={nonce} />
          ) : isTextual ? (
            response.kind === 'json' && !response.bodyTextTruncated ? (
              <EmptyState icon={<AlertTriangle size={18} />} title="This response is labelled JSON but is not valid JSON" description="Open the Raw tab to read it as text." />
            ) : (
              <RawView lang={lang} lines={rawLines} matches={rawSearch.matches} currentMatch={matchIndex} revealNonce={nonce} />
            )
          ) : (
            <EmptyState title="No text body to pretty-print" description="This response is not text. Use Preview to view it, or download it." />
          ))}
        {tab === 'raw' &&
          (isTextual ? <RawView lang={lang} lines={rawLines} matches={rawSearch.matches} currentMatch={matchIndex} revealNonce={nonce} /> : <EmptyState title="Binary response" description={`${formatBytes(response.sizeBytes)} of ${response.contentType || 'binary'} data. Download it to inspect.`} />)}
        {tab === 'preview' && <PreviewView response={response} onDownload={() => downloadFullResponse(outcome)} />}
        {tab === 'headers' && <div className="h-full bg-[var(--af-panel)]"><HeadersView outcome={outcome} /></div>}
      </div>
    </div>
  )
}
