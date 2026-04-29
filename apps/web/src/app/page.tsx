import { redirect } from 'next/navigation'

// Root → redirect to dashboard (auth is auto-managed)
// Landing page is available at /landing
export default function Home() {
  redirect('/dashboard')
}
