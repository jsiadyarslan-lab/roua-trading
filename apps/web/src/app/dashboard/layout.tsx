import { AppHeader } from '@/components/dashboard/AppHeader'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#04050C', direction: 'rtl' }}>
      <AppHeader />
      <main style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  )
}
