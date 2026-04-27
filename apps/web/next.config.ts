import type { NextConfig } from "next";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Routing Architecture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CRITICAL routes → NestJS (enforces RiskGatekeeper, AI Council, etc.):
//   /api/trading/*   — Orders, positions, risk, bot (MUST go through safety pipeline)
//   /api/signals/*   — Signal generation (MUST use AI Council, not simple heuristic)
//   /api/portfolio/* — Credentials & sanctuary (MUST use proper AES-256-GCM)
//
// LOCAL routes → Next.js (read-only or no NestJS equivalent):
//   /api/auth/*      — NextAuth, WebAuthn (Next.js native)
//   /api/exchange/*  — Quotes & history (sophisticated multi-source with caching)
//   /api/alpaca/*    — Direct Alpaca proxy (no NestJS equivalent)
//   /api/ai/*        — Frontend-specific AI (trading-intelligence module)
//   /api/news/*, /api/calendar/*, etc. — Read-only data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const apiTarget = process.env.API_INTERNAL_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  // No "output: standalone" — Railpack keeps node_modules so "next start" works.
  // standalone bakes absolute local paths and requires manual static/public copying.
  // turbopack disabled — causes panic with middleware; use webpack instead
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // ── CRITICAL: Prisma must NOT be bundled by webpack ──
  // Prisma uses native binaries (libquery_engine) that cannot be webpack'd.
  // Without this, Next.js tries to bundle @prisma/client and silently fails
  // at runtime — DB operations throw cryptic errors, and ensureDbReady()
  // returns false, causing ALL trading endpoints to return 401.
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@simplewebauthn/server',
  ],

  // Bundle optimizations
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      'framer-motion',
    ],
  },

  async rewrites() {
    return [
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // IMPORTANT: Routes with catch-all Route Handlers (nestjs-proxy)
      // must NOT be listed here. Next.js rewrites take priority over
      // Route Handlers and do NOT forward cookies/auth headers, which
      // causes 401 errors on the proxied NestJS backend.
      //
      // The following routes are handled by Route Handlers that properly
      // inject Authorization headers from the roua_session cookie:
      //   /api/trading/*   → apps/web/src/app/api/trading/[...path]/route.ts
      //   /api/engine/*    → apps/web/src/app/api/engine/[...path]/route.ts
      //   /api/portfolio/* → apps/web/src/app/api/portfolio/[...path]/route.ts
      //   /api/analytics/* → apps/web/src/app/api/analytics/[...path]/route.ts
      //   /api/signals/*   → apps/web/src/app/api/signals/[...path]/route.ts
      //   /api/ai/*        → apps/web/src/app/api/ai/[...path]/route.ts
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // ── Health check → NestJS ──
      // Public endpoint — no auth required.
      {
        source: '/api/health',
        destination: `${apiTarget}/api/health`,
      },

      // ── News routes → NestJS (fallback) ──
      // These use /nest/ prefix to avoid conflicting with local routes.
      {
        source: '/api/news/nest/latest',
        destination: `${apiTarget}/api/news/latest`,
      },
      {
        source: '/api/news/nest/analyze',
        destination: `${apiTarget}/api/news/analyze`,
      },
      {
        source: '/api/news/nest/fetch',
        destination: `${apiTarget}/api/news/fetch`,
      },
    ];
  },
};

export default nextConfig;
