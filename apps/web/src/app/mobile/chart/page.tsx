'use client'

import { Suspense } from 'react'
import { useTranslations } from 'next-intl'
import ChartInner from './ChartInner'

export default function ChartPage() {
  const t = useTranslations('mobile.chart')

  return (
    <Suspense fallback={<div className="m-page"><div style={{ padding: 20, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{t('loading')}</div></div>}>
      <ChartInner />
    </Suspense>
  )
}
