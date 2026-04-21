import { redirect } from 'next/navigation'

// DEV MODE: bypass landing page → go straight to dashboard
export default function Home() {
  redirect('/dashboard')
}
