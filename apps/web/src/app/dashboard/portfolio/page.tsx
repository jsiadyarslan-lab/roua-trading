import { Metadata } from 'next'
import PortfolioPageClient from './PortfolioPageClient'

export const metadata: Metadata = {
  title: 'متابع الإشارات | رؤى',
  description: 'تتبع إشارات التداول الذكية من المجلس الذكي والمنفذ الذكي',
}

export default function PortfolioPage() {
  return <PortfolioPageClient />
}
