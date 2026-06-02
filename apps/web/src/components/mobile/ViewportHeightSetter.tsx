'use client'

import { useEffect } from 'react'

/**
 * V175: Sets --app-height using visualViewport (أدق من window.innerHeight)
 * visualViewport يستثني iOS Safari toolbar تلقائياً
 * هذا هو الحل الوحيد الموثوق لمشكلة الناف بار المرتفع
 */
export default function ViewportHeightSetter() {
  useEffect(() => {
    const setHeight = () => {
      // visualViewport أدق: يعطي الـ height الفعلية المرئية
      const h = window.visualViewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }

    setHeight()

    // استمع لكل تغييرات الـ viewport (scroll، zoom، iOS toolbar)
    window.visualViewport?.addEventListener('resize', setHeight)
    window.visualViewport?.addEventListener('scroll', setHeight)
    window.addEventListener('resize', setHeight)
    window.addEventListener('orientationchange', () => setTimeout(setHeight, 150))

    return () => {
      window.visualViewport?.removeEventListener('resize', setHeight)
      window.visualViewport?.removeEventListener('scroll', setHeight)
      window.removeEventListener('resize', setHeight)
    }
  }, [])
  return null
}
