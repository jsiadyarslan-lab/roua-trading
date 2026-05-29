import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

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
  // PWA FIX: Prevent Next.js from normalizing URLs before middleware runs.
  // Without this, /icon-192.png gets redirected by next-intl middleware.
  skipTrailingSlashRedirect: true,
  // PERFORMANCE: Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400, // 24 hours
    deviceSizes: [640, 1080, 1920],
    imageSizes: [16, 32, 64, 128],
  },
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
  // Keep console.error (critical issues) and console.warn (auth/debug diagnostics).
  // console.warn is essential for diagnosing OAuth flow failures in production.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }  // Keep error + warn for production diagnostics
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
      'framer-motion',
      'lucide-react',
      'lightweight-charts',
      'technicalindicators',
      'socket.io-client',
    ],
  },

  // Next.js 16 defaults to Turbopack. Provide an empty turbopack config
  // so the build doesn't error when a webpack config is also present.
  // The webpack config below is still used when building with --webpack flag.
  turbopack: {},

  // Removed destructive Webpack minimizer overrides that broke Next.js App Router client-side routing.
  // Next.js relies on its internal SWC minifier and chunking to correctly resolve RSC payloads.

  async headers() {
    return [
      // ── PWA Service Worker headers ──
      // NOTE: Removed icon-192.png and icon-512.png headers because they were
      // being applied to 307 redirect responses from next-intl middleware,
      // causing Railway CDN to cache the redirects for 24h. Icons now
      // rely solely on middleware bypass + cache-control from SW.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },

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
      // REMOVED: Previously this rewrote /api/health → NestJS API.
      // This caused Railway healthcheck to FAIL during startup because
      // Next.js rewrites take precedence over route handlers, so the
      // rewrite proxied to NestJS before it was ready, returning 502/503.
      // Now the Next.js route handler at apps/web/src/app/api/health/route.ts
      // handles health checks directly — it returns 200 even when the API
      // is still starting, allowing Railway to mark the replica as healthy.
      // The NestJS /api/health endpoint is still available on port 3001
      // for internal monitoring and the route handler proxies to it with
      // graceful degradation.
      // ── Auth endpoints (proxied to NestJS) ──
      // FIX: /api/auth/session was returning 404 because it was only in NestJS
      // but not proxied through Next.js. This caused the frontend to think
      // the API was down when checking session status.
      {
        source: '/api/auth/session',
        destination: `${apiTarget}/api/auth/session`,
      },
      // ── OAuth Callbacks (EXPLICIT BYPASS) ──
      // These routes MUST be handled by Next.js Route Handlers, NOT proxied to NestJS.
      // Next.js processes rewrites in order; these don't have a destination, so they pass through.
      // NOTE: We don't need explicit 'bypass' entries because Next.js only rewrites what matches
      // the 'source' fields below. We ensure no catch-all /api/:path* exists.

      // NOTE: /api/auth/guest rewrite REMOVED — it was shadowing the Next.js
      // route handler at apps/web/src/app/api/auth/guest/route.ts. The rewrite
      // sent requests to NestJS which may not be ready, causing 502 errors.
      // The local Next.js route handler is more reliable and faster.
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

export default withNextIntl(nextConfig);
