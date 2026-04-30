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
  return (
    <main style={{ background: '#000000', minHeight: '100vh', position: 'relative' }}>
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
    </main>
  );
}
