import { redirect } from 'next/navigation'

// Landing page → redirect to dashboard (auth is auto-managed)
export default function Home() {
  redirect('/dashboard')
}
