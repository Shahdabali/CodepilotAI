export type HlLang = 'json' | 'javascript' | 'typescript' | 'python' | 'shell' | 'java' | 'csharp' | 'go' | 'php' | 'xml' | 'text'

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c])

const KEYWORDS: Record<string, string[]> = {
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'throw', 'new', 'await', 'async', 'import', 'from', 'export', 'default', 'class', 'typeof', 'of', 'in', 'this'],
  typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'throw', 'new', 'await', 'async', 'import', 'from', 'export', 'default', 'class', 'typeof', 'of', 'in', 'this', 'interface', 'type', 'as', 'extends', 'implements'],
  python: ['import', 'from', 'as', 'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'raise', 'in', 'is', 'not', 'and', 'or', 'lambda', 'pass', 'async', 'await'],
  shell: ['curl', 'export', 'echo', 'if', 'then', 'fi', 'else'],
  java: ['import', 'public', 'private', 'protected', 'static', 'void', 'class', 'new', 'return', 'throws', 'final', 'try', 'catch', 'if', 'else', 'for', 'while', 'String', 'int', 'var', 'package'],
  csharp: ['using', 'var', 'new', 'await', 'async', 'class', 'public', 'private', 'static', 'void', 'return', 'if', 'else', 'try', 'catch', 'string', 'int', 'namespace'],
  go: ['package', 'import', 'func', 'return', 'if', 'else', 'for', 'range', 'defer', 'var', 'const', 'type', 'struct', 'go', 'nil', 'err'],
  php: ['function', 'return', 'if', 'else', 'foreach', 'for', 'while', 'new', 'throw', 'try', 'catch', 'echo', 'class', 'public', 'private', 'static', 'use', 'namespace'],
}
const LITERALS = ['true', 'false', 'null', 'None', 'True', 'False', 'undefined', 'NaN', 'nil']

const cache = new Map<string, RegExp>()

function regexFor(lang: HlLang): RegExp {
  const hit = cache.get(lang)
  if (hit) return hit
  const kw = (KEYWORDS[lang] ?? []).join('|')
  const comment = lang === 'python' || lang === 'shell' || lang === 'php' ? String.raw`(?<com>#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)` : String.raw`(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)`
  const parts = [
    comment,
    String.raw`(?<str>"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + '`(?:[^`\\\\]|\\\\.)*`)',
    String.raw`(?<var>\{\{[^}\n]*\}\}|\$[A-Za-z_]\w*)`,
    String.raw`(?<num>-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)`,
    kw ? String.raw`(?<kw>\b(?:${kw})\b)` : '',
    String.raw`(?<lit>\b(?:${LITERALS.join('|')})\b)`,
    String.raw`(?<fn>\b[A-Za-z_]\w*(?=\())`,
    String.raw`(?<punc>[{}()[\],.;:=<>+\-*/!&|?]+)`,
  ].filter(Boolean)
  const re = new RegExp(parts.join('|'), 'g')
  cache.set(lang, re)
  return re
}

const JSON_RE = /(?<key>"(?:[^"\\\n]|\\.)*"(?=\s*:))|(?<str>"(?:[^"\\\n]|\\.)*")|(?<var>\{\{[^}\n]*\}\})|(?<num>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(?<lit>\btrue\b|\bfalse\b|\bnull\b)|(?<punc>[{}[\],:])/g

const CLASS: Record<string, string> = { com: 'af-t-com', str: 'af-t-str', key: 'af-t-key', var: 'af-t-var', num: 'af-t-num', kw: 'af-t-kw', fn: 'af-t-fn', punc: 'af-t-punc' }

/** Returns HTML with syntax spans. Every character of the input is HTML-escaped, so the result is safe for innerHTML. */
export function highlight(code: string, lang: HlLang): string {
  if (lang === 'text') return escapeHtml(code)
  if (lang === 'xml') return highlightXml(code)
  const re = lang === 'json' ? JSON_RE : regexFor(lang)
  re.lastIndex = 0
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    if (m[0] === '') {
      re.lastIndex++
      continue
    }
    out += escapeHtml(code.slice(last, m.index))
    const groups = m.groups ?? {}
    let cls = ''
    for (const k of Object.keys(groups)) {
      if (groups[k] !== undefined) {
        cls = k === 'lit' ? (lang === 'json' ? (m[0] === 'null' ? 'af-t-null' : 'af-t-bool') : m[0] === 'null' || m[0] === 'None' || m[0] === 'nil' || m[0] === 'undefined' ? 'af-t-null' : 'af-t-bool') : CLASS[k]
        break
      }
    }
    out += `<span class="${cls}">${escapeHtml(m[0])}</span>`
    last = m.index + m[0].length
  }
  return out + escapeHtml(code.slice(last))
}

function highlightXml(code: string): string {
  return escapeHtml(code)
    .replace(/(&lt;\/?)([\w:.-]+)/g, '$1<span class="af-t-kw">$2</span>')
    .replace(/([\w:.-]+)(=)(&quot;.*?&quot;)/g, '<span class="af-t-key">$1</span>$2<span class="af-t-str">$3</span>')
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="af-t-com">$1</span>')
}

export function langForContentType(kind: string, contentType: string): HlLang {
  if (kind === 'json') return 'json'
  if (kind === 'html' || kind === 'xml') return 'xml'
  if (/javascript/.test(contentType)) return 'javascript'
  return 'text'
}
