import type { AgentEvent } from '@/types'

export function subscribeToTask(
  taskId: string,
  onEvent: (e: AgentEvent) => void,
  onError?: (e: Event) => void
): () => void {
  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  const url = `${apiBase}/sse/agent/${taskId}`
  let es: EventSource
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  function connect() {
    if (closed) return
    es = new EventSource(url)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AgentEvent
        onEvent(data)
      } catch {
        // ignore malformed events
      }
    }

    es.onerror = (e) => {
      onError?.(e)
      es.close()
      if (!closed) {
        // Reconnect after 2s
        reconnectTimer = setTimeout(connect, 2000)
      }
    }
  }

  connect()

  return () => {
    closed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    es?.close()
  }
}
