import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A small, dependency-free Markdown renderer for model answers and GitHub READMEs.
 *
 * It builds React elements only — nothing from the source is ever injected as HTML, and every URL goes
 * through `resolveUrl` (http/https/mailto/#anchor only), so a hostile README cannot run script or load
 * `javascript:` links. Raw HTML in READMEs is reduced to its text; <img>, <br> and headings are kept.
 */

export interface MarkdownProps {
  text: string
  /** Rewrite relative links/images (e.g. README paths → raw.githubusercontent). Return null to drop the URL. */
  resolveUrl?: (url: string, kind: 'link' | 'image') => string | null
  className?: string
}

const SAFE_URL = /^(https?:|mailto:|#)/i

function defaultResolve(url: string): string | null {
  return SAFE_URL.test(url.trim()) ? url.trim() : null
}

/* ── HTML that READMEs rely on ─────────────────────────────────────────────── */

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return m ? (m[2] ?? m[3]) : undefined
}

function htmlToMarkdown(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, (whole, img: string) => {
      const href = attr(whole.slice(0, whole.indexOf('>') + 1), 'href')
      const s = attr(img, 'src')
      if (!s) return ''
      const inner = `![${attr(img, 'alt') ?? ''}](${s})`
      return href ? `[${inner}](${href})` : inner
    })
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const s = attr(tag, 'src')
      return s ? `![${attr(tag, 'alt') ?? ''}](${s})` : ''
    })
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (whole, inner: string) => {
      const href = attr(whole.slice(0, whole.indexOf('>') + 1), 'href')
      const text = inner.replace(/<[^>]+>/g, '').trim()
      return href && text ? `[${text}](${href})` : text
    })
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_w, n: string, inner: string) => `\n\n${'#'.repeat(Number(n))} ${inner.replace(/<[^>]+>/g, '').trim()}\n\n`)
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<\/(p|div|details|summary|table|tr|li|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<\/?(p|div|span|picture|source|center|details|summary|table|thead|tbody|tr|td|th|kbd|sub|sup|b|i|em|strong|u|s|ul|ol|li|blockquote|section|article|header|footer|nav|figure|figcaption|font|small|big|mark)\b[^>]*>/gi, '')
}

/* ── Inline ────────────────────────────────────────────────────────────────── */

// Order matters: linked image, image, link, code, bold, italic, strike, autolink, bare URL.
const INLINE =
  /(\[!\[[^\]]*\]\([^)\s]+\)\]\([^)\s]+\)|!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)|\[[^\]]+\]\([^)\s]+(?:\s+"[^"]*")?\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|(?<![\w])_[^_\s][^_\n]*_(?![\w])|~~[^~\n]+~~|<https?:\/\/[^>\s]+>|https?:\/\/[^\s<>)\]]+)/g

