'use client';
import { useEffect } from 'react';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // منع التمرير على body — التطبيق يتحكم في التمرير داخلياً
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0B0E14',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    }}>
      {children}
    </div>
  );
}
