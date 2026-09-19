/** 1234 → 1.2k, 1_500_000 → 1.5M. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`
}

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'just now'
  const units: Array<[number, string]> = [
    [60, 'minute'], [3600, 'hour'], [86400, 'day'], [2_592_000, 'month'], [31_536_000, 'year'],
  ]
  let value = 1
  let unit = 'minute'
  if (s >= 60) {
    for (const [secs, name] of units) {
      if (s >= secs) {
        value = Math.floor(s / secs)
        unit = name
      }
    }
  }
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572a5', Java: '#b07219', Go: '#00add8', Rust: '#dea584',
  'C++': '#f34b7d', C: '#8a8a8a', 'C#': '#178600', Ruby: '#a91401', PHP: '#7a86b8', Swift: '#f05138', Kotlin: '#a97bff',
  HTML: '#e34c26', CSS: '#7a5bc4', SCSS: '#c6538c', Shell: '#89e051', Vue: '#41b883', Dart: '#00b4ab', Scala: '#dc322f',
  Lua: '#5c6bc0', Jupyter: '#da5b0b', 'Jupyter Notebook': '#da5b0b', Makefile: '#427819', Dockerfile: '#384d54',
  Svelte: '#ff3e00', Elixir: '#6e4a7e', Haskell: '#5e5086', 'Objective-C': '#438eff', R: '#198ce7', Zig: '#ec915c',
}

/** Known languages get GitHub's colour; the rest get a stable hue derived from the name. */
export function languageColor(name: string): string {
  if (LANGUAGE_COLORS[name]) return LANGUAGE_COLORS[name]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h} 55% 55%)`
}

export interface LanguageShare {
  name: string
  bytes: number
  percent: number
}

export function languageShares(languages: Record<string, number>, top = 6): LanguageShare[] {
  const total = Object.values(languages).reduce((a, b) => a + b, 0)
  if (!total) return []
  const sorted = Object.entries(languages).sort((a, b) => b[1] - a[1])
  const head = sorted.slice(0, top)
  const rest = sorted.slice(top).reduce((a, [, b]) => a + b, 0)
  const shares = head.map(([name, bytes]) => ({ name, bytes, percent: (bytes / total) * 100 }))
  if (rest > 0) shares.push({ name: 'Other', bytes: rest, percent: (rest / total) * 100 })
  return shares
}
