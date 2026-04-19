import type { NextConfig } from "next";

// API target for server-side rewrites:
// - Local dev:  http://localhost:3001 (default)
// - Docker:     http://api:3001       (via API_INTERNAL_URL env var)
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
    // Only rewrite /api/ai/* — exchange, signals, and portfolio now have
    // their own Next.js route handlers (no NestJS backend needed).
    // To re-enable NestJS rewrites, set API_INTERNAL_URL env var.
    if (!process.env.API_INTERNAL_URL) {
      return [
        {
          source: "/api/ai/:path*",
          destination: `${apiTarget}/api/ai/:path*`,
        },
        {
          source: "/api/trading/:path*",
          destination: `${apiTarget}/api/trading/:path*`,
        },
      ];
    }

    // If API_INTERNAL_URL is set, proxy all API routes to NestJS backend
    return [
      {
        source: "/api/exchange/:path*",
        destination: `${apiTarget}/api/exchange/:path*`,
      },
      {
        source: "/api/ai/:path*",
        destination: `${apiTarget}/api/ai/:path*`,
      },
      {
        source: "/api/portfolio/:path*",
        destination: `${apiTarget}/api/portfolio/:path*`,
      },
      {
        source: "/api/signals/:path*",
        destination: `${apiTarget}/api/signals/:path*`,
      },
      {
        source: "/api/trading/:path*",
        destination: `${apiTarget}/api/trading/:path*`,
      },
    ];
  },
};

export default nextConfig;
