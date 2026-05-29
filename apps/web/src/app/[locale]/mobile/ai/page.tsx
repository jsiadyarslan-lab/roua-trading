'use client'
import { useState } from 'react'
import { StrategicCouncilPanel } from '@/components/dashboard/StrategicCouncilPanel'
import { AgentControlMini } from '@/components/dashboard/AgentControlMini'

export default function AIPage() {
  const [tab, setTab] = useState<'council'|'agent'>('council')
  const C = { bg:'#060A14', cyan:'#00B4FF', border:'rgba(255,255,255,0.06)', dim:'rgba(255,255,255,0.4)' }

  return (
    <div style={{ minHeight:'100%', background:C.bg }}>
      <div style={{ padding:'14px 16px 10px', borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:18, fontWeight:900, color:'#F0F2F5', fontFamily:"'Cairo',sans-serif", marginBottom:12 }}>التحليل الذكي</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', background:'rgba(255,255,255,0.03)', borderRadius:10, padding:3 }}>
          {[{k:'council',l:'مجلس AI'},{k:'agent',l:'الوكيل'}].map(t => (
            <button key={t.k} onClick={()=>setTab(t.k as any)} style={{ padding:'10px', borderRadius:8, border:'none', cursor:'pointer', background:tab===t.k?'rgba(0,180,255,0.12)':'transparent', color:tab===t.k?C.cyan:C.dim, fontSize:13, fontWeight:700, fontFamily:"'Cairo',sans-serif", WebkitTapHighlightColor:'transparent' }}>{t.l}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:'14px 16px' }}>
        {tab==='council' && <StrategicCouncilPanel />}
        {tab==='agent'   && <AgentControlMini />}
      </div>
    </div>
  )
}
