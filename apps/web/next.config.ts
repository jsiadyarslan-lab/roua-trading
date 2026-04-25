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
  async rewrites() {
    return [
      // ── CRITICAL: Trading routes → NestJS ──
      // All trading operations MUST go through RiskGatekeeper (5 safety checks),
      // IdempotencyService (prevent duplicates), and BullMQ execution queue.
      {
        source: '/api/trading/:path*',
        destination: `${apiTarget}/api/trading/:path*`,
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
    ];
  },
};

export default nextConfig;
