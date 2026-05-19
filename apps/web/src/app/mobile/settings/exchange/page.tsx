'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { Link2, AlertTriangle } from 'lucide-react'

export default function MobileSettingsExchangePage() {
  const exchangeBalances = usePositionsStore(s => s.exchangeBalances)

  return (
    <div className="m-page">
      <MobilePageHeader title="إعدادات البورصة" subtitle="إدارة مفاتيح API" />

      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <Link2 size={18} color="#00D4FF" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
            قم بربط حساب البورصة عبر مفاتيح API للوصول إلى أرصدتك وتنفيذ الصفقات. لا نحتاج صلاحية السحب.
          </div>
        </div>
      </IOSCard>

      {exchangeBalances && exchangeBalances.length > 0 ? (
        exchangeBalances.map((ex, i) => (
          <IOSCard key={i}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Link2 size={18} color="#00D4FF" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{ex.exchange}</div>
                  {ex.label && <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{ex.label}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${Number(ex.equity).toFixed(2)}</div>
                {ex.error && <div style={{ fontSize: 9, color: '#FF453A', fontFamily: "'Cairo', sans-serif" }}>غير متاح</div>}
                {!ex.error && <div style={{ fontSize: 9, color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>متصل ✓</div>}
              </div>
            </div>
          </IOSCard>
        ))
      ) : (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <AlertTriangle size={32} color="#d4af37" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>لا توجد بورصات مرتبطة</div>
            <a href="/mobile/kyc" style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 10, background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)', color: '#00D4FF', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", textDecoration: 'none' }}>ربط بورصة</a>
          </div>
        </IOSCard>
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
