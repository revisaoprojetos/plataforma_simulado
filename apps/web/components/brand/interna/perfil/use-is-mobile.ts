'use client'

import { useEffect, useState } from 'react'

// ≤640px = board mobile (spec 05 §0). Client-only (matchMedia); SSR começa desktop.
export function useIsMobile(breakpoint = 640): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint}px)`)
    const on = () => setMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [breakpoint])
  return mobile
}
