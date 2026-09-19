import { randomUUID } from 'node:crypto'

export type BodyKind = 'json' | 'html' | 'xml' | 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' | 'empty'

export const TEXT_INLINE_MAX = 10 * 1024 * 1024
export const MEDIA_INLINE_MAX = 8 * 1024 * 1024

function mimeOf(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase()
}

export function charsetOf(contentType: string): string {
  const m = contentType.match(/charset\s*=\s*"?([\w.:-]+)"?/i)
  return (m?.[1] ?? 'utf-8').toLowerCase()
}

function sniffBinary(buf: Buffer): BodyKind | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image'
  if (buf.length >= 4 && buf.toString('latin1', 0, 4) === 'GIF8') return 'image'
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image'
  if (buf.length >= 4 && buf.toString('latin1', 0, 4) === '%PDF') return 'pdf'
  return null
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8000))
  for (const byte of sample) if (byte === 0) return false
  return !sample.toString('utf8').includes('�')
}

export function classifyBody(contentType: string, buf: Buffer): BodyKind {
  if (buf.length === 0) return 'empty'
  const mime = mimeOf(contentType)
  if (mime.includes('json') && !mime.includes('ndjson')) return 'json'
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (mime.includes('xml')) return 'xml'
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (
    mime.startsWith('text/') ||
    /(javascript|ecmascript|yaml|csv|graphql|markdown|x-www-form-urlencoded|x-sh|ndjson|x-ndjson|sql)/.test(mime)
  ) {
    return 'text'
  }
  const sniffed = sniffBinary(buf)
  if (sniffed) return sniffed
  if (looksLikeText(buf)) {
    const head = buf.toString('utf8', 0, 200).trimStart().toLowerCase()
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html'
    if ((head.startsWith('{') || head.startsWith('[')) && buf.length <= TEXT_INLINE_MAX) {
      try {
        JSON.parse(buf.toString('utf8'))
        return 'json'
      } catch {
        return 'text'
      }
    }
    return 'text'
  }
  return 'binary'
}

export function decodeText(buf: Buffer, contentType: string): string {
  let text: string
  try {
    text = new TextDecoder(charsetOf(contentType), { fatal: false }).decode(buf)
  } catch {
    text = buf.toString('utf8')
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

const EXT_BY_MIME: Record<string, string> = {
  'application/json': 'json',
  'text/html': 'html',
  'text/plain': 'txt',
  'text/css': 'css',
  'text/csv': 'csv',
  'text/xml': 'xml',
  'application/xml': 'xml',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/javascript': 'js',
}

export function suggestFilename(url: string, contentType: string, contentDisposition?: string): string {
  const cd = contentDisposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  if (cd?.[1]) {
    try {
      return decodeURIComponent(cd[1]).replace(/[\\/:*?"<>|]/g, '_')
    } catch {
      return cd[1].replace(/[\\/:*?"<>|]/g, '_')
    }
  }
  const mime = mimeOf(contentType)
  const ext = EXT_BY_MIME[mime] ?? (mime.includes('json') ? 'json' : mime.includes('xml') ? 'xml' : 'bin')
  let base = 'response'
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    if (last) base = last.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^\w.-]/g, '_') || 'response'
  } catch {
    /* keep default */
  }
  return `${base}.${ext}`
}

interface CacheEntry {
  body: Buffer
  contentType: string
  filename: string
  expiresAt: number
}

/** Small in-memory LRU of full response bodies so large payloads can be downloaded without being inlined in JSON. */
export class ResponseCache {
  private entries = new Map<string, CacheEntry>()
  private totalBytes = 0

  constructor(
    private readonly maxTotalBytes = 150 * 1024 * 1024,
    private readonly ttlMs = 15 * 60 * 1000
  ) {}

  put(body: Buffer, contentType: string, filename: string): string {
    this.evictExpired()
    const id = randomUUID()
    this.entries.set(id, { body, contentType, filename, expiresAt: Date.now() + this.ttlMs })
    this.totalBytes += body.length
    while (this.totalBytes > this.maxTotalBytes && this.entries.size > 1) {
      const oldest = this.entries.keys().next().value as string
      this.remove(oldest)
    }
    return id
  }

  get(id: string): CacheEntry | undefined {
    const entry = this.entries.get(id)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.remove(id)
      return undefined
    }
    return entry
  }

  private remove(id: string): void {
    const entry = this.entries.get(id)
    if (entry) {
      this.totalBytes -= entry.body.length
      this.entries.delete(id)
    }
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [id, e] of this.entries) if (e.expiresAt < now) this.remove(id)
  }
}

export const responseCache = new ResponseCache()
