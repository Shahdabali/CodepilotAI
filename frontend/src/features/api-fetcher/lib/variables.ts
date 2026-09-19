import type { Environment } from '../types'

const VAR_RE = /\{\{\s*([\w.$-]+)\s*\}\}/g
const DYNAMIC = new Set(['$timestamp', '$isoTimestamp', '$guid', '$uuid', '$randomInt'])

export const DYNAMIC_VARIABLES = [
  { name: '$timestamp', description: 'Unix timestamp in seconds' },
  { name: '$isoTimestamp', description: 'Current time in ISO 8601' },
  { name: '$guid', description: 'Random UUID v4' },
  { name: '$randomInt', description: 'Random integer 0-999' },
]

export function findVariables(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(VAR_RE)) out.add(m[1])
  return [...out]
}

export type VarState = 'defined' | 'secret' | 'dynamic' | 'missing'

export function variableState(name: string, env: Environment | null): VarState {
  if (DYNAMIC.has(name)) return 'dynamic'
  const v = env?.variables.find((x) => x.key === name)
  if (!v) return 'missing'
  return v.secret ? 'secret' : 'defined'
}

/**
 * Resolves non-secret variables for display and code generation.
 * Secret variables are never resolved on the client (their values are not available here); they stay as {{NAME}}.
 */
export function resolveForDisplay(text: string, env: Environment | null): string {
  if (!text.includes('{{')) return text
  return text.replace(VAR_RE, (match, name: string) => {
    const v = env?.variables.find((x) => x.key === name)
    if (v && !v.secret) return v.value
    return match
  })
}

export function missingVariables(texts: string[], env: Environment | null): string[] {
  const out = new Set<string>()
  for (const t of texts) for (const name of findVariables(t)) if (variableState(name, env) === 'missing') out.add(name)
  return [...out]
}
