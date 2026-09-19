import React, { useEffect, useState } from 'react'
import { animate, useMotionValue, useReducedMotion } from 'framer-motion'
import { EASE } from '@/lib/motion'

/** Counts up to `value` on mount and whenever it changes. Jumps straight there for reduced-motion users. */
export function AnimatedNumber({ value, format = (n: number) => String(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const [text, setText] = useState(() => format(reduce ? value : 0))

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      setText(format(value))
      return
    }
    const unsub = mv.on('change', (v) => setText(format(v)))
    const controls = animate(mv, value, { duration: 0.9, ease: EASE })
    return () => {
      controls.stop()
      unsub()
    }
    // `format` is intentionally omitted: callers pass an inline function that never changes meaning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, mv])

  return <span className={className}>{text}</span>
}
