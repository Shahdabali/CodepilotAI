export class TerminalWebSocket {
  private ws: WebSocket | null = null
  private sessionId: string
  private projectPath: string
  private dataCallbacks: Array<(data: string) => void> = []
  private closeCallbacks: Array<() => void> = []
  private _connected = false

  constructor(sessionId: string, projectPath: string) {
    this.sessionId = sessionId
    this.projectPath = projectPath
  }

  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/terminal/${this.sessionId}?projectPath=${encodeURIComponent(this.projectPath)}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this._connected = true
    }

    this.ws.onmessage = (event) => {
      const data = typeof event.data === 'string' ? event.data : ''
      this.dataCallbacks.forEach((cb) => cb(data))
    }

    this.ws.onclose = () => {
      this._connected = false
      this.closeCallbacks.forEach((cb) => cb())
    }

    this.ws.onerror = () => {
      this._connected = false
    }
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
  }

  onData(cb: (data: string) => void): void {
    this.dataCallbacks.push(cb)
  }

  onClose(cb: () => void): void {
    this.closeCallbacks.push(cb)
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this._connected = false
  }

  get connected(): boolean {
    return this._connected
  }
}