function Inline({ text, resolveUrl, k }: { text: string; resolveUrl: NonNullable<MarkdownProps['resolveUrl']>; k: string }) {
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  let n = 0
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${k}-${n++}`

    let node: React.ReactNode = tok
    let mm: RegExpMatchArray | null
    if ((mm = tok.match(/^\[(!\[[^\]]*\]\([^)\s]+\))\]\(([^)\s]+)\)$/))) {
      const href = resolveUrl(mm[2], 'link')
      const img = <Inline key={`${key}i`} text={mm[1]} resolveUrl={resolveUrl} k={`${key}i`} />
      node = href ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {img}
        </a>
      ) : (
        img
      )
    } else if ((mm = tok.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/))) {
      const src = resolveUrl(mm[2], 'image')
      node = src ? <img key={key} src={src} alt={mm[1]} loading="lazy" referrerPolicy="no-referrer" /> : mm[1] ? <span key={key}>{mm[1]}</span> : null
    } else if ((mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/))) {
      const href = resolveUrl(mm[2], 'link')
      node = href ? (
        <a key={key} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer nofollow">
          <Inline text={mm[1]} resolveUrl={resolveUrl} k={key} />
        </a>
      ) : (
        <Inline key={key} text={mm[1]} resolveUrl={resolveUrl} k={key} />
      )
    } else if (tok.startsWith('`')) {
      node = <code key={key}>{tok.slice(1, -1)}</code>
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      node = (
        <strong key={key}>
          <Inline text={tok.slice(2, -2)} resolveUrl={resolveUrl} k={key} />
        </strong>
      )
    } else if (tok.startsWith('~~')) {
      node = (
        <del key={key}>
          <Inline text={tok.slice(2, -2)} resolveUrl={resolveUrl} k={key} />
        </del>
      )
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      node = (
        <em key={key}>
          <Inline text={tok.slice(1, -1)} resolveUrl={resolveUrl} k={key} />
        </em>
      )
    } else if (tok.startsWith('<')) {
      const href = resolveUrl(tok.slice(1, -1), 'link')
      node = href ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {tok.slice(1, -1)}
        </a>
      ) : (
        tok
      )
    } else {
      const href = resolveUrl(tok, 'link')
      node = href ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {tok}
        </a>
      ) : (
        tok
      )
    }
    out.push(node)
    last = m.index + tok.length
    if (tok.length === 0) INLINE.lastIndex++
  }
  if (last < text.length) out.push(text.slice(last))

  // Hard line breaks ("  \n") inside a paragraph.
  const nodes: React.ReactNode[] = out.flatMap((o, i): React.ReactNode[] =>
    typeof o === 'string'
      ? o.split(/ {2,}\n/).flatMap((part, j, arr): React.ReactNode[] => (j < arr.length - 1 ? [part, <br key={`${k}-br-${i}-${j}`} />] : [part]))
      : [o]
  )
  return <>{nodes}</>
}

/* ── Blocks ────────────────────────────────────────────────────────────────── */

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="cp-code">
      <div className="cp-code-bar">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(
              () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1400)
              },
              () => {}
            )
          }}
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

type Block =
  | { t: 'code'; lang: string; code: string }
  | { t: 'md'; text: string }

