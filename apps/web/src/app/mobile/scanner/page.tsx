'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { ScannerMini } from '@/components/dashboard/ScannerMini'

export default function MobileScannerPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100%', background: '#0B0E14', direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 12px) 16px 16px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.1), transparent)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(255,255,255,0.07)',
          border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          cursor: 'pointer',
        }}>
          <ChevronLeft size={18} color="#F0F2F5" />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
          السكانر الذكي
        </h1>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '0 16px', minHeight: 'calc(100% - 120px)' }}>
        <ScannerMini mobile={true} />
      </div>
    </div>
  )
}
