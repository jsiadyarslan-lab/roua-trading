'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { ScannerMini } from '@/components/dashboard/ScannerMini'

export default function MobileScannerPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl', paddingBottom: 24 }}>
      {/* ── Header ── */}
      <div style={{
        paddingTop: 52,
        padding: '52px 16px 16px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.1), transparent)',
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <button onClick={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(255,255,255,0.07)',
          border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ArrowRight size={18} color="#F0F2F5" />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
          السكانر الذكي
        </h1>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '0 16px', height: 'calc(100vh - 120px)' }}>
        <ScannerMini mobile={true} />
      </div>
    </div>
  )
}
