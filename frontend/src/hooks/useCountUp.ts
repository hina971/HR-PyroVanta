import { useEffect, useRef, useState } from 'react'

// Count-up with the demo's cubic-out easing (requestAnimationFrame).
export function useCountUp(target: number, dur = 1100): number {
  const [value, setValue] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    // First mount counts from 0 like the demo; later changes re-run it.
    void first.current
    first.current = false
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return value
}
