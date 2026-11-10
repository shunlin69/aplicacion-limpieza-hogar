// Número que sube de 0 al valor final (con frenado suave al final)
import { useEffect, useState } from 'react'

export function useCountUp(target: number, ms = 900, delay = 0): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setValue(target)
      return
    }
    let raf = 0
    let start = 0
    const timer = setTimeout(() => {
      const step = (t: number) => {
        start ||= t
        const p = Math.min((t - start) / ms, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setValue(Math.round(target * eased))
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, ms, delay])
  return value
}
