'use client'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'

export default function TradePage() {
  return (
    <div style={{ minHeight:'100%', background:'#060A14', padding:'14px 16px' }}>
      <div style={{ fontSize:18, fontWeight:900, color:'#F0F2F5', fontFamily:"'Cairo',sans-serif", marginBottom:16 }}>تداول سريع</div>
      <QuickExecutionMini mobile={true} />
    </div>
  )
}