function splitFences(text: string): Block[] {
  const blocks: Block[] = []
  const fence = /^([ \t]*)(`{3,}|~{3,})[ \t]*([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:^\1?\2[ \t]*$|(?![\s\S]))/gm
  let last = 0
  let m: RegExpExecArray | null
  while ((m = fence.exec(text))) {
    if (m.index > last) blocks.push({ t: 'md', text: text.slice(last, m.index) })
    blocks.push({ t: 'code', lang: m[3].toLowerCase(), code: m[4].replace(/\n$/, '') })
    last = m.index + m[0].length
    if (m[0].length === 0) fence.lastIndex++
  }
  if (last < text.length) blocks.push({ t: 'md', text: text.slice(last) })
  return blocks
}

interface ListItem {
  text: string
  checked?: boolean
  children: ListNode | null
}
interface ListNode {
  ordered: boolean
  items: ListItem[]
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}

function MarkdownBlock({ text, id, resolveUrl }: { text: string; id: string; resolveUrl: NonNullable<MarkdownProps['resolveUrl']> }) {
  const lines = htmlToMarkdown(text).split('\n')
  const out: React.ReactNode[] = []
  let para: string[] = []
  let i = 0

  const flushPara = () => {
    if (!para.length) return
    const key = `${id}-p${out.length}`
    out.push(
      <p key={key}>
        <Inline text={para.join('\n')} resolveUrl={resolveUrl} k={key} />
      </p>
    )
    para = []
  }

  const renderList = (node: ListNode, key: string): React.ReactNode => {
    const Tag = node.ordered ? 'ol' : 'ul'
    return (
      <Tag key={key}>
        {node.items.map((it, idx) => (
          <li key={idx} className={it.checked !== undefined ? 'cp-task' : undefined}>
            {it.checked !== undefined && <input type="checkbox" checked={it.checked} readOnly tabIndex={-1} aria-label={it.checked ? 'done' : 'not done'} />}
            <Inline text={it.text} resolveUrl={resolveUrl} k={`${key}-${idx}`} />
            {it.children && renderList(it.children, `${key}-${idx}c`)}
          </li>
        ))}
      </Tag>
    )
  }

  const listMarker = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      flushPara()
      i++
      continue
    }

    // Heading
    const h = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/)
    if (h) {
      flushPara()
      const level = h[1].length
      const key = `${id}-h${out.length}`
      const Tag = `h${level}` as 'h1'
      out.push(
        <Tag key={key}>
          <Inline text={h[2]} resolveUrl={resolveUrl} k={key} />
        </Tag>
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flushPara()
      out.push(<hr key={`${id}-hr${out.length}`} />)
      i++
      continue
    }

    // Table: header row + separator row
    if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      flushPara()
      const head = parseTableRow(trimmed)
      const aligns = parseTableRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'))
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        rows.push(parseTableRow(lines[i]))
        i++
      }
      const key = `${id}-t${out.length}`
      out.push(
        <div key={key} className="cp-table-wrap">
          <table>
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci} style={{ textAlign: aligns[ci] as 'left' }}>
                    <Inline text={c} resolveUrl={resolveUrl} k={`${key}h${ci}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, ci) => (
                    <td key={ci} style={{ textAlign: aligns[ci] as 'left' }}>
                      <Inline text={r[ci] ?? ''} resolveUrl={resolveUrl} k={`${key}r${ri}c${ci}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushPara()
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      const key = `${id}-q${out.length}`
      out.push(
        <blockquote key={key}>
          <MarkdownBlock text={quote.join('\n')} id={key} resolveUrl={resolveUrl} />
        </blockquote>
      )
      continue
    }

    // List (one nesting level per 2+ spaces of indent)
    if (listMarker.test(line)) {
      flushPara()
      const root: ListNode = { ordered: /\d/.test(line.match(listMarker)![2]), items: [] }
      const stack: Array<{ indent: number; node: ListNode }> = [{ indent: line.match(listMarker)![1].length, node: root }]
      while (i < lines.length) {
        const m = lines[i].match(listMarker)
        if (!m) {
          // Lazy continuation of the previous item
          if (lines[i].trim() !== '' && /^\s{2,}\S/.test(lines[i]) && stack[stack.length - 1].node.items.length) {
            const items = stack[stack.length - 1].node.items
            items[items.length - 1].text += ' ' + lines[i].trim()
            i++
            continue
          }
          break
        }
        const indent = m[1].length
        while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop()
        let top = stack[stack.length - 1]
        if (indent > top.indent + 1) {
          const parentItems = top.node.items
          const parent = parentItems[parentItems.length - 1]
          if (parent) {
            parent.children = parent.children ?? { ordered: /\d/.test(m[2]), items: [] }
            stack.push({ indent, node: parent.children })
            top = stack[stack.length - 1]
          }
        }
        const task = m[3].match(/^\[( |x|X)\]\s+(.*)$/)
        top.node.items.push(task ? { text: task[2], checked: task[1].toLowerCase() === 'x', children: null } : { text: m[3], children: null })
        i++
      }
      out.push(renderList(root, `${id}-l${out.length}`))
      continue
    }

    para.push(trimmed)
    i++
  }
  flushPara()
  return <>{out}</>
}

export function Markdown({ text, resolveUrl, className }: MarkdownProps) {
  const resolve = React.useCallback(
    (url: string, kind: 'link' | 'image') => {
      const custom = resolveUrl ? resolveUrl(url, kind) : url
      return custom === null ? null : defaultResolve(custom)
    },
    [resolveUrl]
  )
  const blocks = React.useMemo(() => splitFences(text), [text])
  return (
    <div className={cn('cp-prose', className)}>
      {blocks.map((b, i) =>
        b.t === 'code' ? <CodeBlock key={i} lang={b.lang} code={b.code} /> : <MarkdownBlock key={i} text={b.text} id={`m${i}`} resolveUrl={resolve} />
      )}
    </div>
  )
}
