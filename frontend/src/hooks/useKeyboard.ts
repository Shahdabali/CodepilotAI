import { useEffect } from 'react'

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  modifiers: ('ctrl' | 'meta' | 'shift' | 'alt')[] = ['ctrl']
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrlOk = !modifiers.includes('ctrl') || e.ctrlKey
      const metaOk = !modifiers.includes('meta') || e.metaKey
      const shiftOk = !modifiers.includes('shift') || e.shiftKey
      const altOk = !modifiers.includes('alt') || e.altKey
      if (ctrlOk && metaOk && shiftOk && altOk && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault()
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback, modifiers])
}
