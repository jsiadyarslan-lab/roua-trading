'use client';
import { useEffect } from 'react'
import T from '@/lib/unified-tokens';

export default function PWAEntry() {
  useEffect(() => {
    // نقل مباشر للداشبورد
    window.location.replace('/ar/dashboard');
  }, []);

  return (
    <div style={{
      position:'fixed', inset:0,
      background:'#0A0D13',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{ color:T.info, fontFamily: "var(--font-mono)", fontSize: 'var(--text-base)' }}>
        جاري التحميل...
      </div>
    </div>
  );
}
