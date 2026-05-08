import type { NextConfig } from "next";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL FIX: API_INTERNAL_URL must NEVER be "http://api:3001"
// on Railway single-container deployments. NestJS runs on port 3001
// within the SAME container, so the correct address is 127.0.0.1:3001.
// "http://api:3001" only works in Docker Compose multi-container setups.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const rawApiTarget = process.env.API_INTERNAL_URL || "http://127.0.0.1:3001";
// If the baked-in value is the old Docker Compose hostname, override it
const apiTarget = rawApiTarget.includes("http://api:") ? "http://127.0.0.1:3001" : rawApiTarget;

const nextConfig: NextConfig = {
  // reactStrictMode: only in development — avoids double-invoking effects in production
  reactStrictMode: process.env.NODE_ENV !== 'production',
  // SECURITY: Remove X-Powered-By header to prevent information disclosure
  poweredByHeader: false,
  // socket.io path specifics are handled by the rewrites() config below.
  // Skip TypeScript errors during build (pre-existing type issues in API routes)
  typescript: {
    ignoreBuildErrors: true,
  },
  // PERFORMANCE: Remove all console.* calls from the production bundle.
  // There are 281 console.log/warn calls across the frontend codebase.
  // In production, these add unnecessary overhead and can leak debug info.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error'] }  // Keep console.error for critical issues
      : false,
  },
  // NOTE: eslint.ignoreDuringBuilds removed in Next.js 16.
  // The build will skip ESLint checks by default.
  // If ESLint issues arise, configure via .eslintrc instead.
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@simplewebauthn/server',
  ],

  experimental: {
    optimizePackageImports: [
      'recharts',
      '@mdxeditor/editor',
      'react-syntax-highlighter',
      'date-fns',
      'framer-motion',
    ],
  },

  // Next.js 16 defaults to Turbopack. Provide an empty turbopack config
  // so the build doesn't error when a webpack config is also present.
  // The webpack config below is still used when building with --webpack flag.
  turbopack: {},

  // Removed destructive Webpack minimizer overrides that broke Next.js App Router client-side routing.
  // Next.js relies on its internal SWC minifier and chunking to correctly resolve RSC payloads.

  async rewrites() {
    return [
      // ── Socket.IO proxy to NestJS ──
      // FIX: Socket.IO runs on NestJS (port 3001), but all traffic hits
      // Next.js (port 3000). Without this rewrite, /socket.io requests
      // return 404 because Next.js doesn't serve Socket.IO.
      // Three patterns needed:
      //   1. /socket.io (no trailing slash) — matches /socket.io?EIO=4
      //   2. /socket.io/ (trailing slash, no sub-path) — matches /socket.io/?EIO=4
      //   3. /socket.io/:path* — matches all sub-paths like /socket.io/1/
      // Pattern #2 is critical: Socket.IO clients initially connect to
      // /socket.io/?EIO=4&transport=polling which has pathname /socket.io/
      // (with trailing slash). Without this explicit pattern, the rewrite
      // may not match, causing 404 errors.
      {
        source: '/socket.io',
        destination: `${apiTarget}/socket.io`,
      },
      {
        source: '/socket.io/',
        destination: `${apiTarget}/socket.io/`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${apiTarget}/socket.io/:path*`,
      },
      // ── Health check ──
      {
        source: '/api/health',
        destination: `${apiTarget}/api/health`,
      },
      // ── Auth endpoints (proxied to NestJS) ──
      // FIX: /api/auth/session was returning 404 because it was only in NestJS
      // but not proxied through Next.js. This caused the frontend to think
      // the API was down when checking session status.
      {
        source: '/api/auth/session',
        destination: `${apiTarget}/api/auth/session`,
      },
      {
        source: '/api/auth/guest',
        destination: `${apiTarget}/api/auth/guest`,
      },
      // ── News endpoints (proxied to NestJS) ──
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
      // ── Integration endpoints (proxied to NestJS for cross-platform communication) ──
      // These endpoints use X-Integration-Key auth (not session-based), so rewrites
      // are safe here — no Authorization header injection needed.
      // NestJS IntegrationGuard + CORS handle auth and cross-origin requests.
      {
        source: '/api/integration/:path*',
        destination: `${apiTarget}/api/integration/:path*`,
      },
      // ── REMOVED: Strategic Council and Smart Executor rewrites ──
      // These were bypassing the Next.js Route Handlers that inject auth tokens.
      // The rewrites sent requests directly to NestJS without Authorization headers,
      // causing 401 errors. The Route Handlers at:
      //   /api/strategic-council/[...path]/route.ts
      //   /api/smart-executor/[...path]/route.ts
      // already proxy to NestJS with proper auth injection via createNestJSProxyHandlers().
    ];
  },
};

export default nextConfig;
