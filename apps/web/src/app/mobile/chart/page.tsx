'use client'

import { Suspense } from 'react'
import ChartInner from './ChartInner'

export default function ChartPage() {
  return (
    <Suspense fallback={<div className="m-page" style={{ direction: 'rtl' }}><div style={{ padding: 20, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>جارٍ تحميل الشارت...</div></div>}>
      <ChartInner />
    </Suspense>
  )
}
