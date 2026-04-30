import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'جارٍ التحميل... | رؤى',
}

export default function Loading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: '#06090f',
        direction: 'rtl',
      }}
    >
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{
              borderTopColor: '#10B981',
              borderRightColor: '#3B82F6',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>

        {/* Brand */}
        <h2
          className="text-3xl font-bold mb-2"
          style={{
            fontFamily: 'var(--font-ar)',
            background: 'linear-gradient(135deg, #10B981, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          رؤى
        </h2>

        <p
          className="text-sm"
          style={{
            fontFamily: 'var(--font-ar)',
            color: '#64748B',
          }}
        >
          جارٍ تحميل المنصة...
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
