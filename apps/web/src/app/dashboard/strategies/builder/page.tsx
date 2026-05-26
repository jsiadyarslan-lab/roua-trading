import { redirect } from 'next/navigation'

// FIX: Redirect /dashboard/strategies/builder → /dashboard/strategy-builder
// The strategy builder page exists at /dashboard/strategy-builder but some
// navigation links incorrectly point to /dashboard/strategies/builder,
// causing a 404. This redirect fixes the broken link.
export default function StrategiesBuilderPage() {
  redirect('/dashboard/strategy-builder')
}
