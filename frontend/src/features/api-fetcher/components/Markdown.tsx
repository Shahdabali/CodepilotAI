import React from 'react'
import { PlayCircle } from 'lucide-react'
import { highlight, type HlLang } from '../lib/highlight'
import { Button, CopyButton } from './ui'

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
    if (link)
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      )
    return <React.Fragment key={key}>{part}</React.Fragment>
  })
}

const LANG_MAP: Record<string, HlLang> = { js: 'javascript', javascript: 'javascript', ts: 'typescript', typescript: 'typescript', py: 'python', python: 'python', json: 'json', bash: 'shell', sh: 'shell', shell: 'shell', curl: 'shell', java: 'java', csharp: 'csharp', cs: 'csharp', go: 'go', php: 'php', xml: 'xml', html: 'xml' }

function TextBlock({ text, id }: { text: string; id: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length) out.push(<p key={`${id}-p${out.length}`}>{inline(para.join(' '), `${id}-p${out.length}`)}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag key={`${id}-l${out.length}`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `${id}-l${out.length}-${i}`)}</li>
        ))}
      </Tag>
    )
    list = null
  }
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (bullet || numbered) {
      flushPara()
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)![1])
    } else if (heading) {
      flushPara()
      flushList()
      out.push(<h3 key={`${id}-h${out.length}`}>{inline(heading[1], `${id}-h${out.length}`)}</h3>)
    } else if (line.trim() === '') {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <>{out}</>
}

export function looksLikeRequestJson(code: string): boolean {
  try {
    const o = JSON.parse(code)
    return !!o && typeof o === 'object' && !Array.isArray(o) && typeof o.url === 'string'
  } catch {
    return false
  }
}

/** Renders assistant output as React elements. Nothing from the model is ever injected as raw HTML. */
export function Markdown({ text, onUseRequest }: { text: string; onUseRequest?: (json: string) => void }) {
  const segments: Array<{ type: 'text'; value: string } | { type: 'code'; lang: string; value: string }> = []
  const fence = /```([\w+-]*)[ \t]*\n([\s\S]*?)(?:```|$)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = fence.exec(text))) {
    if (m.index > last) segments.push({ type: 'text', value: text.slice(last, m.index) })
    segments.push({ type: 'code', lang: (m[1] || '').toLowerCase(), value: m[2].replace(/\n$/, '') })
    last = m.index + m[0].length
    if (m[0].length === 0) fence.lastIndex++
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })

  return (
    <div className="af-prose text-[12px] leading-relaxed">
      {segments.map((s, i) =>
        s.type === 'text' ? (
          <TextBlock key={i} text={s.value} id={`t${i}`} />
        ) : (
          <div key={i} className="my-2 overflow-hidden rounded-md border border-[var(--af-border)] bg-[var(--af-sunken)]">
            <div className="flex items-center gap-1 border-b border-[var(--af-border)] px-2 py-0.5">
              <span className="af-mono text-[10.5px] text-[var(--af-text-3)]">{s.lang || 'text'}</span>
              <div className="ml-auto flex items-center gap-1">
                {onUseRequest && s.lang === 'json' && looksLikeRequestJson(s.value) && (
                  <Button size="sm" variant="primary" onClick={() => onUseRequest(s.value)}>
                    <PlayCircle size={12} /> Use as request
                  </Button>
                )}
                <CopyButton text={s.value} label="Copy code" />
              </div>
            </div>
            <pre className="af-code !py-2" style={{ overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: highlight(s.value, LANG_MAP[s.lang] ?? 'text') }} />
          </div>
        )
      )}
    </div>
  )
}
