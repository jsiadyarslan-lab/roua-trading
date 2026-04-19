'use client'

import { useState } from 'react'
import { Wallet, ChevronDown } from 'lucide-react'

export default function WalletPanel() {
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(10,132,255,0.133)', background: 'rgba(10,132,255,0.02)', transition: 'border-color 0.2s' }}>
      <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,132,255,0.094)', border: '1px solid rgba(10,132,255,0.208)' }}>
          <Wallet size={10} stroke="#0A84FF" strokeWidth={2.2} />
        </div>
        <span style={{ flex: '1 1 0%', fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', fontFamily: 'var(--font-ar), Inter, sans-serif', textAlign: 'start', color: 'var(--text-main)' }}>المحفظة</span>
        <div style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <ChevronDown size={10} stroke="#0A84FF" strokeWidth={2} />
        </div>
      </button>
      
      {expanded && (
        <div style={{ padding: '0 8px 8px', borderTop: '1px solid rgba(10,132,255,0.07)' }}>
          <div style={{ paddingTop: '5px' }}>
            <div style={{ textAlign: 'center', padding: '5px 0 7px' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar), Inter, sans-serif', fontWeight: 700 }}>حقوق الملكية</span>
              <div dir="ltr" style={{ fontSize: '17px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>$29,733.45</div>
              <div dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(0,255,198,0.08)', border: '1px solid rgba(0,255,198,0.2)' }}>
                <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }}>▲ +$1240.30 (4.35%)</span>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '5px' }}>
              {[
                { label: 'الرصيد', value: '$28,493.15' },
                { label: 'الهامش المتاح', value: '$25,120.80' },
                { label: 'الهامش المستخدم', value: '$3,372.35' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2.5px 0' }}>
                  <span style={{ fontSize: '9px', color: 'rgba(128,144,168,0.55)', fontFamily: 'var(--font-ar), Inter, sans-serif', fontWeight: 600 }}>{item.label}</span>
                  <span dir="ltr" style={{ fontSize: '9.5px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
