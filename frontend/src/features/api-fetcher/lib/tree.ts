import type { Collection } from '../types'

export interface FlatCollection {
  collection: Collection
  depth: number
}

/** Collections in depth-first tree order with their nesting depth. */
export function flattenCollections(collections: Collection[], skip?: Set<string>): FlatCollection[] {
  const out: FlatCollection[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const c of collections.filter((x) => x.parentId === parentId)) {
      if (skip?.has(c.id)) continue
      out.push({ collection: c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function descendantIds(collections: Collection[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (parent: string) => {
    for (const c of collections) {
      if (c.parentId === parent && !out.has(c.id)) {
        out.add(c.id)
        walk(c.id)
      }
    }
  }
  walk(id)
  return out
}

export function collectionPath(collections: Collection[], id: string | null): string {
  const names: string[] = []
  let cur = id ? collections.find((c) => c.id === id) : undefined
  let guard = 0
  while (cur && guard++ < 50) {
    names.unshift(cur.name)
    cur = cur.parentId ? collections.find((c) => c.id === cur!.parentId) : undefined
  }
  return names.join(' / ')
}
