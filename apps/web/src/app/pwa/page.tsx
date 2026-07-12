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
      background:'#0B0E14',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{ color:'#00D4FF', fontFamily: "var(--font-mono)", fontSize: 15 }}>
        جاري التحميل...
      </div>
    </div>
  );
}
