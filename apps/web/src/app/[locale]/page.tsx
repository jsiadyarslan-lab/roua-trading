'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import dynamic from 'next/dynamic';
import './landing.css';

// Heavy canvas animation — load only on client, skip SSR
const CosmicCanvas = dynamic(() => import('@/components/landing/CosmicCanvas'), {
  ssr: false,
  loading: () => <div className="fixed inset-0" style={{ background: T.bg }} />,
});

import MarketPulse from '@/components/landing/MarketPulse';
import LiveSignals from '@/components/landing/LiveSignals';
import CosmicNavbar from '@/components/landing/CosmicNavbar';
import HeroSection from '@/components/landing/HeroSection';
import CountdownBanner from '@/components/landing/CountdownBanner';
import AIModelsSection from '@/components/landing/AIModelsSection';
import LiveTicker from '@/components/landing/LiveTicker';
import FeaturesSection from '@/components/landing/FeaturesSection';
import HowItWorks from '@/components/landing/HowItWorks';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import BlackholeCTA from '@/components/landing/BlackholeCTA';
import CosmicFooter from '@/components/landing/CosmicFooter'
import T from '@/lib/unified-tokens';

export default function Home() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, router])

  // NOTE: Landing page bypass is handled by src/middleware.ts (SKIP_LANDING env var)
  // Intersection Observer for fade-in animations (matching original HTML)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.landing-page .fade-in').forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-page">
      <CosmicCanvas />
      <MarketPulse />
      <CosmicNavbar />
      <HeroSection />
      <CountdownBanner />
      <AIModelsSection />
      <LiveTicker />
      <FeaturesSection />
      <HowItWorks />
      <TestimonialsSection />
      <BlackholeCTA />
      <CosmicFooter />
      <LiveSignals />
    </div>
  );
}
