import { useCallback, useEffect, useRef, useState } from 'react'

/** Fixed-row-height windowing: only the rows near the viewport are ever mounted, so very large documents stay smooth. */
export function useVirtualRows(count: number, rowHeight: number, overscan = 14) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 480 })
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (raf.current !== null) return
    raf.current = requestAnimationFrame(() => {
      raf.current = null
      setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }))
    })
  }, [])

  const start = Math.max(0, Math.floor(view.top / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((view.top + view.height) / rowHeight) + overscan)

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = ref.current
      if (!el) return
      const top = index * rowHeight
      if (top < el.scrollTop + rowHeight || top > el.scrollTop + el.clientHeight - rowHeight * 2) {
        el.scrollTop = Math.max(0, top - el.clientHeight / 2)
      }
    },
    [rowHeight]
  )

  return { ref, onScroll, start, end, totalHeight: count * rowHeight, scrollToIndex }
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
