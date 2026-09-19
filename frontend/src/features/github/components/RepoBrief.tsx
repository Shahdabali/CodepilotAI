import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Settings, Sparkles, Square } from 'lucide-react'
import { Markdown } from '@/components/ui/Markdown'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/primitives'
import { useUIStore } from '@/stores/ui.store'
import { GithubApiError, streamBrief } from '../api'

interface BriefState {
  text: string
  status: 'idle' | 'streaming' | 'done' | 'error'
  error?: GithubApiError
}

// Kept for the session so switching tabs (or repositories and back) doesn't discard a generated briefing.
const cache = new Map<string, BriefState>()

/** AI briefing: the server fetches the README, tree, commits and issues itself, so the model only sees real repository data. */
export function RepoBrief({ owner, repo }: { owner: string; repo: string }) {
  const key = `${owner}/${repo}`.toLowerCase()
  const [state, setState] = useState<BriefState>(() => cache.get(key) ?? { text: '', status: 'idle' })
  const abort = useRef<AbortController | null>(null)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)

  // Repository changed while mounted: show that repository's cached briefing (or a fresh start).
  useEffect(() => {
    abort.current?.abort()
    setState(cache.get(key) ?? { text: '', status: 'idle' })
    return () => abort.current?.abort()
  }, [key])

  const update = (next: BriefState) => {
    cache.set(key, next)
    setState(next)
  }

  const run = async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    let text = ''
    update({ text: '', status: 'streaming' })
    try {
      await streamBrief(owner, repo, (delta) => {
        text += delta
        update({ text, status: 'streaming' })
      }, ctrl.signal)
      update({ text, status: 'done' })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        update({ text, status: text ? 'done' : 'idle' })
        return
      }
      update({ text, status: 'error', error: err instanceof GithubApiError ? err : new GithubApiError((err as Error).message, 'AI_FAILED', 500) })
    }
  }

  const stop = () => abort.current?.abort()

  return (
    <section aria-labelledby="brief-title" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-text)]">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="brief-title" className="text-sm font-semibold text-[var(--text-primary)]">
            AI briefing
          </h3>
          <p className="text-[11.5px] text-[var(--text-muted)]">Built only from this repo’s README, file tree, commits and issues.</p>
        </div>
        {state.status === 'streaming' ? (
          <Button size="sm" onClick={stop}>
            <Square size={11} /> Stop
          </Button>
        ) : (
          <Button size="sm" variant={state.status === 'idle' ? 'primary' : 'secondary'} onClick={() => void run()}>
            <Sparkles size={12} /> {state.status === 'idle' ? 'Brief me' : 'Regenerate'}
          </Button>
        )}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {state.status === 'idle' ? (
          <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 py-5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Get a short briefing — what it is, how it’s organised, how to start, and where you could contribute — without reading the whole repo first.
          </motion.p>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-4" aria-live="polite" aria-busy={state.status === 'streaming'}>
            {state.text ? <Markdown text={state.text} /> : <p className="text-[13px] text-[var(--text-muted)]">Reading the repository…</p>}
            {state.status === 'streaming' && <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[var(--accent-text)] align-middle" aria-hidden />}

            {state.status === 'error' && state.error && (
              <div role="alert" className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3.5 py-3 text-[13px] text-[var(--text-primary)]">
                <p>{state.error.message}</p>
                {state.error.code === 'NO_PROVIDER' && (
                  <Button size="sm" className="mt-2" onClick={() => setSettingsOpen(true)}>
                    <Settings size={12} /> Open AI settings
                  </Button>
                )}
              </div>
            )}

            {state.status === 'done' && state.text && (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    navigator.clipboard?.writeText(state.text).then(
                      () => toast.success('Briefing copied'),
                      () => toast.error('Could not copy to the clipboard')
                    )
                  }
                >
                  <Copy size={12} /> Copy
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
