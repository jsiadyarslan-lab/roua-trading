'use client'

import CosmicTicker from '@/components/landing/CosmicTicker'
import HeroSection from '@/components/landing/HeroSection'
import AIModelsSection from '@/components/landing/AIModelsSection'
import LiveMarketChart from '@/components/landing/LiveMarketChart'
import FeaturesSection from '@/components/landing/FeaturesSection'
import TestimonialsSection from '@/components/landing/TestimonialsSection'
import CTASection from '@/components/landing/CTASection'
import Footer from '@/components/landing/Footer'

export default function Home() {
  return (
    <div className="relative min-h-screen text-white overflow-hidden" dir="rtl" style={{ background: '#06090f' }}>
      {/* Subtle gradient mesh background instead of heavy Three.js */}
      <div className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16,185,129,0.08) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(59,130,246,0.05) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(139,92,246,0.04) 0%, transparent 50%), #06090f',
          }}
        />
      </div>

      <div className="relative z-10">
        <CosmicTicker />
        <HeroSection />
        <AIModelsSection />
        <LiveMarketChart />
        <FeaturesSection id="features" />
        <TestimonialsSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  )
}
