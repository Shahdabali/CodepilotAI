import React, { memo, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, Copy, Link2 } from 'lucide-react'
import { ancestorIds, buildRows, getAtPath, pathToString, type ExpandState, type JsonMatch, type TreeRow } from '../lib/json'
import { copyText } from '../lib/download'
import { escapeRegExp, useVirtualRows } from '../lib/useVirtual'
import { toast } from '../toast'
import { IconButton } from './ui'

const ROW_H = 20
const INDENT = 14

function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const re = new RegExp(escapeRegExp(query), 'gi')
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m[0] === '') break
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <mark key={i++} className="af-match">
        {m[0]}
      </mark>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

const KIND_CLASS: Record<string, string> = { string: 'af-t-str', number: 'af-t-num', boolean: 'af-t-bool', null: 'af-t-null', object: 'af-t-punc', array: 'af-t-punc' }

interface RowProps {
  row: TreeRow
  top: number
  query: string
  match: JsonMatch | undefined
  isCurrent: boolean
  onToggle: (row: TreeRow) => void
  onCopyPath: (row: TreeRow) => void
  onCopyValue: (row: TreeRow) => void
}

const Row = memo(function Row({ row, top, query, match, isCurrent, onToggle, onCopyPath, onCopyValue }: RowProps) {
  const pad = row.depth * INDENT + 6
  const highlightKey = match?.where === 'key'
  const highlightValue = match?.where === 'value'
  return (
    <div className="af-tree-row" style={{ top, paddingLeft: pad }} data-current={isCurrent || undefined}>
      {row.container ? (
        <button type="button" className="af-tree-toggle" onClick={() => onToggle(row)} aria-label={row.expanded ? 'Collapse' : 'Expand'} aria-expanded={row.expanded}>
          {row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}
      {row.keyLabel !== null &&
        (row.isIndex ? (
          <span className="af-muted" style={{ marginRight: 6 }}>
            {row.keyLabel}:
          </span>
        ) : (
          <>
            <span className="af-t-key">
              &quot;{highlightKey ? <Marked text={row.keyLabel} query={query} /> : row.keyLabel}&quot;
            </span>
            <span className="af-t-punc" style={{ marginRight: 6 }}>
              :
            </span>
          </>
        ))}
      <span className={KIND_CLASS[row.kind]} title={row.fullText}>
        {highlightValue ? <Marked text={row.text} query={query} /> : row.text}
      </span>
      {row.container && !row.expanded && (
        <span className="af-muted" style={{ marginLeft: 8, fontSize: 11 }}>
          {row.childCount} {row.kind === 'array' ? (row.childCount === 1 ? 'item' : 'items') : row.childCount === 1 ? 'key' : 'keys'}
        </span>
      )}
      {row.comma && <span className="af-t-punc">,</span>}
      {!row.closing && (
        <span className="af-tree-actions">
          <IconButton label="Copy path" style={{ width: 20, height: 18 }} onClick={() => onCopyPath(row)}>
            <Link2 size={11} />
          </IconButton>
          <IconButton label="Copy value" style={{ width: 20, height: 18 }} onClick={() => onCopyValue(row)}>
            <Copy size={11} />
          </IconButton>
        </span>
      )}
    </div>
  )
})

interface Props {
  root: unknown
  expand: ExpandState
  onExpandChange: (s: ExpandState) => void
  query: string
  matches: JsonMatch[]
  currentMatch: number
  revealNonce: number
}

export function JsonTree({ root, expand, onExpandChange, query, matches, currentMatch, revealNonce }: Props) {
  const { rows, truncated } = useMemo(() => buildRows(root, expand), [root, expand])
  const v = useVirtualRows(rows.length, ROW_H)
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches])
  const currentId = matches[currentMatch]?.id
  const lastNonce = useRef(revealNonce)

  useEffect(() => {
    if (lastNonce.current === revealNonce || !currentId) return
    const idx = rows.findIndex((r) => r.id === currentId && !r.closing)
    if (idx >= 0) {
      lastNonce.current = revealNonce
      v.scrollToIndex(idx)
    } else if (truncated) {
      // The match sits beyond the row cap (e.g. "Expand all" on a huge document): show just its ancestors instead.
      onExpandChange({ depth: 1, open: new Set(ancestorIds(matches[currentMatch].path)), closed: new Set() })
    } else {
      lastNonce.current = revealNonce
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce, rows, currentId])

  const toggle = (row: TreeRow) => {
    const open = new Set(expand.open)
    const closed = new Set(expand.closed)
    if (row.expanded) {
      open.delete(row.id)
      closed.add(row.id)
    } else {
      closed.delete(row.id)
      open.add(row.id)
    }
    onExpandChange({ ...expand, open, closed })
  }
  const copyPath = async (row: TreeRow) => ((await copyText(pathToString(row.path))) ? toast.success('Path copied', pathToString(row.path)) : toast.error('Copy failed'))
  const copyValue = async (row: TreeRow) => {
    const value = getAtPath(root, row.path)
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    ;(await copyText(text)) ? toast.success('Value copied') : toast.error('Copy failed')
  }

  return (
    <div ref={v.ref} onScroll={v.onScroll} className="af-scroll relative h-full" role="tree" aria-label="JSON response">
      <div style={{ height: v.totalHeight, position: 'relative', minWidth: 'max-content' }}>
        {rows.slice(v.start, v.end).map((row, k) => (
          <Row key={row.id} row={row} top={(v.start + k) * ROW_H} query={query} match={matchById.get(row.id)} isCurrent={row.id === currentId && !row.closing} onToggle={toggle} onCopyPath={copyPath} onCopyValue={copyValue} />
        ))}
      </div>
      {truncated && <div className="sticky bottom-0 bg-[var(--af-warn-soft)] px-3 py-1 text-[11px] text-[var(--af-warn)]">Showing the first 400,000 rows. Download the response to inspect the rest.</div>}
    </div>
  )
}
