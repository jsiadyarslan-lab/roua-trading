import { redirect } from '@/i18n/navigation'

// Landing page is now served at root (/), redirect /landing to /
export default function LandingPage() {
  redirect('/')
}
