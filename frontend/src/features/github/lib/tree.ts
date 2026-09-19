import type { TreeEntry } from '../types'

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  size?: number
  children: TreeNode[]
}

/** Flat GitHub tree entries → nested nodes (folders first, then files, each alphabetical). */
export function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] }
  const dirs = new Map<string, TreeNode>([['', root]])

  const ensureDir = (path: string): TreeNode => {
    const existing = dirs.get(path)
    if (existing) return existing
    const idx = path.lastIndexOf('/')
    const parent = ensureDir(idx === -1 ? '' : path.slice(0, idx))
    const node: TreeNode = { name: path.slice(idx + 1), path, type: 'dir', children: [] }
    parent.children.push(node)
    dirs.set(path, node)
    return node
  }

  for (const e of entries) {
    if (e.type === 'tree') {
      ensureDir(e.path)
    } else {
      const idx = e.path.lastIndexOf('/')
      const parent = ensureDir(idx === -1 ? '' : e.path.slice(0, idx))
      parent.children.push({ name: e.path.slice(idx + 1), path: e.path, type: 'file', size: e.size, children: [] })
    }
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : a.type === 'dir' ? -1 : 1))
    for (const n of nodes) if (n.type === 'dir') sort(n.children)
  }
  sort(root.children)
  return root.children
}

export interface VisibleRow {
  node: TreeNode
  depth: number
}

/** The rows currently visible given which folders are open. */
export function visibleRows(nodes: TreeNode[], open: ReadonlySet<string>, depth = 0, out: VisibleRow[] = []): VisibleRow[] {
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.type === 'dir' && open.has(node.path)) visibleRows(node.children, open, depth + 1, out)
  }
  return out
}

/** Every folder that contains `path` (used to reveal a file). */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/')
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'))
  return out
}

/** "Go to file": case-insensitive fuzzy-ish match — every query character in order, ranked by tightness. */
export function findFiles(entries: TreeEntry[], query: string, limit = 60): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: Array<{ path: string; score: number }> = []
  for (const e of entries) {
    if (e.type !== 'blob') continue
    const p = e.path.toLowerCase()
    const base = p.slice(p.lastIndexOf('/') + 1)
    let score = -1
    if (base === q) score = 0
    else if (base.startsWith(q)) score = 1
    else if (base.includes(q)) score = 2
    else if (p.includes(q)) score = 3
    else {
      // subsequence
      let i = 0
      for (const ch of p) if (ch === q[i]) i++
      if (i === q.length) score = 4
    }
    if (score >= 0) scored.push({ path: e.path, score: score * 1000 + e.path.length })
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.path)
}
