'use client'

import dynamic from 'next/dynamic'
import DataPulseTicker from '@/components/landing/DataPulseTicker'
import HeroSection from '@/components/landing/HeroSection'
import NeuralFeatures from '@/components/landing/NeuralFeatures'
import TestimonialsSection from '@/components/landing/TestimonialsSection'
import CTASection from '@/components/landing/CTASection'
import Footer from '@/components/landing/Footer'

// Dynamic imports for heavy components (Three.js + lightweight-charts)
const NeuralBackground = dynamic(() => import('@/components/landing/NeuralBackground'), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 -z-10"
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #0a1628 0%, #050D1A 50%, #020810 100%)',
      }}
    />
  ),
})

const LiveMarketChart = dynamic(() => import('@/components/landing/LiveMarketChart'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="text-sm animate-pulse" style={{ color: '#64748B', fontFamily: 'var(--font-ar)' }}>
        جاري تحميل الرسم البياني...
      </div>
    </div>
  ),
})

export default function LandingPage() {
  return (
    <div
      className="relative min-h-screen flex flex-col overflow-x-hidden"
      style={{ background: '#050D1A' }}
    >
      {/* Neural Network Background */}
      <NeuralBackground />

      {/* Live Price Ticker */}
      <DataPulseTicker />

      {/* Hero Section */}
      <HeroSection />

      {/* Neural Features */}
      <NeuralFeatures />

      {/* Live Market Chart */}
      <LiveMarketChart />

      {/* Testimonials */}
      <TestimonialsSection />

      {/* CTA */}
      <CTASection />

      {/* Footer */}
      <Footer />
    </div>
  )
}
