import React, { memo, useEffect, useMemo, useRef } from 'react'
import { highlight, type HlLang } from '../lib/highlight'
import { useVirtualRows } from '../lib/useVirtual'

const ROW_H = 20
const CHUNK = 2000

interface VLine {
  text: string
  no: number | null
}

/** Splits text into display rows. Very long lines (e.g. minified JSON) are chunked so no single DOM row is enormous. */
export function toVisualLines(text: string): VLine[] {
  const out: VLine[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
    if (line.length <= CHUNK) out.push({ text: line, no: i + 1 })
    else for (let p = 0; p < line.length; p += CHUNK) out.push({ text: line.slice(p, p + CHUNK), no: p === 0 ? i + 1 : null })
  }
  return out
}

export interface RawMatch {
  line: number
  start: number
  length: number
}

export function findRawMatches(lines: VLine[], query: string, cap = 5000): { matches: RawMatch[]; capped: boolean } {
  const matches: RawMatch[] = []
  if (!query) return { matches, capped: false }
  const q = query.toLowerCase()
  for (let i = 0; i < lines.length; i++) {
    const hay = lines[i].text.toLowerCase()
    let from = 0
    for (;;) {
      const idx = hay.indexOf(q, from)
      if (idx < 0) break
      if (matches.length >= cap) return { matches, capped: true }
      matches.push({ line: i, start: idx, length: q.length })
      from = idx + q.length
    }
  }
  return { matches, capped: false }
}

const RawRow = memo(function RawRow({ text, no, top, lang, ranges, currentStart }: { text: string; no: number | null; top: number; lang: HlLang; ranges: RawMatch[]; currentStart: number | null }) {
  let content: React.ReactNode
  if (ranges.length) {
    const parts: React.ReactNode[] = []
    let last = 0
    ranges.forEach((r, i) => {
      if (r.start > last) parts.push(text.slice(last, r.start))
      parts.push(
        <mark key={i} className="af-match" data-current={currentStart === r.start || undefined}>
          {text.slice(r.start, r.start + r.length)}
        </mark>
      )
      last = r.start + r.length
    })
    if (last < text.length) parts.push(text.slice(last))
    content = parts
  } else {
    content = <span dangerouslySetInnerHTML={{ __html: highlight(text, lang) }} />
  }
  return (
    <div className="af-tree-row" style={{ top }}>
      <span className="af-line-no">{no ?? ''}</span>
      <span>{content}</span>
    </div>
  )
})

interface Props {
  lang: HlLang
  matches: RawMatch[]
  currentMatch: number
  revealNonce: number
  lines: VLine[]
}

export function RawView({ lang, matches, currentMatch, revealNonce, lines }: Props) {
  const v = useVirtualRows(lines.length, ROW_H)
  const byLine = useMemo(() => {
    const map = new Map<number, RawMatch[]>()
    for (const m of matches) {
      const list = map.get(m.line)
      if (list) list.push(m)
      else map.set(m.line, [m])
    }
    return map
  }, [matches])
  const current = matches[currentMatch]
  const lastNonce = useRef(revealNonce)

  useEffect(() => {
    if (lastNonce.current === revealNonce || !current) return
    lastNonce.current = revealNonce
    v.scrollToIndex(current.line)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce, current])

  return (
    <div ref={v.ref} onScroll={v.onScroll} className="af-scroll relative h-full" role="region" aria-label="Raw response body">
      <div style={{ height: v.totalHeight, position: 'relative', minWidth: 'max-content' }}>
        {lines.slice(v.start, v.end).map((l, k) => {
          const idx = v.start + k
          return <RawRow key={idx} text={l.text} no={l.no} top={idx * ROW_H} lang={lang} ranges={byLine.get(idx) ?? []} currentStart={current && current.line === idx ? current.start : null} />
        })}
      </div>
    </div>
  )
}
