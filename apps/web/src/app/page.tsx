'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './landing.css';
import CosmicCanvas from '@/components/landing/CosmicCanvas';
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
import CosmicFooter from '@/components/landing/CosmicFooter';

export default function Home() {
  // SKIP_LANDING: Set env var NEXT_PUBLIC_SKIP_LANDING=true to bypass landing page
  const router = useRouter();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SKIP_LANDING === 'true') {
      router.replace('/dashboard');
    }
  }, [router]);
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
