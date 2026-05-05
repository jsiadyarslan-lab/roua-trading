'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with lightweight-charts
const RouaChart = dynamic(
  () => import('@/components/chart/RouaChart').then(mod => ({ default: mod.RouaChart })),
  { ssr: false, loading: () => <ChartLoadingSkeleton /> }
);

function ChartLoadingSkeleton() {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
        background: '#0B0E14',
        border: '1px solid #2A313C',
        borderRadius: 8,
        color: '#8090A8',
        fontSize: 14,
      }}
    >
      جاري تحميل الشارت...
    </div>
  );
}

export default function Home() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0B0E14',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        direction: 'rtl',
        fontFamily: "'Cairo', 'JetBrains Mono', sans-serif",
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          padding: '0 4px',
        }}
      >
        <h1 style={{ color: '#E6EBF5', fontSize: 18, fontWeight: 800 }}>
          روعا تريدينج
        </h1>
        <span style={{ color: '#8090A8', fontSize: 12 }}>
          شارت مباشر
        </span>
      </div>

      {/* Chart container — fills entire card */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <RouaChart />
      </div>
    </div>
  );
}
