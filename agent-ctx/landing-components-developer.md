# Task: Create Landing Page Components for ROUA Trading Platform

## Task ID: landing-components

## Summary
Created 8 landing page components and a main page.tsx for the ROUA Trading Platform with the "Neural Pulse" design theme.

## Files Created

### In `/home/z/my-project/roua-trading/apps/web/src/components/landing/`:
1. **NeuralBackground.tsx** - Three.js neural network background with 102 pulsing nodes in 4 rings, connection lines, data stream particles, and static gradient fallback for reduced-motion
2. **DataPulseTicker.tsx** - Live price ticker fetching 10 symbols from `/api/exchange/quote/`, infinite scroll animation, LIVE indicator
3. **HeroSection.tsx** - Hero with Arabic logo "رؤى" gradient, "ROUA" brand, typewriter effect cycling 4 phrases, CTA buttons, stats row
4. **NeuralFeatures.tsx** - 5 glassmorphism feature cards (Polyglot Analyst, Roua Signals, News Radar, Portfolio Sanctuary, Smart Lab) with SVG neural connections
5. **LiveMarketChart.tsx** - BTC/USD candlestick chart using lightweight-charts v5 `addCandlestickSeries()`, dark theme, auto-update every 3s
6. **TestimonialsSection.tsx** - 3 testimonials with star ratings, avatar initials, quotes
7. **CTASection.tsx** - Final CTA with floating particles, gradient glow background
8. **Footer.tsx** - Footer with logo, nav links, social icons, copyright

### Also created in root project `/home/z/my-project/src/` (served by dev server):
- Same 8 components in `components/landing/`
- `hooks/use-reduced-motion.ts` - Custom hook using `useSyncExternalStore` for prefers-reduced-motion
- `app/api/exchange/quote/[symbol]/route.ts` - Dynamic API route for quote data
- Updated `app/layout.tsx` with Cairo, Inter, JetBrains_Mono, Orbitron fonts and RTL
- Updated `app/globals.css` with Neural Pulse theme
- Updated `app/page.tsx` as landing page composition

## Key Technical Decisions
- Used `useSyncExternalStore` for prefers-reduced-motion to avoid React 19 lint errors about setState in effects
- Dynamic imports for Three.js and lightweight-charts (SSR: false)
- lightweight-charts v5 API: `chart.addCandlestickSeries()` (not the newer `addSeries()` pattern)
- All string timestamps (ISO date format) for lightweight-charts Time type
- API route handles URL-encoded symbols (e.g., BTC%2FUSDT → BTC/USDT)
