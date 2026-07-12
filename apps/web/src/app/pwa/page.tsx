'use client';
import { useEffect } from 'react'

export default function PWAEntry() {
  useEffect(() => {
    // نقل مباشر للداشبورد
    window.location.replace('/ar/dashboard');
  }, []);

  return (
    <div style={{
      position:'fixed', inset:0,
      background:T.bg,
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{ color:'#00D4FF', fontFamily: "var(--font-mono)", fontSize: 'var(--text-base)' }}>
        جاري التحميل...
      </div>
    </div>
  );
}
