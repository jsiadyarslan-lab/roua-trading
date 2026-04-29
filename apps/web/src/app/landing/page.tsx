import { redirect } from 'next/navigation'

// Landing page is now served at root (/), redirect /landing to /
export default function LandingPage() {
  redirect('/')
}
