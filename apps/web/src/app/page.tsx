'use client'

import dynamic from 'next/dynamic'
import CosmicTicker from '@/components/landing/CosmicTicker'
import HeroSection from '@/components/landing/HeroSection'
import GalaxyOrchestra from '@/components/landing/GalaxyOrchestra'
import LiveMarketChart from '@/components/landing/LiveMarketChart'
import MediaGallery from '@/components/landing/MediaGallery'
import FeaturesSection from '@/components/landing/FeaturesSection'
import TestimonialsSection from '@/components/landing/TestimonialsSection'
import CTASection from '@/components/landing/CTASection'
import Footer from '@/components/landing/Footer'

const SpaceBackground = dynamic(() => import('@/components/landing/SpaceBackground'), { ssr: false })

export default function Home() {
  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden" dir="rtl">
      <SpaceBackground />
      <div className="relative z-10">
        <CosmicTicker />
        <HeroSection />
        <GalaxyOrchestra />
        <LiveMarketChart />
        <MediaGallery />
        <FeaturesSection id="features" />
        <TestimonialsSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  )
}
