'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function MobileTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Scroll to top on route change
  useEffect(() => {
    const main = document.querySelector('.r-main')
    if (main) main.scrollTop = 0
  }, [pathname])

  return <>{children}</>
}
