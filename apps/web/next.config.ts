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
      // ── CRITICAL: Trading routes → NestJS ──
      // All trading operations MUST go through RiskGatekeeper (5 safety checks),
      // IdempotencyService (prevent duplicates), and BullMQ execution queue.
      {
        source: '/api/trading/:path*',
        destination: `${apiTarget}/api/trading/:path*`,
      },

      // ── Engine Bot routes → NestJS ──
      // Bot enable/disable/status and engine health checks.
      {
        source: '/api/engine/:path*',
        destination: `${apiTarget}/api/engine/:path*`,
      },

      // ── CRITICAL: Signal routes → NestJS ──
      // Signal generation MUST use AI Council (Gemini + Groq + GLM),
      // RAG context, and sentiment analysis — not simple price heuristic.
      {
        source: '/api/signals/:path*',
        destination: `${apiTarget}/api/signals/:path*`,
      },

      // ── CRITICAL: Portfolio routes → NestJS ──
      // Credentials MUST use proper AES-256-GCM encryption (no base64 fallback).
      // Sanctuary MUST use NestJS risk analysis with live P&L tracking.
      {
        source: '/api/portfolio/:path*',
        destination: `${apiTarget}/api/portfolio/:path*`,
      },

      // ── AI routes → NestJS ──
      // AI analysis, consensus council, and model status MUST use the real
      // AI orchestrator (Gemini + Groq + GLM-4 + RAG), not local heuristics.
      // Falls back to local Next.js routes when NestJS is unavailable.
      {
        source: '/api/ai/analyze',
        destination: `${apiTarget}/api/ai/analyze`,
      },
      {
        source: '/api/ai/analyze/all',
        destination: `${apiTarget}/api/ai/analyze/all`,
      },
      {
        source: '/api/ai/models',
        destination: `${apiTarget}/api/ai/models`,
      },
      {
        source: '/api/ai/consensus-nest',
        destination: `${apiTarget}/api/ai/consensus`,
      },
      {
        source: '/api/analytics/:path*',
        destination: `${apiTarget}/api/analytics/:path*`,
      },

      // ── Neural Lab routes → NestJS (fallback) ──
      // Neural Lab has local Next.js API routes that try NestJS first
      // and fall back to local simulation. These rewrites are for direct
      // NestJS access when the local routes are not available.
      {
        source: '/api/neural/optimize',
        destination: `${apiTarget}/api/neural/optimize`,
      },
      {
        source: '/api/neural/compare',
        destination: `${apiTarget}/api/neural/compare`,
      },
      {
        source: '/api/neural/export',
        destination: `${apiTarget}/api/neural/export`,
      },
      {
        source: '/api/neural/apply-recommendation',
        destination: `${apiTarget}/api/neural/apply-recommendation`,
      },

      // ── Health check → NestJS ──
      // Proxies /api/health to NestJS for DB connectivity and schema verification.
      {
        source: '/api/health',
        destination: `${apiTarget}/api/health`,
      },

      // ── News routes → NestJS (fallback) ──
      // News has local Next.js API routes that try NestJS first
      // and fall back to local RSS + simulation.
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
