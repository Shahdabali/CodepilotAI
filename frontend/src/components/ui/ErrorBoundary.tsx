import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/primitives'

interface Props {
  /** What crashed, shown to the user ("this view", "the code editor"…). */
  label?: string
  children: React.ReactNode
  /** Change this value to clear the error (e.g. the current view). */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

/** Keeps one broken view from blanking the whole app, and lets the user try again. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--warning)]">
          <AlertTriangle size={22} />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">Something went wrong in {this.props.label ?? 'this view'}</p>
          <p className="mx-auto mt-1 max-w-md break-words text-xs leading-relaxed text-[var(--text-secondary)]">{this.state.error.message || 'An unexpected error occurred.'}</p>
        </div>
        <Button onClick={() => this.setState({ error: null })}>
          <RefreshCw size={13} /> Try again
        </Button>
      </div>
    )
  }
}
